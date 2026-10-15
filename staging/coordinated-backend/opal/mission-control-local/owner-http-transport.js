import {
  MATRIX_MAC,
  SUPPORTED_RELEASE,
  buildPatch,
  stateMatches,
} from "./local-transport.js";
export { buildPatch, stateMatches };

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function normalizeMatrixState(value) {
  if (!value || typeof value !== "object") throw new Error("Matrix state response is invalid.");
  const state = value.state && value.state.HBNF ? value.state : value;
  if (!state.HBNF || typeof state.HBNF !== "object") throw new Error("Matrix HBNF state is missing.");
  return state;
}

// Owner PWA transport: every Matrix read/write is a bounded HTTPS request
// carrying the paired session. Unlike WLED's native WebSocket, authorization
// is checked by the gateway for each command.
export class LocalMatrixTransport {
  constructor({ readState, sendCommand, onState = () => {}, onConnection = () => {}, pollMs = 1500, timeoutMs = 2500 } = {}) {
    if (typeof readState !== "function" || typeof sendCommand !== "function") throw new Error("Authenticated Matrix HTTP callbacks are required.");
    this.readStateFn = readState;
    this.sendCommandFn = sendCommand;
    this.onState = onState;
    this.onConnection = onConnection;
    this.pollMs = Math.max(750, Number(pollMs) || 1500);
    this.timeoutMs = Math.max(500, Number(timeoutMs) || 2500);
    this.snapshot = null;
    this.snapshotVersion = 0;
    this.snapshotAt = 0;
    this.identityVerifiedAt = 0;
    this.running = false;
    this.timer = null;
    this.retryMs = this.pollMs;
    this.readPromise = null;
    this.queue = Promise.resolve();
  }

  connect() {
    if (this.running) return;
    this.running = true;
    this.poll();
  }

  disconnect() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.identityVerifiedAt = 0;
    this.onConnection(false);
  }

  async refresh() {
    if (this.readPromise) return this.readPromise;
    this.readPromise = (async () => {
      const state = normalizeMatrixState(await this.readStateFn());
      this.snapshot = state;
      this.snapshotVersion += 1;
      this.snapshotAt = Date.now();
      this.onState(state);
      return state;
    })();
    try { return await this.readPromise; }
    finally { this.readPromise = null; }
  }

  async poll() {
    if (!this.running) return;
    let wait = this.pollMs;
    try {
      await this.refresh();
      this.retryMs = this.pollMs;
      this.onConnection(true);
    } catch (_) {
      this.identityVerifiedAt = 0;
      this.onConnection(false);
      wait = this.retryMs;
      this.retryMs = Math.min(5000, Math.max(this.pollMs, this.retryMs * 2));
    }
    if (this.running) this.timer = setTimeout(() => this.poll(), wait);
  }

  verifyIdentity(info) {
    const mac = String(info && info.mac || "").toLowerCase();
    this.identityVerifiedAt = mac === MATRIX_MAC ? Date.now() : 0;
    return this.identityVerifiedAt > 0;
  }

  clearIdentity() { this.identityVerifiedAt = 0; }

  controlReady() {
    const h = this.snapshot && this.snapshot.HBNF;
    return !!(this.running && h && h.candidate === SUPPORTED_RELEASE && this.snapshotAt &&
      Date.now() - this.snapshotAt <= 15000 && this.identityVerifiedAt && Date.now() - this.identityVerifiedAt <= 30000);
  }

  requestState() { return this.refresh(); }

  command(type, payload = {}) {
    const run = () => commandOnce(this, type, payload);
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => {});
    return result;
  }
}

async function commandOnce(transport, type, payload) {
  if (!transport.controlReady()) throw new Error("Fresh Matrix release, device identity, and state are required; no control was sent.");
  const patch = buildPatch(type, payload);
  const after = transport.snapshotVersion;
  await transport.sendCommandFn(patch);
  const deadline = Date.now() + transport.timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const state = await transport.refresh();
      if (transport.snapshotVersion > after && stateMatches(state, patch)) return state;
    } catch (error) { lastError = error; }
    await delay(80);
  }
  if (lastError) throw new Error(`Matrix command readback unavailable: ${lastError.message}`);
  throw new Error("Matrix command was not confirmed by matching state readback.");
}

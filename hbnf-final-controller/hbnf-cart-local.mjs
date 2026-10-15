/* Secure local transport adapter for the existing Owner PWA. */
import { fetchWithDeadline, HBNF_API_TIMEOUT_MS } from "./hbnf-cart-net.mjs?v=20261015-local-owner-v2";

// The owner-only gateway is a separate Opal Nginx instance. Its nonstandard
// HTTPS port keeps GL.iNet's existing 443 service and root-worker policy
// untouched while the new instance drops request workers to nobody.
export const LOCAL_CONTROL_ORIGIN = "https://cart-control.hbnightflyers.com:8443";
export const LOCAL_MATRIX_MAC = "704bca5b345c";
export const LOCAL_AUX_MAC = "8c94df55c34c";
export const LOCAL_MATRIX_RELEASE = "hbnf-cart2-phase2-r6-skins-readable-20261014";

function validToken(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function jsonHeaders(token) {
  return { "Content-Type": "application/json", "X-HBNF-Device": token };
}

export class LocalOwnerControl {
  constructor(options = {}) {
    this.origin = String(options.origin || LOCAL_CONTROL_ORIGIN).replace(/\/$/, "");
    this.fetchFn = options.fetchFn || fetch;
    this.transportLoader = options.transportLoader || (() => import(`${this.origin}/mission-control-local/owner-http-transport.js`));
    this.transport = null;
    this.module = null;
    this.token = "";
    this.expiresAtEpoch = 0;
    this.matrixInfo = null;
    this.auxInfo = null;
    this.auxState = null;
    this.commandQueue = Promise.resolve();
    this.localRevalidateMs = Number.isSafeInteger(options.localRevalidateMs) ? Math.max(1, options.localRevalidateMs) : 60000;
    this.localRevalidationTimer = null;
    this.commandsPending = 0;
  }

  async request(token, path, method = "GET", body = null) {
    if (!validToken(token)) throw new Error("A valid paired Owner session is required.");
    const options = {
      method,
      headers: jsonHeaders(token),
      cache: "no-store",
      credentials: "omit",
    };
    if (body !== null) options.body = JSON.stringify(body);
    const response = await fetchWithDeadline(this.fetchFn, this.origin + path, options, HBNF_API_TIMEOUT_MS, "Local Cart control");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `Local control HTTP ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  async ensureSession(token, expiresAtEpoch) {
    try {
      return await this.request(token, "/api/session");
    } catch (error) {
      if (error.status === 401) this.disconnectTransport();
      if (error.status !== 404) throw error;
    }
    // The browser value is only a freshness hint. The gateway must persist
    // the expiry returned by its trusted server-side pairing verification.
    if (Number.isSafeInteger(expiresAtEpoch) && expiresAtEpoch <= Math.floor(Date.now() / 1000)) {
      throw new Error("The paired-device expiry has elapsed.");
    }
    return this.request(token, "/api/session/enroll", "POST", { action: "enroll", expiresAtEpoch });
  }

  async waitForState(transport, timeoutMs = 3500) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const release = transport.snapshot && transport.snapshot.HBNF && transport.snapshot.HBNF.candidate;
      if (release && release !== LOCAL_MATRIX_RELEASE) throw new Error("Matrix firmware is not the locally approved release.");
      if (transport.controlReady()) return transport.snapshot;
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    throw new Error("Local Matrix identity, firmware and fresh state were not all confirmed.");
  }

  async readAux(token) {
    const result = await Promise.all([
      this.request(token, "/api/aux/json/info"),
      this.request(token, "/api/aux/json/state"),
    ]);
    if (String(result[0].mac || "").toLowerCase() !== LOCAL_AUX_MAC || !Number.isFinite(Number(result[1].bri)) || typeof result[1].on !== "boolean") {
      throw new Error("AUX identity or state readback is incomplete.");
    }
    this.auxInfo = result[0];
    this.auxState = result[1];
    return { info: result[0], state: result[1] };
  }

  disconnectTransport() {
    if (this.localRevalidationTimer) clearTimeout(this.localRevalidationTimer);
    this.localRevalidationTimer = null;
    if (this.transport) this.transport.disconnect();
    this.transport = null;
    this.token = "";
    this.matrixInfo = null;
    this.auxInfo = null;
    this.auxState = null;
  }

  scheduleLocalRevalidation(token) {
    if (this.localRevalidationTimer || !token) return;
    this.localRevalidationTimer = setTimeout(async () => {
      this.localRevalidationTimer = null;
      if (this.token !== token || !this.transport) return;
      if (this.commandsPending > 0) {
        this.scheduleLocalRevalidation(token);
        return;
      }
      try {
        // Revalidate the paired token periodically without interrupting the
        // HTTP polling transport. During WAN loss Lua keeps the bounded local
        // 180-day session active; revoked cloud pairings are persisted locally.
        await this.request(token, "/api/session/revalidate", "POST", { action: "revalidate" });
        this.scheduleLocalRevalidation(token);
      } catch (_) {
        this.disconnectTransport();
      }
    }, this.localRevalidateMs);
    if (this.localRevalidationTimer && typeof this.localRevalidationTimer.unref === "function") this.localRevalidationTimer.unref();
  }

  async connect(token, expiresAtEpoch) {
    if (!validToken(token)) throw new Error("This device is not paired for local control.");
    await this.ensureSession(token, expiresAtEpoch);
    if (Number.isSafeInteger(expiresAtEpoch)) this.expiresAtEpoch = expiresAtEpoch;
    const module = this.module || await this.transportLoader();
    this.module = module;
    try {
      const matrixInfo = await this.request(token, "/api/matrix/json/info");
      if (String(matrixInfo.mac || "").toLowerCase() !== LOCAL_MATRIX_MAC) throw new Error("Unexpected Matrix identity.");
      if (this.token !== token || !this.transport) {
        this.disconnectTransport();
        this.transport = new module.LocalMatrixTransport({
          readState: () => this.request(token, "/api/matrix/json/state"),
          sendCommand: patch => this.request(token, "/api/matrix/control", "POST", { HBNF: patch }),
          pollMs: 1500,
        });
        this.token = token;
      }
      if (!this.transport.verifyIdentity(matrixInfo)) throw new Error("Matrix identity verification failed.");
      this.transport.connect();
      const matrixState = await this.waitForState(this.transport);
      const candidate = matrixState && matrixState.HBNF && matrixState.HBNF.candidate;
      if (candidate !== LOCAL_MATRIX_RELEASE) throw new Error("Matrix firmware is not the locally approved release.");
      await this.readAux(token);
      this.matrixInfo = matrixInfo;
      this.scheduleLocalRevalidation(token);
      return this.snapshot();
    } catch (error) {
      this.disconnectTransport();
      throw error;
    }
  }

  snapshot() {
    const local = this.transport && this.transport.snapshot;
    const h = local && local.HBNF;
    if (!h || !this.auxState || !this.transport.controlReady()) throw new Error("Fresh local Matrix/AUX state is unavailable.");
    const isRange = (value, minimum, maximum) => Number.isInteger(Number(value)) && Number(value) >= minimum && Number(value) <= maximum;
    if (!isRange(h.matrixBrightness, 0, 255) || !isRange(h.auxBrightness, 0, 255) ||
        !isRange(h.vibe, 0, 5) || !isRange(h.motion, 0, 100) || !isRange(h.audioResponse, 0, 100)) {
      throw new Error("Fresh Matrix control readback is incomplete; controls remain disabled.");
    }
    const revision = this.transport.snapshotVersion;
    const vibeNames = ["chill", "groove", "heavy", "psychedelic", "cosmic", "auto"];
    const sceneNames = ["course-flow", "field-mix", "hbnf-signature", "quiet-cosmos"];
    const scene = Number.isInteger(Number(h.scene)) ? (sceneNames[Number(h.scene)] || String(h.scene)) : String(h.scene || "");
    const matrixBrightness = Number(h.matrixBrightness);
    const auxBrightness = Number(h.auxBrightness);
    const matrixObserved = { device_id: "matrix", desired_revision: revision, status: "online", observed_at: new Date().toISOString(), reported: { confirmed: true, brightness: matrixBrightness, appliedProjection: { brightness: matrixBrightness } } };
    const auxObserved = { device_id: "aux", desired_revision: revision, status: this.auxState.on ? "online" : "off", observed_at: new Date().toISOString(), reported: { confirmed: true, brightness: Number(this.auxState.bri), appliedProjection: { brightness: auxBrightness }, ddp: this.auxInfo.live === true && this.auxInfo.lm === "DDP" && this.auxInfo.lip === "192.168.77.10" } };
    return {
      local: true,
      desired: { revision, state: {
        sceneId: scene,
        selectedVibe: vibeNames[Number(h.vibe)] || "",
        vibeMode: Number(h.vibe) === 5 ? "music" : "manual",
        guestMode: null,
        tuning: { motion: Number(h.motion), audioResponse: Number(h.audioResponse) },
        devices: { matrix: { brightness: matrixBrightness }, aux: { brightness: Number(this.auxState.bri) } },
      } },
      observed: [matrixObserved, auxObserved],
      devices: {
        matrix: { confirmed: true, confirmedRevision: revision, mac: LOCAL_MATRIX_MAC, firmware: h.candidate },
        aux: { confirmed: true, confirmedRevision: revision, mac: LOCAL_AUX_MAC, ddp: this.auxInfo.live === true && this.auxInfo.lm === "DDP" && this.auxInfo.lip === "192.168.77.10", physical: "unverified" },
      },
      capabilities: { phase2VibeRuntimeV1: true, localOwnerControlV1: true },
      localState: local,
    };
  }

  supports(type, payload) {
    if (!this.module || !this.module.buildPatch) return false;
    try { this.module.buildPatch(type, payload || {}); return true; }
    catch (_) { return false; }
  }

  command(token, type, payload) {
    const run = async () => {
      this.commandsPending += 1;
      try { return await this.commandNow(token, type, payload); }
      finally { this.commandsPending -= 1; }
    };
    const result = this.commandQueue.then(run, run);
    this.commandQueue = result.catch(() => {});
    return result;
  }

  async commandNow(token, type, payload) {
    if (token !== this.token || !this.transport) throw new Error("Fresh paired local session and Matrix identity are required.");
    await this.ensureSession(token);
    if (!this.transport.controlReady()) await this.connect(token, this.expiresAtEpoch);
    if (!this.transport.controlReady()) throw new Error("Fresh paired local session and Matrix identity are required.");
    if (!this.supports(type, payload)) throw new Error(`This command is not yet available through offline local control: ${type}`);
    // Keep a stable pre-command record for cross-device compensation; test
    // adapters and callers may otherwise retain a live reference to readback.
    const beforeMatrix = { ...(this.transport.snapshot && this.transport.snapshot.HBNF || {}) };
    const patch = this.module.buildPatch(type, payload || {});
    if (Object.prototype.hasOwnProperty.call(patch, "auxBrightness")) await this.readAux(token);
    const beforeAux = { bri: Number(this.auxState.bri), on: this.auxState.on === true };
    const state = await this.transport.command(type, payload || {});
    if (Object.prototype.hasOwnProperty.call(patch, "auxBrightness")) {
      try {
        await this.request(token, "/api/aux/control", "POST", { bri: Number(patch.auxBrightness) });
        const aux = await this.readAux(token);
        if (Number(aux.state.bri) !== Number(patch.auxBrightness)) throw new Error("AUX brightness readback did not match the requested value.");
      } catch (error) {
        const restoreFailed = [];
        try {
          await this.request(token, "/api/aux/control", "POST", beforeAux);
          const restored = await this.readAux(token);
          if (Number(restored.state.bri) !== beforeAux.bri || restored.state.on !== beforeAux.on) throw new Error("AUX restoration readback mismatch");
        }
        catch (_) { restoreFailed.push("AUX"); }
        const oldTarget = Number(beforeMatrix.auxBrightness);
        if (Number.isInteger(oldTarget) && oldTarget >= 0 && oldTarget <= 255) {
          try {
            const restored = await this.transport.command("TUNE", { auxBrightness: oldTarget });
            if (Number(restored.HBNF && restored.HBNF.auxBrightness) !== oldTarget) throw new Error("Matrix AUX target readback mismatch");
          }
          catch (_) { restoreFailed.push("Matrix AUX target"); }
        }
        if (restoreFailed.length) throw new Error(`AUX command failed; bounded restoration could not be confirmed for ${restoreFailed.join(" and ")}.`);
        throw error;
      }
    } else {
      await this.readAux(token);
    }
    return {
      accepted: true,
      local: true,
      revision: this.transport.snapshotVersion,
      acknowledgments: {
        matrix: { confirmed: true, mac: LOCAL_MATRIX_MAC, release: LOCAL_MATRIX_RELEASE, stateVersion: this.transport.snapshotVersion },
        aux: { confirmed: true, mac: LOCAL_AUX_MAC, reachable: true, brightness: Number(this.auxState.bri), ddp: this.auxInfo.live === true && this.auxInfo.lm === "DDP" && this.auxInfo.lip === "192.168.77.10", physical: "unverified", matrixProjection: Object.prototype.hasOwnProperty.call(patch, "auxBrightness") ? Number(state.HBNF.auxBrightness) : null },
      },
      state,
    };
  }

  async revoke(token) {
    if (!validToken(token)) return false;
    try {
      await this.request(token, "/api/session/revoke", "POST", { action: "revoke" });
    } finally {
      this.disconnectTransport();
      this.expiresAtEpoch = 0;
    }
    return true;
  }
}

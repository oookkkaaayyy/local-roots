import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { LocalOwnerControl, LOCAL_MATRIX_IP, LOCAL_AUX_IP, LOCAL_MATRIX_MAC, LOCAL_AUX_MAC, LOCAL_MATRIX_RELEASE } from "../hbnf-final-controller/hbnf-cart-local.mjs";
import { buildPatch } from "../staging/coordinated-backend/opal/mission-control-local/local-transport.js";
import { LocalMatrixTransport as PairedHttpTransport } from "../staging/coordinated-backend/opal/mission-control-local/owner-http-transport.js";

function directFixture({ auxReachable = true, matrixReachable = true, matrixStateReachable = true } = {}) {
  const calls = [];
  const commands = [];
  const matrix = {
    HBNF: {
      candidate: LOCAL_MATRIX_RELEASE, matrixBrightness: 69, auxBrightness: 255,
      vibe: 1, motion: 50, audioResponse: 50, scene: "course-flow",
      palette: { mode: "legacy", id: "hbnf-balanced" },
    },
    seg: [],
  };
  class FakeTransport {
    constructor({ url }) { this.url = url; this.socket = null; this.snapshot = null; this.snapshotVersion = 0; this.snapshotAt = 0; this.identityVerifiedAt = 0; }
    verifyIdentity(info) { this.identityVerifiedAt = info.mac === LOCAL_MATRIX_MAC ? Date.now() : 0; return this.identityVerifiedAt > 0; }
    controlReady() { return !!(this.socket && this.socket.readyState === 1 && this.identityVerifiedAt && this.snapshot && this.snapshot.HBNF.candidate === LOCAL_MATRIX_RELEASE); }
    connect() { this.socket = { readyState: 1 }; if (matrixReachable && matrixStateReachable) this.read(); }
    read() { if (!matrixReachable || !matrixStateReachable) return null; this.snapshot = structuredClone(matrix); this.snapshotVersion += 1; this.snapshotAt = Date.now(); return this.snapshot; }
    requestState() { return this.read(); }
    async command(type, payload) {
      const patch = buildPatch(type, payload);
      commands.push({ type, payload: structuredClone(payload), patch: structuredClone(patch) });
      Object.assign(matrix.HBNF, patch);
      this.read();
      return this.snapshot;
    }
    disconnect() { this.socket = null; }
  }
  const module = {
    buildPatch,
    LocalMatrixTransport: FakeTransport,
    async getJson(url) {
      calls.push(url);
      if (url === `http://${LOCAL_MATRIX_IP}/json/info`) { if (!matrixReachable) throw new Error("Matrix info timeout"); return { mac: LOCAL_MATRIX_MAC }; }
      if (url === `http://${LOCAL_AUX_IP}/json/info`) {
        if (!auxReachable) throw new Error("AUX offline");
        return { mac: LOCAL_AUX_MAC, live: true, lm: "DDP", lip: LOCAL_MATRIX_IP };
      }
      if (url === `http://${LOCAL_AUX_IP}/json/state`) {
        if (!auxReachable) throw new Error("AUX offline");
        return { bri: 255, on: true };
      }
      throw new Error(`Unexpected device request: ${url}`);
    },
  };
  return { calls, commands, matrix, module, setMatrixReachable(value) { matrixReachable = value; }, setMatrixStateReachable(value) { matrixStateReachable = value; }, setAuxReachable(value) { auxReachable = value; } };
}

function pairedFixture({ matrixReachable = true, auxReachable = true } = {}) {
  const calls = [];
  const emitted = [];
  const matrix = { HBNF: {
    candidate: LOCAL_MATRIX_RELEASE, matrixBrightness: 69, auxBrightness: 255,
    vibe: 1, motion: 50, audioResponse: 50, scene: "course-flow",
    palette: { mode: "legacy", id: "hbnf-balanced" },
  }, seg: [] };
  const aux = { bri: 255, on: true };
  const jsonResponse = value => ({ ok: true, status: 200, json: async () => value });
  const failResponse = () => ({ ok: false, status: 503, json: async () => ({ error: "device_unavailable" }) });
  const fetchFn = async (url, options = {}) => {
    const path = new URL(url).pathname;
    calls.push({ path, method: options.method || "GET", body: options.body || null });
    if (path === "/api/session") return jsonResponse({ active: true });
    if (path === "/api/matrix/json/info") return matrixReachable ? jsonResponse({ mac: LOCAL_MATRIX_MAC }) : failResponse();
    if (path === "/api/matrix/json/state") return matrixReachable ? jsonResponse({ state: structuredClone(matrix) }) : failResponse();
    if (path === "/api/aux/json/info") return auxReachable ? jsonResponse({ mac: LOCAL_AUX_MAC, live: true, lm: "DDP", lip: LOCAL_MATRIX_IP }) : failResponse();
    if (path === "/api/aux/json/state") return auxReachable ? jsonResponse(structuredClone(aux)) : failResponse();
    if (path === "/api/aux/control" && options.method === "POST") {
      if (!auxReachable) return failResponse();
      const body = JSON.parse(options.body);
      if (Number.isInteger(body.bri)) aux.bri = body.bri;
      if (typeof body.on === "boolean") aux.on = body.on;
      return jsonResponse({ accepted: true });
    }
    if (path === "/api/matrix/control" && options.method === "POST") {
      if (!matrixReachable) return failResponse();
      const body = JSON.parse(options.body);
      emitted.push(structuredClone(body.HBNF));
      Object.assign(matrix.HBNF, body.HBNF);
      return jsonResponse({ accepted: true });
    }
    throw new Error(`Unexpected mocked gateway request: ${options.method || "GET"} ${path}`);
  };
  return { calls, emitted, matrix, aux, fetchFn, module: { buildPatch, LocalMatrixTransport: PairedHttpTransport }, setMatrixReachable(value) { matrixReachable = value; }, setAuxReachable(value) { auxReachable = value; } };
}

test("Opal-hosted Owner PWA uses fresh local Matrix and AUX identity/readback without cloud credentials", async t => {
  const f = directFixture();
  const owner = new LocalOwnerControl({ opalDirect: true, directTransportLoader: async () => f.module, storage: null });
  t.after(() => owner.disconnectTransport());
  const status = await owner.connect("", 0);
  assert.equal(status.local, true);
  assert.equal(status.devices.matrix.mac, LOCAL_MATRIX_MAC);
  assert.equal(status.devices.matrix.firmware, LOCAL_MATRIX_RELEASE);
  assert.equal(status.devices.aux.mac, LOCAL_AUX_MAC);
  assert.equal(status.devices.aux.ddp, true);
  assert.equal(status.devices.aux.physical, "unverified");
  assert.ok(f.calls.includes(`http://${LOCAL_MATRIX_IP}/json/info`));
  assert.ok(f.calls.includes(`http://${LOCAL_AUX_IP}/json/state`));
});

test("fresh verified Opal connection skips repeat identity/AUX preflight before commands", async t => {
  const f = directFixture();
  const owner = new LocalOwnerControl({ opalDirect: true, directTransportLoader: async () => f.module, storage: null });
  t.after(() => owner.disconnectTransport());
  await owner.connect("", 0);
  const preflightReads = f.calls.length;
  const result = await owner.command("", "VIBE", { vibe: "heavy" });
  assert.equal(f.calls.length, preflightReads + 2, "a command performs its required post-command AUX identity/state readback without re-reading Matrix identity or waiting for another Matrix poll");
  assert.equal(result.acknowledgments.matrix.confirmed, true, "fresh Matrix state acknowledgment remains required");
  assert.equal(result.acknowledgments.aux.reachable, true, "AUX reachability readback remains required");
});

test("Opal-direct Matrix control stays available when AUX readback is unreachable", async t => {
  const f = directFixture({ auxReachable: false });
  const owner = new LocalOwnerControl({ opalDirect: true, directTransportLoader: async () => f.module, storage: null });
  t.after(() => owner.disconnectTransport());
  const snapshot = await owner.connect("", 0);
  assert.equal(snapshot.componentStatus.matrix.available, true);
  assert.equal(snapshot.componentStatus.aux.available, false);
  assert.equal(snapshot.devices.matrix.confirmed, true);
  assert.equal(snapshot.devices.aux.confirmed, false);
  assert.deepEqual(f.commands, [], "display hydration sends no Matrix command");
  const result = await owner.command("", "VIBE", { vibe: "heavy" });
  assert.equal(result.acknowledgments.matrix.confirmed, true);
  assert.equal(result.acknowledgments.aux.confirmed, false);
  assert.equal(result.acknowledgments.aux.brightness, null);
  assert.equal(f.commands.length, 1);
});

test("Opal-direct reports AUX readback without inventing a Matrix command when Matrix is unreachable", async t => {
  const f = directFixture({ matrixReachable: false, auxReachable: true });
  const owner = new LocalOwnerControl({ opalDirect: true, directTransportLoader: async () => f.module, storage: null, matrixReadyTimeoutMs: 80 });
  t.after(() => owner.disconnectTransport());
  const snapshot = await owner.connect("", 0);
  assert.equal(snapshot.componentStatus.matrix.available, false);
  assert.equal(snapshot.componentStatus.aux.available, true);
  assert.equal(snapshot.devices.matrix.confirmed, false);
  assert.equal(snapshot.devices.aux.confirmed, true);
  assert.equal(snapshot.devices.aux.ddp, false, "AUX DDP projection is not confirmed while Matrix is unavailable");
  assert.equal(snapshot.desired.state.devices.aux.actualWledBrightness, 255);
  assert.deepEqual(f.commands, [], "partial status hydration sends no Matrix command");
  await assert.rejects(owner.command("", "VIBE", { vibe: "heavy" }), /Fresh Matrix identity and readback/);
  assert.deepEqual(f.commands, []);
});

test("Opal-direct Matrix state timeout is bounded and does not fabricate command acknowledgments", async t => {
  const f = directFixture({ matrixStateReachable: false, auxReachable: true });
  const owner = new LocalOwnerControl({ opalDirect: true, directTransportLoader: async () => f.module, storage: null, matrixReadyTimeoutMs: 90 });
  t.after(() => owner.disconnectTransport());
  const started = Date.now();
  const snapshot = await owner.connect("", 0);
  assert.ok(Date.now() - started < 1000, "state wait is bounded by the configured readiness timeout");
  assert.equal(snapshot.componentStatus.matrix.available, false);
  assert.match(snapshot.componentStatus.matrix.error, /state readback was not received/);
  assert.equal(snapshot.componentStatus.aux.available, true);
  await assert.rejects(owner.command("", "VIBE", { vibe: "heavy" }), /Fresh Matrix identity and readback/);
  assert.deepEqual(f.commands, []);
});

test("paired route permits Matrix-only commands during AUX outage with component-specific acknowledgments", async t => {
  const f = pairedFixture({ auxReachable: false });
  const owner = new LocalOwnerControl({ opalDirect: false, origin: "https://mock-cart.invalid", transportLoader: async () => f.module, fetchFn: f.fetchFn, localSyncIntervalMs: 60000, localRevalidateMs: 60000 });
  t.after(() => owner.disconnectTransport());
  const snapshot = await owner.connect("a".repeat(64), Math.floor(Date.now() / 1000) + 3600);
  assert.equal(snapshot.componentStatus.matrix.available, true);
  assert.equal(snapshot.componentStatus.aux.available, false);
  assert.deepEqual(f.emitted, [], "paired status hydration sends no control command");
  const result = await owner.command("a".repeat(64), "TUNE", { matrixBrightness: 77 }, ["matrixBrightness"]);
  assert.equal(result.acknowledgments.matrix.confirmed, true);
  assert.equal(result.acknowledgments.aux.confirmed, false);
  assert.equal(f.emitted.length, 1);
  assert.equal(f.matrix.HBNF.matrixBrightness, 77);
});

test("paired route controls only independent AUX WLED brightness while Matrix is unavailable", async t => {
  const f = pairedFixture({ matrixReachable: false, auxReachable: true });
  const owner = new LocalOwnerControl({ opalDirect: false, origin: "https://mock-cart.invalid", transportLoader: async () => f.module, fetchFn: f.fetchFn, localSyncIntervalMs: 60000, localRevalidateMs: 60000 });
  t.after(() => owner.disconnectTransport());
  const snapshot = await owner.connect("a".repeat(64), Math.floor(Date.now() / 1000) + 3600);
  assert.equal(snapshot.componentStatus.matrix.available, false);
  assert.equal(snapshot.componentStatus.aux.available, true);
  assert.equal(snapshot.devices.aux.ddp, false);
  assert.deepEqual(f.emitted, [], "partial paired status hydration sends no control command");
  const result = await owner.command("a".repeat(64), "TUNE", { auxBrightness: 201 }, ["auxBrightness"]);
  assert.equal(result.acknowledgments.matrix.confirmed, false);
  assert.equal(result.acknowledgments.aux.confirmed, true);
  assert.equal(result.acknowledgments.aux.independent, true);
  assert.equal(result.acknowledgments.aux.matrixProjection, null);
  assert.equal(f.aux.bri, 201);
  assert.deepEqual(f.emitted, [], "Matrix-derived AUX target was not sent while Matrix was unavailable");
});

test("both routes reject controls when both devices are unreachable and recover components independently", async t => {
  for (const direct of [false, true]) {
    const f = direct ? directFixture({ auxReachable: false, matrixReachable: false }) : pairedFixture({ auxReachable: false, matrixReachable: false });
    const owner = new LocalOwnerControl({ opalDirect: direct, origin: "https://mock-cart.invalid", directTransportLoader: async () => f.module, transportLoader: async () => f.module, fetchFn: f.fetchFn, storage: null, matrixReadyTimeoutMs: 80, localSyncIntervalMs: 60000, localRevalidateMs: 60000 });
    t.after(() => owner.disconnectTransport());
    const snapshot = await owner.connect(direct ? "" : "a".repeat(64), direct ? 0 : Math.floor(Date.now() / 1000) + 3600);
    assert.equal(snapshot.componentStatus.matrix.available, false);
    assert.equal(snapshot.componentStatus.aux.available, false);
    await assert.rejects(owner.command(direct ? "" : "a".repeat(64), "VIBE", { vibe: "heavy" }));
    assert.deepEqual(direct ? f.commands : f.emitted, [], "no command is acknowledged while both components are unavailable");
    f.setAuxReachable(true);
    const auxRecovered = await owner.connect(direct ? "" : "a".repeat(64), direct ? 0 : Math.floor(Date.now() / 1000) + 3600);
    assert.equal(auxRecovered.componentStatus.matrix.available, false);
    assert.equal(auxRecovered.componentStatus.aux.available, true, "AUX recovers without Matrix or a Cart reboot");
    f.setMatrixReachable(true);
    const recovered = await owner.connect(direct ? "" : "a".repeat(64), direct ? 0 : Math.floor(Date.now() / 1000) + 3600);
    assert.equal(recovered.componentStatus.matrix.available, true);
    assert.equal(recovered.componentStatus.aux.available, true);
  }
});

test("local Owner PWA brightness, motion/audio, Vibes, scenes, palettes, text and scoreboard route through existing Matrix transport", async t => {
  const f = directFixture();
  const owner = new LocalOwnerControl({ opalDirect: true, directTransportLoader: async () => f.module, storage: null });
  t.after(() => owner.disconnectTransport());
  await owner.connect("", 0);
  const tune = await owner.command("", "TUNE", { matrixBrightness: 72, auxBrightness: 235, motion: 61, audioResponse: 44 }, ["matrixBrightness", "auxBrightness", "motion", "audioResponse"]);
  assert.deepEqual(f.commands[0], { type: "TUNE", payload: { matrixBrightness: 72, auxBrightness: 235, motion: 61, audioResponse: 44 }, patch: { matrixBrightness: 72, auxBrightness: 235, motion: 61, audioResponse: 44 } });
  assert.equal(tune.state.HBNF.matrixBrightness, 72);
  assert.equal(tune.state.HBNF.auxBrightness, 235);
  assert.equal(tune.acknowledgments.matrix.confirmed, true);
  assert.equal(tune.acknowledgments.aux.matrixProjection, 235);
  assert.equal(tune.acknowledgments.aux.brightness, 255, "WLED state.bri is reported separately from the HBNF AUX output target");
  assert.equal(tune.snapshot.desired.state.devices.aux.brightness, 235);
  assert.equal(tune.snapshot.observed[1].reported.physical, "unverified");
  await owner.command("", "VIBE", { vibe: "cosmic" });
  await owner.command("", "SCENE", { sceneId: "quiet-cosmos" });
  await owner.command("", "PALETTE", { paletteId: "wled-4" });
  await owner.command("", "OVERLAY_START", { overlayId: "local-text-test", kind: "text", ttlMs: 5000, data: { text: "HELLO", color: "#FFFFFF" } });
  await owner.command("", "OVERLAY_START", { overlayId: "local-scores-test", kind: "scoreboard", ttlMs: 8000, data: { label: "F9", entries: ["AND 3"] } });
  assert.equal(f.matrix.HBNF.vibe, 4);
  assert.equal(f.matrix.HBNF.scene, "quiet-cosmos");
  assert.deepEqual(f.matrix.HBNF.palette, { mode: "wled", index: 4 });
  assert.equal(f.matrix.HBNF.overlay.id, "local-scores-test");
});

test("direct Opal rejects Energy/Variation-only and mixed Motion+Variation as local TUNE", async t => {
  const f = directFixture();
  const owner = new LocalOwnerControl({ opalDirect: true, directTransportLoader: async () => f.module, storage: null });
  t.after(() => owner.disconnectTransport());
  await owner.connect("", 0);
  const fullPayload = { matrixBrightness: 69, auxBrightness: 255, motion: 61, audioResponse: 44, energy: 10, variation: 5 };
  for (const changedFields of [["energy"], ["variation"], ["motion", "variation"]]) {
    const payload = { ...fullPayload };
    assert.equal(owner.supports("TUNE", payload, changedFields), false);
    await assert.rejects(owner.command("", "TUNE", payload, changedFields), /not available on the offline local transport/);
  }
  assert.deepEqual(f.commands, [], "unsupported direct-local tune fields emit no device patch");
});

test("paired local fallback preserves valid legacy TUNE payloads without changedFields", async t => {
  const f = pairedFixture();
  const token = "d".repeat(64);
  const owner = new LocalOwnerControl({ opalDirect: false, origin: "https://mock-cart.invalid", transportLoader: async () => f.module, fetchFn: f.fetchFn, localSyncIntervalMs: 60000, localRevalidateMs: 60000 });
  t.after(() => owner.disconnectTransport());
  await owner.connect(token, Math.floor(Date.now() / 1000) + 3600);
  const payload = { matrixBrightness: 70, auxBrightness: 235, motion: 61, audioResponse: 44 };
  assert.equal(owner.supports("TUNE", payload), true);
  const result = await owner.command(token, "TUNE", payload);
  assert.deepEqual(f.emitted.at(-1), payload, "legacy paired call transmits exactly supported fields");
  assert.equal(result.acknowledgments.matrix.confirmed, true);
  assert.equal(result.acknowledgments.aux.confirmed, true);
  assert.equal(Number(result.state.HBNF.motion), 61);
  assert.equal(Number(result.state.HBNF.audioResponse), 44);
});

test("paired local fallback rejects ambiguous unsupported TUNE fields when changedFields is absent", async t => {
  const f = pairedFixture();
  const token = "c".repeat(64);
  const owner = new LocalOwnerControl({ opalDirect: false, origin: "https://mock-cart.invalid", transportLoader: async () => f.module, fetchFn: f.fetchFn, localSyncIntervalMs: 60000, localRevalidateMs: 60000 });
  t.after(() => owner.disconnectTransport());
  await owner.connect(token, Math.floor(Date.now() / 1000) + 3600);
  const payload = { matrixBrightness: 70, auxBrightness: 240, energy: 10, variation: 5 };
  assert.equal(owner.supports("TUNE", payload), false);
  await assert.rejects(owner.command(token, "TUNE", payload), /not yet available through offline local control/);
  assert.deepEqual(f.emitted, [], "ambiguous mixed TUNE payload sends no Matrix command");
});

test("paired local fallback rejects unsupported edited fields and preserves supported fields", async t => {
  const f = pairedFixture();
  const token = "a".repeat(64);
  const owner = new LocalOwnerControl({
    opalDirect: false,
    origin: "https://mock-cart.invalid",
    transportLoader: async () => f.module,
    fetchFn: f.fetchFn,
    localSyncIntervalMs: 60000,
    localRevalidateMs: 60000,
  });
  t.after(() => owner.disconnectTransport());
  await owner.connect(token, Math.floor(Date.now() / 1000) + 3600);

  const payload = { matrixBrightness: 70, auxBrightness: 240, motion: 61, audioResponse: 44, energy: 10, variation: 5 };
  for (const changedFields of [["energy"], ["variation"], ["motion", "variation"]]) {
    assert.equal(owner.supports("TUNE", payload, changedFields), false);
    await assert.rejects(owner.command(token, "TUNE", payload, changedFields), /not yet available through offline local control/);
  }
  assert.deepEqual(f.emitted, [], "unsupported local edits transmit no Matrix command");

  const supportedCases = [
    [["motion", "audioResponse"], { motion: 61, audioResponse: 44 }],
    [["matrixBrightness"], { matrixBrightness: 70 }],
    [["auxBrightness"], { auxBrightness: 240 }],
  ];
  for (const [changedFields, expectedPatch] of supportedCases) {
    assert.equal(owner.supports("TUNE", payload, changedFields), true);
    const result = await owner.command(token, "TUNE", payload, changedFields);
    assert.equal(result.accepted, true);
    assert.equal(result.acknowledgments.matrix.confirmed, true);
    assert.equal(result.acknowledgments.aux.confirmed, true);
    assert.deepEqual(f.emitted[f.emitted.length - 1], expectedPatch, "paired transport sends only edited supported fields");
    assert.equal(Object.hasOwn(result.state.HBNF, "energy"), false);
    assert.equal(Object.hasOwn(result.state.HBNF, "variation"), false);
    const snapshot = owner.snapshot();
    const uiApplied = snapshot.desired && snapshot.observed.length >= 2 && snapshot.observed.every(item =>
      Number(item.desired_revision) === Number(snapshot.desired.revision) && ["online", "off"].includes(String(item.status)) && item.reported && item.reported.confirmed === true);
    assert.equal(uiApplied, true, "supported edited fields retain existing confirmed-revision UI behavior");
  }
});

test("regression: paired fallback must not classify omitted Energy/Variation as successful", async t => {
  const f = pairedFixture();
  const token = "b".repeat(64);
  const owner = new LocalOwnerControl({ opalDirect: false, origin: "https://mock-cart.invalid", transportLoader: async () => f.module, fetchFn: f.fetchFn, localSyncIntervalMs: 60000, localRevalidateMs: 60000 });
  t.after(() => owner.disconnectTransport());
  await owner.connect(token, Math.floor(Date.now() / 1000) + 3600);
  const payload = { matrixBrightness: 70, auxBrightness: 240, motion: 61, audioResponse: 44, energy: 10, variation: 5 };
  const changedFields = ["energy", "variation"];
  assert.equal(owner.supports("TUNE", payload, changedFields), false);
  const outcome = await owner.command(token, "TUNE", payload, changedFields)
    .then(value => ({ value }), error => ({ error }));
  assert.ok(outcome.error && /not yet available through offline local control/.test(outcome.error.message),
    "unsupported requested fields must be rejected before local send or positive acknowledgement");
  assert.deepEqual(f.emitted, []);
});

test("paired fallback forwards edited fields while cloud payload strips the local-only metadata", () => {
  const js = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart.js", import.meta.url), "utf8");
  assert.match(js, /const OPAL_LOCAL_TUNE_FIELDS = new Set\(\["matrixBrightness", "auxBrightness", "motion", "audioResponse"\]\)/);
  assert.match(js, /const localTune = body\.type === "TUNE" && Array\.isArray\(body\.changedFields\)[\s\S]*?body\.changedFields\.every\(key => OPAL_LOCAL_TUNE_FIELDS\.has\(key\)\)/);
  assert.match(js, /type: "TUNE",\s*payload,\s*changedFields,/);
  assert.match(js, /delete cloudBody\.changedFields/);
  assert.match(js, /if \(localControlActive && localOwnerControl\.supports\(body\.type, body\.payload, body\.changedFields\)\) \{\s*return localOwnerControl\.command\(token, body\.type, body\.payload, body\.changedFields\);/);
  assert.match(js, /const applied = snap\.desired && observed\.length >= 2 && observed\.every\(x => Number\(x\.desired_revision\) === Number\(snap\.desired\.revision\)[\s\S]*?x\.reported\.confirmed === true\)/);
  assert.doesNotMatch(js.match(/const applied = ([^;]+);/)?.[1] || "", /changedFields|variation|energy/);
});

test("local Owner PWA fails closed when either required device cannot be read", async t => {
  const f = directFixture({ auxReachable: false });
  const owner = new LocalOwnerControl({ opalDirect: true, directTransportLoader: async () => f.module, storage: null });
  t.after(() => owner.disconnectTransport());
  const snapshot = await owner.connect("", 0);
  assert.equal(snapshot.componentStatus.matrix.available, true);
  assert.equal(snapshot.componentStatus.aux.available, false);
  assert.equal(snapshot.devices.matrix.confirmed, true);
  assert.equal(snapshot.devices.aux.confirmed, false);
});

test("local route preserves cloud reads and distinguishes live scores from manual offline scoring", () => {
  const js = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart.js", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart.html", import.meta.url), "utf8");
  assert.match(js, /const result = await callCloud\(cloudBody\)/);
  assert.match(js, /const SUPABASE_URL = "https:\/\/phcpbvuqibyarpfrftgx\.supabase\.co"/);
  assert.match(html, /id="featureLive"[^>]*>Live scores haven’t loaded yet\./);
  assert.match(html, /id="manualOfflineScorePanel"[\s\S]*?<summary>Manual Show Scores · works offline<\/summary>/);
  assert.match(js, /You are offline\. No change was sent\./);
});

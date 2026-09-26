import test from "node:test";
import assert from "node:assert/strict";
import { applyCommand, createInitialState, resolveEffectiveState, acceptMusicSemantics } from "../domain/cart-state.mjs";
import { reconcileCart } from "../domain/reconciler.mjs";
import { expireAndReconcile } from "../domain/overlay-lease.mjs";
import { MusicIntelligence } from "../domain/music-intelligence.mjs";
import { SCENES, validateSceneRegistry } from "../domain/scenes.mjs";

let serial = 0;
function command(state, type, payload = {}, extra = {}) {
  return { commandId: `test-${++serial}`, type, payload, expectedRevision: state.revision, at: 1_000 + serial, ...extra };
}
function reduce(state, type, payload, options = {}) { return applyCommand(state, command(state, type, payload), options).state; }

test("scene registry and nested scene data cannot own brightness/power/device profiles", () => {
  assert.equal(validateSceneRegistry(), true);
  for (const scene of [
    { nested: { brightness: 128 } },
    { controls: [{ device_profile: { aux: { brightness: 2 } } }] },
    { MQTT: { topic: "x" } },
  ]) {
    const state = createInitialState();
    assert.throws(() => applyCommand(state, command(state, "SCENE", { sceneId: "unsafe" }), { scenes: { unsafe: scene } }), { code: "SCENE_FIELD_FORBIDDEN" });
  }
});

test("device brightness is independent and sticky across cart commands, scenes, and music", () => {
  let state = createInitialState();
  state = reduce(state, "BRIGHTNESS", { deviceId: "matrix", brightness: 31 });
  state = reduce(state, "BRIGHTNESS", { deviceId: "aux", brightness: 177 });
  for (const [type, payload] of [["ON", {}], ["NEXT", {}], ["AUTO", {}], ["SCENE", { sceneId: "field-mix" }], ["PALETTE", { paletteId: "copper" }], ["VIBE", { vibe: "energetic" }], ["LOCK", {}]]) {
    state = reduce(state, type, payload, { scenes: SCENES });
    state = acceptMusicSemantics(state, { vibe: "peak", stableTempoBias: 1.35, bass: 0.8 }, 2_000);
  }
  const [matrix, aux] = Object.values(resolveEffectiveState(state, { release: "staging-1", fenceEpoch: 4 }));
  assert.equal(matrix.brightness, 31);
  assert.equal(aux.brightness, 177);
  assert.equal(matrix.brightnessProfileRevision, aux.brightnessProfileRevision);
  assert.notEqual(matrix.brightness, aux.brightness);
});

test("manual vibe/speed wins over music while automatic modes consume semantic values", () => {
  let state = createInitialState();
  state = reduce(state, "VIBE", { vibe: "mellow" });
  state = reduce(state, "SPEED", { speedBias: 0.8 });
  state = acceptMusicSemantics(state, { vibe: "peak", stableTempoBias: 1.4 }, 20);
  assert.equal(state.vibe, "mellow");
  assert.equal(resolveEffectiveState(state, { release: "r", fenceEpoch: 1 }).matrix.speedBias, 0.8);
  state = reduce(state, "VIBE_AUTO", {});
  state = reduce(state, "TEMPO_AUTO", {});
  state = acceptMusicSemantics(state, { vibe: "peak", stableTempoBias: 1.4 }, 40);
  const p = resolveEffectiveState(state, { release: "r", fenceEpoch: 1 }).matrix;
  assert.equal(p.vibe, "peak");
  assert.equal(p.speedBias, 1.4);
});

test("commands are idempotent and stale revisions are rejected", () => {
  const state = createInitialState();
  const cmd = command(state, "ON");
  const once = applyCommand(state, cmd);
  const twice = applyCommand(once.state, cmd);
  assert.equal(twice.duplicate, true);
  assert.equal(twice.state.revision, 1);
  assert.throws(() => applyCommand(once.state, { ...cmd, commandId: "different-id" }), { code: "STALE_REVISION" });
});

test("overlay expiry resolves latest state and restores current profile, not snapshot", async () => {
  const base = createInitialState();
  const overlaid = reduce(base, "OVERLAY_START", { overlayId: "alert", kind: "alert", ttlMs: 100, data: { color: "red" } });
  const latest = reduce(overlaid, "BRIGHTNESS", { deviceId: "aux", brightness: 122 });
  let stored, reconciled;
  const out = await expireAndReconcile({ state: latest, now: 2_000, storeState: async s => stored = s, reconcile: async s => reconciled = resolveEffectiveState(s, { release: "r", fenceEpoch: 1 }) });
  assert.equal(out.expired, true);
  assert.equal(stored.devices.aux.brightness, 122);
  assert.equal(reconciled.aux.brightness, 122);
  assert.equal(reconciled.matrix.overlay, null);
});

test("one offline adapter degrades independently; stale or unfenced acknowledgements never reconcile", async () => {
  const desiredState = reduce(createInitialState(), "ON", {});
  let liveFence = { active: true, release: "r1", epoch: 3 };
  const fence = { ...liveFence };
  const seen = [];
  const makeAdapter = deviceId => ({
    isOnline: async () => deviceId === "matrix",
    apply: async p => ({ confirmed: true, deviceId, cartRevision: p.cartRevision, fenceEpoch: p.fenceEpoch, brightness: p.brightness, enabled: p.enabled, observedAt: 2 }),
  });
  const degraded = await reconcileCart({ desiredState, release: "r1", fence, adapters: { matrix: makeAdapter("matrix"), aux: makeAdapter("aux") }, readFence: async () => liveFence, writeObserved: async (id, obs) => seen.push([id, obs]) });
  assert.equal(degraded.status, "degraded");
  assert.equal(seen.find(x => x[0] === "matrix")[1].status, "online");
  assert.equal(seen.find(x => x[0] === "aux")[1].online, false);

  liveFence = { ...fence };
  let reads = 0;
  const switched = await reconcileCart({ desiredState, release: "r1", fence, adapters: { matrix: makeAdapter("matrix"), aux: makeAdapter("matrix") }, readFence: async () => (++reads < 4 ? fence : (liveFence = { active: true, release: "r2", epoch: 4 })) });
  assert.equal(switched.status, "degraded");
  assert.match(switched.results[0].error, /fence changed/i);
});

test("music analyzer separates band ratios, ignores isolated impacts for global tempo, and locks manual control", () => {
  const analyzer = new MusicIntelligence({ minDwellMs: 0 });
  const input = (at, band, volume, transient = false) => {
    const bins = new Array(16).fill(0);
    if (band === "bass") bins[1] = transient ? 250 : 160;
    if (band === "mids") bins[7] = transient ? 250 : 160;
    if (band === "treble") bins[14] = transient ? 250 : 160;
    return analyzer.update({ at, fftBins: bins, volume: transient ? 255 : volume });
  };
  const zero = new Array(16).fill(0);
  analyzer.update({ at: 1, fftBins: zero, volume: 0 });
  let transient = input(101, "treble", 255, true);
  assert.ok(transient.onset > 0);
  assert.equal(transient.stableTempoBpm, null);
  let bass;
  for (let i = 0; i < 40; i++) bass = input(201 + i * 100, "bass", 170);
  assert.ok(bass.bass > bass.treble);
  assert.ok(bass.fastEnergy > 0);
  let slow;
  for (let i = 0; i < 20; i++) slow = input(5_000 + i * 100, "mids", 15);
  assert.equal(slow.stableTempoBpm, null);
  assert.ok(["mellow", "moderate"].includes(slow.vibe));
  const state = acceptMusicSemantics(createInitialState(), { ...bass, stableTempoBias: 1.2 }, 10_000);
  const manual = reduce(state, "SPEED", { speedBias: 0.75 });
  assert.equal(resolveEffectiveState(manual, { release: "r", fenceEpoch: 1 }).matrix.speedBias, 0.75);
});

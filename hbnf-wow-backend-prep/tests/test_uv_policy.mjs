import test from "node:test";
import assert from "node:assert/strict";
import { UV_OFFLINE_CONFIG, UV_MODES, nextUvOutput, nextUvOutputs, wledUvStatePatch } from "../../hbnf-aux-lighting/backend/aux_uv_policy.mjs";
import { readFile } from "node:fs/promises";

test("integrated UV defaults fail closed with no output or WLED segment targets", () => {
  assert.equal(UV_OFFLINE_CONFIG.enabled, false);
  assert.equal(UV_OFFLINE_CONFIG.hardwareAvailable, false);
  assert.equal(UV_OFFLINE_CONFIG.maxBrightness, 0);
  assert.deepEqual(UV_MODES, ["OFF", "MANUAL", "FOLLOW_MATRIX", "VIBE_REACTIVE"]);
  assert.equal(nextUvOutput({ mode: "MANUAL", manualBrightness: 255, currentOutput: 42 }), 0);
  assert.deepEqual(wledUvStatePatch(UV_OFFLINE_CONFIG, 200), { on: true, seg: [] });
});

test("enabled fixture demonstrates cap, owner override and smooth ramp without changing fail-closed defaults", () => {
  const cfg = { enabled: true, hardwareAvailable: true, maxBrightness: 40, rampPerTick: 5, segmentIds: [1, 2] };
  assert.equal(nextUvOutput({ mode: "VIBE_REACTIVE", ownerOverride: 100, currentOutput: 10 }, cfg), 15);
  assert.equal(nextUvOutput({ mode: "MANUAL", manualBrightness: 255, currentOutput: 35 }, cfg), 40);
  assert.equal(nextUvOutput({ mode: "FOLLOW_MATRIX", currentOutput: 0 }, cfg, { matrixBrightness: 255 }), 5);
  assert.equal(nextUvOutput({ mode: "VIBE_REACTIVE", currentOutput: 0 }, cfg, { vibeEnvelope: 255 }), 5);
  assert.equal(nextUvOutput({ mode: "OFF", ownerOverride: 40, currentOutput: 30 }, cfg), 0);
  assert.deepEqual(wledUvStatePatch(cfg, 255), {
    on: true,
    seg: [{ id: 1, on: true, bri: 40 }, { id: 2, on: true, bri: 40 }],
  });
});

test("UV channels keep separate brightness and owner levels while sharing Matrix or vibe response", () => {
  const cfg = { enabled: true, hardwareAvailable: true, maxBrightness: 100, rampPerTick: 100, segmentIds: [1, 2] };
  assert.deepEqual(nextUvOutputs({ mode: "MANUAL", manualBrightnessBySegment: { 1: 18, 2: 63 } }, cfg), [
    { id: 1, brightness: 18 }, { id: 2, brightness: 63 },
  ]);
  assert.deepEqual(nextUvOutputs({ mode: "MANUAL", manualBrightness: 5, manualBrightnessBySegment: { 1: 18, 2: 63 }, ownerOverrideBySegment: { 2: 27 } }, cfg), [
    { id: 1, brightness: 18 }, { id: 2, brightness: 27 },
  ]);
  assert.deepEqual(nextUvOutputs({ mode: "VIBE_REACTIVE", manualBrightnessBySegment: { 1: 100, 2: 50 } }, cfg, { vibeEnvelope: 50 }), [
    { id: 1, brightness: 20 }, { id: 2, brightness: 10 },
  ]);
  assert.deepEqual(nextUvOutputs({ mode: "FOLLOW_MATRIX", manualBrightnessBySegment: { 1: 100, 2: 50 } }, cfg, { matrixBrightness: 50 }), [
    { id: 1, brightness: 20 }, { id: 2, brightness: 10 },
  ]);
  assert.deepEqual(wledUvStatePatch(cfg, { 1: 18, 2: 63 }).seg.map(({ id, on, bri }) => ({ id, on, bri })), [
    { id: 1, on: true, bri: 18 }, { id: 2, on: true, bri: 63 },
  ]);
  assert.deepEqual(wledUvStatePatch(UV_OFFLINE_CONFIG, { 1: 18, 2: 63 }), { on: true, seg: [] });
  const uncommissioned = { ...cfg, enabled: false };
  assert.deepEqual(nextUvOutputs({ mode: "MANUAL", manualBrightnessBySegment: { 1: 100, 2: 50 } }, uncommissioned), [
    { id: 1, brightness: 0 }, { id: 2, brightness: 0 },
  ]);
  assert.deepEqual(wledUvStatePatch(uncommissioned, { 1: 100, 2: 50 }).seg.map(({ id, on, bri }) => ({ id, on, bri })), [
    { id: 1, on: false, bri: 0 }, { id: 2, on: false, bri: 0 },
  ]);
  const offlineChannels = { ...UV_OFFLINE_CONFIG, segmentIds: ["main", "short"] };
  assert.deepEqual(nextUvOutputs({ mode: "VIBE_REACTIVE", manualBrightnessBySegment: { main: 255, short: 190 }, ownerOverrideBySegment: { main: 255, short: 255 } }, offlineChannels, { vibeEnvelope: 255 }), [
    { id: "main", brightness: 0 }, { id: "short", brightness: 0 },
  ]);
  assert.deepEqual(wledUvStatePatch(UV_OFFLINE_CONFIG, { main: 255, short: 190 }), { on: true, seg: [] });
  const offlinePreview = { ...UV_OFFLINE_CONFIG, segmentIds: ["main", "short"] };
  assert.deepEqual(nextUvOutputs({ mode: "MANUAL", manualBrightnessBySegment: { main: 255, short: 128 } }, offlinePreview), [
    { id: "main", brightness: 0 }, { id: "short", brightness: 0 },
  ]);
  assert.deepEqual(wledUvStatePatch(UV_OFFLINE_CONFIG, { main: 255, short: 128 }), { on: true, seg: [] });
});

test("native font and treatment menu is exact-source-bound and stays unfrozen", async () => {
  const contract = JSON.parse(await readFile(new URL("../contracts/text_presentation.json", import.meta.url), "utf8"));
  assert.equal(contract.wled_source_commit, "29b389df1c1aaec6ff53aea742d17063b985906c");
  assert.equal(contract.functional_baseline.font_index, 4);
  assert.equal(contract.visual_freeze, false);
  assert.equal(contract.treatments_are_owner_selectable, true);
  assert.deepEqual(contract.font_options_for_review.map((font) => font.font_index).sort(), [1, 2, 3, 4]);
  assert.equal(contract.treatment_options_for_review.length, 3);
  assert.ok(contract.invariants.includes("no_custom_font_renderer"));
  assert.ok(contract.invariants.includes("no_glyph_geometry_modification_during_hold"));
});

test("AUX edge route delegates UV writes to the gated command helper", async () => {
  const source = await readFile(new URL("../../hbnf-aux-lighting/backend/aux_control.ts", import.meta.url), "utf8");
  const policyStart = source.indexOf('if(action==="uv_policy")');
  const policyEnd = source.indexOf("\n }", policyStart);
  const legacyStart = source.indexOf('if(action==="uv")');
  const legacyEnd = source.indexOf("\n }", legacyStart);
  const modeStart = source.indexOf('if(action==="mode")');
  const modeEnd = source.indexOf("\n  if(action===", modeStart + 1);
  assert.ok(policyStart >= 0 && policyEnd > policyStart);
  assert.ok(legacyStart >= 0 && legacyEnd > legacyStart);
  assert.ok(modeStart >= 0 && modeEnd > modeStart);
  assert.match(source, /HBNF_UV_ENABLED"\)\|\|""\)\.toLowerCase\(\)==="true"/);
  assert.match(source.slice(policyStart, policyEnd), /executeUvRequest/);
  assert.match(source.slice(policyStart, policyEnd), /UV_HARDWARE_CONFIG/);
  assert.match(source.slice(policyStart, policyEnd), /uvEnabled:ENV_UV_ENABLED/);
  assert.doesNotMatch(source.slice(policyStart, policyEnd), /publish\(/);
  assert.match(source.slice(legacyStart, legacyEnd), /executeUvRequest/);
  assert.doesNotMatch(source.slice(legacyStart, legacyEnd), /await publish\(/);
  assert.doesNotMatch(source.slice(legacyStart, legacyEnd), /publish\(/);
  assert.match(source.slice(modeStart, modeEnd), /mode==="glow_live"\)return json\(/);
});

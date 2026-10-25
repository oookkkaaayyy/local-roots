import assert from "node:assert/strict";
import test from "node:test";
import { executeUvRequest, UV_FOLLOW_EFFECT_ID, UV_HARDWARE_CONFIG, uvCommissioningReady, uvHardwareReady } from "../backend/aux_uv_command.mjs";

const gates = Object.freeze({
  hardware_wired: true, power_verified: true, gpio_verified: true,
  current_limit_verified: true, segments_verified: true,
  uv_main_verified: true, uv_short_verified: true, uv_full_verified: true,
  thermal_verified: true, mixed_load_verified: true,
});
const verifiedHardware = Object.freeze({
  verified: true,
  evidence: "owner-recorded in-person electrical verification",
  supplyByChannel: {
    main: { outputVoltageV: 5, currentLimitMa: 300 },
    short: { outputVoltageV: 5, currentLimitMa: 200 },
  },
  switching: { verified: true, isolated: true, maxLoadVoltageV: 5, controlInputMinVoltage: 3.0, controlInputMaxVoltage: 3.6, channels: 2, maxChannelCurrentMa: 180, maxTotalCurrentMa: 300 },
  maxBrightness: 180,
  channels: {
    main: { gpio: 25, segmentId: 1, loadVoltageV: 5, loadCurrentMa: 100, fuseRatingMa: 150, wireCurrentRatingMa: 150 },
    short: { gpio: 26, segmentId: 2, loadVoltageV: 5, loadCurrentMa: 150, fuseRatingMa: 150, wireCurrentRatingMa: 150 },
  },
});

test("incomplete/default hardware profile stays preview-only and never calls MQTT", async () => {
  let published = false;
  const result = await executeUvRequest({
    request: { mode: "MANUAL", brightnessBySegment: { main: 240, short: 180 } },
    state: gates, auxEnabled: true, uvEnabled: true,
    publish: async () => { published = true; },
  });
  assert.equal(result.status, 409);
  assert.equal(result.body.mutationIssued, false);
  assert.equal(result.body.preview, true);
  assert.deepEqual(result.body.output, { main: 0, short: 0 });
  assert.equal(published, false);
});

test("owner-reported 5V UV strip voltage is recorded without enabling an unverified path", () => {
  assert.equal(UV_HARDWARE_CONFIG.channels.main.loadVoltageV, 5);
  assert.equal(UV_HARDWARE_CONFIG.channels.short.loadVoltageV, 5);
  assert.equal(UV_HARDWARE_CONFIG.supplyByChannel.main.outputVoltageV, null);
  assert.equal(UV_HARDWARE_CONFIG.supplyByChannel.short.outputVoltageV, null);
  assert.equal(uvHardwareReady(UV_HARDWARE_CONFIG), false);
});

test("verified two-channel request maps independent sliders and reports only broker acknowledgment", async () => {
  let sent = null;
  const result = await executeUvRequest({
    request: { mode: "MANUAL", brightnessBySegment: { main: 255, short: 80 } },
    state: gates, auxEnabled: true, uvEnabled: true, hardware: verifiedHardware,
    publish: async (payload, allowed) => { sent = { payload, allowed }; },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.mutationIssued, true);
  assert.deepEqual(result.body.caps, { main: 180, short: 80 });
  assert.deepEqual(sent.payload.seg.slice(1).map(({ id, on, bri, fx, ix }) => ({ id, on, bri, fx, ix })), [
    { id: 1, on: true, bri: 180, fx: 0, ix: 180 }, { id: 2, on: true, bri: 80, fx: 0, ix: 80 },
  ]);
  assert.equal(sent.allowed, true);
  assert.deepEqual(result.body.acknowledgement, {
    transport: "mqtt", qos: 1, acceptedByBroker: true, deviceReadback: false,
  });
});

test("missing AUX, UV, or prerequisite commissioning gate rejects before publish", async () => {
  for (const input of [
    { auxEnabled: false, uvEnabled: true, state: gates },
    { auxEnabled: true, uvEnabled: false, state: gates },
    { auxEnabled: true, uvEnabled: true, state: { ...gates, power_verified: false } },
    { auxEnabled: true, uvEnabled: true, state: { ...gates, uv_main_verified: false } },
    { auxEnabled: true, uvEnabled: true, state: { ...gates, uv_short_verified: false } },
    { auxEnabled: true, uvEnabled: true, state: { ...gates, uv_full_verified: false } },
    { auxEnabled: true, uvEnabled: true, state: { ...gates, thermal_verified: false } },
    { auxEnabled: true, uvEnabled: true, state: { ...gates, mixed_load_verified: false } },
    { auxEnabled: true, uvEnabled: true, state: { hardware_wired: true, power_verified: true, gpio_verified: true, current_limit_verified: true, segments_verified: true } },
  ]) {
    let published = false;
    const result = await executeUvRequest({
      request: { mode: "MANUAL", brightnessBySegment: { main: 20, short: 10 } },
      ...input, hardware: verifiedHardware,
      publish: async () => { published = true; },
    });
    assert.equal(result.status, 409);
    assert.equal(result.body.mutationIssued, false);
    assert.equal(published, false);
  }
});

test("follow modes send persistent independent caps for AUX-local audio following", async () => {
  let matrixPayload = null;
  const matrix = await executeUvRequest({
    request: { mode: "FOLLOW_MATRIX", brightnessBySegment: { main: 128, short: 64 }, matrixBrightness: 255, vibeEnvelope: 255 },
    state: gates, auxEnabled: true, uvEnabled: true, hardware: verifiedHardware,
    publish: async (payload) => { matrixPayload = payload; },
  });
  assert.equal(matrix.body.localAudioFollow, true);
  assert.deepEqual(matrix.body.caps, { main: 128, short: 64 });
  assert.deepEqual(matrixPayload.seg.slice(1).map(({ id, bri, fx, ix }) => ({ id, bri, fx, ix })), [
    { id: 1, bri: 255, fx: UV_FOLLOW_EFFECT_ID, ix: 128 },
    { id: 2, bri: 255, fx: UV_FOLLOW_EFFECT_ID, ix: 64 },
  ]);
  const vibe = await executeUvRequest({
    request: { mode: "VIBE_REACTIVE", brightnessBySegment: { main: 128, short: 64 }, vibeEnvelope: 0 },
    state: gates, auxEnabled: true, uvEnabled: true, hardware: verifiedHardware,
    publish: async () => {},
  });
  assert.deepEqual(vibe.body.caps, { main: 128, short: 64 });
  assert.equal(vibe.body.localAudioFollow, true);
});

test("missing mode defaults to local Matrix rhythm following", async () => {
  let sent;
  const result = await executeUvRequest({
    request: { brightnessBySegment: { main: 96, short: 48 } },
    state: gates, auxEnabled: true, uvEnabled: true, hardware: verifiedHardware,
    publish: async (payload) => { sent = payload; },
  });
  assert.equal(result.body.mode, "FOLLOW_MATRIX");
  assert.equal(sent.seg[1].fx, UV_FOLLOW_EFFECT_ID);
  assert.equal(sent.seg[2].ix, 48);
});

test("hardware mapping requires reviewed facts and exact proposed GPIO/segment pairing", () => {
  assert.equal(uvHardwareReady(verifiedHardware), true);
  assert.equal(uvCommissioningReady(gates), true);
  assert.equal(uvHardwareReady({ ...verifiedHardware, channels: { ...verifiedHardware.channels, short: { ...verifiedHardware.channels.short, segmentId: 1 } } }), false);
  assert.equal(uvHardwareReady({ ...verifiedHardware, supplyByChannel: { ...verifiedHardware.supplyByChannel, short: { ...verifiedHardware.supplyByChannel.short, outputVoltageV: 12 } } }), false);
  assert.equal(uvHardwareReady({ ...verifiedHardware, channels: { ...verifiedHardware.channels, short: { ...verifiedHardware.channels.short, loadVoltageV: null } } }), false);
  assert.equal(uvHardwareReady({ ...verifiedHardware, switching: { ...verifiedHardware.switching, maxLoadVoltageV: 4.9 } }), false);
});

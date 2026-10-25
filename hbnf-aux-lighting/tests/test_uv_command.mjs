import assert from "node:assert/strict";
import test from "node:test";
import { executeUvRequest, uvCommissioningReady, uvHardwareReady } from "../backend/aux_uv_command.mjs";

const gates = Object.freeze({
  hardware_wired: true, power_verified: true, gpio_verified: true,
  current_limit_verified: true, segments_verified: true,
});
const verifiedHardware = Object.freeze({
  verified: true,
  evidence: "owner-reviewed power-off wiring photo",
  supply: { outputVoltage: 5, currentLimitMa: 500 },
  switching: { verified: true, isolated: true, outputVoltage: 5, controlInputMinVoltage: 3.0, controlInputMaxVoltage: 3.6, channels: 2, maxChannelCurrentMa: 180, maxTotalCurrentMa: 300 },
  fuse: { verified: true, ratingMa: 300 },
  wire: { currentRatingMa: 300 },
  maxBrightness: 180,
  channels: {
    main: { gpio: 25, segmentId: 1, loadCurrentMa: 100 },
    short: { gpio: 26, segmentId: 2, loadCurrentMa: 150 },
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

test("verified two-channel request maps independent sliders and reports only broker acknowledgment", async () => {
  let sent = null;
  const result = await executeUvRequest({
    request: { mode: "MANUAL", brightnessBySegment: { main: 255, short: 80 } },
    state: gates, auxEnabled: true, uvEnabled: true, hardware: verifiedHardware,
    publish: async (payload, allowed) => { sent = { payload, allowed }; },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.mutationIssued, true);
  assert.deepEqual(result.body.output, { main: 180, short: 80 });
  assert.deepEqual(sent.payload.seg.slice(1).map(({ id, on, bri }) => ({ id, on, bri })), [
    { id: 1, on: true, bri: 180 }, { id: 2, on: true, bri: 80 },
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

test("follow modes retain separate channel caps on the shared Matrix/WOW sample", async () => {
  const matrix = await executeUvRequest({
    request: { mode: "FOLLOW_MATRIX", brightnessBySegment: { main: 128, short: 64 }, matrixBrightness: 200 },
    state: gates, auxEnabled: true, uvEnabled: true, hardware: verifiedHardware,
    publish: async () => {},
  });
  assert.deepEqual(matrix.body.output, { main: 100, short: 50 });
  const vibe = await executeUvRequest({
    request: { mode: "VIBE_REACTIVE", brightnessBySegment: { main: 128, short: 64 }, vibeEnvelope: 200 },
    state: gates, auxEnabled: true, uvEnabled: true, hardware: verifiedHardware,
    publish: async () => {},
  });
  assert.deepEqual(vibe.body.output, { main: 100, short: 50 });
});

test("hardware mapping requires reviewed facts and exact proposed GPIO/segment pairing", () => {
  assert.equal(uvHardwareReady(verifiedHardware), true);
  assert.equal(uvCommissioningReady(gates), true);
  assert.equal(uvHardwareReady({ ...verifiedHardware, channels: { ...verifiedHardware.channels, short: { ...verifiedHardware.channels.short, segmentId: 1 } } }), false);
});

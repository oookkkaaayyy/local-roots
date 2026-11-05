import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { executeUvRequest, UV_FOLLOW_EFFECT_ID, UV_HARDWARE_CONFIG, uvCommissioningReady, uvHardwareReady, uvServiceTokenAuthorized } from "../backend/aux_uv_command.mjs";

const gates = Object.freeze({
  hardware_wired: true, power_verified: true, gpio_verified: true,
  current_limit_verified: true, segments_verified: true,
  uv_main_verified: true, uv_short_verified: true, uv_full_verified: true,
  thermal_verified: true, mixed_load_verified: true,
});
// A wholly synthetic test fixture. This is NOT evidence that the actual
// SP803E output stage or mixed-voltage supply is electrically qualified.
const verifiedHardware = Object.freeze({
  verified: true,
  evidence: "owner-recorded in-person electrical verification",
  supplyByChannel: {
    main: { outputVoltageV: 5, currentLimitMa: 300 },
    short: { outputVoltageV: 5, currentLimitMa: 200 },
  },
  sharedSupply: { topology: "one_converter_one_inline_fuse_shared_by_both_uv_strips", fuseRatingMa: 300, currentLimitMa: 300, verified: true },
  switching: {
    verified: true, isolated: true, method: "opto_isolated_cv_pwm_repeater",
    inputVoltageV: 12, outputVoltageV: 5, pwmFrequencyHz: 880,
    maxLoadVoltageV: 5, controlInputMinVoltage: 5, controlInputMaxVoltage: 24,
    channels: 2, maxChannelCurrentMa: 180, maxTotalCurrentMa: 300,
  },
  physicalSafety: Object.fromEntries([
    "externalSignalToLoadIsolationVerified", "separate5vUvAnd12vAuxRailsVerified",
    "physicalTwoChannelOffVerified", "manualCutoffVerified", "opticalProtectionAndInterlockVerified",
    "bootBrownoutAndFaultOffVerified", "directWledBypassProtected",
    "branchFuseAndConductorProtectionVerified",
  ].map(key => [key, true])),
  maxBrightness: 180,
  channels: {
    main: { gpio: 25, segmentId: 1, loadVoltageV: 5, loadCurrentMa: 100, fuseRatingMa: 150, wireCurrentRatingMa: 300 },
    short: { gpio: 26, segmentId: 2, loadVoltageV: 5, loadCurrentMa: 150, fuseRatingMa: 150, wireCurrentRatingMa: 300 },
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

test("missing or malformed brightness caps are rejected without an implicit zero or OFF command", async () => {
  for (const brightnessBySegment of [undefined, {}, { main: 80 }, { main: 80, short: 2.5 }, { main: -1, short: 20 }]) {
    let published = false;
    const result = await executeUvRequest({
      request: { mode: "MANUAL", brightnessBySegment },
      state: gates, auxEnabled: true, uvEnabled: true, uvOutputsVerified: true, hardware: verifiedHardware,
      publish: async () => { published = true; },
    });
    assert.equal(result.status, 400);
    assert.equal(result.body.mutationIssued, false);
    assert.equal(published, false);
  }
});

test("owner-measured 5V UV and historical 12V underglow remain distinct and uncommissioned", async () => {
  assert.equal(UV_HARDWARE_CONFIG.channels.main.loadVoltageV, 5);
  assert.equal(UV_HARDWARE_CONFIG.channels.short.loadVoltageV, 5);
  assert.equal(UV_HARDWARE_CONFIG.supplyByChannel.main.outputVoltageV, null);
  assert.equal(UV_HARDWARE_CONFIG.supplyByChannel.short.outputVoltageV, null);
  assert.equal(UV_HARDWARE_CONFIG.switching.verified, false);
  assert.equal(UV_HARDWARE_CONFIG.switching.isolated, false);
  assert.equal(UV_HARDWARE_CONFIG.sharedSupply.verified, false);
  assert.match(UV_HARDWARE_CONFIG.ownerReported.moduleStatus, /uv_illuminates_with_aux_power_not_pwm_switched/);
  assert.equal(UV_HARDWARE_CONFIG.ownerReported.currentPhysicalDisconnectVerified, false);
  assert.equal(UV_HARDWARE_CONFIG.physicalSafety.manualCutoffVerified, false);
  assert.equal(UV_HARDWARE_CONFIG.physicalSafety.physicalTwoChannelOffVerified, false);
  assert.equal(uvHardwareReady(UV_HARDWARE_CONFIG), false);
  const edge = await readFile(new URL("../backend/aux_control.ts", import.meta.url), "utf8");
  assert.match(edge, /digital:\{gpio:16,type:"WS2811",volts:12\}/);
  // The historical 12V AUX feed is NOT proof that its GPIO25/26 PWM stages
  // may switch separately powered 5V UV loads. Hardware remains UV OFF.
  assert.match(edge, /uvMain:\{gpio:25,type:"PWM White"\},uvShort:\{gpio:26,type:"PWM White"\}/);
});

test("verified two-channel request maps independent sliders and reports only broker acknowledgment", async () => {
  let sent = null;
  const result = await executeUvRequest({
    request: { mode: "MANUAL", brightnessBySegment: { main: 255, short: 80 } },
    state: gates, auxEnabled: true, uvEnabled: true, uvOutputsVerified: true, hardware: verifiedHardware,
    publish: async (payload, allowed, retain) => { sent = { payload, allowed, retain }; },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.mutationIssued, true);
  assert.deepEqual(result.body.caps, { main: 180, short: 80 });
  assert.deepEqual(sent.payload.seg.slice(1).map(({ id, on, bri, fx, ix, col }) => ({ id, on, bri, fx, ix, col })), [
    { id: 1, on: true, bri: 180, fx: 0, ix: 180, col: [[0, 0, 0, 255]] },
    { id: 2, on: true, bri: 80, fx: 0, ix: 80, col: [[0, 0, 0, 255]] },
  ]);
  assert.equal(sent.allowed, true);
  assert.equal(sent.retain, false, "UV MQTT command must never be retained");
  assert.equal(sent.payload.on, true, "explicit nonzero manual ON remains deliberate");
  assert.deepEqual(result.body.acknowledgement, {
    transport: "mqtt", qos: 1, acceptedByBroker: true, deviceReadback: false,
  });
});

test("output verification remains a mandatory no-publish gate even when every other gate passes", async () => {
  let published = false;
  const result = await executeUvRequest({
    request: { mode: "FOLLOW_MATRIX", brightnessBySegment: { main: 128, short: 64 } },
    state: gates, auxEnabled: true, uvEnabled: true, hardware: verifiedHardware,
    publish: async () => { published = true; },
  });
  assert.equal(result.status, 409);
  assert.equal(result.body.mutationIssued, false);
  assert.equal(result.body.output.main, 0);
  assert.equal(result.body.output.short, 0);
  assert.equal(published, false);
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
      ...input, uvOutputsVerified: true, hardware: verifiedHardware,
      publish: async () => { published = true; },
    });
    assert.equal(result.status, 409);
    assert.equal(result.body.mutationIssued, false);
    assert.equal(published, false);
  }
});

test("follow modes carry independent caps without retained MQTT actuation", async () => {
  let matrixPayload = null;
  const matrix = await executeUvRequest({
    request: { mode: "FOLLOW_MATRIX", brightnessBySegment: { main: 128, short: 64 }, matrixBrightness: 255, vibeEnvelope: 255 },
    state: gates, auxEnabled: true, uvEnabled: true, uvOutputsVerified: true, hardware: verifiedHardware,
    publish: async (payload) => { matrixPayload = payload; },
  });
  assert.equal(matrix.body.localAudioFollow, true);
  assert.deepEqual(matrix.body.caps, { main: 128, short: 64 });
  assert.deepEqual(matrixPayload.seg.slice(1).map(({ id, bri, fx, ix, col }) => ({ id, bri, fx, ix, col })), [
    { id: 1, bri: 255, fx: UV_FOLLOW_EFFECT_ID, ix: 128, col: [[0, 0, 0, 255]] },
    { id: 2, bri: 255, fx: UV_FOLLOW_EFFECT_ID, ix: 64, col: [[0, 0, 0, 255]] },
  ]);
  const vibe = await executeUvRequest({
    request: { mode: "VIBE_REACTIVE", brightnessBySegment: { main: 128, short: 64 }, vibeEnvelope: 0 },
    state: gates, auxEnabled: true, uvEnabled: true, uvOutputsVerified: true, hardware: verifiedHardware,
    publish: async () => {},
  });
  assert.deepEqual(vibe.body.caps, { main: 128, short: 64 });
  assert.equal(vibe.body.localAudioFollow, true);
});

test("missing mode defaults OFF without waking WLED or retaining a command", async () => {
  let published = null;
  const result = await executeUvRequest({
    request: { brightnessBySegment: { main: 96, short: 48 } },
    state: gates, auxEnabled: true, uvEnabled: true, uvOutputsVerified: true, hardware: verifiedHardware,
    publish: async (payload, allowed, retain) => { published = { payload, allowed, retain }; },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.mode, "OFF");
  assert.equal(published.allowed, true, "the actuation authorization must not be confused with retain=false");
  assert.equal(published.retain, false);
  assert.equal(Object.hasOwn(published.payload, "on"), false, "OFF must not globally turn the underglow on");
  assert.deepEqual(published.payload.seg.slice(1).map(({ id, on, bri }) => ({ id, on, bri })), [
    { id: 1, on: false, bri: 0 }, { id: 2, on: false, bri: 0 },
  ]);
});

test("hardware mapping requires reviewed facts and exact proposed GPIO/segment pairing", () => {
  assert.equal(uvHardwareReady(verifiedHardware), true);
  assert.equal(uvCommissioningReady(gates), true);
  assert.equal(uvHardwareReady({ ...verifiedHardware, channels: { ...verifiedHardware.channels, short: { ...verifiedHardware.channels.short, segmentId: 1 } } }), false);
  assert.equal(uvHardwareReady({ ...verifiedHardware, supplyByChannel: { ...verifiedHardware.supplyByChannel, short: { ...verifiedHardware.supplyByChannel.short, outputVoltageV: 12 } } }), false);
  assert.equal(uvHardwareReady({ ...verifiedHardware, channels: { ...verifiedHardware.channels, short: { ...verifiedHardware.channels.short, loadVoltageV: null } } }), false);
  assert.equal(uvHardwareReady({ ...verifiedHardware, switching: { ...verifiedHardware.switching, maxLoadVoltageV: 4.9 } }), false);
  assert.equal(uvHardwareReady({ ...verifiedHardware, sharedSupply: { ...verifiedHardware.sharedSupply, fuseRatingMa: 200 } }), false, "combined load must fit under the one shared fuse");
  assert.equal(uvHardwareReady({ ...verifiedHardware, channels: { ...verifiedHardware.channels, main: { ...verifiedHardware.channels.main, wireCurrentRatingMa: 299 } } }), false, "each branch wire must be protected by the shared fuse");
  assert.equal(uvHardwareReady({ ...verifiedHardware, sharedSupply: { ...verifiedHardware.sharedSupply, currentLimitMa: 299 } }), false, "shared supply rating must cover the shared fuse");
});


test("explicit OFF and zero-cap MANUAL never switch global AUX power ON", async () => {
  for (const [mode, caps] of [
    ["OFF", { main: 100, short: 70 }],
    ["MANUAL", { main: 0, short: 0 }],
  ]) {
    let published;
    const result = await executeUvRequest({
      request: { mode, brightnessBySegment: caps },
      state: gates, auxEnabled: true, uvEnabled: true, uvOutputsVerified: true, hardware: verifiedHardware,
      publish: async (payload, allowed, retain) => { published = { payload, allowed, retain }; },
    });
    assert.equal(result.status, 200);
    assert.equal(published.allowed, true);
    assert.equal(published.retain, false);
    assert.equal(Object.hasOwn(published.payload, "on"), false);
    assert.deepEqual(published.payload.seg.slice(1).map(s => s.on), [false, false]);
  }
});

test("unverified cold start and restart defaults refuse all UV actuation", async () => {
  for (const mode of [undefined, "MANUAL", "FOLLOW_MATRIX"]) {
    let publishCount = 0;
    const result = await executeUvRequest({
      request: { mode, brightnessBySegment: { main: 120, short: 85 } },
      state: gates, auxEnabled: true, uvEnabled: true, uvOutputsVerified: true,
      publish: async () => { publishCount++; },
    });
    assert.equal(result.status, 409);
    assert.equal(result.body.mutationIssued, false);
    assert.deepEqual(result.body.output, { main: 0, short: 0 });
    assert.equal(publishCount, 0);
  }
  // The pre-existing safe-boot preset implementation is independently
  // covered by tests/hbnf_aux_uv_pwm_boot_safety.py. A source check here
  // prevents the new UV policy path from silently dropping its OFF contract.
  const boot = await readFile(new URL("../commissioning/configure_uv_pwm_outputs.py", import.meta.url), "utf8");
  assert.match(boot, /def safe_boot_preset_body\(state, preset_id\):/);
  assert.match(boot, /def check_safe_boot_preset\(presets, preset_id, baseline_state=None\):/);
  assert.match(boot, /segments\\.get\\(i\\) or \\{\\}\\)\\.get\\("on"\\) is False/);
  assert.match(boot, /segments\\.get\\(i\\) or \\{\\}\\)\\.get\\("bri"\\) == 0/);
  assert.match(boot, /reboot_and_wait\(request\(TARGET_IP, "\/json\/info"/);
});

test("UV token check refuses absent, empty and incorrect credentials", () => {
  assert.equal(uvServiceTokenAuthorized("Bearer ", ""), false);
  assert.equal(uvServiceTokenAuthorized(null, ""), false);
  assert.equal(uvServiceTokenAuthorized("Bearer secret", ""), false);
  assert.equal(uvServiceTokenAuthorized("Bearer wrong", "secret"), false);
  assert.equal(uvServiceTokenAuthorized("Basic secret", "secret"), false);
  assert.equal(uvServiceTokenAuthorized("Bearer secret", "secret"), true);
});

test("unsupported UV commands and extra fields are not accepted by review paths", async () => {
  for (const mode of ["GLOW_LIVE", "COMMISSIONING_TEST", "__proto__"]) {
    let publishCount = 0;
    const result = await executeUvRequest({
      request: { mode, brightnessBySegment: { main: 85, short: 40 } },
      state: gates, auxEnabled: true, uvEnabled: true, uvOutputsVerified: true, hardware: verifiedHardware,
      publish: async () => { publishCount++; },
    });
    assert.equal(result.status, 400);
    assert.equal(result.body.mutationIssued, false);
    assert.equal(publishCount, 0);
  }
  const edge = await readFile(new URL("../backend/aux_control.ts", import.meta.url), "utf8");
  assert.match(edge, /!uvServiceTokenAuthorized\(req\.headers\.get\("Authorization"\),Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)\|\|""\)/);
  assert.match(edge, /if\(retain!==false\)throw new Error\("Retained AUX actuation is forbidden\."\)/);
  assert.match(edge, /c\.publish\(API,JSON\.stringify\(payload\),\{qos:1,retain:false\}/);
  assert.match(edge, /if\(action==="uv_policy"\)/);
  assert.match(edge, /if\(action==="uv"\)/);
  const opal = await readFile(new URL("../../staging/coordinated-backend/opal/owner-local-control/uv_policy_access.lua", import.meta.url), "utf8");
  assert.match(opal, /key ~= "mode" and key ~= "brightnessBySegment"/);
  assert.match(opal, /key ~= "main" and key ~= "short"/);
  assert.match(opal, /mode == "COMMISSIONING_TEST"/);
  assert.match(opal, /uv_electrical_qualification_not_admitted/);
});

test("the proposed 12V SP803E-to-isolated-repeater / 5V UV path is never admitted by wiring claims alone", () => {
  assert.equal(uvHardwareReady(verifiedHardware), true, "synthetic fully verified fixture qualifies the target contract");
  for (const gate of Object.keys(verifiedHardware.physicalSafety)) {
    assert.equal(uvHardwareReady({
      ...verifiedHardware, physicalSafety: { ...verifiedHardware.physicalSafety, [gate]: false },
    }), false, `physical gate ${gate} must block both UV outputs`);
    assert.equal(uvHardwareReady({
      ...verifiedHardware, physicalSafety: { ...verifiedHardware.physicalSafety, [gate]: undefined },
    }), false, `missing physical gate ${gate} must block both UV outputs`);
  }
  assert.equal(uvHardwareReady({ ...verifiedHardware, physicalSafety: undefined }), false);
  for (const switching of [
    { method: "unisolated_sp803e_mosfet" },
    { isolated: false },
    { inputVoltageV: 5 },
    { outputVoltageV: 12 },
    { pwmFrequencyHz: 100 },
    { pwmFrequencyHz: 2500 },
  ]) {
    assert.equal(uvHardwareReady({ ...verifiedHardware,
      switching: { ...verifiedHardware.switching, ...switching } }), false,
      `invalid switching contract: ${Object.keys(switching)[0]}`);
  }
  assert.equal(uvHardwareReady({ ...verifiedHardware, channels: {
    ...verifiedHardware.channels, main: { ...verifiedHardware.channels.main, loadVoltageV: 12 },
  } }), false, "historic 12V UV must never silently stand in for the owner-measured 5V load");
});

test("Opal enforces every physical-safety gate and 12V PWM to 5V isolation contract", async () => {
  const opal = await readFile(new URL("../../staging/coordinated-backend/opal/owner-local-control/uv_runtime.lua", import.meta.url), "utf8");
  const spec = await readFile(new URL("../backend/aux_uv_policy_spec.json", import.meta.url), "utf8");
  const contract = JSON.parse(spec);
  assert.equal(contract.switching.method, "opto_isolated_cv_pwm_repeater");
  assert.equal(contract.switching.controlVoltage, 12);
  assert.equal(contract.switching.loadVoltage, 5);
  assert.deepEqual(contract.switching.pwmFrequencyHz, { minimum: 200, maximum: 2000 });
  assert.deepEqual(contract.requiredPhysicalSafetyGates.sort(),
    Object.keys(verifiedHardware.physicalSafety).sort());
  assert.match(opal, /ipairs\(policy\.requiredPhysicalSafetyGates\)/);
  assert.match(opal, /profile\.physicalSafety\[key\] ~= true/);
  assert.match(opal, /switching\.method ~= switchingSpec\.method/);
  assert.match(opal, /switching\.inputVoltageV\) ~= tonumber\(switchingSpec\.controlVoltage\)/);
  assert.match(opal, /switching\.outputVoltageV\) ~= tonumber\(switchingSpec\.loadVoltage\)/);
  assert.match(opal, /frequency_limits\.minimum/);
  assert.match(opal, /frequency_limits\.maximum/);
});

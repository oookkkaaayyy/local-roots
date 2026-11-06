import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { executeUvRequest, UV_HARDWARE_CONFIG, uvHardwareReady, uvSame5vHardwareReady } from "../backend/aux_uv_command.mjs";

const contract = JSON.parse(await readFile(new URL("../backend/aux_uv_policy_spec.json", import.meta.url), "utf8"));
const clone = value => structuredClone(value);

// All of these attestations are deliberately SYNTHETIC TEST DATA.
// No Cart hardware is qualified, wired, or powered by this fixture.
function fictitiousBenchAccepted() {
  const h = clone(UV_HARDWARE_CONFIG);
  const spec = contract.same5vCandidate;
  h.verified = true;
  h.evidence = "SYNTHETIC-DO-NOT-INSTALL";
  h.topologyId = spec.schema;
  h.hardwareQualification = {
    boardRevision: "FIXTURE-NOT-A-REAL-BOARD",
    installedBoardEvidenceSha256: "a".repeat(64),
    dummyLoadAndOpticalAcceptanceSha256: "b".repeat(64),
    manufacturerRatedLowSideOutputs: true,
    manualResetNoAutoRearmObserved: true,
    gpio16AddressableRailPreserved: true,
  };
  h.physicalSafety = Object.fromEntries(contract.same5vRequiredSafetyGates.map(key => [key, true]));
  h.switching = {
    verified: true, isolated: false, method: spec.method,
    inputVoltageV: 5, outputVoltageV: 5, maxLoadVoltageV: 5,
    channels: 2, maxChannelCurrentMa: 6000, maxTotalCurrentMa: 12000,
    pwmFrequencyHz: 19531, measuredPwmFrequencyHz: 19520,
  };
  h.sharedSupply = {
    verified: true,
    topology: spec.sharedSupplyTopology,
    converter: "TOBSUN EA50-5V",
    controllerInputVoltageV: 5,
    addressableSupplyVoltageV: 12,
    addressableDataGpio: 16,
    addressableGroups: 22,
    fuseRatingMa: 5000,
    trunkWireCurrentRatingMa: 6000,
    converterOutputContinuousRatingMa: 10000,
    controllerCurrentMarginMa: 400,
    measuredCombinedPeakMa: 2700,
    currentLimitMa: 9000,
  };
  h.supplyByChannel = {
    main: { outputVoltageV: 5, currentLimitMa: 3000 },
    short: { outputVoltageV: 5, currentLimitMa: 2500 },
  };
  h.channels = {
    main: { gpio: 25, segmentId: 1, loadVoltageV: 5, loadCurrentMa: 800,
      measuredPeakCurrentMa: 1100, fuseRatingMa: 1500, wireCurrentRatingMa: 2000 },
    short: { gpio: 26, segmentId: 2, loadVoltageV: 5, loadCurrentMa: 520,
      measuredPeakCurrentMa: 800, fuseRatingMa: 1000, wireCurrentRatingMa: 1500 },
  };
  h.maxBrightness = 190;
  return h;
}

test("current reported direct-ground UV wiring remains entirely unqualified", async () => {
  assert.equal(UV_HARDWARE_CONFIG.verified, false);
  assert.equal(UV_HARDWARE_CONFIG.ownerReported.currentSp803eSupplyV, 12);
  assert.equal(UV_HARDWARE_CONFIG.ownerReported.currentNegativeReturnByChannel.main,
    "three_port_common_ground_unswitched");
  assert.equal(UV_HARDWARE_CONFIG.ownerReported.currentNegativeReturnByChannel.short,
    "TOBSUN_OUT_MINUS_unswitched");
  assert.equal(UV_HARDWARE_CONFIG.plannedCandidateNotInstalled.asBuilt, false);
  assert.equal(uvHardwareReady(UV_HARDWARE_CONFIG), false);
  assert.equal(uvSame5vHardwareReady(UV_HARDWARE_CONFIG), false);
  let called = false;
  const out = await executeUvRequest({
    request: { mode: "MANUAL", brightnessBySegment: { main: 200, short: 120 } },
    state: Object.fromEntries(contract.requiredCommissioningGates.map(k => [k, true])),
    auxEnabled: true, uvEnabled: true, uvOutputsVerified: true,
    publish: async () => { called = true; },
  });
  assert.equal(out.status, 409);
  assert.equal(out.body.mutationIssued, false);
  assert.equal(called, false);
});

test("separately qualified same-5V synthetic profile can drive two independent WLED logical segments", async () => {
  const h = fictitiousBenchAccepted();
  assert.equal(uvSame5vHardwareReady(h), true);
  assert.equal(uvHardwareReady(h), true);
  const cmds = [];
  const args = {
    hardware: h, auxEnabled: true, uvEnabled: true, uvOutputsVerified: true,
    state: Object.fromEntries(contract.requiredCommissioningGates.map(k => [k, true])),
    publish: async (payload, allowed, retain) => cmds.push({ payload, allowed, retain }),
  };
  const manual = await executeUvRequest({ ...args,
    request: { mode: "MANUAL", brightnessBySegment: { main: 100, short: 20 } } });
  assert.equal(manual.status, 200);
  assert.deepEqual(cmds[0].payload.seg.map(s => s.id), [0, 1, 2]);
  assert.deepEqual(cmds[0].payload.seg.slice(1).map(s => s.bri), [100, 20]);
  assert.deepEqual(cmds[0].payload.seg.slice(1).map(s => s.col), [[[0,0,0,255]],[[0,0,0,255]]]);
  assert.equal(cmds[0].retain, false);
  const following = await executeUvRequest({ ...args,
    request: { mode: "FOLLOW_MATRIX", brightnessBySegment: { main: 100, short: 20 } } });
  assert.equal(following.status, 200);
  assert.deepEqual(cmds[1].payload.seg.slice(1).map(s => [s.fx, s.ix]), [[248,100],[248,20]]);
  const off = await executeUvRequest({ ...args,
    request: { mode: "OFF", brightnessBySegment: { main: 100, short: 20 } } });
  assert.equal(off.status, 200);
  assert.equal("on" in cmds[2].payload, false, "UV OFF cannot power on the whole underglow");
  assert.deepEqual(cmds[2].payload.seg.slice(1).map(s => [s.on,s.bri]), [[false,0],[false,0]]);
  assert.deepEqual(cmds.map(c => c.retain), [false,false,false]);
});

test("every new physical gate independently blocks the same-5V profile", () => {
  const fixture = fictitiousBenchAccepted();
  assert.ok(contract.same5vRequiredSafetyGates.length >= 15);
  for (const key of contract.same5vRequiredSafetyGates) {
    for (const value of [false, null, undefined]) {
      const h = clone(fixture);
      h.physicalSafety[key] = value;
      assert.equal(uvHardwareReady(h), false, key + " missing or false");
    }
  }
  for (const name of ["verified","evidence","topologyId","hardwareQualification"]) {
    const h = clone(fixture);
    delete h[name];
    assert.equal(uvHardwareReady(h), false, "missing " + name);
  }
});

test("topology, installed-board identity, PWM and no-auto-rearm proof cannot be inherited from 12V repeater", () => {
  const fixture = fictitiousBenchAccepted();
  for (const [field,value] of [
    ["isolated",true],["method","opto_isolated_cv_pwm_repeater"],
    ["inputVoltageV",12],["outputVoltageV",12],["maxLoadVoltageV",4],
    ["channels",1],["pwmFrequencyHz",0],["measuredPwmFrequencyHz",1000],
  ]) {
    const h = clone(fixture); h.switching[field]=value;
    assert.equal(uvHardwareReady(h), false, "invalid switching." + field);
  }
  for (const field of ["installedBoardEvidenceSha256","dummyLoadAndOpticalAcceptanceSha256"]) {
    const h = clone(fixture); h.hardwareQualification[field] = "unverified";
    assert.equal(uvHardwareReady(h), false, field);
  }
  for (const field of ["manufacturerRatedLowSideOutputs","manualResetNoAutoRearmObserved",
    "gpio16AddressableRailPreserved"]) {
    const h = clone(fixture); h.hardwareQualification[field] = false;
    assert.equal(uvHardwareReady(h), false, field);
  }
});

test("old ground bypass, power rails, peak current, branch protection and 22-group geometry are hard rejection conditions", () => {
  const fixture = fictitiousBenchAccepted();
  const changes = [
    h=>{h.sharedSupply.controllerInputVoltageV=12},
    h=>{h.sharedSupply.addressableSupplyVoltageV=5},
    h=>{h.sharedSupply.addressableDataGpio=25},
    h=>{h.sharedSupply.addressableGroups=24},
    h=>{h.sharedSupply.topology="old_12v_control_with_5v_aux"},
    h=>{h.sharedSupply.trunkWireCurrentRatingMa=1000},
    h=>{h.sharedSupply.fuseRatingMa=100},
    h=>{h.sharedSupply.currentLimitMa=1000},
    h=>{h.sharedSupply.converterOutputContinuousRatingMa=2000},
    h=>{h.sharedSupply.measuredCombinedPeakMa=2000},
    h=>{h.sharedSupply.controllerCurrentMarginMa=0},
    h=>{h.channels.main.gpio=26},
    h=>{h.channels.short.segmentId=1},
    h=>{h.channels.main.loadVoltageV=12},
    h=>{h.channels.main.measuredPeakCurrentMa=3000},
    h=>{h.channels.main.fuseRatingMa=500},
    h=>{h.channels.short.wireCurrentRatingMa=600},
    h=>{h.switching.maxChannelCurrentMa=500},
    h=>{h.switching.maxTotalCurrentMa=1000},
  ];
  for (const [i,mutate] of changes.entries()) {
    const h = clone(fixture); mutate(h);
    assert.equal(uvHardwareReady(h), false, "rejected mismatch index " + i);
  }
});

test("Opal runtime includes exact same-5V path and never promotes synthetic or historic isolation gates", async () => {
  const opal = await readFile(new URL("../../staging/coordinated-backend/opal/owner-local-control/uv_runtime.lua", import.meta.url), "utf8");
  assert.match(opal, /function M.same5v_profile_ready\(profile, policy\)/);
  assert.match(opal, /profile.switching.method == policy.same5vCandidate.method/);
  assert.match(opal, /ipairs\(required\)/);
  assert.match(opal, /profile.physicalSafety\[key\] ~= true/);
  assert.match(opal, /sw.isolated ~= false/);
  assert.match(opal, /shared.addressableDataGpio ~= spec.addressableDataGpio/);
  assert.match(opal, /proof.manualResetNoAutoRearmObserved ~= true/);
  assert.match(opal, /shared.measuredCombinedPeakMa < lamp_peak \+ shared.controllerCurrentMarginMa/);
  assert.match(opal, /switching.method ~= switchingSpec.method/, "original isolated-repeater path remains closed and unchanged");
  for (const gate of contract.same5vRequiredSafetyGates)
    assert.equal(UV_HARDWARE_CONFIG.physicalSafety[gate], false, "review profile never claims " + gate);
});

import test from "node:test";
import assert from "node:assert/strict";
import { inspectUvChannel, buildUvBrightnessPatch, verifyUvReadback } from "../hbnf-final-controller/hbnf-cart-uv.mjs";

const device = { mac: "8c94df55c34c" };
function setup() {
  return {
    config: { hw: { led: { ins: [
      { type: 22, pin: [16], start: 0, len: 22 },
      { type: 41, pin: [25], start: 22, len: 1 }
    ] } } },
    state: { on: true, bri: 255, seg: [
      { id: 0, start: 0, stop: 22, on: true, bri: 255, fx: 55 },
      { id: 1, start: 22, stop: 23, on: false, bri: 1, fx: 0 }
    ] },
    channel: { gpio: 25, segmentId: 1 },
    evidence: {
      physicalWiringVerified: true,
      uvRatedVolts: 12,
      supplyVolts: 12,
      branchProtectionVerified: true,
      failOffOnBootVerified: true,
      ddpMainSegmentOnlyVerified: true
    }
  };
}
function admit(p) { return inspectUvChannel(p.config, p.state, device, p.channel, p.evidence); }

test("isolated GPIO25 UV segment admitted only with complete physical evidence", () => {
  const p = setup();
  const a = admit(p);
  assert.equal(a.ready, true);
  assert.equal(a.segmentId, 1);
  assert.equal(a.defaultSoftwareBrightnessCap, 96);
  assert.deepEqual(a.failures, []);
});
test("UV command changes only its own segment, no master brightness or DDP", () => {
  const p = setup(), a = admit(p);
  const patch = buildUvBrightnessPatch(a, 42);
  assert.deepEqual(patch, { udpn: { nn: true }, seg: [{ id: 1, on: true, bri: 42 }] });
  assert.equal("on" in patch, false);
  assert.equal("bri" in patch, false);
  assert.equal("live" in patch, false);
  assert.equal("mainseg" in patch, false);
  assert.equal(patch.seg.some(seg => seg.id === 0), false);
  assert.equal(p.state.seg[0].bri, 255);
});
test("off uses per-segment on=false and keeps a nonzero stored brightness", () => {
  const patch = buildUvBrightnessPatch(admit(setup()), 0);
  assert.deepEqual(patch.seg, [{ id: 1, on: false, bri: 1 }]);
});
test("software brightness cap rejects excess and non-integers", () => {
  const a = admit(setup());
  for (const v of [-1, 97, 255, 10.5, "12", null, NaN]) {
    assert.throws(() => buildUvBrightnessPatch(a, v));
  }
  assert.equal(buildUvBrightnessPatch(a, 96).seg[0].bri, 96);
});
test("readback must match exact commanded segment", () => {
  const p = setup(), a = admit(p);
  assert.equal(verifyUvReadback(p.state, a, 0), true);
  assert.equal(verifyUvReadback(p.state, a, 32), false);
  p.state.seg[1].on = true; p.state.seg[1].bri = 32;
  assert.equal(verifyUvReadback(p.state, a, 32), true);
  assert.equal(verifyUvReadback(p.state, a, 31), false);
});
test("refuse unexpected AUX identity", () => {
  const p = setup();
  assert.equal(inspectUvChannel(p.config, p.state, { mac: "unknown" }, p.channel, p.evidence).ready, false);
});
test("refuse UV segment overlapping 22-pixel DDP underglow", () => {
  const p = setup();
  p.config.hw.led.ins[1].start = 21;
  p.state.seg[1].start = 21; p.state.seg[1].stop = 22;
  assert.equal(admit(p).ready, false);
});
test("refuse analog bus with wrong GPIO or bus type", () => {
  const p = setup();
  p.config.hw.led.ins[1].type = 22;
  assert.equal(admit(p).ready, false);
  p.config.hw.led.ins[1].type = 41; p.config.hw.led.ins[1].pin = [26];
  assert.equal(admit(p).ready, false);
});
test("refuse incomplete hardware readiness and realtime isolation", () => {
  for (const field of [
    "physicalWiringVerified", "branchProtectionVerified",
    "failOffOnBootVerified", "ddpMainSegmentOnlyVerified"
  ]) {
    const p = setup(); p.evidence[field] = false;
    const a = admit(p);
    assert.equal(a.ready, false, field);
    assert.throws(() => buildUvBrightnessPatch(a, 12));
  }
});
test("refuse 5V USB UV strip on 12V source", () => {
  const p = setup(); p.evidence.uvRatedVolts = 5;
  assert.equal(admit(p).ready, false);
});
test("refuse missing /json/cfg or incomplete /json/state", () => {
  const p = setup(); p.config = null;
  assert.equal(admit(p).ready, false);
  p.config = setup().config; p.state.seg = [];
  assert.equal(admit(p).ready, false);
});

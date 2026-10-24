// HBNF Cart 2.0 — independent SP803E UV segment control, NOT active until commissioned.
// Pure validation/patch generation: it performs no network calls or hardware writes.
// Requires a verified 12V PWM channel separate from the GPIO16 WS2811/22-pixel DDP bus.
// WLED API: https://kno.wled.ge/interfaces/json-api/
// SP803E PWM wiring: https://www.btf-lighting.com/en-intl/products/sp803e-wled-esp32-wifi-led-controller

const PWM_MONO = 41;
const GPIO_UV = [25, 26, 27];
const MAX_DEFAULT_BRIGHTNESS = 96; // conservative software setting, NOT a UV exposure limit

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function integer(value) {
  return typeof value === "number" && Number.isInteger(value);
}
function findSegment(state, id) {
  if (!state || !Array.isArray(state.seg)) return null;
  return state.seg.find(function (segment) { return segment && segment.id === id; }) || null;
}
function busPins(bus) {
  if (!bus || !Array.isArray(bus.pin)) return [];
  return bus.pin.filter(function (pin) { return integer(pin) && pin >= 0; });
}
function getBuses(config) {
  const hw = config && config.hw;
  const led = hw && hw.led;
  return led && Array.isArray(led.ins) ? led.ins : null;
}

/**
 * Read-only admission for exactly one monochrome PWM UV segment.
 *
 * config = fetched WLED /json/cfg; state = /json/state; info = /json/info.
 * commissioning is an external physically verified record; never infer
 * wiring, strip voltage, fuse rating or boot-off behavior from WLED JSON.
 *
 * This deliberately refuses a UV segment which overlaps the 22-pixel
 * DDP underglow or has no uniquely matching hardware bus.
 */
export function inspectUvChannel(config, state, info, channel, commissioning) {
  const failures = [];
  function requireCondition(ok, message) { if (!ok) failures.push(message); }
  const buses = getBuses(config);
  const target = channel || {};
  const evidence = commissioning || {};
  const gpio = target.gpio;
  const segmentId = target.segmentId;
  const uv = findSegment(state, segmentId);
  const matched = buses && buses.filter(function (bus) {
    const pins = busPins(bus);
    return bus && bus.type === PWM_MONO && pins.length === 1 && pins[0] === gpio;
  }) || [];
  const underglow = buses && buses.filter(function (bus) {
    return bus && bus.start === 0 && bus.len === 22 && busPins(bus).indexOf(16) >= 0;
  }) || [];

  requireCondition(buses !== null, "WLED bus configuration unavailable");
  requireCondition(info && String(info.mac || "").toLowerCase().replace(/:/g, "") === "8c94df55c34c",
    "AUX device identity not verified");
  requireCondition(integer(gpio) && GPIO_UV.indexOf(gpio) >= 0,
    "UV GPIO must be SP803E IO25/IO26/IO27");
  requireCondition(integer(segmentId) && segmentId > 0,
    "UV must have a segment ID separate from main underglow");
  requireCondition(underglow.length === 1, "Existing GPIO16 22-pixel underglow configuration not verified");
  requireCondition(matched.length === 1, "Exactly one independent monochrome PWM bus must match UV GPIO");
  requireCondition(!!uv && integer(uv.start) && integer(uv.stop) && uv.stop === uv.start + 1,
    "UV must have a one-pixel standalone segment");
  if (uv && matched.length === 1) {
    requireCondition(uv.start === matched[0].start && matched[0].len === 1,
      "UV segment does not map exactly to its PWM bus");
    requireCondition(uv.start >= 22, "UV segment overlaps DDP underglow");
  }
  if (uv && underglow.length === 1) {
    requireCondition(uv.start >= underglow[0].start + underglow[0].len,
      "UV segment overlaps underglow");
  }
  // WLED's firmware/controller JSON does not establish physical load voltage,
  // safe branch current, fuse fit, stable 12V power or startup fail-off.
  requireCondition(evidence.physicalWiringVerified === true,
    "Physical UV wiring has not been inspected and accepted");
  requireCondition(evidence.uvRatedVolts === 12 && evidence.supplyVolts === 12,
    "12V source and 12V UV load must match");
  requireCondition(evidence.branchProtectionVerified === true,
    "UV wire/branch overcurrent protection not verified");
  requireCondition(evidence.failOffOnBootVerified === true,
    "UV output must be proven OFF through boot and resets");
  requireCondition(evidence.ddpMainSegmentOnlyVerified === true,
    "DDP must be proven to leave the separate UV segment independent");
  return {
    ready: failures.length === 0,
    failures: failures,
    gpio: gpio,
    segmentId: segmentId,
    // Do not confuse this with max physical UV irradiance.
    defaultSoftwareBrightnessCap: MAX_DEFAULT_BRIGHTNESS
  };
}

/** Generate a deliberately minimal, single-segment JSON API update. */
export function buildUvBrightnessPatch(admission, requestedBrightness, cap) {
  assert(admission && admission.ready === true, "UV channel is not physically commissioned");
  const ceiling = cap === undefined ? MAX_DEFAULT_BRIGHTNESS : cap;
  assert(integer(ceiling) && ceiling > 0 && ceiling <= 255,
    "Invalid software brightness cap");
  assert(integer(requestedBrightness) && requestedBrightness >= 0 &&
    requestedBrightness <= ceiling, "UV brightness exceeds commissioned software cap");
  assert(integer(admission.segmentId) && admission.segmentId > 0,
    "UV segment identity unavailable");
  return {
    // Never set global bri/on, mainseg, segment geometry, presets, live or sync.
    udpn: { nn: true },
    seg: [{ id: admission.segmentId, on: requestedBrightness > 0,
      bri: requestedBrightness > 0 ? requestedBrightness : 1 }]
  };
}

/** Confirm only the requested UV segment; never infer a physical irradiance level. */
export function verifyUvReadback(state, admission, requestedBrightness) {
  if (!admission || !admission.ready) return false;
  const seg = findSegment(state, admission.segmentId);
  if (!seg) return false;
  if (requestedBrightness === 0) return seg.on === false;
  return seg.on === true && seg.bri === requestedBrightness;
}

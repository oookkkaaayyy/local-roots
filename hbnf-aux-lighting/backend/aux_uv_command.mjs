import { UV_MODES, UV_OFFLINE_CONFIG, nextUvOutputs } from "./aux_uv_policy.mjs";

// Deliberately incomplete until the power-off hardware evidence is reviewed.
// Do not fill these fields from a browser request or commissioning notes.
export const UV_HARDWARE_CONFIG = Object.freeze({
  verified: false,
  evidence: null,
  supply: Object.freeze({ outputVoltage: 5, currentLimitMa: 0 }),
  switching: Object.freeze({ verified: false, isolated: false, outputVoltage: 5, controlInputMinVoltage: 0, controlInputMaxVoltage: 0, channels: 0, maxChannelCurrentMa: 0, maxTotalCurrentMa: 0 }),
  fuse: Object.freeze({ verified: false, ratingMa: 0 }),
  wire: Object.freeze({ currentRatingMa: 0 }),
  maxBrightness: 0,
  channels: Object.freeze({
    main: Object.freeze({ gpio: null, segmentId: null, loadCurrentMa: 0 }),
    short: Object.freeze({ gpio: null, segmentId: null, loadCurrentMa: 0 }),
  }),
});

const REQUIRED_BASE_GATES = ["hardware_wired", "power_verified", "gpio_verified", "current_limit_verified", "segments_verified"];
const clamp8 = (value) => Math.max(0, Math.min(255, Math.round(Number.isFinite(Number(value)) ? Number(value) : 0)));

export function uvHardwareReady(config = UV_HARDWARE_CONFIG) {
  const main = config?.channels?.main;
  const short = config?.channels?.short;
  const supplyMa = Number(config?.supply?.currentLimitMa) || 0;
  const switchChannelMa = Number(config?.switching?.maxChannelCurrentMa) || 0;
  const switchTotalMa = Number(config?.switching?.maxTotalCurrentMa) || 0;
  const fuseMa = Number(config?.fuse?.ratingMa) || 0;
  const wireMa = Number(config?.wire?.currentRatingMa) || 0;
  const loadsMa = (Number(main?.loadCurrentMa) || 0) + (Number(short?.loadCurrentMa) || 0);
  return config?.verified === true
    && typeof config.evidence === "string" && config.evidence.trim().length > 0
    && config.supply?.outputVoltage === 5 && supplyMa > 0
    && config.switching?.verified === true && config.switching?.isolated === true && config.switching?.outputVoltage === 5
    && config.switching?.controlInputMinVoltage <= 3.3 && config.switching?.controlInputMaxVoltage >= 3.3
    && config.switching?.channels === 2 && switchChannelMa > 0 && switchTotalMa >= loadsMa
    && config.fuse?.verified === true && fuseMa >= loadsMa && fuseMa <= supplyMa
    && fuseMa <= switchTotalMa && fuseMa <= wireMa && wireMa > 0 && loadsMa > 0 && supplyMa >= loadsMa
    && config.maxBrightness > 0 && config.maxBrightness <= 255
    && main?.gpio === 25 && main?.segmentId === 1 && main?.loadCurrentMa > 0 && main.loadCurrentMa <= switchChannelMa
    && short?.gpio === 26 && short?.segmentId === 2 && short?.loadCurrentMa > 0 && short.loadCurrentMa <= switchChannelMa
    && main.segmentId !== short.segmentId;
}

export function uvCommissioningReady(state = {}) {
  return REQUIRED_BASE_GATES.every((key) => state?.[key] === true);
}

export async function executeUvRequest({ request = {}, state = {}, auxEnabled = false, uvEnabled = false, hardware = UV_HARDWARE_CONFIG, publish }) {
  const mode = String(request.mode || "OFF").toUpperCase();
  if (!UV_MODES.includes(mode)) {
    return { status: 400, body: { ok: false, action: "uv_policy", mutationIssued: false, error: "Unknown UV response mode." } };
  }
  const requested = {
    main: clamp8(request.brightnessBySegment?.main),
    short: clamp8(request.brightnessBySegment?.short),
  };
  const liveReady = auxEnabled === true && uvEnabled === true && uvHardwareReady(hardware) && uvCommissioningReady(state);
  if (!liveReady) {
    const offline = { ...UV_OFFLINE_CONFIG, segmentIds: ["main", "short"] };
    const output = Object.fromEntries(nextUvOutputs({ mode, manualBrightnessBySegment: requested }, offline, {
      matrixBrightness: request.matrixBrightness,
      vibeEnvelope: request.vibeEnvelope,
    }).map(({ id, brightness }) => [id, brightness]));
    return { status: 409, body: {
      ok: false, action: "uv_policy", mutationIssued: false, preview: true,
      error: "UV remains preview-only until the verified 5V channel profile and commissioning gates are present.",
      mode, requested, output,
    } };
  }

  if (typeof publish !== "function") throw new TypeError("AUX publish function is required for an enabled UV command.");
  const policy = {
    enabled: true, hardwareAvailable: true,
    maxBrightness: hardware.maxBrightness,
    rampPerTick: hardware.maxBrightness,
    segmentIds: ["main", "short"],
  };
  const output = Object.fromEntries(nextUvOutputs({ mode, manualBrightnessBySegment: requested }, policy, {
    matrixBrightness: request.matrixBrightness,
    vibeEnvelope: request.vibeEnvelope,
  }).map(({ id, brightness }) => [id, brightness]));
  const payload = { on: true, mainseg: 0, seg: [
    { id: 0, sel: true },
    { id: hardware.channels.main.segmentId, on: output.main > 0, bri: output.main, sel: false, col: [[255, 255, 255]] },
    { id: hardware.channels.short.segmentId, on: output.short > 0, bri: output.short, sel: false, col: [[255, 255, 255]] },
  ] };
  await publish(payload, true);
  return { status: 200, body: {
    ok: true, action: "uv_policy", mutationIssued: true, preview: false,
    mode, requested, output, payload,
    acknowledgement: { transport: "mqtt", qos: 1, acceptedByBroker: true, deviceReadback: false },
  } };
}

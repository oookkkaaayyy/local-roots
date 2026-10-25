import { UV_MODES, UV_OFFLINE_CONFIG, nextUvOutputs } from "./aux_uv_policy.mjs";

// Deliberately incomplete until the owner-recorded, in-person hardware
// verification establishes the exact parts, safe ratings, and output mapping.
// Never populate these fields from a browser request or unverified notes.
export const UV_HARDWARE_CONFIG = Object.freeze({
  verified: false,
  evidence: null,
  // Owner reports both installed UV strips are iNextStation 5V USB-A units.
  // This is a reported load voltage, not proof of current, supply, switching,
  // protection, or channel mapping. Keep the profile unverified and fail-dark.
  supplyByChannel: Object.freeze({
    main: Object.freeze({ outputVoltageV: null, currentLimitMa: 0 }),
    short: Object.freeze({ outputVoltageV: null, currentLimitMa: 0 }),
  }),
  switching: Object.freeze({ verified: false, isolated: false, maxLoadVoltageV: 0, controlInputMinVoltage: 0, controlInputMaxVoltage: 0, channels: 0, maxChannelCurrentMa: 0, maxTotalCurrentMa: 0 }),
  maxBrightness: 0,
  channels: Object.freeze({
    main: Object.freeze({ gpio: null, segmentId: null, loadVoltageV: 5, loadCurrentMa: 0, fuseRatingMa: 0, wireCurrentRatingMa: 0 }),
    short: Object.freeze({ gpio: null, segmentId: null, loadVoltageV: 5, loadCurrentMa: 0, fuseRatingMa: 0, wireCurrentRatingMa: 0 }),
  }),
});

export const UV_FOLLOW_EFFECT_ID = 248;

const REQUIRED_BASE_GATES = ["hardware_wired", "power_verified", "gpio_verified", "current_limit_verified", "segments_verified"];
const REQUIRED_UV_GATES = ["uv_main_verified", "uv_short_verified", "uv_full_verified", "thermal_verified", "mixed_load_verified"];
const clamp8 = (value) => Math.max(0, Math.min(255, Math.round(Number.isFinite(Number(value)) ? Number(value) : 0)));

export function uvHardwareReady(config = UV_HARDWARE_CONFIG) {
  const main = config?.channels?.main;
  const short = config?.channels?.short;
  const switchChannelMa = Number(config?.switching?.maxChannelCurrentMa) || 0;
  const switchTotalMa = Number(config?.switching?.maxTotalCurrentMa) || 0;
  const supplyMainMa = Number(config?.supplyByChannel?.main?.currentLimitMa) || 0;
  const supplyShortMa = Number(config?.supplyByChannel?.short?.currentLimitMa) || 0;
  const loadsMa = (Number(main?.loadCurrentMa) || 0) + (Number(short?.loadCurrentMa) || 0);
  const channelSafe = (channel, supply, supplyMa) => Number.isFinite(channel?.loadVoltageV)
    && channel.loadVoltageV > 0
    && supply?.outputVoltageV === channel.loadVoltageV
    && supplyMa >= channel.loadCurrentMa
    && Number(channel?.loadCurrentMa) > 0
    && Number(channel?.fuseRatingMa) >= channel.loadCurrentMa
    && channel.fuseRatingMa <= supplyMa
    && Number(channel?.wireCurrentRatingMa) >= channel.fuseRatingMa;
  return config?.verified === true
    && typeof config.evidence === "string" && config.evidence.trim().length > 0
    && channelSafe(main, config.supplyByChannel?.main, supplyMainMa)
    && channelSafe(short, config.supplyByChannel?.short, supplyShortMa)
    && config.switching?.verified === true && config.switching?.isolated === true
    && Number(config.switching?.maxLoadVoltageV) >= Math.max(main?.loadVoltageV || Infinity, short?.loadVoltageV || Infinity)
    && config.switching?.controlInputMinVoltage <= 3.3 && config.switching?.controlInputMaxVoltage >= 3.3
    && config.switching?.channels === 2 && switchChannelMa > 0 && switchTotalMa >= loadsMa
    && config.maxBrightness > 0 && config.maxBrightness <= 255
    && main?.gpio === 25 && main?.segmentId === 1 && main?.loadCurrentMa > 0 && main.loadCurrentMa <= switchChannelMa
    && short?.gpio === 26 && short?.segmentId === 2 && short?.loadCurrentMa > 0 && short.loadCurrentMa <= switchChannelMa
    && main.segmentId !== short.segmentId;
}

export function uvCommissioningReady(state = {}) {
  return [...REQUIRED_BASE_GATES, ...REQUIRED_UV_GATES].every((key) => state?.[key] === true);
}

export async function executeUvRequest({ request = {}, state = {}, auxEnabled = false, uvEnabled = false, hardware = UV_HARDWARE_CONFIG, publish }) {
  const mode = String(request.mode || "FOLLOW_MATRIX").toUpperCase();
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
      error: "UV remains preview-only until the exact load, switching path, and commissioning gates are verified.",
      mode, requested, output,
    } };
  }

  if (typeof publish !== "function") throw new TypeError("AUX publish function is required for an enabled UV command.");
  const caps = {
    main: Math.min(requested.main, hardware.maxBrightness),
    short: Math.min(requested.short, hardware.maxBrightness),
  };
  const followsAudio = mode === "FOLLOW_MATRIX" || mode === "VIBE_REACTIVE";
  const segment = (id, cap) => {
    if (mode === "OFF" || cap === 0) return { id, on: false, bri: 0, fx: 0, ix: 0, sel: false };
    if (followsAudio) return { id, on: true, bri: 255, fx: UV_FOLLOW_EFFECT_ID, ix: cap, sel: false, col: [[255,255,255]] };
    return { id, on: true, bri: cap, fx: 0, ix: cap, sel: false, col: [[255,255,255]] };
  };
  const payload = { on: true, mainseg: 0, seg: [
    { id: 0, sel: true },
    segment(hardware.channels.main.segmentId, mode === "OFF" ? 0 : caps.main),
    segment(hardware.channels.short.segmentId, mode === "OFF" ? 0 : caps.short),
  ] };
  await publish(payload, true);
  return { status: 200, body: {
    ok: true, action: "uv_policy", mutationIssued: true, preview: false,
    mode, requested, caps, localAudioFollow: followsAudio, payload,
    acknowledgement: { transport: "mqtt", qos: 1, acceptedByBroker: true, deviceReadback: false },
  } };
}

import { UV_MODES, UV_OFFLINE_CONFIG, UV_POLICY_SPEC, nextUvOutputs } from "./aux_uv_policy.mjs";
import UV_HARDWARE_PROFILE from "./uv_hardware_profile.json" with { type: "json" };

// Shared with the local Opal gateway. Owner-reported mapping/status is retained
// in the profile, while every operational gate remains false until acceptance.
const deepFreeze = value => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};
export const UV_HARDWARE_CONFIG = deepFreeze(UV_HARDWARE_PROFILE);

export const UV_FOLLOW_EFFECT_ID = UV_POLICY_SPEC.followEffectId;
const REQUIRED_COMMISSIONING_GATES = UV_POLICY_SPEC.requiredCommissioningGates;
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
    && config.switching?.controlInputMinVoltage <= UV_POLICY_SPEC.switching.controlVoltage
    && config.switching?.controlInputMaxVoltage >= UV_POLICY_SPEC.switching.controlVoltage
    && config.switching?.channels === UV_POLICY_SPEC.switching.channels && switchChannelMa > 0 && switchTotalMa >= loadsMa
    && config.maxBrightness > 0 && config.maxBrightness <= UV_POLICY_SPEC.brightness.maximum
    && main?.gpio === UV_POLICY_SPEC.channels.main.gpio && main?.segmentId === UV_POLICY_SPEC.channels.main.segmentId && main?.loadCurrentMa > 0 && main.loadCurrentMa <= switchChannelMa
    && short?.gpio === UV_POLICY_SPEC.channels.short.gpio && short?.segmentId === UV_POLICY_SPEC.channels.short.segmentId && short?.loadCurrentMa > 0 && short.loadCurrentMa <= switchChannelMa
    && main.segmentId !== short.segmentId;
}

export function uvCommissioningReady(state = {}) {
  return REQUIRED_COMMISSIONING_GATES.every((key) => state?.[key] === true);
}

export function uvRuntimeReady({ auxEnabled = false, uvEnabled = false, uvOutputsVerified = false, hardware = UV_HARDWARE_CONFIG } = {}) {
  const runtime = { auxEnabled, uvEnabled, uvOutputsVerified, hardwareReady: uvHardwareReady(hardware) };
  return UV_POLICY_SPEC.requiredRuntimeGates.every((key) => runtime[key] === true);
}

export async function executeUvRequest({ request = {}, state = {}, auxEnabled = false, uvEnabled = false, uvOutputsVerified = false, hardware = UV_HARDWARE_CONFIG, publish }) {
  const mode = String(request.mode || UV_POLICY_SPEC.defaultMode).toUpperCase();
  if (!UV_MODES.includes(mode)) {
    return { status: 400, body: { ok: false, action: "uv_policy", mutationIssued: false, error: "Unknown UV response mode." } };
  }
  const levels = request.brightnessBySegment;
  const limits = UV_POLICY_SPEC.brightness;
  const validLevel = value => Number.isInteger(value) && value >= limits.minimum && value <= limits.maximum;
  if (!levels || !limits.requiredChannels.every(channel => validLevel(levels[channel]))) {
    return { status: 400, body: { ok: false, action: "uv_policy", mutationIssued: false, error: "Both UV brightness caps must be explicit integers within the supported range." } };
  }
  const requested = {
    main: levels.main,
    short: levels.short,
  };
  const liveReady = uvRuntimeReady({ auxEnabled, uvEnabled, uvOutputsVerified, hardware }) && uvCommissioningReady(state);
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
  const followsAudio = UV_POLICY_SPEC.followModes.includes(mode);
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
  await publish(payload, UV_POLICY_SPEC.publish.retain);
  return { status: 200, body: {
    ok: true, action: "uv_policy", mutationIssued: true, preview: false,
    mode, requested, caps, localAudioFollow: followsAudio, payload,
    acknowledgement: { transport: "mqtt", qos: UV_POLICY_SPEC.publish.qos, acceptedByBroker: true, deviceReadback: false },
  } };
}

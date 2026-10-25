// Native WLED segment policy only. Runtime configuration stays fail-closed
// until physical AUX commissioning explicitly supplies verified segments.
export const UV_OFFLINE_CONFIG = Object.freeze({
  enabled: false,
  hardwareAvailable: false,
  maxBrightness: 0,
  rampPerTick: 4,
  segmentIds: Object.freeze([]),
});

export const UV_MODES = Object.freeze(["OFF", "MANUAL", "FOLLOW_MATRIX", "VIBE_REACTIVE"]);

export function nextUvOutput(state = {}, config = UV_OFFLINE_CONFIG, inputs = {}) {
  const mode = String(state.mode || "OFF").toUpperCase();
  const maximum = clamp(config.maxBrightness, 0, 255);
  const current = clamp(state.currentOutput, 0, 255);
  if (!config.enabled || !config.hardwareAvailable || maximum === 0 || mode === "OFF") return 0;
  if (!UV_MODES.includes(mode)) return 0;

  let target;
  if (state.ownerOverride !== undefined && state.ownerOverride !== null) {
    target = clamp(state.ownerOverride, 0, maximum);
  } else if (mode === "MANUAL") {
    target = clamp(state.manualBrightness, 0, maximum);
  } else if (mode === "FOLLOW_MATRIX") {
    const level = clamp(state.responseBrightness ?? maximum, 0, maximum);
    target = Math.round(clamp(inputs.matrixBrightness, 0, 255) * level / 255);
  } else {
    const level = clamp(state.responseBrightness ?? maximum, 0, maximum);
    target = Math.round(clamp(inputs.vibeEnvelope, 0, 255) * level / 255);
  }

  const step = Math.max(1, clamp(config.rampPerTick, 1, 255));
  return target > current ? Math.min(target, current + step) : Math.max(target, current - step);
}

// Compute each configured UV channel independently while sharing the selected
// Matrix/vibe envelope. Per-channel values are dormant until the same physical
// commissioning gate that protects the scalar policy is satisfied.
export function nextUvOutputs(state = {}, config = UV_OFFLINE_CONFIG, inputs = {}) {
  const ids = Array.isArray(config.segmentIds) ? config.segmentIds : [];
  const values = state.manualBrightnessBySegment ?? {};
  const overrides = state.ownerOverrideBySegment ?? {};
  const currents = state.currentOutputBySegment ?? {};
  return ids.map((id) => ({
    id,
    brightness: nextUvOutput({
      ...state,
      manualBrightness: values[id] ?? state.manualBrightness,
      responseBrightness: values[id] ?? state.responseBrightness,
      ownerOverride: overrides[id] ?? state.ownerOverride,
      currentOutput: currents[id] ?? state.currentOutput,
    }, config, inputs),
  }));
}

export function wledUvStatePatch(config = UV_OFFLINE_CONFIG, brightness = 0) {
  const maximum = clamp(config.maxBrightness, 0, 255);
  const active = config.enabled === true && config.hardwareAvailable === true && maximum > 0;
  const levels = brightness && typeof brightness === "object"
    ? brightness
    : Object.fromEntries((Array.isArray(config.segmentIds) ? config.segmentIds : []).map((id) => [id, brightness]));
  return {
    on: true,
    seg: (Array.isArray(config.segmentIds) ? config.segmentIds : []).map((id) => ({
      id,
      // Missing, malformed, or uncommissioned values always remain dark.
      bri: active ? clamp(levels[id], 0, maximum) : 0,
      on: active && clamp(levels[id], 0, maximum) > 0,
    })),
  };
}

function clamp(value, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, Math.round(number))) : minimum;
}

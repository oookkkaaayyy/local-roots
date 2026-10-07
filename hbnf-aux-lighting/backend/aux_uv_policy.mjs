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
    target = Math.round(clamp(inputs.matrixBrightness, 0, 255) * maximum / 255);
  } else {
    target = Math.round(clamp(inputs.vibeEnvelope, 0, 255) * maximum / 255);
  }

  const step = Math.max(1, clamp(config.rampPerTick, 1, 255));
  return target > current ? Math.min(target, current + step) : Math.max(target, current - step);
}

export function wledUvStatePatch(config = UV_OFFLINE_CONFIG, brightness = 0) {
  const maximum = clamp(config.maxBrightness, 0, 255);
  const active = config.enabled === true && config.hardwareAvailable === true && maximum > 0;
  const level = active ? clamp(brightness, 0, maximum) : 0;
  return {
    on: true,
    seg: (Array.isArray(config.segmentIds) ? config.segmentIds : []).map((id) => ({
      id,
      on: level > 0,
      bri: level,
    })),
  };
}

function clamp(value, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, Math.round(number))) : minimum;
}

export const DEVICES = Object.freeze(["matrix", "aux"]);
export const VIBES = Object.freeze(["mellow", "moderate", "energetic", "peak"]);

const FORBIDDEN_SCENE_KEYS = new Set([
  "brightness", "bri", "power", "on", "mqtt", "network", "deviceprofile",
  "device_profile", "device-profile", "deviceprofiles", "device_profiles", "device-profiles",
  "brightnessprofile", "brightness_profile", "brightness-profile",
]);

export class CartCommandError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "CartCommandError";
    this.code = code;
    this.details = details;
  }
}

export function assertSceneSafe(value, path = "scene") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSceneSafe(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_SCENE_KEYS.has(key.toLowerCase())) {
      throw new CartCommandError("SCENE_FIELD_FORBIDDEN", `Scene field ${path}.${key} is not allowed.`, { path: `${path}.${key}` });
    }
    assertSceneSafe(child, `${path}.${key}`);
  }
}

export function createInitialState({ cartId = "hbnf-cart", profiles = {} } = {}) {
  const deviceProfiles = {};
  for (const id of DEVICES) {
    const profile = profiles[id] ?? {};
    deviceProfiles[id] = {
      enabled: profile.enabled ?? true,
      brightness: clampInt(profile.brightness ?? (id === "matrix" ? 8 : 64), 0, 255),
      brightnessLocked: profile.brightnessLocked ?? true,
      speedBias: clampNumber(profile.speedBias ?? 1, 0.5, 2),
      profileRevision: profile.profileRevision ?? 1,
    };
  }
  return {
    cartId,
    revision: 0,
    power: "off",
    programMode: "auto",
    sceneId: "course-flow",
    paletteId: "hbnf-balanced",
    vibe: "moderate",
    vibeMode: "music",
    tempoMode: "music",
    manualSpeedBias: 1,
    sequenceCursor: 0,
    devices: deviceProfiles,
    overlays: [],
    lastCommandId: null,
    commandReceipts: {},
  };
}

export function applyCommand(state, command, { scenes = {} } = {}) {
  validateCommand(command);
  const next = structuredClone(state);
  const receipt = state.commandReceipts?.[command.commandId];
  if (receipt) {
    return { state, duplicate: true, accepted: true, resultRevision: receipt.revision };
  }
  if (command.expectedRevision !== state.revision) {
    throw new CartCommandError("STALE_REVISION", "Command revision does not match current cart state.", {
      expectedRevision: command.expectedRevision,
      currentRevision: state.revision,
    });
  }
  const payload = command.payload ?? {};
  switch (command.type) {
    case "OFF": next.power = "off"; break;
    case "ON": next.power = "on"; break;
    case "NEXT": next.sequenceCursor += 1; next.programMode = "auto"; break;
    case "AUTO": next.programMode = "auto"; break;
    case "LOCK": next.programMode = "lock"; break;
    case "SCENE": {
      const scene = scenes[payload.sceneId];
      if (!scene) throw new CartCommandError("UNKNOWN_SCENE", `Unknown scene ${payload.sceneId}.`);
      assertSceneSafe(scene);
      next.sceneId = payload.sceneId;
      next.programMode = "lock";
      break;
    }
    case "PALETTE": next.paletteId = requireText(payload.paletteId, "paletteId"); break;
    case "VIBE":
      if (!VIBES.includes(payload.vibe)) throw new CartCommandError("INVALID_VIBE", "Unsupported vibe.");
      next.vibe = payload.vibe;
      next.vibeMode = "manual";
      break;
    case "VIBE_AUTO": next.vibeMode = "music"; break;
    case "TEMPO_AUTO": next.tempoMode = "music"; break;
    case "SPEED":
      next.manualSpeedBias = clampNumber(payload.speedBias, 0.5, 2);
      next.tempoMode = "manual";
      break;
    case "BRIGHTNESS": {
      const id = requireDevice(payload.deviceId);
      next.devices[id].brightness = clampInt(payload.brightness, 0, 255);
      next.devices[id].brightnessLocked = true;
      next.devices[id].profileRevision += 1;
      break;
    }
    case "DEVICE_ENABLE": {
      const id = requireDevice(payload.deviceId);
      next.devices[id].enabled = Boolean(payload.enabled);
      next.devices[id].profileRevision += 1;
      break;
    }
    case "OVERLAY_START": {
      const id = requireText(payload.overlayId, "overlayId");
      const ttlMs = clampInt(payload.ttlMs, 1, 120_000);
      next.overlays = next.overlays.filter(item => item.id !== id);
      next.overlays.push({ id, kind: requireText(payload.kind, "kind"), priority: clampInt(payload.priority ?? 40, 1, 100), expiresAt: command.at + ttlMs, payload: payload.data ?? {} });
      break;
    }
    case "OVERLAY_EXPIRE": next.overlays = next.overlays.filter(item => item.expiresAt > command.at); break;
    default: throw new CartCommandError("UNKNOWN_COMMAND", `Unknown command ${command.type}.`);
  }
  next.overlays = next.overlays.filter(item => item.expiresAt > command.at);
  next.revision += 1;
  next.lastCommandId = command.commandId;
  next.commandReceipts[command.commandId] = { revision: next.revision, type: command.type };
  const receiptKeys = Object.keys(next.commandReceipts);
  if (receiptKeys.length > 512) delete next.commandReceipts[receiptKeys[0]];
  return { state: next, duplicate: false, accepted: true, resultRevision: next.revision };
}

export function acceptMusicSemantics(state, semantics, at = Date.now()) {
  const next = structuredClone(state);
  next.music = normalizeMusic(semantics, at);
  if (next.vibeMode === "music" && VIBES.includes(semantics?.vibe)) next.vibe = semantics.vibe;
  if (next.tempoMode === "music" && Number.isFinite(semantics?.stableTempoBias)) {
    next.effectiveMusicTempoBias = clampNumber(semantics.stableTempoBias, 0.65, 1.5);
  }
  // Semantic observations are effective inputs, not a command or desired-state mutation.
  return next;
}

export function resolveEffectiveState(state, { release, fenceEpoch }) {
  const music = state.music ?? {};
  const speedBias = state.tempoMode === "manual" ? state.manualSpeedBias : (state.effectiveMusicTempoBias ?? 1);
  const activeOverlay = [...state.overlays].sort((a, b) => b.priority - a.priority)[0] ?? null;
  return Object.fromEntries(DEVICES.map(deviceId => {
    const profile = state.devices[deviceId];
    return [deviceId, {
      cartId: state.cartId,
      cartRevision: state.revision,
      release,
      fenceEpoch,
      deviceId,
      enabled: state.power === "on" && profile.enabled,
      brightness: profile.brightness,
      brightnessProfileRevision: profile.profileRevision,
      programMode: state.programMode,
      sceneId: state.sceneId,
      paletteId: state.paletteId,
      vibe: state.vibeMode === "manual" ? state.vibe : (music.vibe ?? state.vibe),
      speedBias,
      sequenceCursor: state.sequenceCursor,
      audio: {
        bass: music.bass ?? 0,
        mids: music.mids ?? 0,
        treble: music.treble ?? 0,
        bassIntensity: music.bassAccent ?? 0,
        midsIntensity: music.midsAccent ?? 0,
        trebleIntensity: music.trebleAccent ?? 0,
        onset: music.onset ?? 0,
        accentsOnly: true,
      },
      overlay: activeOverlay ? { id: activeOverlay.id, kind: activeOverlay.kind, payload: activeOverlay.payload } : null,
      applyCompleteProjection: true,
    }];
  }));
}

export function reduceDesiredState(state, command, options) {
  return applyCommand(state, command, options).state;
}

export function validateCommand(command) {
  if (!command || typeof command !== "object") throw new CartCommandError("INVALID_COMMAND", "Command must be an object.");
  requireText(command.commandId, "commandId");
  requireText(command.type, "type");
  if (!Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0) throw new CartCommandError("INVALID_REVISION", "expectedRevision must be a non-negative integer.");
  if (!Number.isFinite(command.at)) command.at = Date.now();
}

function normalizeMusic(raw = {}, at) {
  const out = { at, confidence: clampNumber(raw.confidence ?? 0, 0, 1), clipping: Boolean(raw.clipping), noiseFloor: clampNumber(raw.noiseFloor ?? 0, 0, 1) };
  for (const field of ["bass", "mids", "treble", "onset", "spectralCentroid", "onsetDensity"]) out[field] = clampNumber(raw[field] ?? 0, 0, 1);
  if (VIBES.includes(raw.vibe)) out.vibe = raw.vibe;
  if (Number.isFinite(raw.stableTempoBias)) out.stableTempoBias = clampNumber(raw.stableTempoBias, 0.65, 1.5);
  return out;
}
function requireText(value, name) { if (typeof value !== "string" || !value.trim()) throw new CartCommandError("INVALID_FIELD", `${name} must be a non-empty string.`); return value.trim(); }
function requireDevice(value) { if (!DEVICES.includes(value)) throw new CartCommandError("INVALID_DEVICE", "Unknown cart device."); return value; }
function clampInt(value, min, max) { const n = Number(value); if (!Number.isFinite(n)) throw new CartCommandError("INVALID_NUMBER", "Expected a finite number."); return Math.max(min, Math.min(max, Math.round(n))); }
function clampNumber(value, min, max) { const n = Number(value); if (!Number.isFinite(n)) throw new CartCommandError("INVALID_NUMBER", "Expected a finite number."); return Math.max(min, Math.min(max, n)); }

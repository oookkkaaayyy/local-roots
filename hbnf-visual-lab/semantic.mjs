export const SEMANTIC_SCHEMA = "hbnf-visual-semantic-v1";

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n)));

export function normalizeSemantic(input = {}) {
  const out = {
    energy: clamp(input.energy ?? 50, 0, 100),
    audioResponse: clamp(input.audioResponse ?? 60, 0, 100),
    motion: clamp(input.motion ?? 50, 0, 100),
    variation: clamp(input.variation ?? 85, 0, 100),
    couplingMode: ["locked","related","independent"].includes(input.couplingMode) ? input.couplingMode : "locked",
  };
  if (typeof input.paletteId === "string" && input.paletteId.trim()) out.paletteId = input.paletteId.trim();
  return out;
}

export function energyToVibe(energy) {
  const e = clamp(energy, 0, 100);
  if (e < 25) return "mellow";
  if (e < 55) return "moderate";
  if (e < 82) return "energetic";
  return "peak";
}

export function motionToSpeedCode(motion) {
  // Relative multiplier for Generative V4: 64=0.5x, 128=1x, 192=1.5x.
  return Math.round(64 + clamp(motion, 0, 100) * 1.28);
}

export function motionToCanonicalBias(motion) {
  return Number((0.5 + clamp(motion, 0, 100) / 100).toFixed(2));
}

export function audioResponseToBoost(audioResponse) {
  // Current canonical backend supports 1.0–1.5 without replacing scene-native audio geometry.
  return Number((1 + clamp(audioResponse, 0, 100) * 0.005).toFixed(3));
}

export function compileSemanticPlan(input = {}) {
  const semantic = normalizeSemantic(input);
  const cartTune = {
    vibe: energyToVibe(semantic.energy),
    speedBias: motionToCanonicalBias(semantic.motion),
    responseBoost: audioResponseToBoost(semantic.audioResponse),
  };
  if (semantic.paletteId) cartTune.paletteId = semantic.paletteId;

  const renderer = {
    generator: {
      enabled: true,
      locked: false,
    },
    tuning: {
      speedEnabled: true,
      speed: motionToSpeedCode(semantic.motion),
    },
  };

  // Do not fake a hardware mapping. Current observed V4 exposes no independent
  // continuous variation control. Anti-repeat-v4 remains authoritative until
  // the accepted renderer adds a stable variation-bias field.
  const unbound = [];
  if (semantic.variation !== 85) unbound.push("variation");
  if (semantic.couplingMode !== "locked") unbound.push("couplingMode");

  return { schema: SEMANTIC_SCHEMA, semantic, cartTune, renderer, unbound };
}

export function circularSeqDistance(a, b, modulus = 65536) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const aa = ((Math.trunc(a) % modulus) + modulus) % modulus;
  const bb = ((Math.trunc(b) % modulus) + modulus) % modulus;
  const d = Math.abs(aa - bb);
  return Math.min(d, modulus - d);
}

export function assessFrameLock(matrix = {}, aux = {}, nowMs = Date.now()) {
  const seqDistance = circularSeqDistance(matrix.projectionSeq, aux.projectionRxSeq);
  const rxAge = Number(aux.projectionRxAgeMs);
  const capable =
    matrix.projectionLink === "frame-lock-v1" &&
    aux.projectionLink === "frame-lock-v1" &&
    aux.projectionRole === "receiver";
  const rxActive = aux.projectionRxActive === true && Number.isFinite(rxAge) && rxAge <= 350;
  const healthy = capable && rxActive && seqDistance !== null && seqDistance <= 4;
  return {
    capable,
    healthy,
    seqDistance,
    rxActive,
    rxAgeMs: Number.isFinite(rxAge) ? rxAge : null,
    checkedAt: new Date(nowMs).toISOString(),
  };
}

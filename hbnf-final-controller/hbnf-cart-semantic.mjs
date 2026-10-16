export const SEMANTIC_SCHEMA = "hbnf-visual-semantic-v3";

export function parseManualScoreRows(input) {
  const rows = String(input == null ? "" : input)
    .replace(/\r/g, "")
    .split("\n")
    .map(row => row.trim())
    .filter(Boolean);
  if (!rows.length) throw new Error("Enter at least one player/team row.");
  if (rows.length > 12) throw new Error("Use no more than 12 player/team rows.");
  if (rows.some(row => row.length > 63)) throw new Error("Each player/team row must be 63 characters or fewer.");
  return rows;
}

export function createManualScoreboardPayload(label, input) {
  const normalizedLabel = String(label || "");
  if (!["F9", "B9", "GLOW", "SCORES"].includes(normalizedLabel)) {
    throw new Error("Choose Front 9, Back 9, Glow, or Scores.");
  }
  return { label: normalizedLabel, entries: parseManualScoreRows(input) };
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n)));
const valueOr = (value, fallback) => (value === undefined || value === null) ? fallback : value;

export function normalizeSemantic(input = {}) {
  return {
    energy: clamp(valueOr(input.energy, 65), 0, 100),
    audioResponse: clamp(valueOr(input.audioResponse, 75), 0, 100),
    motion: clamp(valueOr(input.motion, 60), 0, 100),
    variation: clamp(valueOr(input.variation, 85), 0, 100),
  };
}

export function energyToVibe(energy) {
  const e = clamp(energy, 0, 100);
  if (e < 25) return "mellow";
  if (e < 55) return "moderate";
  if (e < 82) return "energetic";
  return "peak";
}

export function motionToCanonicalBias(motion) {
  return Number((0.5 + clamp(motion, 0, 100) * 0.015).toFixed(3));
}

export function audioResponseToBoost(audioResponse) {
  return Number((1 + clamp(audioResponse, 0, 100) * 0.005).toFixed(3));
}

export function compileSemanticPlan(input = {}) {
  const semantic = normalizeSemantic(input);
  return {
    schema: SEMANTIC_SCHEMA,
    semantic,
    cartTune: {
      vibe: energyToVibe(semantic.energy),
      speedBias: motionToCanonicalBias(semantic.motion),
      responseBoost: audioResponseToBoost(semantic.audioResponse),
      variation: semantic.variation,
      energy: semantic.energy,
      audioResponse: semantic.audioResponse,
      motion: semantic.motion,
    },
    renderer: {
      generator: "anti-repeat-v4",
      audioGeometry: "source-coupled-v4",
      projectionLink: "frame-lock-v1",
      variation: semantic.variation,
    },
  };
}

export function circularSeqDistance(a, b, modulus = 65536) {
  if (!Number.isFinite(Number(a)) || !Number.isFinite(Number(b))) return null;
  const aa = ((Math.trunc(Number(a)) % modulus) + modulus) % modulus;
  const bb = ((Math.trunc(Number(b)) % modulus) + modulus) % modulus;
  const d = Math.abs(aa - bb);
  return Math.min(d, modulus - d);
}

export function assessFrameLock(matrix = {}, aux = {}) {
  const seqDistance = circularSeqDistance(matrix.projectionSeq, aux.projectionRxSeq);
  const rxAge = Number(aux.projectionRxAgeMs);
  const capable =
    matrix.projectionLink === "frame-lock-v1" &&
    aux.projectionLink === "frame-lock-v1" &&
    aux.projectionRole === "receiver";
  const rxActive = aux.projectionRxActive === true && Number.isFinite(rxAge) && rxAge <= 350;
  return {
    capable,
    healthy: capable && rxActive && seqDistance !== null && seqDistance <= 4,
    seqDistance,
    rxActive,
    rxAgeMs: Number.isFinite(rxAge) ? rxAge : null,
  };
}

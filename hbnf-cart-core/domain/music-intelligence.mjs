const EPS = 1e-6;
const BANDS = Object.freeze({ bass: [0, 4], mids: [4, 11], treble: [11, 16] });

/**
 * Stateful semantic analyzer for the WLED AudioReactive 16-bin FFT + volume feed.
 * A single attack is emitted as a short accent; global tempo/vibe only use slow,
 * stable evidence. The engine never writes cart or device state.
 */
export class MusicIntelligence {
  constructor({ minDwellMs = 1800, maxOnsets = 12 } = {}) {
    this.minDwellMs = minDwellMs;
    this.maxOnsets = maxOnsets;
    this.reset();
  }

  reset() {
    this.lastAt = null;
    this.noiseFloor = 0.035;
    this.slow = { energy: 0, bass: 0, mids: 0, treble: 0, centroid: 0 };
    this.fast = { energy: 0, bass: 0, mids: 0, treble: 0 };
    this.prevBins = new Array(16).fill(0);
    this.prevEnergy = 0;
    this.energyHistory = [];
    this.onsets = [];
    this.vibe = "moderate";
    this.vibeChangedAt = 0;
    this.clipFrames = 0;
    this.frames = 0;
    this.lastOnsetAt = null;
    this.onsetPulse = 0;
  }

  update(frame) {
    const at = Number(frame?.at);
    if (!Number.isFinite(at)) throw new TypeError("Audio frame requires a finite at timestamp.");
    if (!Array.isArray(frame?.fftBins) || frame.fftBins.length !== 16) throw new TypeError("Audio frame requires exactly 16 FFT bins.");
    const dt = this.lastAt === null ? 0.02 : clamp((at - this.lastAt) / 1000, 0.005, 0.25);
    if (this.lastAt !== null && at <= this.lastAt) throw new RangeError("Audio timestamps must increase.");
    this.lastAt = at;

    const bins = frame.fftBins.map(v => clamp(Number(v) / 255, 0, 1));
    const energy = clamp(Number(frame.volume ?? 0) / 255, 0, 1);
    const { bass, mids, treble } = bandMeans(bins);
    const sum = bins.reduce((a, b) => a + b, 0);
    const centroid = sum <= EPS ? 0 : bins.reduce((a, b, i) => a + b * (i / 15), 0) / sum;
    const spectralFlux = bins.reduce((a, b, i) => a + Math.max(0, b - this.prevBins[i]), 0) / 16;
    const attack = Math.max(0, energy - this.prevEnergy);
    const aboveFloor = Math.max(0, energy - this.noiseFloor);
    const adaptiveThreshold = Math.max(0.075, this.noiseFloor * 1.75);
    const onsetStrength = clamp(Math.max(spectralFlux * 1.7, attack * 1.35), 0, 1);
    const isOnset = aboveFloor > adaptiveThreshold && onsetStrength > 0.2;

    // Learn noise only on quiet/low-flux frames; rise slowly and decay quickly.
    if (energy < Math.max(0.18, this.noiseFloor * 2.5) && spectralFlux < 0.055) {
      this.noiseFloor = ema(this.noiseFloor, energy, dt, 5.0);
    } else {
      this.noiseFloor = ema(this.noiseFloor, Math.min(this.noiseFloor, energy * 0.55), dt, 0.6);
    }

    this.fast.energy = ema(this.fast.energy, aboveFloor, dt, 0.085);
    this.fast.bass = ema(this.fast.bass, bass, dt, 0.095);
    this.fast.mids = ema(this.fast.mids, mids, dt, 0.095);
    this.fast.treble = ema(this.fast.treble, treble, dt, 0.095);
    this.slow.energy = ema(this.slow.energy, aboveFloor, dt, 1.8);
    this.slow.bass = ema(this.slow.bass, bass, dt, 1.1);
    this.slow.mids = ema(this.slow.mids, mids, dt, 1.1);
    this.slow.treble = ema(this.slow.treble, treble, dt, 1.1);
    this.slow.centroid = ema(this.slow.centroid, centroid, dt, 1.5);
    this.energyHistory.push({ at, energy: this.slow.energy });
    this.energyHistory = this.energyHistory.filter(x => at - x.at <= 5000);

    this.onsetPulse = Math.max(isOnset ? onsetStrength : 0, this.onsetPulse * Math.exp(-dt / 0.12));
    if (isOnset && (this.lastOnsetAt === null || at - this.lastOnsetAt >= 110)) {
      this.onsets.push(at);
      this.lastOnsetAt = at;
    }
    this.onsets = this.onsets.filter(t => at - t <= 12_000).slice(-this.maxOnsets);
    this.prevBins = bins;
    this.prevEnergy = energy;
    this.frames += 1;
    const clipping = Boolean(frame.clipping) || energy >= 0.985 || bins.filter(x => x >= 0.985).length >= 5;
    this.clipFrames = clipping ? this.clipFrames + 1 : Math.max(0, this.clipFrames - 1);

    const tempo = stableTempo(this.onsets);
    const dynamics = dynamicsOf(this.energyHistory);
    const confidence = confidenceOf({ tempo, dynamics, energy: this.slow.energy, clipping: this.clipFrames > 4, floor: this.noiseFloor });
    const proposed = classify({ energy: this.slow.energy, tempo: tempo?.bpm ?? null, onsetDensity: this.onsets.length / 12 });
    if (proposed !== this.vibe && at - this.vibeChangedAt >= this.minDwellMs && confidence >= 0.42) {
      this.vibe = proposed;
      this.vibeChangedAt = at;
    }

    // Tempo-based visual bias is deliberately slow and only emitted when the beat is stable.
    const tempoBias = tempo ? clamp(tempo.bpm / 118, 0.72, 1.42) : null;
    return {
      at,
      stableTempoBpm: tempo?.bpm ?? null,
      stableTempoConfidence: tempo?.confidence ?? 0,
      stableTempoBias: tempoBias,
      vibe: this.vibe,
      confidence,
      onsetDensity: Math.min(1, this.onsets.length / 12),
      onset: this.onsetPulse,
      energy: this.slow.energy,
      fastEnergy: this.fast.energy,
      bass: ratio(this.slow.bass, this.slow.bass + this.slow.mids + this.slow.treble),
      mids: ratio(this.slow.mids, this.slow.bass + this.slow.mids + this.slow.treble),
      treble: ratio(this.slow.treble, this.slow.bass + this.slow.mids + this.slow.treble),
      bassAccent: this.fast.bass,
      midsAccent: this.fast.mids,
      trebleAccent: this.fast.treble,
      spectralCentroid: this.slow.centroid,
      dynamics,
      noiseFloor: this.noiseFloor,
      clipping: this.clipFrames > 4,
      onsetEvent: isOnset ? { strength: onsetStrength, transientOnly: true } : null,
      tempoOwner: "music-if-enabled-by-cart",
      speedAuthority: "manual-lock-overrides-music",
    };
  }
}

function bandMeans(bins) {
  return Object.fromEntries(Object.entries(BANDS).map(([key, [start, end]]) => [key, mean(bins.slice(start, end))]));
}
function stableTempo(onsets) {
  if (onsets.length < 6) return null;
  const times = onsets.slice(-7);
  const intervals = times.slice(1).map((t, i) => t - times[i]);
  const bpmFor = d => 60_000 / d;
  const usable = intervals.filter(d => d >= 250 && d <= 1500);
  if (usable.length < 5) return null;
  const med = median(usable);
  const cv = stdev(usable) / Math.max(1, mean(usable));
  const matching = usable.filter(d => Math.abs(d - med) / med <= 0.2).length;
  if (cv > 0.16 || matching < 5) return null;
  return { bpm: Math.round(bpmFor(med)), confidence: clamp((1 - cv / 0.22) * (matching / usable.length), 0, 1) };
}
function classify({ energy, tempo, onsetDensity }) {
  if (energy > 0.68 && (tempo === null || tempo >= 118 || onsetDensity > 0.42)) return "peak";
  if (energy > 0.48 || (tempo !== null && tempo >= 112) || onsetDensity > 0.35) return "energetic";
  if (energy < 0.17 && (tempo === null || tempo <= 92)) return "mellow";
  return "moderate";
}
function confidenceOf({ tempo, dynamics, energy, clipping, floor }) {
  let score = 0.25 + Math.min(0.35, energy * 0.45) + Math.min(0.25, (tempo?.confidence ?? 0) * 0.25) + Math.min(0.15, dynamics * 0.5);
  if (clipping) score -= 0.22;
  if (energy <= floor * 1.35) score -= 0.15;
  return clamp(score, 0, 1);
}
function dynamicsOf(history) {
  if (history.length < 3) return 0;
  const values = history.map(x => x.energy);
  return clamp(stdev(values) * 3, 0, 1);
}
function ema(previous, value, dt, tau) { const alpha = 1 - Math.exp(-dt / tau); return previous + alpha * (value - previous); }
function mean(values) { return values.reduce((a, b) => a + b, 0) / Math.max(1, values.length); }
function median(values) { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; }
function stdev(values) { if (values.length < 2) return 0; const avg = mean(values); return Math.sqrt(mean(values.map(v => (v - avg) ** 2))); }
function ratio(n, d) { return d <= EPS ? 0 : clamp(n / d, 0, 1); }
function clamp(n, min, max) { return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min; }

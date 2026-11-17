// Deterministic manufacturability checks and bridge-or-remove repair for binary
// vinyl stencil masks. mask: Uint8Array, 1 = retained vinyl (white), 0 = cut away (black).
// Pure functions, no dependencies. Not wired into any UI.
export const DEFAULT_RULES = Object.freeze({
  islandMinBboxMm: 2.0,
  islandMinDiameterMm: 1.5,
  islandMinAreaMm2: 3,
  whiteMinWidthMm: 1.0,
  blackMinWidthMm: 0.8,
  bridgeMaxGapMm: 1.6,
  bridgeWidthMm: 1.0,
});
const BIG = 1e15;

function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}

// Squared distance from each pixel to the nearest pixel where isSource(i) is true.
export function squaredDistance(w, h, isSource) {
  const m = Math.max(w, h), v = new Int32Array(m), z = new Float64Array(m + 1), f = new Float64Array(m), d = new Float64Array(m);
  const tmp = new Float64Array(w * h), out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = isSource(y * w + x) ? 0 : BIG;
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) tmp[y * w + x] = d[x];
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = tmp[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) out[y * w + x] = d[y];
  }
  return out;
}

export function label4(mask, w, h, value) {
  const labels = new Int32Array(w * h), comps = [];
  const stack = [];
  for (let s = 0; s < mask.length; s++) {
    if (mask[s] !== value || labels[s]) continue;
    const id = comps.length + 1; labels[s] = id; stack.push(s);
    const c = { id, area: 0, x0: w, y0: h, x1: 0, y1: 0, border: false, pixels: [] };
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i - x) / w;
      c.area++; c.pixels.push(i);
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) c.border = true;
      if (x > 0 && mask[i - 1] === value && !labels[i - 1]) { labels[i - 1] = id; stack.push(i - 1); }
      if (x < w - 1 && mask[i + 1] === value && !labels[i + 1]) { labels[i + 1] = id; stack.push(i + 1); }
      if (y > 0 && mask[i - w] === value && !labels[i - w]) { labels[i - w] = id; stack.push(i - w); }
      if (y < h - 1 && mask[i + w] === value && !labels[i + w]) { labels[i + w] = id; stack.push(i + w); }
    }
    comps.push(c);
  }
  return { labels, comps };
}

// Pixels of `value` that no disk of diameter widthMm fits inside (morphological opening residue).
function thinRegion(mask, w, h, value, widthMm, mmPerPx) {
  const r = widthMm / mmPerPx / 2;
  const inside = squaredDistance(w, h, (i) => mask[i] !== value);
  const core = (i) => mask[i] === value && inside[i] >= r * r;
  const toCore = squaredDistance(w, h, core);
  const thin = new Uint8Array(w * h);
  let count = 0;
  for (let i = 0; i < thin.length; i++) if (mask[i] === value && toCore[i] > r * r) { thin[i] = 1; count++; }
  return { thin, areaMm2: count * mmPerPx * mmPerPx, pixels: count };
}

export function analyzeStencil(mask, w, h, mmPerPx, rules = {}) {
  const R = { ...DEFAULT_RULES, ...rules };
  const { comps } = label4(mask, w, h, 1);
  const inside = squaredDistance(w, h, (i) => mask[i] === 0);
  const islands = comps.filter((c) => !c.border).map((c) => {
    let m = 0;
    for (const i of c.pixels) if (inside[i] > m) m = inside[i];
    const diameterMm = (2 * Math.sqrt(m) - 1) * mmPerPx;
    const areaMm2 = c.area * mmPerPx * mmPerPx;
    const bboxMm = [(c.x1 - c.x0 + 1) * mmPerPx, (c.y1 - c.y0 + 1) * mmPerPx];
    const fails = diameterMm < R.islandMinDiameterMm || areaMm2 < R.islandMinAreaMm2 || bboxMm[0] < R.islandMinBboxMm || bboxMm[1] < R.islandMinBboxMm;
    return { id: c.id, diameterMm: +diameterMm.toFixed(3), areaMm2: +areaMm2.toFixed(3), bboxMm, fails };
  });
  const tw = thinRegion(mask, w, h, 1, R.whiteMinWidthMm, mmPerPx);
  const tb = thinRegion(mask, w, h, 0, R.blackMinWidthMm, mmPerPx);
  const failingIslands = islands.filter((i) => i.fails).length;
  return {
    rules: R, islands, failingIslands,
    thinWhiteAreaMm2: +tw.areaMm2.toFixed(3), thinBlackAreaMm2: +tb.areaMm2.toFixed(3),
    verdict: failingIslands === 0 ? 'PASS_ISLANDS' : 'FAIL_ISLANDS',
  };
}

// Bridge each failing island to the nearest other vinyl within bridgeMaxGapMm, else remove it.
export function repairIslands(maskIn, w, h, mmPerPx, rules = {}) {
  const R = { ...DEFAULT_RULES, ...rules };
  const mask = Uint8Array.from(maskIn);
  const report = analyzeStencil(mask, w, h, mmPerPx, R);
  const failing = new Set(report.islands.filter((i) => i.fails).map((i) => i.id));
  const { labels, comps } = label4(mask, w, h, 1);
  const maxDepth = Math.ceil(R.bridgeMaxGapMm / mmPerPx);
  const rb = Math.max(0, Math.ceil(R.bridgeWidthMm / mmPerPx / 2) - 1);
  const log = [];
  for (const c of comps) {
    if (!failing.has(c.id)) continue;
    const prev = new Int32Array(w * h).fill(-1), depth = new Int32Array(w * h).fill(-1);
    let queue = [];
    for (const i of c.pixels) { depth[i] = 0; queue.push(i); }
    let hit = -1, from = -1;
    for (let head = 0; head < queue.length && hit < 0; head++) {
      const i = queue[head]; if (depth[i] >= maxDepth) continue;
      const x = i % w, y = (i - x) / w;
      for (let dy = -1; dy <= 1 && hit < 0; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (mask[n] === 1) { if (labels[n] !== c.id) { hit = n; from = i; break; } continue; }
        if (depth[n] < 0) { depth[n] = depth[i] + 1; prev[n] = i; queue.push(n); }
      }
    }
    if (hit < 0) {
      for (const i of c.pixels) mask[i] = 0;
      log.push({ island: c.id, action: 'removed', areaMm2: +(c.area * mmPerPx * mmPerPx).toFixed(3) });
      continue;
    }
    let steps = 0;
    for (let p = from; p >= 0 && depth[p] > 0; p = prev[p]) {
      const px = p % w, py = (p - px) / w; steps++;
      for (let dy = -rb; dy <= rb; dy++) for (let dx = -rb; dx <= rb; dx++) {
        if (dx * dx + dy * dy > rb * rb + rb) continue;
        const nx = px + dx, ny = py + dy; if (nx >= 0 && ny >= 0 && nx < w && ny < h) mask[ny * w + nx] = 1;
      }
    }
    log.push({ island: c.id, action: 'bridged', gapMm: +(steps * mmPerPx).toFixed(3) });
  }
  return { mask, log, before: report, after: analyzeStencil(mask, w, h, mmPerPx, R) };
}

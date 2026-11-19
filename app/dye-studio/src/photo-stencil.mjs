import { compileStencil, normalizeArtwork, maskToCutSvg } from "./duStencilCompiler.mjs";
export const N = 640;
function box(a, w, h, r) {
  const t = new Float32Array(a.length), o = new Float32Array(a.length), d = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let s = 0; const row = y * w;
    for (let x = -r; x <= r; x++) s += a[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) { t[row + x] = s / d; s += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)]; }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += t[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) { o[y * w + x] = s / d; s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; }
  }
  return o;
}
export function blur(a, w, h, sigma) { const r = Math.max(1, Math.round(sigma * 1.2)); return box(box(box(a, w, h, r), w, h, r), w, h, r); }
// rgba: N*N framed photo (RGBA). opts: detail 0..1, balance 0..1, invert.
export function photoToLum(rgba, n = N, { detail = 0.6, balance = 0.5, invert = false } = {}) {
  const g = new Float32Array(n * n), c = n / 2, inside = new Uint8Array(n * n), vals = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, k = i * 4, ins = Math.hypot(x + .5 - c, y + .5 - c) <= c - 1;
    inside[i] = ins ? 1 : 0; g[i] = .299 * rgba[k] + .587 * rgba[k + 1] + .114 * rgba[k + 2];
    if (ins && (x + y) % 7 === 0) vals.push(g[i]);
  }
  vals.sort((p, q) => p - q);
  const lo = vals[Math.floor(vals.length * .02)] ?? 0, hi = vals[Math.floor(vals.length * .98)] ?? 255, span = Math.max(40, hi - lo);
  for (let i = 0; i < g.length; i++) g[i] = Math.min(255, Math.max(0, (g[i] - lo) / span * 255));
  const fine = blur(g, n, n, 0.6 + (1 - detail) * 3.4), coarse = blur(g, n, n, n / (6 + 24 * detail));
  const cc = 3 + (1 - balance) * 30, lum = new Uint8Array(n * n);
  for (let i = 0; i < lum.length; i++) {
    if (!inside[i]) { lum[i] = 255; continue; }
    let dark = fine[i] < coarse[i] - cc || fine[i] < 38;
    if (fine[i] > 215) dark = false;
    if (invert) dark = !dark;
    lum[i] = dark ? 0 : 255;
  }
  return lum;
}
export function buildStencil(rgba, opts, n = N) {
  const lum = photoToLum(rgba, n, opts);
  const art = normalizeArtwork(lum, n, n);
  const r = compileStencil(art.mask, art.width, art.height, art.mmPerPx);
  return { mask: r.mask, w: art.width, h: art.height, mmPerPx: art.mmPerPx, verdict: r.verdict, change: r.fidelity.level, islands: r.validation.islandFails.length };
}
export { maskToCutSvg };

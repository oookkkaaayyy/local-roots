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
function normGray(rgba, n) {
  const g = new Float32Array(n * n), c = n / 2, inside = new Uint8Array(n * n), vals = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, k = i * 4, ins = Math.hypot(x + .5 - c, y + .5 - c) <= c - 1;
    inside[i] = ins ? 1 : 0; g[i] = .299 * rgba[k] + .587 * rgba[k + 1] + .114 * rgba[k + 2];
    if (ins && (x + y) % 7 === 0) vals.push(g[i]);
  }
  vals.sort((p, q) => p - q);
  const lo = vals[Math.floor(vals.length * .02)] ?? 0, hi = vals[Math.floor(vals.length * .98)] ?? 255, span = Math.max(40, hi - lo);
  for (let i = 0; i < g.length; i++) g[i] = Math.min(255, Math.max(0, (g[i] - lo) / span * 255));
  return { g, inside };
}
export const STYLES = ["photo", "bold", "outline", "dots"];
export function photoToLum(rgba, n = N, { detail = 0.6, balance = 0.5, invert = false, fineScale = 3.4 } = {}) {
  const { g, inside } = normGray(rgba, n);
  const fine = blur(g, n, n, 0.6 + (1 - detail) * fineScale), coarse = blur(g, n, n, n / (6 + 24 * detail));
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
function cleanLum(lum, n, opts) {
  // Smooth edges: blur the two-tone map and re-threshold, then drop specks.
  const f = new Float32Array(n * n);
  for (let i = 0; i < f.length; i++) f[i] = lum[i] < 128 ? 0 : 255;
  const b = blur(f, n, n, opts.smooth ?? (1.4 + (1 - (opts.detail ?? 0.6)) * 1.2));
  const out = new Uint8Array(n * n);
  for (let i = 0; i < out.length; i++) out[i] = b[i] < 127.5 ? 0 : 255;
  const minA = opts.minArea ?? Math.round(n * n * (0.00018 + (1 - (opts.detail ?? 0.6)) * 0.0004));
  const seen = new Uint8Array(n * n), stack = [];
  for (let s0 = 0; s0 < out.length; s0++) {
    if (seen[s0]) continue;
    const v = out[s0], comp = [];
    stack.push(s0); seen[s0] = 1;
    while (stack.length) {
      const k = stack.pop(); comp.push(k);
      const x = k % n, y = (k - x) / n;
      if (x > 0 && !seen[k - 1] && out[k - 1] === v) { seen[k - 1] = 1; stack.push(k - 1); }
      if (x < n - 1 && !seen[k + 1] && out[k + 1] === v) { seen[k + 1] = 1; stack.push(k + 1); }
      if (y > 0 && !seen[k - n] && out[k - n] === v) { seen[k - n] = 1; stack.push(k - n); }
      if (y < n - 1 && !seen[k + n] && out[k + n] === v) { seen[k + n] = 1; stack.push(k + n); }
    }
    if (comp.length < minA) for (const k of comp) out[k] = v ? 0 : 255;
  }
  return out;
}
function outlineLum(rgba, n, o) {
  const { g, inside } = normGray(rgba, n), d = o.detail ?? 0.6, bl = blur(g, n, n, 1.9 + (1 - d) * 1.6), mag = new Float32Array(n * n);
  for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
    const i = y * n + x, gx = bl[i - n + 1] + 2 * bl[i + 1] + bl[i + n + 1] - bl[i - n - 1] - 2 * bl[i - 1] - bl[i + n - 1], gy = bl[i + n - 1] + 2 * bl[i + n] + bl[i + n + 1] - bl[i - n - 1] - 2 * bl[i - n] - bl[i - n + 1];
    mag[i] = Math.hypot(gx, gy);
  }
  const vals = []; for (let i = 0; i < mag.length; i += 5) if (inside[i]) vals.push(mag[i]);
  vals.sort((p, q) => p - q);
  const thr = vals[Math.floor(vals.length * (0.945 - (o.balance ?? 0.5) * 0.1 - d * 0.03))] ?? 40, line = new Uint8Array(n * n);
  for (let i = 0; i < line.length; i++) line[i] = inside[i] && mag[i] >= thr ? 1 : 0;
  const r = 2, out = new Uint8Array(n * n).fill(255);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (line[y * n + x]) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < n && yy < n && dx * dx + dy * dy <= r * r + 1 && inside[yy * n + xx]) out[yy * n + xx] = 0; }
  }
  if (o.invert) for (let i = 0; i < out.length; i++) if (inside[i]) out[i] = out[i] ? 0 : 255;
  return out;
}
function dotsLum(rgba, n, o) {
  const { g, inside } = normGray(rgba, n), fine = blur(g, n, n, 1.4), coarse = blur(g, n, n, n / 14), cell = Math.round(11 + (1 - (o.detail ?? 0.6)) * 6), rMax = (cell - 3.6) / 2, rMin = 2.6, out = new Uint8Array(n * n).fill(255);
  for (let py = Math.round(cell / 2); py < n; py += cell) for (let px = Math.round(cell / 2); px < n; px += cell) {
    const i = py * n + px; if (!inside[i]) continue;
    let tone = 1 - (fine[i] * 0.6 + (128 + (fine[i] - coarse[i]) * 2.2) * 0.4) / 255;
    if (o.invert) tone = 1 - tone;
    const t = Math.min(1, Math.max(0, (tone - (0.62 - (o.balance ?? 0.5) * 0.4)) * 2.6));
    if (t <= 0) continue;
    const r = rMin + (rMax - rMin) * t, r2 = r * r, ir = Math.ceil(r);
    for (let dy = -ir; dy <= ir; dy++) for (let dx = -ir; dx <= ir; dx++) { const xx = px + dx, yy = py + dy; if (dx * dx + dy * dy <= r2 && xx >= 0 && yy >= 0 && xx < n && yy < n && inside[yy * n + xx]) out[yy * n + xx] = 0; }
  }
  return out;
}
export function buildStencil(rgba, opts = {}, n = N) {
  const st = opts.style || "photo";
  if (st === "photo" || st === "bold") opts = { ...opts, detail: 0.55 + 0.45 * (opts.detail ?? 0.6), balance: 0.5 + 0.5 * (opts.balance ?? 0.5) };
  let lum;
  if (st === "photo") lum = cleanLum(photoToLum(rgba, n, { ...opts, detail: Math.max(opts.detail ?? 0.6, 0.55), fineScale: 1.2 }), n, { ...opts, smooth: 0.9, minArea: Math.round(n * n * 0.00006) });
  else if (st === "outline") lum = cleanLum(outlineLum(rgba, n, opts), n, { ...opts, smooth: 0.8, minArea: Math.round(n * n * 0.0007) });
  else if (st === "dots") lum = dotsLum(rgba, n, opts);
  else lum = cleanLum(photoToLum(rgba, n, opts), n, opts);
  const art = normalizeArtwork(lum, n, n);
  const r = compileStencil(art.mask, art.width, art.height, art.mmPerPx);
  return { mask: r.mask, w: art.width, h: art.height, mmPerPx: art.mmPerPx, verdict: r.verdict, change: r.fidelity.level, islands: r.validation.islandFails.length, style: st };
}
export { maskToCutSvg };

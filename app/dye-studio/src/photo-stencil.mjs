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

// Subject isolation: iterated two-class colour model (foreground ellipse prior vs border) with smoothing. Returns Uint8Array n*n, 1 = subject.
function kmeans(pts, k, iters = 6) {
  const c = []; for (let i = 0; i < k; i++) c.push(pts[Math.floor((i + .5) * pts.length / k)].slice());
  for (let it = 0; it < iters; it++) {
    const sum = c.map(() => [0, 0, 0, 0]);
    for (const p of pts) { let b = 0, bd = 1e18; for (let j = 0; j < k; j++) { const d = (p[0] - c[j][0]) ** 2 + (p[1] - c[j][1]) ** 2 + (p[2] - c[j][2]) ** 2; if (d < bd) { bd = d; b = j; } } const m = sum[b]; m[0] += p[0]; m[1] += p[1]; m[2] += p[2]; m[3]++; }
    for (let j = 0; j < k; j++) if (sum[j][3]) c[j] = [sum[j][0] / sum[j][3], sum[j][1] / sum[j][3], sum[j][2] / sum[j][3]];
  }
  return c;
}
export function isolateSubject(rgba, n = N, prior = 0.33) {
  const s = 128, f = new Float32Array(s * s * 3), k = n / s;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    let r = 0, g = 0, b = 0, cnt = 0;
    for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) { const q = (((y * k + dy) | 0) * n + ((x * k + dx) | 0)) * 4; r += rgba[q]; g += rgba[q + 1]; b += rgba[q + 2]; cnt++; }
    r /= cnt; g /= cnt; b /= cnt; const o = (y * s + x) * 3;
    f[o] = .299 * r + .587 * g + .114 * b; f[o + 1] = (b - (.299 * r + .587 * g + .114 * b)) * .9; f[o + 2] = (r - (.299 * r + .587 * g + .114 * b)) * .9;
  }
  const rad = (x, y) => Math.hypot((x + .5) / s - .5, (y + .5) / s - .5);
  const fg = [], bg = [];
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) { const o = (y * s + x) * 3, d = rad(x, y), p = [f[o], f[o + 1], f[o + 2]]; if (d < prior * .8) fg.push(p); else if (d > .44 || x < 3 || y < 3 || x > s - 4 || y > s - 4) bg.push(p); }
  let lab = new Uint8Array(s * s);
  let cf = kmeans(fg, 7), cb = kmeans(bg, 7);
  for (let it = 0; it < 4; it++) {
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const o = (y * s + x) * 3; let df = 1e18, db = 1e18;
      for (const c of cf) { const d = (f[o] - c[0]) ** 2 + (f[o + 1] - c[1]) ** 2 + (f[o + 2] - c[2]) ** 2; if (d < df) df = d; }
      for (const c of cb) { const d = (f[o] - c[0]) ** 2 + (f[o + 1] - c[1]) ** 2 + (f[o + 2] - c[2]) ** 2; if (d < db) db = d; }
      const rr = rad(x, y), pen = (rr - .36) * 4200;
      lab[y * s + x] = df + Math.max(-1500, pen) < db ? 1 : 0;
    }
    const nl = new Uint8Array(s * s);
    for (let p = 0; p < 2; p++) {
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) { let c = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = Math.min(s - 1, Math.max(0, x + dx)), yy = Math.min(s - 1, Math.max(0, y + dy)); c += lab[yy * s + xx]; } nl[y * s + x] = c >= 13 ? 1 : 0; }
      lab.set(nl);
    }
    const fp = [], bp = [];
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) { const o = (y * s + x) * 3, p = [f[o], f[o + 1], f[o + 2]]; (lab[y * s + x] ? fp : bp).push(p); }
    if (fp.length > 40 && bp.length > 40) { cf = kmeans(fp.filter((_, i) => i % 2 === 0), 7, 3); cb = kmeans(bp.filter((_, i) => i % 2 === 0), 7, 3); }
  }
  // largest component touching the centre, holes filled
  const comp = new Uint8Array(s * s), st = [];
  let seed = -1; for (let r = 0; r < 20 && seed < 0; r++) for (let dy = -r; dy <= r && seed < 0; dy++) for (let dx = -r; dx <= r; dx++) { const x = s / 2 + dx, y = s / 2 + dy; if (lab[y * s + x]) { seed = y * s + x; break; } }
  if (seed >= 0) { st.push(seed); comp[seed] = 1; while (st.length) { const q = st.pop(), x = q % s, y = (q - x) / s; for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + ax, yy = y + ay; if (xx < 0 || yy < 0 || xx >= s || yy >= s) continue; const w = yy * s + xx; if (lab[w] && !comp[w]) { comp[w] = 1; st.push(w); } } } }
  const out0 = new Uint8Array(s * s), seen = new Uint8Array(s * s);
  for (let i = 0; i < s; i++) for (const q of [i, (s - 1) * s + i, i * s, i * s + s - 1]) if (!comp[q] && !seen[q]) { seen[q] = 1; st.push(q); }
  while (st.length) { const q = st.pop(), x = q % s, y = (q - x) / s; for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + ax, yy = y + ay; if (xx < 0 || yy < 0 || xx >= s || yy >= s) continue; const w = yy * s + xx; if (!comp[w] && !seen[w]) { seen[w] = 1; st.push(w); } } }
  for (let i = 0; i < s * s; i++) out0[i] = seen[i] ? 0 : 1;
  const up = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const fx = Math.min(s - 1.001, Math.max(0, (x + .5) / k - .5)), fy = Math.min(s - 1.001, Math.max(0, (y + .5) / k - .5)), x0 = fx | 0, y0 = fy | 0, ax = fx - x0, ay = fy - y0; up[y * n + x] = (out0[y0 * s + x0] * (1 - ax) + out0[y0 * s + x0 + 1] * ax) * (1 - ay) + (out0[(y0 + 1) * s + x0] * (1 - ax) + out0[(y0 + 1) * s + x0 + 1] * ax) * ay; }
  const sm = blur(up, n, n, 3), m = new Uint8Array(n * n); for (let i = 0; i < m.length; i++) m[i] = sm[i] > .5 ? 1 : 0;
  return m;
}

function bilateral(a, w, h, r, sr, sp) {
  const o = new Float32Array(a.length), inv = 1 / (2 * sr * sr), sw = []; for (let d = 0; d <= r * r * 2; d++) sw[d] = Math.exp(-d / (2 * sp * sp));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, c = a[i]; let s = 0, ws = 0;
    for (let dy = -r; dy <= r; dy++) { const yy = y + dy; if (yy < 0 || yy >= h) continue; for (let dx = -r; dx <= r; dx++) { const xx = x + dx; if (xx < 0 || xx >= w) continue; const v = a[yy * w + xx], d = v - c, wt = sw[dx * dx + dy * dy] * Math.exp(-d * d * inv); s += v * wt; ws += wt; } }
    o[i] = s / ws;
  }
  return o;
}
function otsu(vals) {
  const hist = new Float64Array(256); for (const v of vals) hist[Math.min(255, Math.max(0, v | 0))]++;
  let tot = vals.length, sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let wb = 0, sb = 0, best = 0, bt = 128; for (let t = 0; t < 256; t++) { wb += hist[t]; if (!wb) continue; const wf = tot - wb; if (!wf) break; sb += t * hist[t]; const mb = sb / wb, mf = (sum - sb) / wf, v = wb * wf * (mb - mf) ** 2; if (v > best) { best = v; bt = t; } }
  return bt;
}
// Cut-out subject rendered as clean two-tone linework in the Dyed & Unattached portrait style.
export function subjectLum(rgba, n, mask, { detail = 0.6, balance = 0.5, invert = false } = {}) {
  const g = new Float32Array(n * n), sub = [];
  for (let i = 0; i < g.length; i++) { const k = i * 4; g[i] = .299 * rgba[k] + .587 * rgba[k + 1] + .114 * rgba[k + 2]; if (mask[i] && i % 3 === 0) sub.push(g[i]); }
  sub.sort((p, q) => p - q);
  const lo = sub[Math.floor(sub.length * .015)] ?? 0, hi = sub[Math.floor(sub.length * .99)] ?? 255, span = Math.max(50, hi - lo);
  for (let i = 0; i < g.length; i++) g[i] = Math.min(255, Math.max(0, (g[i] - lo) / span * 255));
  const gs = bilateral(bilateral(bilateral(g, n, n, 4, 30, 3), n, n, 4, 30, 3), n, n, 4, 24, 3);
  const vals = []; for (let i = 0; i < gs.length; i += 3) if (mask[i]) vals.push(gs[i]);
  vals.sort((p, q) => p - q);
  const t0 = otsu(vals), pct = vals[Math.floor(vals.length * (0.1 + 0.2 * balance))] ?? 40, tShadow = Math.min(t0 * 0.85, pct);
  const s1 = 1.35 + (1 - detail) * 1.2, a1 = blur(gs, n, n, s1), a2 = blur(gs, n, n, s1 * 2.1), eps = 3.5 + (1 - balance) * 7;
  const lum = new Uint8Array(n * n).fill(255), ring = distIn(mask, n, 3);
  for (let i = 0; i < lum.length; i++) {
    if (!mask[i]) continue;
    let dark = gs[i] < tShadow || (a1[i] - a2[i] < -eps && gs[i] < t0 * 1.2);
    if (ring[i] && gs[i] < t0 * 1.25) dark = true;
    if (invert) dark = !dark;
    lum[i] = dark ? 0 : 255;
  }
  return keepStrokes(lum, n);
}
// Drop specks but keep long thin strokes (fur lines) so linework survives.
function keepStrokes(lum, n) {
  const lab = new Int32Array(n * n), st = [], out = new Uint8Array(lum); let id = 0;
  for (let s0 = 0; s0 < lum.length; s0++) {
    if (lum[s0] || lab[s0]) continue; id++; const px = []; let x0 = n, x1 = 0, y0 = n, y1 = 0; st.push(s0); lab[s0] = id;
    while (st.length) { const q = st.pop(); px.push(q); const x = q % n, y = (q - x) / n; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && !lum[q - 1] && !lab[q - 1]) { lab[q - 1] = id; st.push(q - 1); } if (x < n - 1 && !lum[q + 1] && !lab[q + 1]) { lab[q + 1] = id; st.push(q + 1); } if (y > 0 && !lum[q - n] && !lab[q - n]) { lab[q - n] = id; st.push(q - n); } if (y < n - 1 && !lum[q + n] && !lab[q + n]) { lab[q + n] = id; st.push(q + n); } }
    const diag = Math.hypot(x1 - x0, y1 - y0);
    if (px.length < 60 || (px.length < 140 && diag < 26)) for (const q of px) out[q] = 255;
  }
  return out;
}
function distIn(mask, n, r) {
  const out = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const i = y * n + x; if (!mask[i]) continue; let edge = false; for (let dy = -r; dy <= r && !edge; dy += r) for (let dx = -r; dx <= r; dx += r) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= n || yy >= n || !mask[yy * n + xx]) { edge = true; break; } } out[i] = edge ? 1 : 0; }
  return out;
}

// Line-drawing model output (1 = paper, 0 = ink) combined with shadow fills and a silhouette ring into a two-tone stencil.
function erodeMask(m, n, r) {
  const o = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const i = y * n + x; if (!m[i]) continue; let ok = 1; for (let d = -r; d <= r && ok; d += r) for (let e = -r; e <= r; e += r) { const xx = x + e, yy = y + d; if (xx < 0 || yy < 0 || xx >= n || yy >= n || !m[yy * n + xx]) { ok = 0; break; } } o[i] = ok; }
  return o;
}
export function lineLum(rgba, n, mask, line, { detail = 0.6, balance = 0.5, invert = false } = {}, pass = 0) {
  const g = new Float32Array(n * n), sub = []; let area = 0;
  for (let i = 0; i < g.length; i++) { const k = i * 4; g[i] = .299 * rgba[k] + .587 * rgba[k + 1] + .114 * rgba[k + 2]; if (mask[i]) { area++; if (i % 3 === 0) sub.push(g[i]); } }
  sub.sort((p, q) => p - q);
  const lo = sub[Math.floor(sub.length * .02)] ?? 0, hi = sub[Math.floor(sub.length * .99)] ?? 255, span = Math.max(50, hi - lo), gs = blur(g, n, n, 2);
  const gn = new Float32Array(n * n); for (let i = 0; i < gn.length; i++) gn[i] = Math.min(255, Math.max(0, (gs[i] - lo) / span * 255));
  const sv = []; for (let i = 0; i < gn.length; i += 3) if (mask[i]) sv.push(gn[i]); sv.sort((p, q) => p - q);
  const shT = sv[Math.floor(sv.length * (0.02 + 0.05 * balance))] ?? 30, target = 0.11 + 0.17 * detail - pass * 0.03;
  const ring = new Uint8Array(n * n), er = erodeMask(mask, n, 3); for (let i = 0; i < ring.length; i++) ring[i] = mask[i] && !er[i] && gn[i] < 200 ? 1 : 0;
  const cands = [0.34, 0.26, 0.2, 0.15, 0.11, 0.08], build = t1 => {
    const l0 = new Float32Array(n * n); for (let i = 0; i < l0.length; i++) l0[i] = (1 - line[i]) > t1 ? 1 : 0;
    const lb = blur(l0, n, n, 0.8 + pass * 0.45), blk = new Float32Array(n * n); let ink = 0;
    for (let i = 0; i < blk.length; i++) { const on = mask[i] && (lb[i] > 0.22 || gn[i] < shT || ring[i]); blk[i] = on ? 255 : 0; if (on) ink++; }
    return { blk, ink: ink / Math.max(1, area) };
  };
  const best = build(0.25 - 0.12 * detail + pass * 0.035);
  const lum = new Uint8Array(n * n).fill(255); for (let i = 0; i < lum.length; i++) lum[i] = best.blk[i] ? 0 : 255;
  if (invert) for (let i = 0; i < lum.length; i++) if (mask[i]) lum[i] = lum[i] ? 0 : 255;
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
  if (opts.line && opts.mask && st === "photo") {
    let last = null;
    for (let pass = 0; pass < 4; pass++) {
      const lum = cleanLum(lineLum(rgba, n, opts.mask, opts.line, opts, pass), n, { ...opts, smooth: 1.1 + pass * 0.3, minArea: 70 + pass * 60 });
      let art; try { art = normalizeArtwork(lum, n, n); } catch (e) { continue; }
      const r = compileStencil(art.mask, art.width, art.height, art.mmPerPx);
      last = { mask: r.mask, w: art.width, h: art.height, mmPerPx: art.mmPerPx, verdict: r.verdict, change: r.fidelity.level, islands: r.validation.islandFails.length, style: st };
      if (r.verdict === "PASS") return last;
    }
    if (last) return last;
  }
  if (st === "photo" || st === "bold") opts = { ...opts, detail: 0.55 + 0.45 * (opts.detail ?? 0.6), balance: 0.5 + 0.5 * (opts.balance ?? 0.5) };
  let lum;
  if (opts.mask && (st === "photo" || st === "bold")) { let ma = 0; for (let i = 0; i < opts.mask.length; i++) ma += opts.mask[i]; lum = cleanLum(subjectLum(rgba, n, opts.mask, opts), n, { ...opts, smooth: 1.1, minArea: Math.round(ma * 0.0006) }); }
  else if (st === "photo") lum = cleanLum(photoToLum(rgba, n, { ...opts, detail: Math.max(opts.detail ?? 0.6, 0.55), fineScale: 1.2 }), n, { ...opts, smooth: 0.9, minArea: Math.round(n * n * 0.00006) });
  else if (st === "outline") lum = cleanLum(outlineLum(rgba, n, opts), n, { ...opts, smooth: 0.8, minArea: Math.round(n * n * 0.0007) });
  else if (st === "dots") lum = dotsLum(rgba, n, opts);
  else lum = cleanLum(photoToLum(rgba, n, opts), n, opts);
  const art = normalizeArtwork(lum, n, n);
  const r = compileStencil(art.mask, art.width, art.height, art.mmPerPx);
  return { mask: r.mask, w: art.width, h: art.height, mmPerPx: art.mmPerPx, verdict: r.verdict, change: r.fidelity.level, islands: r.validation.islandFails.length, style: st };
}
export function compileGenerated(lum, n, pxMm) {
  const art = normalizeArtwork(lum, n, n);
  const mm = pxMm || art.mmPerPx;
  const r = compileStencil(art.mask, art.width, art.height, mm);
  return { mask: r.mask, w: art.width, h: art.height, origin: art.origin, mmPerPx: mm, verdict: r.verdict, change: r.fidelity.level, islands: r.validation.islandFails.length, style: "gen" };
}
export { maskToCutSvg };

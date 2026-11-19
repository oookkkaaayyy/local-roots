import { blur, N } from "./photo-stencil.mjs";
const S = 320;
let sess = null, ortMod = null;
export function frameToTensor(rgba, n = N) {
  const mean = [.485, .456, .406], std = [.229, .224, .225], t = new Float32Array(3 * S * S), k = n / S;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let r = 0, g = 0, b = 0, c = 0;
    for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) { const q = ((((y * k + dy) | 0) * n) + ((x * k + dx) | 0)) * 4; r += rgba[q]; g += rgba[q + 1]; b += rgba[q + 2]; c++; }
    const i = y * S + x; t[i] = (r / c / 255 - mean[0]) / std[0]; t[S * S + i] = (g / c / 255 - mean[1]) / std[1]; t[2 * S * S + i] = (b / c / 255 - mean[2]) / std[2];
  }
  return t;
}
// prob: Float32Array S*S raw network output. Returns Uint8Array n*n (1 = subject).
export function maskFromProb(prob, n = N) {
  let mn = 1e9, mx = -1e9; for (const v of prob) { if (v < mn) mn = v; if (v > mx) mx = v; }
  const p = new Float32Array(S * S); for (let i = 0; i < p.length; i++) p[i] = (prob[i] - mn) / Math.max(1e-6, mx - mn);
  const up = new Float32Array(n * n), k = S / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const fx = Math.min(S - 1.001, Math.max(0, (x + .5) * k - .5)), fy = Math.min(S - 1.001, Math.max(0, (y + .5) * k - .5)), x0 = fx | 0, y0 = fy | 0, ax = fx - x0, ay = fy - y0;
    up[y * n + x] = (p[y0 * S + x0] * (1 - ax) + p[y0 * S + x0 + 1] * ax) * (1 - ay) + (p[(y0 + 1) * S + x0] * (1 - ax) + p[(y0 + 1) * S + x0 + 1] * ax) * ay;
  }
  const sm = blur(up, n, n, 1.6), m = new Uint8Array(n * n); for (let i = 0; i < m.length; i++) m[i] = sm[i] > .45 ? 1 : 0;
  // keep the largest component, fill holes
  const lab = new Int32Array(n * n), sizes = [0]; let id = 0; const st = [];
  for (let s0 = 0; s0 < m.length; s0++) { if (!m[s0] || lab[s0]) continue; id++; let cnt = 0; st.push(s0); lab[s0] = id; while (st.length) { const q = st.pop(); cnt++; const x = q % n, y = (q - x) / n; if (x > 0 && m[q - 1] && !lab[q - 1]) { lab[q - 1] = id; st.push(q - 1); } if (x < n - 1 && m[q + 1] && !lab[q + 1]) { lab[q + 1] = id; st.push(q + 1); } if (y > 0 && m[q - n] && !lab[q - n]) { lab[q - n] = id; st.push(q - n); } if (y < n - 1 && m[q + n] && !lab[q + n]) { lab[q + n] = id; st.push(q + n); } } sizes[id] = cnt; }
  let best = 0, bs = 0; for (let i = 1; i <= id; i++) if (sizes[i] > bs) { bs = sizes[i]; best = i; }
  const out = new Uint8Array(n * n), keep = new Uint8Array(n * n); for (let i = 0; i < out.length; i++) keep[i] = lab[i] === best ? 1 : 0;
  const seen = new Uint8Array(n * n); for (let i = 0; i < n; i++) for (const q of [i, (n - 1) * n + i, i * n, i * n + n - 1]) if (!keep[q] && !seen[q]) { seen[q] = 1; st.push(q); }
  while (st.length) { const q = st.pop(), x = q % n, y = (q - x) / n; if (x > 0 && !keep[q - 1] && !seen[q - 1]) { seen[q - 1] = 1; st.push(q - 1); } if (x < n - 1 && !keep[q + 1] && !seen[q + 1]) { seen[q + 1] = 1; st.push(q + 1); } if (y > 0 && !keep[q - n] && !seen[q - n]) { seen[q - n] = 1; st.push(q - n); } if (y < n - 1 && !keep[q + n] && !seen[q + n]) { seen[q + n] = 1; st.push(q + n); } }
  for (let i = 0; i < out.length; i++) out[i] = seen[i] ? 0 : 1;
  return out;
}
// Browser: lazily loads onnxruntime-web from /ml next to this module.
export async function segmentSubject(rgba, n = N, base = "/dyed-and-unattached/dye-studio/") {
  if (!sess) {
    ortMod = await import(base + "ml/ort.min.mjs");
    ortMod.env.wasm.wasmPaths = base + "ml/"; ortMod.env.wasm.numThreads = 1; ortMod.env.wasm.proxy = false;
    sess = await ortMod.InferenceSession.create(base + "ml/u2netp.onnx", { executionProviders: ["wasm"] });
  }
  const out = await sess.run({ [sess.inputNames[0]]: new ortMod.Tensor("float32", frameToTensor(rgba, n), [1, 3, S, S]) });
  return maskFromProb(out[sess.outputNames[0]].data, n);
}
// Head-centred square around the subject: {cx, cy, side} in frame pixels.
export function headFrame(mask, n = N) {
  let y0 = n, y1 = -1, x0 = n, x1 = -1;
  const wid = new Int32Array(n), lx = new Int32Array(n).fill(n), rx = new Int32Array(n).fill(-1);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (mask[y * n + x]) { if (y < y0) y0 = y; if (y > y1) y1 = y; if (x < x0) x0 = x; if (x > x1) x1 = x; wid[y]++; if (x < lx[y]) lx[y] = x; if (x > rx[y]) rx[y] = x; }
  if (y1 < 0) return { cx: n / 2, cy: n / 2, side: n };
  const H = y1 - y0 + 1, W = x1 - x0 + 1, ws = [];
  for (let y = y0 + Math.round(H * .1); y <= y0 + Math.round(H * .32); y++) if (wid[y]) ws.push(rx[y] - lx[y] + 1);
  ws.sort((a, b) => a - b); const wh = ws[Math.floor(ws.length * .6)] || W * .6;
  let sx = 0, c = 0; for (let y = y0; y <= y0 + Math.round(Math.min(H, wh * 1.3) * .6); y++) for (let x = lx[y]; x <= rx[y]; x++) if (mask[y * n + x]) { sx += x; c++; }
  const cx = c ? sx / c : (x0 + x1) / 2, side = Math.min(Math.max(wh * 1.9, 160), Math.max(W, H) * 1.1);
  return { cx, cy: y0 + side * .5 - side * .04, side };
}

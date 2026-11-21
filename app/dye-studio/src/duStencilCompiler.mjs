// D&U stencil compiler: turns a binary artwork mask (1 = retained vinyl / white, 0 = cut away / black)
// into a cut-ready, rule-checked mask, a cut SVG at true size, and a measured change report.
// Pure functions, no dependencies. All limits are estimates until calibrated with the cut-sheet test.
import { squaredDistance, label4, repairIslands } from './duStencilConstraints.mjs';

export const COMPILER_VERSION = 'du-stencil-compiler-1.0.0';

export const COMPILER_RULES = Object.freeze({
  artworkWidthMm: 190.5,
  safeZoneDiameterMm: 170,   // owner rule 2026-11-19: all cut-away artwork inside a 170 mm circle on the 213 mm disc
  islandMinBboxMm: 2.0,      // matches the existing validator
  islandMinDiameterMm: 1.5,  // inscribed circle; stops thin diagonal slivers passing a bounding-box test
  islandMinAreaMm2: 3,
  whiteMinWidthMm: 1.0,      // matches the existing validator's connected-width floor
  whiteTargetWidthMm: 1.1,   // compile target, margin above the floor
  neckMinLengthMm: 0.4,
  lobeMinMm: 2.0,
  blackMinWidthMm: 0.6,      // narrower cut-away slits cannot be weeded
  bridgeMaxGapMm: 1.6,
  bridgeWidthMm: 1.1,
  neckWidenMm: 0.4,
  maxPasses: 4,
  fidelity: Object.freeze({ reviewChangedFraction: 0.015, rejectChangedFraction: 0.04, reviewSingleMm2: 12, rejectSingleMm2: 40 }),
});

const radiusPx = (widthMm, mm) => (widthMm / mm + 1) / 2; // pixel-centre radius that corresponds to a feature width

function erode(mask, w, h, r) {
  const d = squaredDistance(w, h, (i) => mask[i] === 0), out = new Uint8Array(w * h), r2 = r * r;
  for (let i = 0; i < out.length; i++) out[i] = mask[i] === 1 && d[i] >= r2 ? 1 : 0;
  return out;
}
function dilate(set, w, h, r) {
  const d = squaredDistance(w, h, (i) => set[i] === 1), out = new Uint8Array(w * h), r2 = r * r;
  for (let i = 0; i < out.length; i++) out[i] = d[i] <= r2 ? 1 : 0;
  return out;
}
function openWhite(mask, w, h, r) {
  const back = dilate(erode(mask, w, h, r), w, h, r);
  for (let i = 0; i < back.length; i++) back[i] = back[i] & mask[i];
  return back;
}
function closeWhite(mask, w, h, r) {
  const inv = new Uint8Array(mask.length);
  for (let i = 0; i < inv.length; i++) inv[i] = mask[i] ? 0 : 1;
  const openedBlack = openWhite(inv, w, h, r);
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < out.length; i++) out[i] = openedBlack[i] ? 0 : 1;
  return out;
}

// Thin white features that run between two substantial supports (they tear while weeding).
function findNecks(mask, w, h, mm, R) {
  const rFloor = radiusPx(R.whiteMinWidthMm, mm);
  const core = erode(mask, w, h, rFloor);
  const back = dilate(core, w, h, rFloor);
  const thin = new Uint8Array(w * h);
  for (let i = 0; i < thin.length; i++) thin[i] = mask[i] && !back[i] ? 1 : 0;
  const lobes = label8(core, w, h);
  const lobeOk = new Uint8Array(lobes.comps.length + 1);
  for (const c of lobes.comps) if ((c.x1 - c.x0 + 1) * mm >= R.lobeMinMm && (c.y1 - c.y0 + 1) * mm >= R.lobeMinMm) lobeOk[c.id] = 1;
  const thinC = label8(thin, w, h), s = Math.max(1, Math.ceil(1.0 / mm));
  const neckMask = new Uint8Array(w * h), necks = [];
  for (const c of thinC.comps) {
    const len = Math.hypot((c.x1 - c.x0 + 1) * mm, (c.y1 - c.y0 + 1) * mm);
    if (len < R.neckMinLengthMm) continue;
    const seen = new Set();
    for (const i of c.pixels) {
      const x = i % w, y = (i - x) / w;
      for (let dy = -s; dy <= s; dy++) { const ny = y + dy; if (ny < 0 || ny >= h) continue; for (let dx = -s; dx <= s; dx++) { const nx = x + dx; if (nx < 0 || nx >= w) continue; const id = lobes.labels[ny * w + nx]; if (id && lobeOk[id]) seen.add(id); } }
      if (seen.size >= 2) break;
    }
    if (seen.size >= 2) { for (const i of c.pixels) neckMask[i] = 1; necks.push({ lengthMm: +len.toFixed(3), areaMm2: +(c.area * mm * mm).toFixed(3), bbox: [c.x0, c.y0, c.x1, c.y1] }); }
  }
  return { neckMask, necks, thin };
}

function label8(mask, w, h) {
  const labels = new Int32Array(w * h), comps = [], stack = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || labels[s]) continue;
    const id = comps.length + 1; labels[s] = id; stack.push(s);
    const c = { id, area: 0, x0: w, y0: h, x1: 0, y1: 0, pixels: [] };
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i - x) / w;
      c.area++; c.pixels.push(i);
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue; const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const n = ny * w + nx;
        if (mask[n] && !labels[n]) { labels[n] = id; stack.push(n); }
      }
    }
    comps.push(c);
  }
  return { labels, comps };
}

// Cut-away (black) pixels farther than diameter/2 from the mask centre. The centre is the artwork bounding-box centre.
export function safeZoneCheck(mask, w, h, mm, diameterMm = COMPILER_RULES.safeZoneDiameterMm) {
  const cx = (w - 1) / 2, cy = (h - 1) / 2, r2 = (diameterMm / 2 / mm) ** 2;
  let outside = 0, maxD2 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (mask[y * w + x] !== 0) continue;
    const d2 = (x - cx) ** 2 + (y - cy) ** 2;
    if (d2 > maxD2) maxD2 = d2;
    if (d2 > r2) outside++;
  }
  return { outsideMm2: +(outside * mm * mm).toFixed(3), maxRadiusMm: +(Math.sqrt(maxD2) * mm).toFixed(2) };
}

export function validateStencil(mask, w, h, mm, rules = {}) {
  const R = { ...COMPILER_RULES, ...rules };
  const { comps } = label4(mask, w, h, 1);
  const inside = squaredDistance(w, h, (i) => mask[i] === 0);
  const islandFails = [];
  let islandCount = 0;
  for (const c of comps) {
    if (c.border) continue;
    islandCount++;
    let m = 0; for (const i of c.pixels) if (inside[i] > m) m = inside[i];
    const diameterMm = (2 * Math.sqrt(m) - 1) * mm, bw = (c.x1 - c.x0 + 1) * mm, bh = (c.y1 - c.y0 + 1) * mm, area = c.area * mm * mm;
    if (diameterMm < R.islandMinDiameterMm || area < R.islandMinAreaMm2 || bw < R.islandMinBboxMm || bh < R.islandMinBboxMm) {
      islandFails.push({ bboxMm: [+bw.toFixed(3), +bh.toFixed(3)], diameterMm: +diameterMm.toFixed(3), areaMm2: +area.toFixed(3), pixelBounds: [c.x0, c.y0, c.x1, c.y1] });
    }
  }
  const { necks } = findNecks(mask, w, h, mm, R);
  const inv = new Uint8Array(mask.length); for (let i = 0; i < inv.length; i++) inv[i] = mask[i] ? 0 : 1;
  const rb = radiusPx(R.blackMinWidthMm, mm), blackOpen = openWhite(inv, w, h, rb);
  let thinBlackPx = 0; for (let i = 0; i < inv.length; i++) if (inv[i] && !blackOpen[i]) thinBlackPx++;
  const sz = safeZoneCheck(mask, w, h, mm, R.safeZoneDiameterMm);
  return { islandCount, islandFails, necks, thinBlackAreaMm2: +(thinBlackPx * mm * mm).toFixed(3), outsideSafeZoneMm2: sz.outsideMm2, maxRadiusMm: sz.maxRadiusMm, pass: islandFails.length === 0 && necks.length === 0 && sz.outsideMm2 === 0 };
}

export function compileStencil(mask0, w, h, mm, rules = {}) {
  const R = { ...COMPILER_RULES, ...rules };
  const rBlack = radiusPx(R.blackMinWidthMm, mm), rWhite = radiusPx(R.whiteTargetWidthMm, mm);
  const notes = [];
  // 1. Fill black slits and holes too narrow to weed.
  const closed = closeWhite(mask0, w, h, rBlack);
  // 2. Drop white features thinner than the target width; keep and thicken those that hold two supports together.
  const opened = openWhite(closed, w, h, rWhite);
  let widen = R.neckWidenMm / mm;
  let base = opened;
  const { neckMask } = findNecks(closed, w, h, mm, { ...R, whiteMinWidthMm: R.whiteTargetWidthMm });
  let current = unionInto(base, dilateMasked(neckMask, w, h, widen));
  let result = current, v = null, bridges = [];
  for (let pass = 1; pass <= R.maxPasses; pass++) {
    // 3. Bridge or remove failing islands.
    const rep = repairIslands(current, w, h, mm, { islandMinBboxMm: R.islandMinBboxMm, islandMinDiameterMm: R.islandMinDiameterMm, islandMinAreaMm2: R.islandMinAreaMm2, bridgeMaxGapMm: R.bridgeMaxGapMm, bridgeWidthMm: R.bridgeWidthMm, whiteMinWidthMm: R.whiteMinWidthMm, blackMinWidthMm: R.blackMinWidthMm });
    result = rep.mask; bridges = rep.log;
    v = validateStencil(result, w, h, mm, R);
    notes.push({ pass, islandFails: v.islandFails.length, necks: v.necks.length });
    if (v.pass) break;
    widen *= 1.5;
    const found = findNecks(result, w, h, mm, R);
    current = unionInto(result, dilateMasked(found.neckMask, w, h, widen));
    if (!found.necks.length && !v.islandFails.length) break;
  }
  const fidelity = measureChange(mask0, result, w, h, mm, R);
  const verdict = v && v.pass ? (fidelity.level === 'reject' ? 'REGENERATE' : 'PASS') : 'FAIL';
  return { mask: result, validation: v, bridges, passes: notes, fidelity, verdict };
}

function dilateMasked(set, w, h, r) {
  let any = false; for (let i = 0; i < set.length; i++) if (set[i]) { any = true; break; }
  return any ? dilate(set, w, h, r) : new Uint8Array(w * h);
}
function unionInto(a, b) { const o = new Uint8Array(a.length); for (let i = 0; i < o.length; i++) o[i] = a[i] | b[i]; return o; }

export function measureChange(before, after, w, h, mm, rules = {}) {
  const R = { ...COMPILER_RULES, ...rules }, F = R.fidelity;
  const diff = new Uint8Array(w * h); let removed = 0, added = 0;
  for (let i = 0; i < diff.length; i++) { if (before[i] !== after[i]) { diff[i] = 1; if (before[i]) removed++; else added++; } }
  const { comps } = label4(diff, w, h, 1);
  const px = mm * mm, regions = comps.map((c) => {
    let rem = 0; for (const i of c.pixels) if (before[i]) rem++;
    return { kind: rem * 2 >= c.area ? 'vinyl removed' : 'vinyl added', areaMm2: +(c.area * px).toFixed(3), pixelBounds: [c.x0, c.y0, c.x1, c.y1] };
  }).sort((a, b) => b.areaMm2 - a.areaMm2);
  const total = w * h * px, changedMm2 = (removed + added) * px, fraction = changedMm2 / total, largest = regions.length ? regions[0].areaMm2 : 0;
  const level = fraction > F.rejectChangedFraction || largest > F.rejectSingleMm2 ? 'reject' : fraction > F.reviewChangedFraction || largest > F.reviewSingleMm2 ? 'review' : 'clean';
  return { vinylRemovedMm2: +(removed * px).toFixed(3), vinylAddedMm2: +(added * px).toFixed(3), changedFraction: +fraction.toFixed(5), largestChangeMm2: largest, regionCount: regions.length, topRegions: regions.slice(0, 20), level };
}

// Dark-artwork crop like the existing validator: threshold, crop to the dark bounding box, scale to the target width.
export function normalizeArtwork(lum, w, h, artworkWidthMm = COMPILER_RULES.artworkWidthMm) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (lum[y * w + x] < 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) throw new Error('No dark artwork found');
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, mask = new Uint8Array(cw * ch);
  let maxD2 = 0; const cx = (cw - 1) / 2, cy = (ch - 1) / 2;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const white = lum[(y + y0) * w + x + x0] >= 128;
    mask[y * cw + x] = white ? 1 : 0;
    if (!white) { const d2 = (x - cx) ** 2 + (y - cy) ** 2; if (d2 > maxD2) maxD2 = d2; }
  }
  // Scale to the artwork width, then shrink (never enlarge) so every dark pixel sits inside the safe-zone circle.
  let mmPerPx = artworkWidthMm / cw;
  const safeR = COMPILER_RULES.safeZoneDiameterMm / 2, extent = Math.sqrt(maxD2) * mmPerPx;
  if (extent > safeR) mmPerPx *= (safeR / extent) * 0.97; // margin so compile repairs cannot push cut-away past the zone
  return { mask, width: cw, height: ch, origin: [x0, y0], mmPerPx };
}

// Cut-away (black) outlines as one even-odd path in millimetres. A white margin closes shapes that touch the artwork edge.
export function maskToCutSvg(mask, w, h, mm, tolerancePx = 0.7) {
  const W = w + 2, H = h + 2, black = new Uint8Array(W * H);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) black[(y + 1) * W + x + 1] = mask[y * w + x] ? 0 : 1;
  const loops = traceLoops(black, W, H), parts = [];
  for (const loop of loops) {
    const pts = simplifyRing(loop, tolerancePx);
    if (pts.length < 3) continue;
    parts.push('M' + pts.map(([x, y]) => `${((x - 1) * mm).toFixed(3)} ${((y - 1) * mm).toFixed(3)}`).join('L') + 'Z');
  }
  const wMm = (w * mm).toFixed(3), hMm = (h * mm).toFixed(3);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${wMm}mm" height="${hMm}mm" viewBox="0 0 ${wMm} ${hMm}"><path fill="#000" fill-rule="evenodd" d="${parts.join('')}"/></svg>`;
}

function traceLoops(set, W, H) {
  const V = W + 1, out = new Map(); // vertex -> list of [dir, endVertex]
  const add = (x0, y0, x1, y1, dir) => { const k = y0 * V + x0; (out.get(k) || out.set(k, []).get(k)).push([dir, y1 * V + x1, false]); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!set[y * W + x]) continue;
    if (y === 0 || !set[(y - 1) * W + x]) add(x, y, x + 1, y, 0);
    if (x === W - 1 || !set[y * W + x + 1]) add(x + 1, y, x + 1, y + 1, 1);
    if (y === H - 1 || !set[(y + 1) * W + x]) add(x + 1, y + 1, x, y + 1, 2);
    if (x === 0 || !set[y * W + x - 1]) add(x, y + 1, x, y, 3);
  }
  const loops = [];
  for (const [startKey, edges] of out) {
    for (const e0 of edges) {
      if (e0[2]) continue;
      const ring = []; let e = e0, key = startKey;
      for (;;) {
        e[2] = true; ring.push([key % V, Math.floor(key / V)]);
        key = e[1]; const next = out.get(key); if (!next) break;
        const d = e[0]; let pick = null;
        for (const turn of [1, 0, 3]) { const want = (d + turn) % 4; pick = next.find((c) => !c[2] && c[0] === want); if (pick) break; }
        if (!pick) break; e = pick;
        if (key === startKey && e === e0) break;
      }
      if (ring.length >= 4) loops.push(ring);
    }
  }
  return loops;
}

function simplifyRing(ring, tol) {
  if (ring.length < 8) return ring;
  let a = 0, b = 0, best = -1;
  for (let i = 1; i < ring.length; i++) { const d = (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2; if (d > best) { best = d; b = i; } }
  const left = rdp(ring.slice(a, b + 1), tol), right = rdp(ring.slice(b).concat([ring[0]]), tol);
  return left.slice(0, -1).concat(right.slice(0, -1));
}
function rdp(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop(); let md = 0, mi = -1;
    const [x1, y1] = pts[s], [x2, y2] = pts[e], dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    for (let i = s + 1; i < e; i++) { const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / len; if (d > md) { md = d; mi = i; } }
    if (md > tol) { keep[mi] = 1; stack.push([s, mi], [mi, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}

export function buildValidatorReport({ label, mm, width, height, result, sourceSha256 }) {
  const v = result.validation;
  return {
    validator: 'D&U in-browser stencil compiler and validator', version: COMPILER_VERSION, artwork_width_mm: COMPILER_RULES.artworkWidthMm,
    thresholds: { island_min_bbox_mm: COMPILER_RULES.islandMinBboxMm, island_min_inscribed_diameter_mm: COMPILER_RULES.islandMinDiameterMm, island_min_area_mm2: COMPILER_RULES.islandMinAreaMm2, connected_white_min_width_mm: COMPILER_RULES.whiteMinWidthMm, white_target_width_mm: COMPILER_RULES.whiteTargetWidthMm, black_min_width_mm: COMPILER_RULES.blackMinWidthMm, status: 'estimated, not yet calibrated by the cut-sheet test' },
    cases: [{
      case: label, source_sha256: sourceSha256, physical_verdict: result.verdict === 'PASS' || result.verdict === 'REGENERATE' ? (result.verdict === 'PASS' ? 'PASS' : 'FAIL') : 'FAIL',
      width_px: width, height_px: height, mm_per_px: +mm.toFixed(6),
      islands_total: v.islandCount, island_fails: v.islandFails.length, neck_fails: v.necks.length, thin_cut_area_mm2: v.thinBlackAreaMm2, outside_safe_zone_mm2: v.outsideSafeZoneMm2, max_radius_mm: v.maxRadiusMm, safe_zone_diameter_mm: COMPILER_RULES.safeZoneDiameterMm,
      bridges_and_removals: result.bridges, change_from_input: { level: result.fidelity.level, changed_fraction: result.fidelity.changedFraction, vinyl_removed_mm2: result.fidelity.vinylRemovedMm2, vinyl_added_mm2: result.fidelity.vinylAddedMm2, largest_change_mm2: result.fidelity.largestChangeMm2 },
    }],
  };
}

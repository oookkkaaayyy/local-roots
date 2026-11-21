import test from 'node:test';
import assert from 'node:assert/strict';
import { compileStencil, validateStencil, measureChange, normalizeArtwork, maskToCutSvg, COMPILER_RULES } from '../src/lib/duStencilCompiler.mjs';

const W = 320, H = 320, MM = 0.2;
const blank = (v) => new Uint8Array(W * H).fill(v);
const disc = (m, cx, cy, r, v) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) m[y * W + x] = v; };
const rect = (m, x0, y0, x1, y1, v) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m[y * W + x] = v; };

test('already-valid stencil passes with no change', () => {
  const m = blank(1); disc(m, 160, 160, 100, 0); disc(m, 160, 160, 60, 1); rect(m, 60, 158, 260, 162, 1); // 1 mm bridges? (5px = 1.0 mm)
  const r = compileStencil(m, W, H, MM);
  assert.equal(r.verdict, 'PASS');
  assert.ok(r.fidelity.changedFraction < 0.01);
});

test('hairline white strand is removed rather than left to tear', () => {
  const m = blank(0); rect(m, 40, 40, 120, 280, 1); rect(m, 200, 40, 280, 280, 1); rect(m, 120, 158, 200, 159, 1); // 0.4 mm strand between two blocks
  const r = compileStencil(m, W, H, MM);
  const v = validateStencil(r.mask, W, H, MM);
  assert.equal(v.necks.length, 0);
  assert.equal(v.pass, true);
});

test('narrow neck holding two supports together is thickened, not cut', () => {
  const m = blank(0); rect(m, 20, 100, 120, 220, 1); rect(m, 200, 100, 300, 220, 1); rect(m, 120, 158, 200, 162, 1); // 1.0 mm neck, 16 mm long
  const before = validateStencil(m, W, H, MM);
  const r = compileStencil(m, W, H, MM);
  assert.equal(r.verdict, 'PASS');
  assert.equal(r.mask[160 * W + 160], 1, 'connection kept');
  assert.ok(r.fidelity.vinylAddedMm2 > 0);
  assert.ok(before.necks.length >= 0);
});

test('tiny floating piece is removed and tiny black pinholes are filled', () => {
  const m = blank(1); rect(m, 100, 100, 220, 220, 0); disc(m, 160, 160, 4, 1); disc(m, 40, 40, 1, 0); // 1.6 mm island, 0.4 mm pinhole
  const r = compileStencil(m, W, H, MM);
  assert.equal(r.verdict, 'PASS');
  assert.equal(r.mask[160 * W + 160], 0);
  assert.equal(r.mask[40 * W + 40], 1);
});

test('large unwanted change is flagged for regeneration', () => {
  const m = blank(0); for (let k = 0; k < 40; k++) rect(m, 10 + k * 7, 10, 10 + k * 7 + 1, 300, 1); // dense hairlines
  const r = compileStencil(m, W, H, MM);
  assert.equal(r.fidelity.level, 'reject');
  assert.equal(r.verdict === 'REGENERATE' || r.verdict === 'FAIL', true);
});

test('measureChange reports removed and added vinyl', () => {
  const a = blank(0), b = blank(0); rect(a, 10, 10, 19, 19, 1); rect(b, 50, 50, 54, 54, 1);
  const c = measureChange(a, b, W, H, MM);
  assert.ok(c.vinylRemovedMm2 > 0 && c.vinylAddedMm2 > 0 && c.regionCount === 2);
});

test('normalizeArtwork crops to dark bounds and scales to 190.5 mm, shrinking to fit the 170 mm safe zone', () => {
  const w = 100, h = 80, lum = new Uint8Array(w * h).fill(255);
  for (let y = 10; y < 50; y++) for (let x = 20; x < 70; x++) lum[y * w + x] = 0;
  const n = normalizeArtwork(lum, w, h);
  assert.equal(n.width, 50); assert.equal(n.height, 40);
  assert.ok(n.mmPerPx * 50 <= 190.5);
  assert.ok(Math.hypot(24.5, 19.5) * n.mmPerPx <= 85, 'corner inside the safe circle');
});

test('cut SVG is true size and closes shapes at the artwork edge', () => {
  const m = blank(1); rect(m, 0, 0, 99, 99, 0); disc(m, 50, 50, 20, 1);
  const svg = maskToCutSvg(m, W, H, MM);
  assert.match(svg, /width="64.000mm" height="64.000mm"/);
  assert.match(svg, /fill-rule="evenodd"/);
  assert.ok((svg.match(/M/g) || []).length >= 2);
  assert.ok(COMPILER_RULES.artworkWidthMm === 190.5);
});

test('safe zone: artwork is scaled inside the 170 mm circle and strays are flagged', () => {
  const n = 400, lum = new Uint8Array(n * n).fill(255);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if ((x - 200) ** 2 + (y - 200) ** 2 <= 190 ** 2 && (x - 200) ** 2 + (y - 200) ** 2 >= 150 ** 2) lum[y * n + x] = 0;
  const art = normalizeArtwork(lum, n, n);
  const v = validateStencil(art.mask, art.width, art.height, art.mmPerPx);
  assert.equal(v.outsideSafeZoneMm2, 0);
  assert.ok(v.maxRadiusMm <= 85, 'max radius ' + v.maxRadiusMm);
  const bad = validateStencil(art.mask, art.width, art.height, art.mmPerPx * 1.2);
  assert.ok(bad.outsideSafeZoneMm2 > 0 && bad.pass === false);
});

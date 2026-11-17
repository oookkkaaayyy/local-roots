import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeStencil, repairIslands, label4 } from '../src/lib/duStencilConstraints.mjs';

const W = 120, H = 120, MM = 0.25;
const blank = (v) => new Uint8Array(W * H).fill(v);
const disc = (m, cx, cy, r, v) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) m[y * W + x] = v; };

test('large island passes, tiny island fails on inscribed diameter', () => {
  const m = blank(1); disc(m, 30, 30, 18, 0); disc(m, 30, 30, 14, 1);
  disc(m, 85, 85, 12, 0); disc(m, 85, 85, 4, 1);
  const a = analyzeStencil(m, W, H, MM);
  assert.equal(a.islands.length, 2);
  assert.equal(a.failingIslands, 1);
  assert.ok(a.islands.find((i) => i.fails).diameterMm < 2.5);
});

test('thin diagonal sliver passes a bounding-box rule but fails the width rule', () => {
  const m = blank(0); disc(m, 60, 60, 50, 0);
  for (let t = 0; t < 14; t++) for (const dx of [-1, 0, 1]) m[(40 + t) * W + (40 + t + dx)] = 1;
  const a = analyzeStencil(m, W, H, MM);
  const s = a.islands[0];
  assert.ok(s.bboxMm[0] >= 2 && s.bboxMm[1] >= 2, 'bbox rule would pass');
  assert.equal(s.fails, true);
});

test('failing island is bridged when vinyl is within the gap limit', () => {
  const m = blank(1); disc(m, 60, 60, 12, 0); disc(m, 60, 60, 4, 1);
  const r = repairIslands(m, W, H, MM, { bridgeMaxGapMm: 2.5 });
  assert.equal(r.before.failingIslands, 1);
  assert.equal(r.after.failingIslands, 0);
  assert.equal(r.log[0].action, 'bridged');
  assert.equal(label4(r.mask, W, H, 1).comps.filter((c) => !c.border).length, 0);
});

test('failing island with no nearby vinyl is removed, never left floating', () => {
  const m = blank(0); disc(m, 60, 60, 4, 1);
  const r = repairIslands(m, W, H, MM);
  assert.equal(r.log[0].action, 'removed');
  assert.equal(r.after.islands.length, 0);
  assert.equal(r.mask[60 * W + 60], 0);
});

test('repair does not change a passing stencil', () => {
  const m = blank(1); disc(m, 30, 30, 18, 0); disc(m, 30, 30, 14, 1);
  const r = repairIslands(m, W, H, MM);
  assert.deepEqual(Array.from(r.mask), Array.from(m));
  assert.equal(r.log.length, 0);
});

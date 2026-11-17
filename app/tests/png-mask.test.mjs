import test from 'node:test';
import assert from 'node:assert/strict';
import { decodePngToMask, encodeMaskToPng } from '../src/lib/pngMask.mjs';

test('mask survives PNG encode/decode round trip', () => {
  const w = 37, h = 23, m = new Uint8Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = (i * 7 + (i >> 3)) % 3 === 0 ? 1 : 0;
  const d = decodePngToMask(encodeMaskToPng(m, w, h));
  assert.equal(d.width, w); assert.equal(d.height, h);
  assert.deepEqual(Array.from(d.mask), Array.from(m));
});

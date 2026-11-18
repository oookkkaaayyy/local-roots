import { bridge, label } from './stencil-compile.mjs'; import assert from 'node:assert';
const W = 9, H = 9, m = new Uint8Array(W * H).fill(1);
// ring-shaped cut (letter O): cut ring leaves a center island
for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) if (x === 2 || x === 6 || y === 2 || y === 6) m[y * W + x] = 0;
assert.strictEqual(label(m, W, H).comps.filter(c => !c.border).length, 1);
const r = bridge(m, W, H);
assert.strictEqual(r.islands, 1); assert.strictEqual(r.bridges, 1);
assert.strictEqual(label(r.mask, W, H).comps.length, 1); assert.ok(r.pass); assert.ok(r.changed >= 1 && r.changed <= 2);
const none = bridge(new Uint8Array(W * H).fill(1), W, H); assert.strictEqual(none.islands, 0);
const empty = bridge(new Uint8Array(W * H), W, H); assert.ok(empty.pass);
console.log('ok', r.changed, r.changedFraction.toFixed(3));

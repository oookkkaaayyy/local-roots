import { cutSheet } from './cutsheet.mjs'; import assert from 'node:assert';
const r = cutSheet({ dyes: ['Red', 'Blue 2'], steps: ['1m', '5m', '15m'] });
assert.strictEqual(r.cells.length, 6); assert.strictEqual(new Set(r.cells.map(c => c.id)).size, 6);
assert.ok(r.svg.startsWith('<svg') && r.svg.endsWith('</svg>')); assert.ok(r.cells[4].id === 'Blue_2__5m');
for (const a of r.cells) for (const b of r.cells) if (a !== b) assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
assert.throws(() => cutSheet({ dyes: [], steps: ['x'] }));
console.log('ok', r.widthMm, r.heightMm);

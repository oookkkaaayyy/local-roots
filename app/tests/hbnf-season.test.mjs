import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
await import('../public/hbnf-season/season.js');
const S = globalThis.HBNFSeason;
const html = readFileSync(new URL('../public/hbnf-season/index.html', import.meta.url), 'utf8');
const hist = (rel, ...p) => p.map((n) => ({ partners: [n], rel, raw: 50 }));
const g = {
  activeWeek: '2026-03-10',
  trophyHistory: {
    '2026-01-06': [...hist(-10, 'A'), ...hist(-4, 'B'), ...hist(-12, 'C')],
    '2026-01-13': [...hist(-8, 'A'), ...hist(-6, 'B')],
    '2026-01-20': [...hist(-9, 'A'), ...hist(-5, 'B')],
    '2025-12-30': hist(-20, 'A'),
  },
  weeks: {},
};
test('only 2026 rounds count and qualifiers need one third of season rounds', () => {
  const b = S.build(g);
  assert.equal(b.dates.length, 3);
  assert.equal(b.min, 1);
  assert.equal(b.rows.find((r) => r.n === 'A').r, 3);
});
test('trophy ranks by average to par per round, not total', () => {
  const b = S.build({ ...g, trophyHistory: { ...g.trophyHistory, '2026-02-03': hist(0, 'B'), '2026-02-10': hist(0, 'B'), '2026-02-17': hist(0, 'B') } });
  const q = b.rows.filter((r) => r.q);
  assert.equal(b.min, 2);
  assert.deepEqual(q.map((r) => r.n), ['A', 'B']);
  assert.ok(q[0].avg < q[1].avg);
  const c = b.rows.find((r) => r.n === 'C');
  assert.equal(c.q, false);
  assert.equal(c.pos, null);
});
test('most rounds is a separate award', () => {
  const a = S.awards(S.build(g), g);
  assert.equal(a.find((x) => x.label === 'Most rounds').names[0], 'A');
  assert.equal(a.find((x) => x.label === 'Trophy').names[0], 'C');
});
test('page is explanation free, read only and uses external scripts', () => {
  assert.doesNotMatch(html, /—/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(readFileSync(new URL('../public/hbnf-season/page.js', import.meta.url), 'utf8'), /method:\s*['"](POST|PUT|PATCH|DELETE)/i);
  assert.match(html, /Cabin/);
});

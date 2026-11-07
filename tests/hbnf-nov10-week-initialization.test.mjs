import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { NOV10_EVENT, prepareNov10WeekInitialization,
  prepareNov10WeekInitializationUndo } from '../scripts/hbnf-parent-release/nov10-week-initialization.mjs';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const witness = {
  ...NOV10_EVENT,
  authority: 'fixture:authorized-event-layout-record',
  sourceUrl: 'https://example.invalid/authorized-layout-record',
  sourceSha256: 'a'.repeat(64),
  verified: true,
  holes: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 3 })),
};
const root = { glow: { activeWeek: '2026-11-03', weeks: {
  '2026-11-03': { date: '2026-11-03', players: [{ id: 'preserve' }], tagsRevision: 11 },
} }, skins: { protected: true }, bagTags: { revision: 11 } };

test('rejects absent, wrong-event, wrong-window, incomplete, or malformed authorized layout', () => {
  for (const bad of [undefined, { ...witness, eventId: 'wrong' },
    { ...witness, windowEnd: '2026-11-12T07:30:00Z' },
    { ...witness, holes: witness.holes.slice(0, 17) },
    { ...witness, holes: witness.holes.map((h, i) => i === 8 ? { ...h, number: 10 } : h) },
    { ...witness, sourceSha256: 'not-a-hash' }]) {
    assert.throws(() => prepareNov10WeekInitialization({ root, updatedAt: 'fresh', witness: bad }));
  }
});

test('initializes only the bound Nov10 week and selects it, preserving Nov03 and protected state', () => {
  const p = prepareNov10WeekInitialization({ root, updatedAt: 'fresh-root-token', witness });
  assert.equal(p.status, 'READY_FOR_EXISTING_ADMIN_CAS_REVIEW');
  assert.equal(p.parTotal, 54);
  assert.deepEqual(p.changedPaths, ['glow.weeks.2026-11-10', 'glow.activeWeek']);
  assert.deepEqual(p.proposedRoot.glow.weeks['2026-11-10'].scorecardText.holePars,
    Object.fromEntries(Array.from({ length: 18 }, (_, i) => [String(i + 1), '3'])));
  assert.deepEqual(p.proposedRoot.glow.weeks['2026-11-03'], root.glow.weeks['2026-11-03']);
  assert.deepEqual(p.proposedRoot.bagTags, root.bagTags);
  assert.deepEqual(p.proposedRoot.skins, root.skins);
  assert.equal(p.productionWrite, false);
});

test('rejects every existing Nov10 week instead of resetting or overwriting it', () => {
  for (const existingWeek of [
    { eventId: 'other', date: '2026-11-10' },
    { eventId: NOV10_EVENT.eventId, date: NOV10_EVENT.date, players: [{ id: 'already-scored' }] },
    { eventId: NOV10_EVENT.eventId, date: NOV10_EVENT.date, players: [], cards: [],
      scorecardText: { holePars: { 1: '9' } } },
  ]) assert.throws(() => prepareNov10WeekInitialization({ root: {
    ...root, glow: { ...root.glow, weeks: { ...root.glow.weeks,
      '2026-11-10': existingWeek } },
  }, updatedAt: 'fresh', witness }), /TARGET_WEEK_ALREADY_EXISTS/);
});

test('path-only inverse restores only if this exact initialization postimage remains current', () => {
  const p = prepareNov10WeekInitialization({ root, updatedAt: 'fresh', witness });
  const undone = prepareNov10WeekInitializationUndo({ currentRoot: p.proposedRoot, inverse: p.inverse });
  assert.equal(undone.proposedRoot.glow.activeWeek, '2026-11-03');
  assert.equal(undone.proposedRoot.glow.weeks['2026-11-10'], undefined);
  assert.deepEqual(undone.proposedRoot.glow.weeks['2026-11-03'], root.glow.weeks['2026-11-03']);
  const drifted = structuredClone(p.proposedRoot);
  drifted.glow.weeks['2026-11-10'].players.push({ id: 'later-write' });
  assert.throws(() => prepareNov10WeekInitializationUndo({ currentRoot: drifted, inverse: p.inverse }),
    /POSTIMAGE_DRIFT/);
});

test('does not mutate the caller preimage', () => {
  const before = hash(root);
  prepareNov10WeekInitialization({ root, updatedAt: 'fresh', witness });
  assert.equal(hash(root), before);
});

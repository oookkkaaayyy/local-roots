import assert from 'node:assert/strict';
import test from 'node:test';
import { releaseIdFor } from '../scripts/package-dye-studio-candidate.mjs';

const source = 'a'.repeat(40);
const archive = 'b'.repeat(64);

test('historic release IDs remain stable for existing receipts', () => {
  assert.equal(releaseIdFor('156', source, archive), 'local-roots-dye-studio-pr-156-2026-10-30-r1');
  assert.equal(releaseIdFor('159', source, archive), 'local-roots-dye-photo-pr-159-2026-10-30-r1');
});

test('current and future Dye Studio PRs receive candidate-bound IDs without new source exceptions', () => {
  assert.equal(
    releaseIdFor('166', source, archive),
    `local-roots-dye-studio-pr-166-${source.slice(0, 12)}-${archive.slice(0, 12)}-r1`,
  );
  assert.equal(
    releaseIdFor('907', source, archive),
    `local-roots-dye-studio-pr-907-${source.slice(0, 12)}-${archive.slice(0, 12)}-r1`,
  );
  assert.notEqual(releaseIdFor('907', source, archive), releaseIdFor('907', source, 'c'.repeat(64)));
  assert.notEqual(releaseIdFor('907', source, archive), releaseIdFor('908', source, archive));
});

test('candidate identity generation fails closed for malformed inputs', () => {
  assert.throws(() => releaseIdFor('PR166', source, archive), /numeric PR/);
  assert.throws(() => releaseIdFor('166', 'not-a-commit', archive), /full source commit/);
  assert.throws(() => releaseIdFor('166', source, 'not-a-hash'), /candidate archive SHA-256/);
});

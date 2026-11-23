import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const fn = readFileSync(new URL('../../supabase/functions/lr-coverage-watch/index.ts', import.meta.url), 'utf8');
const mig = readFileSync(new URL('../../supabase/migrations/20261122230000_publish_gate_coverage_watch.sql', import.meta.url), 'utf8');
test('coverage watch refuses editorial-only hosts', () => {
  for (const h of ['udisc', 'discgolfscene', 'pdga', 'dgpt']) assert.ok(fn.includes(h));
  assert.match(fn, /skipped_editorial_only/);
});
test('coverage watch requires the vault secret header', () => {
  assert.match(fn, /lr_verify_coverage_sync_secret/);
  assert.match(fn, /x-local-roots-sync-secret/);
});
test('publish gate and schedules are migrated', () => {
  assert.match(mig, /lr_event_publish_completeness_gate_trg/);
  for (const n of ['coverage-watch', 'completeness-gap-watch', 'duplicate-watch']) assert.ok(mig.includes(n));
});

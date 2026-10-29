import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../supabase/migrations/20261029203741_hbnf_league_state_server_revision_guard.sql', import.meta.url), 'utf8');

test('revision trigger runs after authoritative tag projection and before AFTER projections', () => {
  assert.match(migration, /zzz_hbnf_enforce_league_state_revision/);
  assert.match(migration, /before update on public\.league_state/i);
  assert.match(migration, /new\.state_json is not distinct from old\.state_json/i);
});

test('no-op writes preserve the stored revision and ignore the supplied clock', () => {
  assert.match(migration, /if new\.state_json is not distinct from old\.state_json then\s+new\.updated_at := old\.updated_at;/i);
});

test('mutations use database time and advance at least one timestamptz(6) tick', () => {
  assert.match(migration, /pg_catalog\.clock_timestamp\(\)/i);
  assert.match(migration, /old\.updated_at[^;]*interval '1 microsecond'/is);
  assert.match(migration, /greatest\(/i);
  assert.match(migration, /old\.updated_at = 'infinity'::timestamptz/i);
});

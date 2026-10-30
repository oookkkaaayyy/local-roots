import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../supabase/migrations/20261029204700_hbnf_league_state_guarded_rpc_cutover.sql', import.meta.url), 'utf8');
const sync = await readFile(new URL('../public/hbnf-league-state-sync.js', import.meta.url), 'utf8');
const skins = await readFile(new URL('../public/skins.html', import.meta.url), 'utf8');

test('login-free browser saves use mandatory revision-guarded RPC', () => {
  assert.match(sync, /client\.rpc\('hbnf_save_league_state_v1'/);
  assert.match(sync, /p_expected_updated_at:\s*current\.revision/);
  assert.match(sync, /p_state_json:\s*result\.root/);
  assert.doesNotMatch(sync, /client\.from\('league_state'\)\s*\.update\(/);
  assert.match(skins, /supabaseClient\.rpc\('hbnf_save_league_state_v1'/);
  assert.doesNotMatch(skins, /supabaseClient\.from\('league_state'\)\.update\(/);
});

test('cutover revokes public direct insert/update and keeps anonymous RPC execution', () => {
  assert.match(migration, /revoke insert, update on table public\.league_state from public, anon, authenticated/i);
  assert.match(migration, /grant select on table public\.league_state to anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.hbnf_save_league_state_v1\(timestamptz, jsonb\)\s+to anon, authenticated/i);
  assert.match(migration, /drop policy if exists "Public can update league_state"/i);
  assert.match(migration, /drop policy if exists "Public can write league_state"/i);
});

test('RPC rejects missing revisions and returns zero rows for stale CAS', () => {
  assert.match(migration, /p_expected_updated_at is null[\s\S]*?errcode = '22023'/i);
  assert.match(migration, /where ls\.id = 1\s+and ls\.updated_at = p_expected_updated_at/i);
  assert.match(migration, /returns setof public\.league_state/i);
});

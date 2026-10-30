import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const base = new URL('../source-snapshots/hbnf-worker-d1a5f936-20261024/', import.meta.url);
const get = path => readFile(new URL(path, base), 'utf8');

test('the reviewed migration matches the packaged migration and revokes legacy anonymous writes', async () => {
  const canonical = await readFile(new URL('../supabase/migrations/20261030021038_hbnf_league_state_anon_cas_rpc.sql', import.meta.url), 'utf8');
  const packaged = await get('database/20261030021038_hbnf_league_state_anon_cas_rpc.sql');
  assert.equal(packaged, canonical);
  assert.match(canonical, /create or replace function public\.hbnf_save_league_state_v1\([\s\S]*?for update[\s\S]*?state\.updated_at = p_expected_updated_at[\s\S]*?returning state\.\*/);
  assert.match(canonical, /revoke insert, update on table public\.league_state from public, anon, authenticated/);
  assert.match(canonical, /grant select on table public\.league_state to anon, authenticated/);
  assert.match(canonical, /grant execute on function public\.hbnf_save_league_state_v1\(timestamptz, jsonb\) to anon, authenticated/);
  assert.doesNotMatch(canonical, /set updated_at\s*=/i, 'server revision trigger owns timestamp advancement');
});

test('public scoring writers use the same revision-conditional RPC', async () => {
  const cas = await get('public/league-state-cas.mjs');
  const glow = await get('public/glow.html');
  const skins = await get('public/skins.html');
  assert.match(cas, /client\.rpc\("hbnf_save_league_state_v1"/);
  assert.match(glow, /rpc\('hbnf_save_league_state_v1'/);
  assert.match(skins, /rpc\('hbnf_save_league_state_v1'/);
  for (const source of [cas, glow, skins]) assert.doesNotMatch(source, /\.from\(['"]league_state['"]\)\.update\(/);
});

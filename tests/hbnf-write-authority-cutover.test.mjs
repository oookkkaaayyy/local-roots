import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../supabase/migrations/20261029204700_hbnf_league_state_guarded_rpc_cutover.sql', import.meta.url), 'utf8');
const sync = await readFile(new URL('../public/hbnf-league-state-sync.js', import.meta.url), 'utf8');
const skins = await readFile(new URL('../public/skins.html', import.meta.url), 'utf8');
const tagRevision = await readFile(new URL('../supabase/migrations/20261030230000_hbnf_verify_round_tag_revision_enforcement.sql', import.meta.url), 'utf8');

test('login-free browser saves use mandatory revision-guarded RPC', () => {
  assert.match(sync, /client\.rpc\('hbnf_save_league_state_v1'/);
  assert.match(sync, /p_expected_updated_at:\s*current\.revision/);
  assert.match(sync, /p_state_json:\s*result\.root/);
  assert.doesNotMatch(sync, /client\.from\('league_state'\)\s*\.update\(/);
  assert.match(skins, /supabaseClient\.rpc\('hbnf_save_league_state_v1'/);
  assert.doesNotMatch(skins, /supabaseClient\.from\('league_state'\)\.update\(/);
});

test('Skins loads the shared revision comparator before using it for Realtime events', () => {
  assert.match(skins, /<script src="hbnf-league-state-sync\.js\?v=20261030-revision-order"><\/script>/);
  assert.match(skins, /HBNFLeagueStateSync\.revisionAtOrBefore\(incomingRevision,ctx\.lastRemoteRevision\)/);
});

test('Skins compares remote JSONB snapshots semantically despite object-key reordering', () => {
  assert.match(skins, /const incomingRootHash=hbnfSemanticHash\(incoming\)/);
  assert.match(skins, /const currentBranchHash=hbnfSemanticHash\(currentRoot&&currentRoot\[ctx\.branch\]\)/);
  assert.match(skins, /ctx\.lastRemoteRootHash=hbnfSemanticHash\(readback\.data\.state_json\)/);
  assert.match(skins, /if\(hbnfSemanticHash\(ctx\.state\)===saveSnapshotHash\)/);
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

test('round-tag verification enforces both revisions after idempotent retry checks', () => {
  assert.match(tagRevision, /p_expected_authority_revision\s+is null or p_expected_authority_revision<>v_authority\.revision/i);
  assert.match(tagRevision, /p_expected_entry_revision\s+is null or p_expected_entry_revision<>v_entry\.revision/i);
  assert.match(tagRevision, /elsif p_expected_entry_revision is distinct from 0/i);
  assert.match(tagRevision, /edit_id_reused/);
});

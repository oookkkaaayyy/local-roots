import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateCutoverSql } from '../scripts/hbnf-parent-release/parent-gate.mjs';

const migration = await readFile(new URL('../supabase/migrations/20261029204700_hbnf_league_state_guarded_rpc_cutover.sql', import.meta.url), 'utf8');
const contract = await readFile(new URL('../scripts/hbnf-parent-release/sql/db-revoke-old-writes.sql', import.meta.url), 'utf8');
const sync = await readFile(new URL('../public/hbnf-league-state-sync.js', import.meta.url), 'utf8');
const skins = await readFile(new URL('../public/skins.html', import.meta.url), 'utf8');
const tagRevision = await readFile(new URL('../supabase/migrations/20261030230000_hbnf_verify_round_tag_revision_enforcement.sql', import.meta.url), 'utf8');
const revisionGuard = await readFile(new URL('../supabase/migrations/20261029203741_hbnf_league_state_server_revision_guard.sql', import.meta.url), 'utf8');

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

test('Skins recovery matches the persisted pending draft base before the original startup snapshot', () => {
  assert.match(skins, /const pendingEditBaseHash=ctx\.pendingBaseHash\|\|ctx\.startupBranchHash/);
  assert.match(skins, /pendingEditBaseHash===hbnfSemanticHash\(remoteBranch\)\|\|pendingEditBaseHash===hbnfSyncHash\(remoteBranch\)/);
});

test('RPC expansion is additive and leaves legacy table writers available until final cutover', () => {
  assert.match(migration, /grant execute on function public\.hbnf_save_league_state_v1\(timestamptz, jsonb\)\s+to anon, authenticated/i);
  assert.doesNotMatch(migration, /revoke\s+(?:insert\s*,\s*update|update\s*,\s*insert)\s+on\s+(?:table\s+)?public\.league_state/i);
  assert.doesNotMatch(migration, /drop policy if exists "Public can (?:update|write) league_state"/i);
});

test('final cutover revokes direct writes only in a separately gated SQL artifact', () => {
  assert.match(contract, /revoke insert, update on table public\.league_state from public, anon, authenticated/i);
  assert.match(contract, /grant select on table public\.league_state to anon, authenticated/i);
  assert.match(contract, /drop policy if exists "Public can update league_state"/i);
  assert.match(contract, /drop policy if exists "Public can write league_state"/i);
  assert.doesNotMatch(contract, /create\s+or\s+replace\s+function\s+public\.hbnf_save_league_state_v1/i);
});

test('cutover preserves the installed eight-second server-side CAS timeout', () => {
  assert.match(migration, /create\s+or\s+replace\s+function\s+public\.hbnf_save_league_state_v1[\s\S]*?set\s+statement_timeout\s*=\s*'8s'/i);
});

test('RPC preserves installed guarded-write semantics and fails closed on stale revision', () => {
  assert.match(migration, /if p_expected_updated_at is null then\s+raise exception 'expected_revision_required'/i);
  assert.match(migration, /where state\.id = 1\s+for update/i);
  assert.match(migration, /if not found then\s+raise exception 'league_state_row_missing'/i);
  assert.match(migration, /if v_current_updated_at is distinct from p_expected_updated_at then\s+return;/i);
  assert.match(migration, /where state\.id = 1\s+and state\.updated_at = p_expected_updated_at/i);
  assert.match(migration, /returns setof public\.league_state/i);
});

test('round-tag verification enforces both revisions after idempotent retry checks', () => {
  assert.match(tagRevision, /p_expected_authority_revision\s+is null or p_expected_authority_revision<>v_authority\.revision/i);
  assert.match(tagRevision, /p_expected_entry_revision\s+is null or p_expected_entry_revision<>v_entry\.revision/i);
  assert.match(tagRevision, /elsif p_expected_entry_revision is distinct from 0/i);
  assert.match(tagRevision, /edit_id_reused/);
});


test('parent-release cutover validator accepts separated real SQL stages, not a combined auto-migration', () => {
  assert.deepEqual(validateCutoverSql({ expandSql: migration, contractSql: contract, revisionSql: revisionGuard, tagSql: tagRevision }), []);
  assert.notEqual(migration, contract);
});

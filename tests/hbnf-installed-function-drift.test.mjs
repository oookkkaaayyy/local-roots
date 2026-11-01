import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dir = new URL('../supabase/migrations/', import.meta.url);
const forward = await readFile(new URL('20261101160000_hbnf_revision_trigger_forward_alignment.sql', dir), 'utf8');
const original = await readFile(new URL('20261029203741_hbnf_league_state_server_revision_guard.sql', dir), 'utf8');
const tag = await readFile(new URL('20261030230000_hbnf_verify_round_tag_revision_enforcement.sql', dir), 'utf8');

function functionBody(sql, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = sql.match(new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${escaped}\\b[\\s\\S]*?as\\s+\\$(\\w*)\\$([\\s\\S]*?)\\$\\1\\$\\s*;?`, 'i'));
  assert.ok(match, `missing function ${name}`);
  return match[2].replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

test('forward migration updates the already-applied revision function to the reviewed body', () => {
  assert.equal(
    functionBody(forward, 'hbnf_enforce_league_state_revision'),
    functionBody(original, 'hbnf_enforce_league_state_revision'),
  );
  assert.match(forward, /old\.updated_at = 'infinity'::timestamptz/i);
  assert.match(forward, /new\.state_json is not distinct from old\.state_json/i);
});

test('forward drift correction changes no table, trigger, grants, policies, or row data', () => {
  const declarations = [...forward.matchAll(/^\s*(create|drop|alter|grant|revoke|insert|update|delete)\b/gim)].map(x => x[1].toLowerCase());
  assert.deepEqual(declarations, ['create']);
  assert.equal([...forward.matchAll(/create\s+or\s+replace\s+function/gi)].length, 1);
});

test('the pending tag migration installs the missing stale authority and entry revision checks', () => {
  assert.match(tag, /if p_expected_authority_revision is null or p_expected_authority_revision<>v_authority\.revision then/i);
  assert.match(tag, /if p_expected_entry_revision is null or p_expected_entry_revision<>v_entry\.revision then/i);
  assert.match(tag, /elsif p_expected_entry_revision is distinct from 0 then/i);
});

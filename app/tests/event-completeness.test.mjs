import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../supabase');
const sql = readFileSync(path.join(root, 'migrations/20261122200000_event_completeness_system.sql'), 'utf8');
const columns = new Set(['name','start_date','timezone','county','city','course_name','venue_name','venue_address','event_type','format','start_time_local','start_time_note','club_host','td_names','official_url','registration_url','registration_status','entry_fee_amount','fee_breakdown','rounds_text','format_details','sanctioned']);

test('requirement seed rows only reference real lr_events columns', () => {
  const rows = [...sql.matchAll(/\('(recurring|tournament)','(\w+)','\{([^}]*)\}','(required|expected)'/g)];
  assert.ok(rows.length >= 28, 'seed rows present');
  for (const [, , , fields] of rows) for (const f of fields.split(',')) assert.ok(columns.has(f), `unknown column ${f}`);
});

test('every event class requires the same core groups', () => {
  const core = ['name','start_date','timezone','county','city','location','event_type','format','start_time','host','link'];
  for (const cls of ['recurring', 'tournament']) for (const g of core) assert.match(sql, new RegExp(`\\('${cls}','${g}',[^)]*'required'`), `${cls}.${g} required`);
});

test('fact applier never overwrites a differing value and has no external side effects', () => {
  assert.match(sql, /Source value differs from stored value; not overwritten/);
  assert.doesNotMatch(sql, /net\.http_post|send_email|smtp/i);
});

test('completeness views are not exposed to anon or authenticated', () => {
  assert.match(sql, /revoke all on public\.lr_event_completeness, public\.lr_event_gaps from anon, authenticated/);
});

test('acceptance SQL fixture exists and rolls back', () => {
  const t = readFileSync(path.join(root, 'tests/event_completeness_acceptance.sql'), 'utf8');
  assert.match(t, /^begin;/m); assert.match(t, /^rollback;/m);
  assert.ok(readdirSync(path.join(root, 'migrations')).some((f) => f.includes('event_completeness_system')));
});

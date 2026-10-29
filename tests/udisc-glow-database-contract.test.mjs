import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const migrationPath=new URL('../source-snapshots/hbnf-worker-d1a5f936-20261024/database/20261028_udisc_glow_atomic_week_sync.sql',import.meta.url);
const migration=await readFile(migrationPath,'utf8');

test('database save locks one row, compares target week and active selection, and changes only Glow week state',()=>{
  assert.match(migration,/where id\s*=\s*1\s+for update/i);
  assert.match(migration,/v_current_week[\s\S]{0,160}p_expected_week/i);
  assert.match(migration,/v_active_week[\s\S]{0,160}p_expected_active_week/i);
  assert.match(migration,/jsonb_set\(v_weeks, array\[p_week_date\], v_replacement_week, true\)/i);
  assert.match(migration,/update public\.league_state set state_json = v_state where id = 1/i);
  assert.match(migration,/scoresLocked/i);
  assert.match(migration,/finalized/i);
});

test('database save is executable only by service_role and contains no table DDL',()=>{
  assert.match(migration,/revoke all on function[\s\S]*from public, anon, authenticated/i);
  assert.match(migration,/grant execute on function[\s\S]*to service_role/i);
  assert.doesNotMatch(migration,/\b(create|alter|drop)\s+table\b/i);
});

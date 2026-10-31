import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {assertReadTimeoutBaseline,READ_TIMEOUT_RELEASE} from '../scripts/hbnf-glow-anon-read-timeout-executor.mjs';

const baseline=()=>({
  project:READ_TIMEOUT_RELEASE.target,
  stateUpdatedAt:'2026-10-31T10:06:16.116363+00:00',
  stateBytes:2553225,stateMd5:'a4fd1d34a5a4b8cfb13b58045a86c816',
  activeWeek:'2026-10-28',nov3Exists:true,nov3Players:0,nov3Locked:false,
  anonConfig:['statement_timeout=3s'],
  authenticatorConfig:['session_preload_libraries=safeupdate','statement_timeout=8s','lock_timeout=8s'],
  functionConfig:['search_path=""','statement_timeout=8s'],
  functionMd5:'8bf371de3aff3355071345b59a50397e',
  triggers:[...READ_TIMEOUT_RELEASE.triggers],triggerDefsMd5:'3b0bb6d2cd1a2bacf3cd76a4e6f35f76',legacyAnonWrites:true,
  migrationLedgerCount:85,previousMigrationPresent:true,targetMigrationPresent:false,
});

test('the measured pre-migration provider baseline is admitted exactly',()=>{
  const b=baseline();assert.equal(assertReadTimeoutBaseline(b,b),true);
});

for(const [label,mutate,pattern] of [
  ['project',b=>b.project='other',/target identity/],
  ['state hash',b=>b.stateMd5='changed',/stateMd5/],
  ['state revision',b=>b.stateUpdatedAt='2026-10-31T10:06:17Z',/stateUpdatedAt/],
  ['active week',b=>b.activeWeek='2026-11-03',/activeWeek/],
  ['Nov 3 roster',b=>b.nov3Players=1,/nov3Players/],
  ['Nov 3 lock',b=>b.nov3Locked=true,/nov3Locked/],
  ['anon role setting',b=>b.anonConfig=['statement_timeout=4s'],/anonymous role timeout/],
  ['authenticator setting',b=>b.authenticatorConfig=['statement_timeout=30s'],/authenticator\/global/],
  ['CAS function timeout',b=>b.functionConfig=['search_path=""'],/CAS function configuration/],
  ['CAS body',b=>b.functionMd5='changed',/function body/],
  ['trigger set',b=>b.triggers.pop(),/trigger set/],
  ['trigger function definition',b=>b.triggerDefsMd5='changed',/trigger definitions/],
  ['legacy write grants',b=>b.legacyAnonWrites=false,/grants changed/],
  ['previous migration ledger',b=>b.migrationLedgerCount=84,/migration baseline/],
  ['replayed target migration',b=>{b.targetMigrationPresent=true;b.migrationLedgerCount=86;},/refusing replay/],
]) test(`stale or mismatched ${label} fails closed`,()=>{
  const expected=baseline(),actual=baseline();mutate(actual);assert.throws(()=>assertReadTimeoutBaseline(actual,expected),pattern);
});

test('candidate SQL is a role-scoped 8-second setting with an exact previous-setting inverse',async()=>{
  const sql=await readFile(new URL('../supabase/migrations/20261031101000_hbnf_anon_read_timeout_8s.sql',import.meta.url),'utf8');
  assert.equal(createHash('sha256').update(sql).digest('hex'),READ_TIMEOUT_RELEASE.migrationSha256);
  assert.match(sql,/ALTER ROLE anon SET statement_timeout = '8s'/);
  assert.match(sql,/NOTIFY pgrst, 'reload config'/);
  assert.doesNotMatch(sql,/ALTER (?:SYSTEM|DATABASE|ROLE authenticator)|ALTER ROLE anon IN DATABASE/);
  assert.match(READ_TIMEOUT_RELEASE.rollback,/ALTER ROLE anon SET statement_timeout = '3s'/);
  assert.match(READ_TIMEOUT_RELEASE.rollback,/NOTIFY pgrst, 'reload config'/);
});

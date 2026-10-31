import test from 'node:test';
import assert from 'node:assert/strict';
import {assertTimeoutBaseline,TIMEOUT_RELEASE} from '../scripts/hbnf-glow-timeout-executor.mjs';

const baseline=()=>({project:TIMEOUT_RELEASE.target,stateUpdatedAt:'2026-10-31T00:17:05.159339+00:00',stateBytes:2552524,stateMd5:'d94723da1bcc95921c6bf413568ebdb2',activeWeek:'2026-10-28',nov3Exists:false,anonConfig:['statement_timeout=3s'],functionConfig:['search_path=""'],triggers:[...TIMEOUT_RELEASE.triggerNames],legacyAnonWrites:true,migrationLedgerCount:84,targetMigrationPresent:false});

test('exact production baseline including revision, tag and Matrix triggers is admitted',()=>{
  const b=baseline();
  assert.equal(assertTimeoutBaseline(b,{...b,stateUpdatedAt:'2026-10-31T00:17:05.159339Z'}),true);
});

for(const [label,change] of [
  ['project',b=>b.project='other'],
  ['state hash',b=>b.stateMd5='changed'],
  ['revision',b=>b.stateUpdatedAt='2026-10-31T00:17:06Z'],
  ['anon timeout',b=>b.anonConfig=['statement_timeout=30s']],
  ['trigger set',b=>b.triggers.pop()],
  ['legacy grant',b=>b.legacyAnonWrites=false],
  ['replayed migration',b=>{b.targetMigrationPresent=true;b.migrationLedgerCount=85;}],
]) test(`stale or mismatched ${label} fails closed`,()=>{
  const expected=baseline(),actual=baseline();change(actual);
  assert.throws(()=>assertTimeoutBaseline(actual,expected),/target identity|baseline drift|timeout changed|trigger set|grants changed|already installed/);
});

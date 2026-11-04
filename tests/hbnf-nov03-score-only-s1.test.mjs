import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildS1ApplySQL,buildS1ExactRollbackSQL,neededS1Gates,SCORED_XLSX_SHA256} from '../scripts/hbnf-parent-release/nov03-score-only-s1.mjs';
const sql=readFileSync(new URL('../scripts/hbnf-parent-release/sql/nov03-score-only-guard.sql',import.meta.url),'utf8');
const before={beforeSha:'4ede8a226b55d556c24359903ebf496e67cff6006b695fe475b72f1673c860f7',
 beforeRevision:'2026-11-04 07:30:01.546079+00',
 oldWeek:{players:[1,2,3].map(n=>({id:'QI_1793572411877_'+n})),cards:[{id:'C1',players:[]}]}};
const report={status:'ATOMIC_NOV03_SCORE_PROPOSAL_REVIEW_ONLY',projectedStatus:'READY_FOR_SEPARATE_ADMITTED_CAS_REVIEW',
 eventId:'hb-glow-doubles-tAP8Y5',officialSource:{claimedSha256:SCORED_XLSX_SHA256,originalXlsxVerified:true},
 projectedWeek:{players:[1,2,3,4].map(n=>({id:'UDISC_20261103_0'+n,scores:Array(18).fill('3')})),cards:[{id:'C1'}]}};
const good=()=>Object.fromEntries(neededS1Gates.map(k=>[k,true]));
test('server guard freezes four Nov03 scoring source fields without ACL or sign-in changes',()=>{
 for(const k of ['CREATE TRIGGER','BEFORE UPDATE OF state_json','UDISC_20261103_','v_old->\\'players\\'',
 'v_old->\\'cards\\'','scorecardText,holePars','udiscSync,latest','ERRCODE=\\'23514\\''])assert(sql.includes(k),k);
 assert.doesNotMatch(sql,/^REVOKE |^ALTER POLICY |^DROP POLICY /m);
});
test('release generation refuses every unadmitted gate',()=>{
 for(const k of neededS1Gates){const g=good();g[k]=false;assert.throws(()=>buildS1ApplySQL({before,review:report,gates:g}),/S1_NOT_ADMITTED/);}
});
test('exact source-only forward and reverse are single transactions with old root fence and inverse',()=>{
 const a=buildS1ApplySQL({before,review:report,gates:good()});
 for(const k of ['BEGIN;','LOCK TABLE public.league_state','CREATE TRIGGER',
 'hbnf_apply_udisc_glow_week','S1_STALE_PREIMAGE','S1_UNRELATED_ROOT_CHANGED','COMMIT;'])assert(a.includes(k),k);
 const b=buildS1ExactRollbackSQL({before,after:{sha:'a'.repeat(64),revision:'2026-11-04 22:15:00.000000+00'}});
 for(const k of ['BEGIN;','ACCESS EXCLUSIVE MODE','S1_REVERSE_FENCE_MISMATCH',
 'DROP TRIGGER','S1_REVERSE_CAS_FAILED','S1_EXACT_ROOT_RESTORE_FAILED',
 'DROP FUNCTION','COMMIT;'])assert(b.includes(k),k);
});

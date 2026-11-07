import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildS1ApplySQL,buildS1ExactRollbackSQL,neededS1Gates,SCORED_XLSX_SHA256} from '../scripts/hbnf-parent-release/nov03-score-only-s1.mjs';
import {NOV03_SCORED_RECEIPT} from '../scripts/hbnf-parent-release/udisc-nov03-reconciliation.mjs';
import {NOV3_LAYOUT} from '../scripts/hbnf-parent-release/nov03-event-source.mjs';
const sql=readFileSync(new URL('../scripts/hbnf-parent-release/sql/nov03-score-only-guard.sql',import.meta.url),'utf8');
const before={beforeSha:'4ede8a226b55d556c24359903ebf496e67cff6006b695fe475b72f1673c860f7',
 beforeRevision:'2026-11-04 07:30:01.546079+00',
 oldWeek:{players:[1,2,3].map(n=>({id:'QI_1793572411877_'+n})),cards:[{id:'C1',players:[]}]}};
const report={status:'ATOMIC_NOV03_SCORE_PROPOSAL_REVIEW_ONLY',projectedStatus:'READY_FOR_SEPARATE_ADMITTED_CAS_REVIEW',
 eventId:'hb-glow-doubles-tAP8Y5',officialSource:{claimedSha256:SCORED_XLSX_SHA256,originalXlsxVerified:true},
 projectedWeek:(()=>{const names=[['Fox','Jason'],['Andrew','Matt'],['Kyle','Dylan'],['Karl','Tony Howell']];
 const players=NOV03_SCORED_RECEIPT.map((row,i)=>({id:'UDISC_20261103_0'+(i+1),partner1:names[i][0],partner2:names[i][1],scores:row.strokes.map(String)}));
 return {players,cards:[{id:'C1',players:players.map(p=>({id:p.id}))}],scorecardText:{holePars:Object.fromEntries(NOV3_LAYOUT.holes.map(h=>[String(h[0]),String(h[4])]))}};})()};
const good=()=>Object.fromEntries(neededS1Gates.map(k=>[k,true]));
test('server guard freezes four Nov03 scoring source fields without ACL or sign-in changes',()=>{
 for(const k of ['CREATE TRIGGER','BEFORE UPDATE OF state_json','UDISC_20261103_',
 "v_old->'players'","v_old->'cards'",'scorecardText,holePars','udiscSync,latest',"ERRCODE='23514'"])assert(sql.includes(k),k);
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

test('S1 final SQL admission rejects a tampered real score, identity, card or hole par',()=>{
 for(const edit of [
  w=>{w.players[0].scores[0]='9';},
  w=>{w.players[3].partner2='Test Player';},
  w=>{w.cards[0].players[1].id='QI_1793572411877_2';},
  w=>{w.scorecardText.holePars['5']='3';}
 ]){
  const altered=structuredClone(report);edit(altered.projectedWeek);
  assert.throws(()=>buildS1ApplySQL({before,review:altered,gates:good()}),/S1_REVIEW_/);
 }
});

test('S1 renderer supplies exact event date to installed RPC for live week lacking date fields',()=>{
 const forward=buildS1ApplySQL({before,review:report,gates:good()});
 const match=forward.match(/new_week jsonb:='((?:[^']|'')*)'::jsonb;/);
 assert(match,'actual RPC replacement JSON must be materialized');
 const prepared=JSON.parse(match[1].replaceAll("''","'"));
 assert.equal(prepared.date,'2026-11-03');
 assert.equal(prepared.activeWeek,'2026-11-03');
 assert.deepEqual(prepared.players,report.projectedWeek.players);
 assert.deepEqual(prepared.cards,report.projectedWeek.cards);
 assert.deepEqual(prepared.scorecardText,report.projectedWeek.scorecardText);
 for(const k of ['date','activeWeek']){
  const altered=structuredClone(report);altered.projectedWeek[k]='2026-10-24';
  assert.throws(()=>buildS1ApplySQL({before,review:altered,gates:good()}),/S1_REVIEW_WEEK_DATE_MISMATCH/);
 }
});

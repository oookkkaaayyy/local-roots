import test from 'node:test';
import assert from 'node:assert/strict';
import {OCT24_OFFICIAL_ROWS,prepareOct24HistoricalReconciliation,
 prepareSkinsToGlowRollover,routeConfirmedAceMoney} from '../scripts/hbnf-parent-release/oct24-business-recovery.mjs';
const base=()=>({updated_at:'rev',state_json:{glow:{weeks:{'2026-10-24':{
 date:'2026-10-24',scoresLocked:false,aceWinner:'',
 cards:[{id:'C1',finalized:false,players:[
 {id:'E1_1',partner1:'Andrew',partner2:'Matt'},{id:'E1_2',partner1:'Jason',partner2:'Mason'},
 {id:'E1_3',partner1:'James',partner2:'Zay'},{id:'E1_4',partner1:'Karl',partner2:'Kyle'}]}],
 players:['Andrew / Matt','Jason / Mason','James / Zay','Karl / Kyle'].map((name,i)=>({
 id:'E1_'+(i+1),name,cardId:'C1',removed:false,scores:['2','3','2',...Array(15).fill('')]
 }))
}}},skins:{weeks:{'2026-10-27':{finalized:false}}},bagTags:{manual:{Matt:10}},
history:{preserve:true}}});
test('Oct24 published six-team eleven-person PAR58 standings + Jason ace remain source facts, not fabricated hole scores',()=>{
 const root=base(),before=JSON.stringify(root);
 const out=prepareOct24HistoricalReconciliation({root,revision:'rev'});
 assert.equal(out.status,'WAITING_FOR_AUTHENTIC_18_HOLE_U_DISC_SCORES');
 assert.deepEqual(out.officialRows.map(x=>x.total),[44,45,48,50,53,58]);
 assert.equal(out.publishedParticipants,11);assert.equal(out.aceClaim.thrower,'Jason');
 assert.equal(out.aceClaim.payment,'NOT_VERIFIED');
 assert.equal(out.productionWrite,false);assert.equal(JSON.stringify(root),before);
});
const fakeScores=()=>{
 // SYNTHETIC SOURCE-LEVEL TEST FIXTURE ONLY. Not event scores or cash evidence.
 return OCT24_OFFICIAL_ROWS.map((r,i)=>{
  const holes=Array(18).fill(2);if(i===2)holes[8]=1;
  let left=r.total-holes.reduce((a,b)=>a+b,0),j=0;
  while(left>0){const index=j%18;j++;if(i===2&&index===8)continue;holes[index]++;left--;}
  return {members:r.members,holes};
 });
};
const aliases=Object.fromEntries(OCT24_OFFICIAL_ROWS.flatMap(r=>r.members).map(x=>[x,x]));
test('strict hole-level sum and owner-confirmed ace evidence required for historic replacement',()=>{
 const root=base(),rows=fakeScores();
 rows[1].holes[3]++;
 assert.throws(()=>prepareOct24HistoricalReconciliation({root,revision:'rev',
 officialHoleRows:rows,approvedAliases:aliases}),/OCT24_OFFICIAL_TOTAL/);
 rows[1].holes[3]--;
 rows[2].holes[8]=2;
 assert.throws(()=>prepareOct24HistoricalReconciliation({root,revision:'rev',
 officialHoleRows:rows,approvedAliases:aliases}),/OCT24_OFFICIAL_TOTAL|OCT24_HOLE9/);
});
test('authentic-shape full 18-hole input creates one dated, non-paying historical replacement and archives original',()=>{
 const root=base(),original=JSON.stringify(root);
 const plan=prepareOct24HistoricalReconciliation({root,revision:'rev',
 officialHoleRows:fakeScores(),approvedAliases:aliases});
 assert.equal(plan.status,'OCT24_EXACT_SOURCE_REPLACEMENT_REVIEW_ONLY');
 assert.equal(plan.sourceArchive.players.length,4);
 assert.equal(plan.proposedWeek.players.length,6);
 assert.equal(plan.proposedWeek.players[2].scores[8],'1');
 assert.equal(plan.proposedWeek.aceWinner,'Jason');
 assert.equal(plan.proposedWeek.scoresLocked,true);
 assert.equal(plan.proposedWeek.historicalReconciliation.payoutStatus,'UNVERIFIED_NOT_RECORDED_AS_PAID');
 assert.equal(JSON.stringify(root),original);
});
test('changed historical preimage cannot be silently replaced',()=>{
 const root=base();
 root.state_json.glow.weeks['2026-10-24'].players[0].scores[3]='3';
 assert.equal(prepareOct24HistoricalReconciliation({root,revision:'rev'}).status,
  'OCT24_LEGACY_WEEK_CHANGED_REQUIRES_MANUAL_REVIEW');
});
test('Skins nominal $357 never becomes a receipt or transfer automatically',()=>{
 assert.equal(prepareSkinsToGlowRollover({confirmedAmountCents:35700}).status,
  'CASH_ACE_HISTORY_AND_TRANSFER_AMOUNT_CONFIRMATION_REQUIRED');
 assert.equal(prepareSkinsToGlowRollover({confirmedAmountCents:35700,sourceConfirmation:{
  confirmed:true,receiptRef:'ledger-x'}}).status,
  'CASH_ACE_HISTORY_AND_TRANSFER_AMOUNT_CONFIRMATION_REQUIRED');
});
test('conditional historic ace and one-time transfer routing matches main/reserve and excludes tag sales',()=>{
 const r=prepareSkinsToGlowRollover({confirmedAmountCents:35700,
  sourceConfirmation:{confirmed:true,receiptRef:'confirmed-bank-ledger'},
  oct24AceModelConfirmed:true});
 assert.equal(r.status,'SOURCE_REVIEW_ONLY_TRANSFER_READY_FOR_SEPARATE_ADMITTED_CAS');
 assert.equal(r.oct24JasonAceConditionalPayoutCents,52300);
 assert.equal(r.conditionalGlowMainCents,35700);
 assert.equal(r.conditionalGlowReserveCents,20000);
 assert.equal(r.routeToMainCents,15700);
 assert.equal(r.routeToReserveCents,20000);
 assert.equal(r.tagSalesExcluded,true);assert.equal(r.productionWrite,false);
 const dup=prepareSkinsToGlowRollover({confirmedAmountCents:35700,priorLedger:[r.proposedLedgerEntry]});
 assert.equal(dup.status,'ALREADY_RECORDED_DO_NOT_DUPLICATE');
 const conflict=prepareSkinsToGlowRollover({confirmedAmountCents:12,priorLedger:[r.proposedLedgerEntry]});
 assert.equal(conflict.status,'BLOCKED_DUPLICATE_TRANSFER_AMOUNT_CONFLICT');
});
test('reserve/main alternate above milestones rather than overflow directly',()=>{
 const a=routeConfirmedAceMoney({main:20000,reserve:0,mode:'reserve',mainTarget:20000,reserveTarget:20000},35700);
 assert.equal(a.main,35700);assert.equal(a.reserve,20000);
 const b=routeConfirmedAceMoney({main:20000,reserve:0,mode:'reserve',mainTarget:20000,reserveTarget:20000},60000);
 assert.equal(b.main,50000);assert.equal(b.reserve,30000);
});

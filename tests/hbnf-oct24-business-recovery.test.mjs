import test from 'node:test';
import assert from 'node:assert/strict';
import {
 OCT24_OFFICIAL_ROWS,OCT24_VERIFIED_HOLE_ROWS,OCT24_OFFICIAL_PARS,
 prepareOct24HistoricalReconciliation,prepareSkinsToGlowRollover,
 modelOct24AceAfterConfirmedPayment,classifySept02FixtureSnapshot,
 routeConfirmedAceMoney
} from '../scripts/hbnf-parent-release/oct24-business-recovery.mjs';
const officialAliases=Object.fromEntries(OCT24_OFFICIAL_ROWS.flatMap(r=>r.members)
 .map(n=>[n,({'Matthew Levinson':'Matt','Jason Mintzer':'Jason',
   'Carlos Celio':'Carlos','Rusty Edwards':'Rusty'})[n]||n]));
function baseline(){
 const name=['Andrew / Matt','Jason / Mason','James / Zay','Karl / Kyle'];
 const scores=[['2','3','2'],['3','3','2'],['2','3','3'],['3','3','2']];
 const players=name.map((n,i)=>({id:'E1_'+(i+1),name:n,cardId:'C1',removed:false,
  partner1:n.split(' / ')[0],partner2:n.split(' / ')[1],
  scores:[...scores[i],...Array(15).fill('')]}));
 // Critical provider fact: the live October 24 week has NO "date" property.
 return {updated_at:'rev',state_json:{glow:{weeks:{'2026-10-24':{
  cards:[{id:'C1',finalized:false,players:players.map(p=>({
   id:p.id,partner1:p.partner1,partner2:p.partner2}))}],
  players,entryFee:10,aceWinner:'',scoresLocked:false,
  scorecardText:{holePars:{},holeNotes:{}},tiebreakerWinner:''
 }},trophyHistory:{'2026-10-24':[
  {raw:7,rel:-2,partners:['Andrew','Matt']},
  {raw:8,rel:-1,partners:['James','Zay']},
  {raw:8,rel:-1,partners:['Jason','Mason']},
  {raw:8,rel:-1,partners:['Karl','Kyle']}
 ]}},skins:{weeks:{'2026-10-27':{finalized:false}}},
 bagTags:{manual:{Matt:10,Jason:6,Andrew:2}},untouchedHistory:{preserve:true}}};
}
const oct24Plan=()=>prepareOct24HistoricalReconciliation({
 root:baseline(),revision:'rev',approvedAliases:officialAliases
});
test('source-pinned official Oct24 public scoreboard: 6 complete teams, 11 real people, PAR58',()=>{
 assert.equal(OCT24_VERIFIED_HOLE_ROWS.length,6);
 assert.equal(OCT24_OFFICIAL_PARS.length,18);
 assert.equal(OCT24_OFFICIAL_PARS.reduce((a,b)=>a+b,0),58);
 assert.deepEqual(OCT24_VERIFIED_HOLE_ROWS.map(r=>r.holes.reduce((a,b)=>a+b,0)),
  [44,45,48,50,53,58]);
 assert.equal(OCT24_VERIFIED_HOLE_ROWS.flatMap(r=>r.members).length,11);
 assert.equal(OCT24_VERIFIED_HOLE_ROWS[2].holes[8],1);
});
test('real provider preimage without date is eligible; exactly one owner-confirmed PAID $500 ace',()=>{
 const b=baseline(),before=JSON.stringify(b);
 const out=prepareOct24HistoricalReconciliation({root:b,revision:'rev',
  approvedAliases:officialAliases});
 assert.equal(out.status,'OCT24_EXACT_SOURCE_REPLACEMENT_REVIEW_ONLY');
 assert.equal(out.aceClaim.paymentStatus,'PAID');
 assert.equal(out.aceClaim.amountPaidCents,50000);
 assert.equal(out.aceClaim.amountOutstandingCents,0);
 assert.equal(out.aceClaim.paymentDate,null);
 assert.equal(out.aceClaim.duplicatePaymentAuthorized,false);
 assert.equal(out.proposedWeek.players.length,6);
 assert.equal(out.proposedWeek.players.flatMap(p=>[p.partner1,p.partner2].filter(Boolean)).length,11);
 assert.equal(out.proposedWeek.players[2].scores[8],'1');
 assert.equal(out.proposedWeek.aceWinner,'Jason');
 assert.equal(out.proposedWeek.scoresLocked,true);
 assert.equal(out.proposedWeek.historicalReconciliation.aceClaim.amountPaidCents,50000);
 assert.equal(out.proposedTrophyHistory.length,6);
 assert.deepEqual(out.proposedTrophyHistory.map(t=>t.raw),[44,45,48,50,53,58]);
 assert.deepEqual(out.proposedTrophyHistory[0].partners,['Andrew','Matt']);
 assert.equal(Object.values(out.proposedWeek.scorecardText.holePars)
  .reduce((a,b)=>a+Number(b),0),58);
 assert.equal(out.sourceArchive.players.length,4);
 assert.equal(out.sourceArchive.trophyHistory.length,4);
 assert.equal(out.winnerEntitlementIfAll11PaidCents.pool,7700);
 assert.equal(out.winnerEntitlementIfAll11PaidCents.Andrew,3850);
 assert.equal(out.winnerEntitlementIfAll11PaidCents.Matt,3850);
 assert.equal(out.winnerActualPaymentStatus,'UNKNOWN');
 assert.equal(JSON.stringify(b),before,'planner never mutates root/history');
 assert.equal(out.productionWrite,false);
});
test('replay of same settled ace is a no-op, never another $500 or invented $23',()=>{
 const base=baseline(),first=prepareOct24HistoricalReconciliation({
  root:base,revision:'rev',approvedAliases:officialAliases});
 base.state_json.glow.weeks['2026-10-24']=first.proposedWeek;
 base.state_json.glow.trophyHistory['2026-10-24']=first.proposedTrophyHistory;
 const replay=prepareOct24HistoricalReconciliation({
  root:base,revision:'rev2',approvedAliases:officialAliases});
 assert.equal(replay.status,'ALREADY_RECONCILED_CONFIRMED_PAID_NOOP');
 assert.equal(replay.productionWrite,false);
 assert.equal(replay.aceClaim.amountOutstandingCents,0);
 base.state_json.glow.weeks['2026-10-24'].historicalReconciliation.aceClaim.amountPaidCents=52300;
 assert.equal(prepareOct24HistoricalReconciliation({
  root:base,revision:'rev3',approvedAliases:officialAliases}).status,
  'OCT24_EXISTING_ACE_CLAIM_CONFLICT');
});
test('alternate 18-hole score rows with identical team totals fail source exact-match, not accepted as official',()=>{
 const rows=JSON.parse(JSON.stringify(OCT24_VERIFIED_HOLE_ROWS));
 rows[0].holes[0]++;rows[0].holes[1]--;
 assert.equal(rows[0].holes.reduce((a,b)=>a+b,0),44);
 assert.throws(()=>prepareOct24HistoricalReconciliation({
  root:baseline(),revision:'rev',officialHoleRows:rows,approvedAliases:officialAliases}),
  /OCT24_HOLE_SOURCE_MISMATCH/);
});
test('missing alias, alias collision or changed 3-hole/trophy preimage fails closed',()=>{
 assert.equal(prepareOct24HistoricalReconciliation({
  root:baseline(),revision:'rev'}).status,
  'OCT24_EXPLICIT_IDENTITY_CROSSWALK_REQUIRED');
 const collided={...officialAliases,'Carlos Celio':'Jason'};
 assert.throws(()=>prepareOct24HistoricalReconciliation({
  root:baseline(),revision:'rev',approvedAliases:collided}),
  /OCT24_CANONICAL_PARTICIPANT_COLLISION/);
 const changed=baseline();changed.state_json.glow.weeks['2026-10-24'].players[0].scores[0]='3';
 assert.equal(prepareOct24HistoricalReconciliation({
  root:changed,revision:'rev'}).status,
  'OCT24_LEGACY_WEEK_CHANGED_REQUIRES_MANUAL_REVIEW');
 const trophyChanged=baseline();
 trophyChanged.state_json.glow.trophyHistory['2026-10-24'][0].raw=99;
 assert.equal(prepareOct24HistoricalReconciliation({
  root:trophyChanged,revision:'rev'}).status,
  'OCT24_TROPHY_PREIMAGE_CHANGED_REQUIRES_REVIEW');
});
test('exact Sep 2 six complete Fixture cards: zero real entrants, wins, payout, ace; audit retained',()=>{
 const names=['Fixture Jason / Fixture Partner A','Fixture Fox / Fixture Partner B',
  'Fixture Andrew / Fixture Partner C','Fixture Matt / Fixture Partner D',
  'Fixture Quiotee / Fixture Partner E','Fixture Taylor / Fixture Partner F'];
 const w={players:names.map((name,i)=>({id:'G'+(i+1),name,removed:false,
  scores:Array(18).fill('3')}))};
 const trophyHistory=names.map(n=>({partners:n.split(' / '),raw:54,rel:-6}));
 const original=JSON.stringify({w,trophyHistory});
 const good=classifySept02FixtureSnapshot({date:'2026-09-02',week:w,trophyHistory});
 assert.equal(good.status,'SEPT02_CONFIRMED_SYNTHETIC_SOURCE_EXCLUDED');
 assert.deepEqual(good.fixturePlayerIds,['G1','G2','G3','G4','G5','G6']);
 assert.equal(good.syntheticIndividuals,12);
 assert.equal(good.qualifyingParticipants,0);
 assert.equal(good.qualifyingEntryFeeCents,0);
 assert.equal(good.qualifyingAceContributionCents,0);
 assert.equal(good.qualifyingWins,0);
 assert.equal(good.auditRetained,true);
 assert.equal(JSON.stringify({w,trophyHistory}),original);
 const mixed=structuredClone(w);mixed.players[5].name='Real Person / Fixture Partner F';
 assert.equal(classifySept02FixtureSnapshot({date:'2026-09-02',week:mixed,trophyHistory}).status,
  'SEPT02_MIXED_OR_CHANGED_REQUIRES_SOURCE_REVIEW');
 assert.equal(classifySept02FixtureSnapshot({date:'2026-10-24',week:w,trophyHistory}).status,
  'NOT_SEPT02');
});
test('exactly $500 paid is independent of conditional $187 model cash after Oct24 ace',()=>{
 const m=modelOct24AceAfterConfirmedPayment({
  seedMainCents:50000,seedReserveCents:7900,
  paidJul18Individuals:12,paidAug22Individuals:13,paidOct24Individuals:11});
 assert.equal(m.status,'MODEL_ONLY_NOT_VERIFIED_CASH');
 assert.equal(m.confirmedJasonPaidCents,50000);
 assert.equal(m.confirmedJasonOutstandingCents,0);
 assert.equal(m.sourceModelMatchesPaidAmount,true);
 assert.equal(m.modeledAfterAceMainCents,18700);
 assert.equal(m.modeledAfterAceReserveCents,0);
 assert.equal(m.sourceSeedAndPaidEntryCountsAreAssumptions,true);
 assert.equal(modelOct24AceAfterConfirmedPayment({}).status,
  'MODEL_INPUTS_REQUIRED_NEVER_ASSUMED');
 const fakeInflated=modelOct24AceAfterConfirmedPayment({
  seedMainCents:50000,seedReserveCents:7900,
  paidJul18Individuals:12,paidAug22Individuals:25,paidOct24Individuals:11});
 assert.equal(fakeInflated.presumedMainBeforeAceCents,52300);
 assert.equal(fakeInflated.sourceModelMatchesPaidAmount,false);
 assert.equal(fakeInflated.confirmedJasonPaidCents,50000);
 assert.equal(fakeInflated.confirmedJasonOutstandingCents,0);
});
test('nominal $357 Skins, Oct27 missing roster, and unsupported $523 model never qualify cash transfer',()=>{
 const r=prepareSkinsToGlowRollover({confirmedAmountCents:35700,
  sourceConfirmation:{confirmed:true,receiptRef:'SYNTHETIC_TEST_RECEIPT'},
  oct24AceModelConfirmed:true});
 assert.equal(r.status,'CASH_ACE_HISTORY_AND_TRANSFER_AMOUNT_CONFIRMATION_REQUIRED');
 assert.equal(r.nominalSkinsBalanceCents,35700);
 assert.equal(r.oct27PaidAttendanceUnknown,true);
 assert.equal(r.ownerConfirmedJasonPaidCents,50000);
 assert.equal(r.productionWrite,false);
});
test('only separately verified cash amount AND post-ace cash balance permits review-only staged transfer',()=>{
 const sourceConfirmation={confirmed:true,receiptRef:'TEST_CONFIRMED_SKINS_CASH'};
 const verifiedPostAceCash={confirmed:true,receiptRef:'TEST_CONFIRMED_POST_ACE_CASH',
  balances:{main:18700,reserve:0,mode:'reserve',
   mainTarget:18700,reserveTarget:20000}};
 const plan=prepareSkinsToGlowRollover({confirmedAmountCents:35700,
  sourceConfirmation,verifiedPostAceCash});
 assert.equal(plan.status,'SOURCE_REVIEW_ONLY_TRANSFER_READY_FOR_SEPARATE_ADMITTED_CAS');
 assert.equal(plan.proposedAfterMainCents,34400);
 assert.equal(plan.proposedAfterReserveCents,20000);
 assert.equal(plan.routeToMainCents,15700);
 assert.equal(plan.routeToReserveCents,20000);
 assert.equal(plan.proposedLedgerEntry.status,'PENDING_UNAPPLIED');
 assert.equal(plan.effectiveBefore,'2026-11-03:GlowNewEntryContributions');
 assert.equal(plan.tagSalesExcluded,true);
 assert.equal(plan.productionWrite,false);
 const pending=prepareSkinsToGlowRollover({confirmedAmountCents:35700,
  sourceConfirmation,verifiedPostAceCash,priorLedger:[plan.proposedLedgerEntry]});
 assert.equal(pending.status,'BLOCKED_EXISTING_TRANSFER_NOT_PROVEN_APPLIED');
 const applied={...plan.proposedLedgerEntry,status:'APPLIED',
  targetReceiptRef:'TEST_VERIFIED_POST_READBACK'};
 const replay=prepareSkinsToGlowRollover({confirmedAmountCents:35700,
  sourceConfirmation,verifiedPostAceCash,priorLedger:[applied]});
 assert.equal(replay.status,'ALREADY_APPLIED_DO_NOT_DUPLICATE');
 assert.equal(replay.productionWrite,false);
 const conflict=prepareSkinsToGlowRollover({confirmedAmountCents:35800,
  sourceConfirmation,verifiedPostAceCash,priorLedger:[applied]});
 assert.equal(conflict.status,'BLOCKED_DUPLICATE_TRANSFER_AMOUNT_CONFLICT');
});
test('source cash router retains reserve/main alternation without treating tag sales as ace',()=>{
 const r=routeConfirmedAceMoney({
  main:18700,reserve:0,mode:'reserve',mainTarget:18700,reserveTarget:20000},35700);
 assert.equal(r.main,34400);assert.equal(r.reserve,20000);
 assert.equal(r.toMain,15700);assert.equal(r.toReserve,20000);
});

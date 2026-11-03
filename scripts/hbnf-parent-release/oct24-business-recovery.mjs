// HBNF Oct24 official-history and Nov3 ace rollover source-bound PREPARATION.
// Pure read-only planner: no database/network/device, no actual payment execution.
// Authority #115 6616656107; official UDisc event ZUDJEk leaderboard and owner
// Jason-ace attribution and $500 confirmed payment. Official 18-hole rows source-pinned.
import {createHash} from 'node:crypto';
const clone=v=>JSON.parse(JSON.stringify(v));
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const DATE='2026-10-24',ID='hb-night-flyers-hb-glow-doubles-ZUDJEk';
const OCT24_SOURCE_URL='https://udisc.com/events/hb-night-flyers-hb-glow-doubles-ZUDJEk/leaderboard?round=1&view=scores';
const PAID_ACE_ID='2026-10-24|ZUDJEk|R1|hole-9|Jason-Mintzer';
export const OCT24_OFFICIAL_PARS=Object.freeze([3,3,4,3,3,3,3,4,3,3,3,3,3,4,3,3,4,3]);
// Source-verified public official UDisc Oct 24 leaderboard, not synthetic fixture totals.
// Individual ace thrower/settlement are separately owner-confirmed.
export const OCT24_VERIFIED_HOLE_ROWS=Object.freeze([
 {members:['Andrew','Matthew Levinson'],holes:[3,2,3,2,3,3,2,3,2,2,2,2,2,4,2,2,3,2]},
 {members:['Brian Rose','Mason Treat'],holes:[3,2,3,3,2,2,3,3,2,2,2,2,2,3,3,3,3,2]},
 {members:['Jason Mintzer','Carlos Celio'],holes:[3,2,4,2,3,3,2,4,1,3,2,2,2,4,2,3,3,3]},
 {members:['Dylan Jones','Tony Howell'],holes:[3,2,3,2,2,2,3,4,3,2,2,2,3,4,3,3,4,3]},
 {members:['Royce Friedmann','Rusty Edwards'],holes:[3,3,3,3,2,3,2,4,2,4,2,2,3,5,3,4,3,2]},
 {members:['Isaiah Gonzalez'],holes:[3,4,4,2,3,3,3,4,2,3,3,3,3,5,3,4,3,3]}
]);
const OWNER_CONFIRMED_ACE=Object.freeze({
 id:PAID_ACE_ID,claimant:'Jason',individualThrower:'Jason Mintzer',
 eventId:ID,round:1,hole:9,amountPaidCents:50000,amountOutstandingCents:0,
 paymentStatus:'PAID',evidence:'DIRECT_OWNER_CONFIRMATION_2026-11-03',
 paymentDate:null,paymentReceiptRef:null,duplicatePaymentAuthorized:false
});
export const OCT24_OFFICIAL_ROWS=Object.freeze([
 {rank:1,members:['Andrew','Matthew Levinson'],total:44,rel:-14},
 {rank:2,members:['Brian Rose','Mason Treat'],total:45,rel:-13},
 {rank:3,members:['Jason Mintzer','Carlos Celio'],total:48,rel:-10},
 {rank:4,members:['Dylan Jones','Tony Howell'],total:50,rel:-8},
 {rank:5,members:['Royce Friedmann','Rusty Edwards'],total:53,rel:-5},
 {rank:6,members:['Isaiah Gonzalez'],total:58,rel:0}
]);
const oldTeams=['Andrew / Matt','Jason / Mason','James / Zay','Karl / Kyle'];
const oldThreeHoles=['2,3,2','3,3,2','2,3,3','3,3,2'];
const oldIDs=['E1_1','E1_2','E1_3','E1_4'];
function exactWeek(w){
 if(!w||(w.date!==undefined&&w.date!==DATE)||w.scoresLocked||w.aceWinner||
    !Array.isArray(w.cards)||w.cards.length!==1||w.cards[0].id!=='C1'||w.cards[0].finalized||
    !Array.isArray(w.players)||w.players.length!==4||w.cards[0].players?.length!==4)return false;
 return w.players.every((p,i)=>p.id===oldIDs[i]&&p.name===oldTeams[i]&&
  p.cardId==='C1'&&p.removed===false&&Array.isArray(p.scores)&&
  p.scores.length===18&&p.scores.slice(0,3).map(String).join(',')===oldThreeHoles[i]&&
  p.scores.slice(3).every(v=>v===''||v===null)&&
  w.cards[0].players[i]?.id===oldIDs[i]);
}
export function prepareOct24HistoricalReconciliation({root,revision,officialHoleRows,approvedAliases={}}){
 const state=root?.state_json||root,w=state?.glow?.weeks?.[DATE];
 if(!revision||!w)return {status:'OCT24_EXACT_BASELINE_REQUIRED',productionWrite:false};
 const initial=JSON.stringify(root);
 const existing=w?.historicalReconciliation?.aceClaim;
 if(existing){
  const good=existing.id===PAID_ACE_ID&&existing.paymentStatus==='PAID'&&
   existing.amountPaidCents===50000&&existing.amountOutstandingCents===0&&
   w.players?.length===6&&w.scoresLocked===true;
  return {status:good?'ALREADY_RECONCILED_CONFIRMED_PAID_NOOP':'OCT24_EXISTING_ACE_CLAIM_CONFLICT',
   aceClaim:OWNER_CONFIRMED_ACE,productionWrite:false};
 }
 if(!exactWeek(w))return {status:'OCT24_LEGACY_WEEK_CHANGED_REQUIRES_MANUAL_REVIEW',productionWrite:false};
 const oldTrophy=state?.glow?.trophyHistory?.[DATE];
 const expectedTrophy=[['Andrew','Matt',7,-2],['James','Zay',8,-1],
  ['Jason','Mason',8,-1],['Karl','Kyle',8,-1]];
 if(!Array.isArray(oldTrophy)||oldTrophy.length!==4||
  oldTrophy.some((r,i)=>JSON.stringify(r?.partners)!==JSON.stringify(expectedTrophy[i].slice(0,2))||
   r.raw!==expectedTrophy[i][2]||r.rel!==expectedTrophy[i][3]))
  return {status:'OCT24_TROPHY_PREIMAGE_CHANGED_REQUIRES_REVIEW',productionWrite:false};
 const base={eventId:ID,date:DATE,publishedPar:58,publishedParticipants:11,
  officialRows:OCT24_OFFICIAL_ROWS,officialHolesSource:OCT24_SOURCE_URL,
  aceClaim:OWNER_CONFIRMED_ACE,
  priorWeekSha256:digest(w),priorTrophySha256:digest(oldTrophy),productionWrite:false};
 if(officialHoleRows===undefined)officialHoleRows=OCT24_VERIFIED_HOLE_ROWS;
 if(!Array.isArray(officialHoleRows)||officialHoleRows.length!==6)
  throw Error('OCT24_ALL_SIX_OFFICIAL_ROWS_REQUIRED');
 const memberAliases=new Map(),seenMembers=new Set();
 for(const [i,reference] of OCT24_OFFICIAL_ROWS.entries()){
  const row=officialHoleRows[i];
  if(JSON.stringify(row?.members)!==JSON.stringify(reference.members)||
     !Array.isArray(row.holes)||row.holes.length!==18||
     row.holes.some(s=>!Number.isInteger(s)||s<1||s>25))
   throw Error('OCT24_OFFICIAL_ROWS_OR_HOLES_MISMATCH');
  if(row.holes.reduce((sum,v)=>sum+v,0)!==reference.total)
   throw Error('OCT24_OFFICIAL_TOTAL_NOT_EQUAL_TO_HOLE_SCORES');
  if(row.holes.some((v,k)=>v!==OCT24_VERIFIED_HOLE_ROWS[i].holes[k]))
   throw Error('OCT24_HOLE_SOURCE_MISMATCH_OFFICIAL_U_DISC');
  if(i===2&&row.holes[8]!==1)
   throw Error('OCT24_HOLE9_ACE_SCORE_EVIDENCE_CONFLICT');
  for(const member of reference.members){
   const alias=approvedAliases[member];
   if(typeof alias!=='string'||!alias.trim())
     return {...base,status:'OCT24_EXPLICIT_IDENTITY_CROSSWALK_REQUIRED',
      missingNames:OCT24_OFFICIAL_ROWS.flatMap(r=>r.members).filter(n=>!approvedAliases[n])};
   if(seenMembers.has(alias.trim().toLocaleLowerCase()))
    throw Error('OCT24_CANONICAL_PARTICIPANT_COLLISION');
   seenMembers.add(alias.trim().toLocaleLowerCase());
   memberAliases.set(member,alias.trim());
  }
 }
 const proposed=clone(w);
 proposed.cards[0].players=OCT24_OFFICIAL_ROWS.map((r,i)=>({
  id:'UDISC_OCT24_'+String(i+1).padStart(2,'0'),
  partner1:memberAliases.get(r.members[0]),partner2:memberAliases.get(r.members[1])||''
 }));
 proposed.cards[0].finalized=true;
 proposed.players=OCT24_OFFICIAL_ROWS.map((r,i)=>({
  ...proposed.cards[0].players[i],
  name:r.members.map(n=>memberAliases.get(n)).join(' / '),
  cardId:'C1',scores:officialHoleRows[i].holes.map(String),removed:false
 }));
 proposed.scorecardText={...proposed.scorecardText,holePars:Object.fromEntries(
  OCT24_OFFICIAL_PARS.map((par,i)=>[String(i+1),String(par)]))};
 proposed.aceWinner='Jason';
 proposed.scoresLocked=true;
 proposed.historicalReconciliation={
  id:'oct24-udisc-ZUDJEk-r1-ace-jason-v1',eventId:ID,
  source:OCT24_SOURCE_URL,sourceType:'verified-official-public-hole-by-hole-scoreboard',
  officialPar:58,officialParticipants:11,aceThrower:'Jason',
  aceClaim:{...OWNER_CONFIRMED_ACE},
  acePayoutStatus:'PAID_500_CONFIRMED_BY_OWNER',otherEventPayoutsStatus:'UNVERIFIED',
  priorWeekSha256:digest(w),priorTrophySha256:digest(oldTrophy)
 };
 if(JSON.stringify(root)!==initial)throw Error('READ_ONLY_ROOT_WAS_CHANGED');
 const newTrophy=OCT24_OFFICIAL_ROWS.map(r=>({
  partners:r.members.map(n=>memberAliases.get(n)),raw:r.total,rel:r.rel
 }));
 return {...base,status:'OCT24_EXACT_SOURCE_REPLACEMENT_REVIEW_ONLY',
  sourceArchive:{cards:clone(w.cards),players:clone(w.players),aceWinner:w.aceWinner,
   scoresLocked:w.scoresLocked,trophyHistory:clone(oldTrophy)},
  proposedWeek:proposed,proposedTrophyHistory:newTrophy,
  newWeekSha256:digest(proposed),newTrophySha256:digest(newTrophy),
  winnerEntitlementIfAll11PaidCents:{pool:7700,Andrew:3850,Matt:3850},
  winnerActualPaymentStatus:'UNKNOWN',verifiedEntryPayments:'UNKNOWN',
  changedPaths:['glow.weeks.2026-10-24.cards','glow.weeks.2026-10-24.players',
   'glow.weeks.2026-10-24.aceWinner','glow.weeks.2026-10-24.scoresLocked',
   'glow.weeks.2026-10-24.scorecardText.holePars',
   'glow.weeks.2026-10-24.historicalReconciliation',
   'glow.trophyHistory.2026-10-24'],
  noOtherWeeksOrTagHistoryChange:true,
  requires:'same-manifest admission, durable archive, fresh revision+preimage CAS and separate settlement verification',
  productionWrite:false};
}
// Source mirror of established Glow reserve/main alternation; used ONLY for a
// conditional example. Ledger receipt must be independently confirmed.
export function routeConfirmedAceMoney(state,amountCents){
 if(!Number.isSafeInteger(amountCents)||amountCents<0)throw Error('ACE_TRANSFER_INVALID_AMOUNT');
 const next={...state};
 if(!Number.isSafeInteger(next.main)||!Number.isSafeInteger(next.reserve)||
    !['main','reserve'].includes(next.mode))throw Error('ACE_ROUTE_INVALID_BASE');
 let left=amountCents,iterations=0,toMain=0,toReserve=0;
 while(left>0){
  if(++iterations>100000)throw Error('ACE_ROUTE_CANNOT_TERMINATE');
  const reserveMode=next.mode==='reserve';
  const target=reserveMode?next.reserveTarget:next.mainTarget;
  const balance=reserveMode?next.reserve:next.main;
  if(!Number.isSafeInteger(target)||target<balance)throw Error('ACE_ROUTE_TARGET_INVALID');
  const add=Math.min(left,target-balance);
  if(reserveMode){next.reserve+=add;toReserve+=add;}
  else {next.main+=add;toMain+=add;}
  left-=add;
  if(left>0||add===target-balance){
   if(reserveMode){next.mode='main';next.mainTarget=next.main+20000;}
   else {next.mode='reserve';next.reserveTarget=next.reserve+10000;}
  }
 }
 return {...next,toMain,toReserve};
}

// Exact known 2026-09-02 test-row classification. Never delete audit history.
// If even one expected identity or 18-hole fixture row changes, HOLD for review.
export function classifySept02FixtureSnapshot({date,week,trophyHistory}={}){
 if(date!=='2026-09-02')return {status:'NOT_SEPT02',productionWrite:false};
 const expected=['Fixture Jason / Fixture Partner A','Fixture Fox / Fixture Partner B',
  'Fixture Andrew / Fixture Partner C','Fixture Matt / Fixture Partner D',
  'Fixture Quiotee / Fixture Partner E','Fixture Taylor / Fixture Partner F'];
 const p=week?.players||[];
 const identities=Array.isArray(p)&&p.length===6&&p.every((r,i)=>
  r.id==='G'+(i+1)&&r.name===expected[i]&&r.removed===false&&
  Array.isArray(r.scores)&&r.scores.length===18&&
  r.scores.every(x=>/^[0-9]+$/.test(String(x))));
 const trophy=Array.isArray(trophyHistory)&&trophyHistory.length===6&&
  trophyHistory.every(t=>Array.isArray(t.partners)&&t.partners.length===2&&
   t.partners.every(n=>n.startsWith('Fixture ')));
 if(!identities||!trophy)
  return {status:'SEPT02_MIXED_OR_CHANGED_REQUIRES_SOURCE_REVIEW',
   settlementAllowed:false,productionWrite:false};
 return {status:'SEPT02_CONFIRMED_SYNTHETIC_SOURCE_EXCLUDED',
  fixturePlayerIds:p.map(x=>x.id),fixtureTeams:6,syntheticIndividuals:12,
  qualifyingParticipants:0,qualifyingEntryFeeCents:0,
  qualifyingWinnerPoolCents:0,qualifyingAceContributionCents:0,
  qualifyingWins:0,auditRetained:true,productionWrite:false};
}
// Explicit what-if accounting only; payment date and cash reserve are NOT verified.
export function modelOct24AceAfterConfirmedPayment({seedMainCents,seedReserveCents,
 paidJul18Individuals,paidAug22Individuals,paidOct24Individuals}={}){
 const inputs=[seedMainCents,seedReserveCents,paidJul18Individuals,
  paidAug22Individuals,paidOct24Individuals];
 if(inputs.some(v=>!Number.isSafeInteger(v)||v<0))
  return {status:'MODEL_INPUTS_REQUIRED_NEVER_ASSUMED',productionWrite:false};
 let st={main:seedMainCents,reserve:seedReserveCents,mode:'reserve',
  mainTarget:seedMainCents,reserveTarget:20000};
 for(const count of [paidJul18Individuals,paidAug22Individuals,paidOct24Individuals])
  st=routeConfirmedAceMoney(st,count*300);
 const before=st.main;
 // Accounting route expectation and physical payment are separate assertions.
 return {status:'MODEL_ONLY_NOT_VERIFIED_CASH',presumedMainBeforeAceCents:before,
  presumedReserveBeforeAceCents:st.reserve,
  confirmedJasonPaidCents:50000,confirmedJasonOutstandingCents:0,
  sourceModelMatchesPaidAmount:before===50000,
  modeledAfterAceMainCents:st.reserve,modeledAfterAceReserveCents:0,
  sourceSeedAndPaidEntryCountsAreAssumptions:true,productionWrite:false};
}
// No transfer without BOTH independently verified cash amount AND actual post-ace
// source balance. Never let modeled $187 or nominal Skins $357 masquerade as cash.
export function prepareSkinsToGlowRollover({confirmedAmountCents,sourceConfirmation,
 priorLedger=[],verifiedPostAceCash}={}){
 const id='skins-to-glow-2026-11-03-after-oct24-ace-v1';
 const old=priorLedger.find(x=>x?.id===id);
 if(old){
  const same=old.amountCents===confirmedAmountCents;
  return {status:!same?'BLOCKED_DUPLICATE_TRANSFER_AMOUNT_CONFLICT':
   (old.status==='APPLIED'&&old.targetReceiptRef&&old.sourceReceiptRef?
   'ALREADY_APPLIED_DO_NOT_DUPLICATE':'BLOCKED_EXISTING_TRANSFER_NOT_PROVEN_APPLIED'),
   transferId:id,productionWrite:false};
 }
 if(!Number.isSafeInteger(confirmedAmountCents)||confirmedAmountCents<0||
    sourceConfirmation?.confirmed!==true||!sourceConfirmation?.receiptRef||
    verifiedPostAceCash?.confirmed!==true||!verifiedPostAceCash?.receiptRef||
    !verifiedPostAceCash?.balances)
  return {status:'CASH_ACE_HISTORY_AND_TRANSFER_AMOUNT_CONFIRMATION_REQUIRED',
   transferId:id,nominalSkinsBalanceCents:35700,oct27PaidAttendanceUnknown:true,
   nominalNotVerifiedRealCash:true,ownerConfirmedJasonPaidCents:50000,
   ownerConfirmedJasonOutstandingCents:0,productionWrite:false};
 const before=verifiedPostAceCash.balances;
 const carry=routeConfirmedAceMoney(before,confirmedAmountCents);
 return {status:'SOURCE_REVIEW_ONLY_TRANSFER_READY_FOR_SEPARATE_ADMITTED_CAS',
  transferId:id,effectiveDate:'2026-11-03',
  effectiveAfter:'2026-10-24:JasonAcePaid500',
  effectiveBefore:'2026-11-03:GlowNewEntryContributions',
  oct24JasonAceConfirmedPaidCents:50000,oct24JasonAceOutstandingCents:0,
  sourceSkinsCashReceiptRef:sourceConfirmation.receiptRef,
  sourcePostAceCashReceiptRef:verifiedPostAceCash.receiptRef,
  proposedLedgerEntry:{id,amountCents:confirmedAmountCents,source:'skins-remaining-ace-funds',
   effectiveDate:'2026-11-03',status:'PENDING_UNAPPLIED',
   sourceReceiptRef:sourceConfirmation.receiptRef,
   postAceBalanceReceiptRef:verifiedPostAceCash.receiptRef},
  verifiedBeforeBalances:clone(before),
  proposedAfterMainCents:carry.main,proposedAfterReserveCents:carry.reserve,
  routeToMainCents:carry.toMain,routeToReserveCents:carry.toReserve,
  requires:'atomic once-only CAS, recorded target receipt, verified post-readback',
  priorLedgerUnchanged:true,tagSalesExcluded:true,productionWrite:false};
}

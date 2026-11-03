// HBNF Oct24 official-history and Nov3 ace rollover source-bound PREPARATION.
// Pure read-only planner: no database/network/device, no payments marked made.
// Authority #115 6616656107; official UDisc event ZUDJEk leaderboard and owner
// Jason-ace attribution. Source has published totals, NOT all 18 hole strokes.
import {createHash} from 'node:crypto';
const clone=v=>JSON.parse(JSON.stringify(v));
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const DATE='2026-10-24',ID='hb-night-flyers-hb-glow-doubles-ZUDJEk';
export const OCT24_OFFICIAL_ROWS=Object.freeze([
 {rank:1,members:['Andrew','Matthew Levinson'],total:44,rel:-14},
 {rank:2,members:['Brian Rose','Mason Treat'],total:45,rel:-13},
 {rank:3,members:['Jason Mintzer','Carlos Celio'],total:48,rel:-10},
 {rank:4,members:['Dylan Jones','Tony Howell'],total:50,rel:-8},
 {rank:5,members:['Royce Friedmann','Rusty Edwards'],total:53,rel:-5},
 {rank:6,members:['Isaiah Gonzalez'],total:58,rel:0}
]);
const oldTeams=['Andrew / Matt','Jason / Mason','James / Zay','Karl / Kyle'];
const oldIDs=['E1_1','E1_2','E1_3','E1_4'];
function exactWeek(w){
 if(!w||w.date!==DATE||w.scoresLocked||w.aceWinner||
    !Array.isArray(w.cards)||w.cards.length!==1||w.cards[0].id!=='C1'||w.cards[0].finalized||
    !Array.isArray(w.players)||w.players.length!==4||w.cards[0].players?.length!==4)return false;
 return w.players.every((p,i)=>p.id===oldIDs[i]&&p.name===oldTeams[i]&&
  p.cardId==='C1'&&p.removed===false&&Array.isArray(p.scores)&&
  p.scores.length===18&&p.scores.slice(0,3).every(v=>/^\d+$/.test(String(v)))&&
  p.scores.slice(3).every(v=>v===''||v===null)&&
  w.cards[0].players[i]?.id===oldIDs[i]);
}
export function prepareOct24HistoricalReconciliation({root,revision,officialHoleRows,approvedAliases={}}){
 const state=root?.state_json||root,w=state?.glow?.weeks?.[DATE];
 if(!revision||!w)return {status:'OCT24_EXACT_BASELINE_REQUIRED',productionWrite:false};
 const initial=JSON.stringify(root);
 if(!exactWeek(w))return {status:'OCT24_LEGACY_WEEK_CHANGED_REQUIRES_MANUAL_REVIEW',productionWrite:false};
 const base={eventId:ID,date:DATE,publishedPar:58,publishedParticipants:11,
  officialRows:OCT24_OFFICIAL_ROWS,aceClaim:{thrower:'Jason',teamRank:3,hole:9,
   attribution:'OWNER_CONFIRMED',payment:'NOT_VERIFIED'},
  priorWeekSha256:digest(w),productionWrite:false};
 if(!officialHoleRows)
   return {...base,status:'WAITING_FOR_AUTHENTIC_18_HOLE_U_DISC_SCORES'};
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
 proposed.aceWinner='Jason';
 proposed.scoresLocked=true;
 proposed.historicalReconciliation={
  id:'oct24-udisc-ZUDJEk-r1-ace-jason-v1',
  eventId:ID,source:'official-18-hole-score-export-plus-owner-ace-attribution',
  officialPar:58,officialParticipants:11,aceThrower:'Jason',
  payoutStatus:'UNVERIFIED_NOT_RECORDED_AS_PAID'
 };
 if(JSON.stringify(root)!==initial)throw Error('READ_ONLY_ROOT_WAS_CHANGED');
 return {...base,status:'OCT24_EXACT_SOURCE_REPLACEMENT_REVIEW_ONLY',
  sourceArchive:{cards:clone(w.cards),players:clone(w.players),aceWinner:w.aceWinner,
   scoresLocked:w.scoresLocked},
  proposedWeek:proposed,newWeekSha256:digest(proposed),
  changedPaths:['glow.weeks.2026-10-24.cards','glow.weeks.2026-10-24.players',
   'glow.weeks.2026-10-24.aceWinner','glow.weeks.2026-10-24.scoresLocked',
   'glow.weeks.2026-10-24.historicalReconciliation'],
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
export function prepareSkinsToGlowRollover({confirmedAmountCents,sourceConfirmation,
  priorLedger=[],oct24AceModelConfirmed=false}={}){
 const id='skins-to-glow-2026-11-03-after-oct24-ace-v1';
 const old=priorLedger.find(x=>x?.id===id);
 if(old)return {status:old.amountCents===confirmedAmountCents?'ALREADY_RECORDED_DO_NOT_DUPLICATE':'BLOCKED_DUPLICATE_TRANSFER_AMOUNT_CONFLICT',
  transferId:id,productionWrite:false};
 if(!oct24AceModelConfirmed||!Number.isSafeInteger(confirmedAmountCents)||
    confirmedAmountCents<0||sourceConfirmation?.confirmed!==true||
    !sourceConfirmation?.receiptRef)
  return {status:'CASH_ACE_HISTORY_AND_TRANSFER_AMOUNT_CONFIRMATION_REQUIRED',
   transferId:id,nominalSkinsBalanceCents:35700,
   nominalNotVerifiedRealCash:true,productionWrite:false};
 // Conditional only: published Oct24 11 participants at $3 -> $33;
 // reserve190 +10 reaches200, main500+23=523; Jason's claimed
 // main payout $523; reserve200 becomes the new main, reserve resets.
 const oldAceMainPaidCents=52300;
 const carry=routeConfirmedAceMoney({main:20000,reserve:0,mode:'reserve',
    mainTarget:20000,reserveTarget:20000},confirmedAmountCents);
 return {status:'SOURCE_REVIEW_ONLY_TRANSFER_READY_FOR_SEPARATE_ADMITTED_CAS',
  transferId:id,effectiveDate:'2026-11-03',effectiveAfter:'2026-10-24',
  oct24JasonAceConditionalPayoutCents:oldAceMainPaidCents,
  acePayoutDelivery:'UNVERIFIED',oldSkinsCashReceiptRef:sourceConfirmation.receiptRef,
  proposedLedgerEntry:{id,amountCents:confirmedAmountCents,source:'skins-remaining-ace-funds',
    effectiveDate:'2026-11-03',confirmedBy:sourceConfirmation.confirmedBy||'OWNER_CONFIRMATION',
    payoutStatus:'TRANSFER_ONLY_NOT_A_PLAYER_PAYOUT'},
  conditionalGlowMainCents:carry.main,conditionalGlowReserveCents:carry.reserve,
  routeToMainCents:carry.toMain,routeToReserveCents:carry.toReserve,
  priorLedgerUnchanged:true,tagSalesExcluded:true,productionWrite:false};
}

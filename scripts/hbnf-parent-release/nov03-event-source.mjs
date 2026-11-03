// Exact November 3 HBNF UDisc event metadata + fail-closed quick-import test guard.
// Source authority: #115 comments 6617174574, 6617219678 and verified live state.
// Pure/read-only. This is not a deployment, a cleanup executor, or roster evidence.
import {createHash} from 'node:crypto';
export const NOV3_LAYOUT=Object.freeze({
 eventId:'hb-glow-doubles-tAP8Y5',layoutId:150408,date:'2026-11-03',
 title:'HB Glow Dubs 11.3.26',par:59,displayedFeet:6022,
 globalRule:'NO INTENTIONAL THROWS OVER PARKING LOT; intentional throw disqualifies. Otherwise no OBs or mandos.',
 holes:Object.freeze([
  [1,'Parkinglot','B on hole 7',196,3,'Parking near pad 10 → 7'],
  [2,'Short','B on hole 18',274,3,'7 short → 18'],
  [3,'Short','B on hole 12',249,3,'17 short → 12'],
  [4,'Short','A on hole 14',260,3,'16 short → 14'],
  [5,'Main','B on hole 10',573,4,'18 main → 10'],
  [6,'Short','A on hole 15',237,3,'16 short → 15'],
  [7,'Main','New 16 on hole 16',250,3,'15 main → 16'],
  [8,'PathBy16Long','Practice 1 (shop)',270,3,'Path by basket 16 → Practice 1'],
  [9,'Main','Practice 3 (long)',212,3,'1 main → Practice 3 (CTP)'],
  [10,'Main','New 16 on hole 16',233,3,'8 main → 16'],
  [11,'Main','A on hole 5',660,4,'12 main → 5'],
  [12,'Main','A on hole 15',308,3,'14 main → 15'],
  [13,'Short','B on hole 6',230,3,'15 short → 6'],
  [14,'Main','B on hole 7',365,3,'18 main → 7'],
  [15,'Main','A on hole 14',536,4,'8 main → 14'],
  [16,'Short','B on hole 10',309,3,'16 short → 10'],
  [17,'Main','C on hole 17',396,4,'12 main → 17 (double mando)'],
  [18,'Main','New 16 on hole 16',465,4,'18 main → 16']
 ]),
 truncatedLabels:[8,9],
 unresolvedRuleConflict:'Hole 17 double mando vs global no-mandos; organizer interpretation required',
 round1Attached:'UNVERIFIED',
 roster:'UNKNOWN_UNTIL_ROUND_BEGINS',
 exportStatus:'INITIAL_XLSX_EMPTY'
});
export function verifyNov3Layout(input=NOV3_LAYOUT) {
 if(input.eventId!==NOV3_LAYOUT.eventId||input.layoutId!==150408||
  input.date!=='2026-11-03'||!Array.isArray(input.holes)||input.holes.length!==18)
   throw Error('NOV3_LAYOUT_IDENTITY_INVALID');
 const unique=new Set(input.holes.map(h=>h[0]));
 if(unique.size!==18||input.holes.some((h,i)=>h[0]!==i+1||!Number.isInteger(h[3])||h[3]<=0||![3,4].includes(h[4])))
  throw Error('NOV3_LAYOUT_HOLE_SEQUENCE_INVALID');
 const pars=input.holes.reduce((n,h)=>n+h[4],0);
 const feet=input.holes.reduce((n,h)=>n+h[3],0);
 const par4=input.holes.filter(h=>h[4]===4).map(h=>h[0]);
 if(pars!==59||input.par!==59||feet!==6023||input.displayedFeet!==6022||
    JSON.stringify(par4)!=='[5,11,15,17,18]')
   throw Error('NOV3_LAYOUT_PAR_LENGTH_INVALID');
 return {layoutId:150408,eventId:input.eventId,par:pars,
  summedRoundedFeet:feet,displayedFeet:input.displayedFeet,
  roundingDifferenceFeet:1,par4,round1Attached:'UNVERIFIED',
  unresolvedRuleConflict:input.unresolvedRuleConflict};
}
const exact=Object.freeze([
 {id:'QI_1793572411877_1',one:'Andrew',two:'Test Player D',score:'3,4,4'},
 {id:'QI_1793572411877_2',one:'Test Player B',two:'',score:'2,4,3'},
 {id:'QI_1793572411877_3',one:'Test Player C',two:'Test Player A',score:'2,3,4'}
]);
const clone=v=>JSON.parse(JSON.stringify(v));
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function classifyNov3TestEntries(week) {
 const players=Array.isArray(week?.players)?week.players:[];
 const contamination=players.filter(p=>/^QI_\d{13}_\d+$/.test(String(p?.id||''))||
   /Test Player [A-Z]/i.test(String(p?.partner1||'')+' '+String(p?.partner2||'')));
 return {contaminated:contamination.length>0,ids:contamination.map(p=>p.id),
  mixedWithUnknown:contamination.length>0 && contamination.length!==players.length,
  productionWrite:false};
}
export function prepareNov3TestOnlyQuarantine({root,revision}) {
 const state=root?.state_json||root,week=state?.glow?.weeks?.['2026-11-03'];
 if(!week||state.glow.activeWeek!=='2026-11-03'||!revision)
  throw Error('EXACT_NOV3_BASELINE_AND_REVISION_REQUIRED');
 const prior=JSON.stringify(root),c=classifyNov3TestEntries(week);
 if(!c.contaminated)return {status:'NO_TEST_ENTRIES',productionWrite:false};
 if(c.mixedWithUnknown||week.scoresLocked||week.finalized||week.aceWinner ||
  !Array.isArray(week.cards)||week.cards.length!==1||week.cards[0].id!=='C1'||
  week.cards[0].finalized||!Array.isArray(week.cards[0].players)||
  week.cards[0].players.length!==3||!Array.isArray(week.players)||week.players.length!==3)
  return {status:'BLOCKED_MIXED_OR_SETTLED_WEEK',productionWrite:false};
 for(let i=0;i<3;i++){
  const e=exact[i],p=week.players[i],entry=week.cards[0].players[i];
  if(p.id!==e.id||entry.id!==e.id||p.partner1!==e.one||p.partner2!==e.two||
    entry.partner1!==e.one||entry.partner2!==e.two||p.cardId!=='C1'||
    p.removed!==false||!Array.isArray(p.scores)||p.scores.length!==18||
    p.scores.slice(0,3).join(',')!==e.score||
    p.scores.slice(3).some(v=>v!==''&&v!==null))
   return {status:'BLOCKED_TEST_PREIMAGE_DRIFT_OR_GENUINE_SCORE',productionWrite:false};
 }
 const after=clone(week);
 after.players=[];after.cards[0].players=[];
 if(JSON.stringify(root)!==prior)throw Error('READ_ONLY_ROOT_CHANGED');
 return {status:'SOURCE_QUALIFIED_QUARANTINE_REVIEW_ONLY',expectedRevision:revision,
  oldWeekSha256:sha(week),newWeekSha256:sha(after),sourceArchive:{
    cards:clone(week.cards),players:clone(week.players)},
  proposedWeek:after,modifiedPaths:[
   'glow.weeks.2026-11-03.cards[0].players',
   'glow.weeks.2026-11-03.players'],
  admissionRequired:'same-manifest verified full-root backup, prechange exact revision+hash, admitted CAS, post-readback, owner approval',
  productionWrite:false};
}


// Review-only, source-pinned new tag season boundary. Installed production
// hbnf_current_tag_entries is authoritative (not bagTags.manual, which is
// overwritten by the installed BEFORE UPDATE projection trigger). This plan
// does NOT modify those tables, erase history, or commit a Nov3 tag result.
export const NOV3_TAG_SEED=Object.freeze([
 {player_key:'matt',player_name:'Matt',tag_number:1},
 {player_key:'jason',player_name:'Jason',tag_number:2},
 {player_key:'andrew',player_name:'Andrew',tag_number:3}
]);
export function prepareNov3TagSeasonReset({authorityRevision,currentOwners,roundDate='2026-11-03',alreadyFinalized=false}) {
 if(roundDate!=='2026-11-03'||authorityRevision!==9||
    !Array.isArray(currentOwners)||alreadyFinalized)
   return {status:'BLOCKED_TAG_SEASON_AUTHORITY_OR_FINALIZATION_CHANGED',productionWrite:false};
 const old=new Map(currentOwners.map(p=>[String(p.player_key||''),Number(p.tag_number)]));
 const expected={rusty:1,andrew:2,fox:5,jason:6,quiotee:7,dylan:8,matt:10,karl:15,danny:16};
 if(old.size!==9||Object.entries(expected).some(([n,tag])=>old.get(n)!==tag)||
    new Set([...old.values()]).size!==old.size)
   return {status:'BLOCKED_TAG_SEASON_PREIMAGE_DRIFT',productionWrite:false};
 return {
  status:'EXACT_NEW_SEASON_RESET_READY_FOR_SEPARATE_ADMITTED_TRANSACTION',
  effectiveDate:'2026-11-03',
  expectedAuthorityRevision:9,
  priorOwnersArchive:structuredClone(currentOwners),
  proposedCurrentOwners:NOV3_TAG_SEED.map(p=>({...p})),
  rootBagTagsMetadata:{seasonStartDate:'2026-11-03'},
  legacyRoundsAndFinalizations:'PRESERVE_UNCHANGED',
  futureNewTagOwners:'MANUAL_ENTRIES_ONLY; NO AUTOGENERATED TAGS',
  conditionalWriteSequence:[
   'verify exact original tag table, authority revision, full league_state backup and same-manifest admission',
   'record original nine tag assignments and revision in durable rollback evidence',
   'in one admitted SQL transaction replace ONLY current tag ownership with Matt1 Jason2 Andrew3',
   'bump authoritative tag revision once; set bagTags.seasonStartDate without altering past rounds',
   'read back tag table, authority revision, projected league_state tags; preserve Watch and scores',
   'undo using exact journaled prior table and original revision on failure'
  ],
  productionWrite:false
 };
}

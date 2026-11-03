import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareNov3Reconciliation} from '../scripts/hbnf-parent-release/udisc-nov03-reconciliation.mjs';
const DATE='2026-11-03', EVENT_ID='hb-glow-doubles-tAP8Y5';
const team=(id,one,two,scores)=>({id,name:one+' / '+two,partner1:one,partner2:two,cardId:'C1',scores,removed:false});
const base=()=>({
 updated_at:'2026-11-01T22:33:40.372437+00:00',
 state_json:{
  glow:{activeWeek:DATE,playerAliases:{'Avery Example':'Avery Example','Blair Example':'Blair Example'},
   weeks:{[DATE]:{date:DATE,activeWeek:DATE,scoresLocked:false,
    cards:[{id:'C1',finalized:false,players:[{id:'TEAM1',partner1:'Avery Example',partner2:'Blair Example'}]}],
    players:[team('TEAM1','Avery Example','Blair Example',['3',...Array(17).fill('')])],
    acePots:{main:500,reserve:200},payouts:{total:0},tiebreakerWinner:'',scorecardText:{holePars:{'1':'3','2':'3'}}
   }}
  },
  skins:{round:'protected'},bagTags:{manual:{'Avery Example':5}},
  history:{past:'protected'},financials:{acePotReserve:200}
 }
});
const snapshot=(score='4',eventId=EVENT_ID)=>({
 eventId,weekDate:DATE,observedAtLocal:'2026-11-04T02:00:00Z',
 rows:[{sourceRow:2,sourceTeam:'Avery Example / Blair Example',members:['Avery Example','Blair Example'],
 usernames:['averyexample','blairexample'],memberAlignment:true,
 scores:['3',score,...Array(16).fill('')],holesCompleted:2,holesComplete:false,
 sourceRank:1,sourceRankRaw:'1',relativeScore:-1,strokeTotal:7,holeStrokesTotal:7}]
});
const decisions={'udisc:averyexample':{canonicalName:'Avery Example'},
 'udisc:blairexample':{canonicalName:'Blair Example'}};
test('read-only authentic-shape proposal preserves protected financial and tag state',async()=>{
 const root=base(),before=JSON.stringify(root);
 const result=await prepareNov3Reconciliation({root,revision:root.updated_at,
   snapshot:snapshot(),decisions});
 assert.equal(JSON.stringify(root),before);
 assert.equal(result.productionWrite,false);
 assert.equal(result.status,'READY_FOR_SEPARATE_ADMITTED_CAS_REVIEW');
 assert.deepEqual(result.observedChanges,[{teamId:'TEAM1',hole:2,existing:'',incoming:'4'}]);
});
test('unknown or unreviewed UDisc identity blocks automatic same-week proposal',async()=>{
 const root=base(),before=JSON.stringify(root);
 const result=await prepareNov3Reconciliation({root,revision:root.updated_at,
   snapshot:snapshot(),decisions:{}});
 assert.equal(result.status,'IDENTITY_REVIEW_REQUIRED');
 assert.equal(JSON.stringify(root),before);
 assert.equal(result.identityReview.length,2);
});
test('wrong event, week or active week cannot enter reconciliation',async()=>{
 const root=base();
 await assert.rejects(()=>prepareNov3Reconciliation({root,revision:root.updated_at,
   snapshot:snapshot('4','invented') }),/UDISC_NOV03_EVENT/);
 root.state_json.glow.activeWeek='2026-10-24';
 await assert.rejects(()=>prepareNov3Reconciliation({root,revision:root.updated_at,
   snapshot:snapshot() }),/NOV03_GLOW_WEEK/);
});
test('live production-shaped Nov3 week without redundant date fields is recognized',async()=>{
 const root=base(),week=root.state_json.glow.weeks[DATE],before=JSON.stringify(root);
 delete week.date;delete week.activeWeek;
 const source=JSON.stringify(root);
 const result=await prepareNov3Reconciliation({root,revision:root.updated_at,
  snapshot:{eventId:EVENT_ID,weekDate:DATE,rows:[]}});
 assert.equal(result.status,'EMPTY_OFFICIAL_EXPORT_NO_IMPORT');
 assert.equal(result.productionWrite,false);
 assert.equal(JSON.stringify(root),source);
 assert.notEqual(before,source);
});
test('explicit contradictory week date is rejected rather than silently ignored',async()=>{
 const root=base();root.state_json.glow.weeks[DATE].date='2026-10-24';
 await assert.rejects(()=>prepareNov3Reconciliation({root,revision:root.updated_at,
  snapshot:{eventId:EVENT_ID,weekDate:DATE,rows:[]}}),/NOV03_GLOW_WEEK_AND_ACTIVE_DATE_REQUIRED/);
});
test('finalized or locked HBNF card blocks without changing scores',async()=>{
 const root=base(),before=JSON.stringify(root);
 root.state_json.glow.weeks[DATE].cards[0].finalized=true;
 const result=await prepareNov3Reconciliation({root,revision:root.updated_at,snapshot:snapshot(),decisions});
 assert.equal(result.status,'BLOCKED_LOCKED_WEEK');
 assert.equal(JSON.stringify(root),before.replace('"finalized":false','"finalized":true'));
});
test('repeat snapshot with existing scores must never remove scored hole',async()=>{
 const root=base(),p=root.state_json.glow.weeks[DATE].players[0];
 p.scores[1]='4';
 const before=JSON.stringify(root),result=await prepareNov3Reconciliation({root,revision:root.updated_at,
 snapshot:snapshot(''),decisions});
 assert.equal(result.productionWrite,false);
 assert.equal(JSON.stringify(root),before);
 assert(!result.observedChanges?.some(c=>c.incoming==='' && c.existing));
});
test('same snapshot never touches live database or network',()=>{
 const text=String(prepareNov3Reconciliation);
 assert(!/fetch\(|execute_sql|applyMigration|rpc\(/.test(text));
});

test('total-only source never guesses hole strokes or enters a write proposal',async()=>{
 const root=base();
 const record=snapshot();
 record.rows[0].scores=Array(18).fill('');
 const out=await prepareNov3Reconciliation({root,revision:root.updated_at,snapshot:record,decisions});
 assert.equal(out.status,'NO_HOLE_SCORES_IN_EXPORT');
 assert.equal(out.productionWrite,false);
});
test('source with invalid hole value fails before any HBNF mutation',async()=>{
 const root=base(),before=JSON.stringify(root),record=snapshot();
 record.rows[0].scores[2]=-2;
 await assert.rejects(()=>prepareNov3Reconciliation({root,revision:root.updated_at,snapshot:record,decisions}),/UDISC_VALID_HOLE_STROKES_REQUIRED/);
 assert.equal(JSON.stringify(root),before);
});


import {NOV3_LAYOUT,verifyNov3Layout,classifyNov3TestEntries,prepareNov3TestOnlyQuarantine} from '../scripts/hbnf-parent-release/nov03-event-source.mjs';
test('actual Nov3 PAR59 source fixture is complete without inventing the roster or Round1 attachment',()=>{
 const v=verifyNov3Layout();
 assert.equal(v.par,59);assert.equal(v.summedRoundedFeet,6023);
 assert.equal(v.displayedFeet,6022);assert.equal(v.round1Attached,'UNVERIFIED');
 assert.deepEqual(v.par4,[5,11,15,17,18]);
 assert.deepEqual(NOV3_LAYOUT.truncatedLabels,[8,9]);
 assert.equal(NOV3_LAYOUT.roster,'UNKNOWN_UNTIL_ROUND_BEGINS');
 assert.match(v.unresolvedRuleConflict,/Hole 17/);
});
test('layout altered par or duplicate hole is rejected without network',()=>{
 const source=structuredClone(NOV3_LAYOUT);source.holes[4][4]=3;
 assert.throws(()=>verifyNov3Layout(source),/NOV3_LAYOUT_PAR_LENGTH_INVALID/);
 source.holes[4][4]=4;source.holes[4][0]=1;
 assert.throws(()=>verifyNov3Layout(source),/NOV3_LAYOUT_HOLE_SEQUENCE_INVALID/);
});
test('valid official empty XLSX rows do not become a fabricated scorecard',async()=>{
 const root=base(),before=JSON.stringify(root);
 const r=await prepareNov3Reconciliation({root,revision:root.updated_at,
   snapshot:{eventId:EVENT_ID,weekDate:DATE,rows:[]}});
 assert.equal(r.status,'EMPTY_OFFICIAL_EXPORT_NO_IMPORT');
 assert.equal(r.sourceRowCount,0);assert.equal(r.productionWrite,false);
 assert.equal(JSON.stringify(root),before);
});
function realNov3TestState(){
 const root=base(),week=root.state_json.glow.weeks[DATE];
 const ids=['QI_1793572411877_1','QI_1793572411877_2','QI_1793572411877_3'];
 const names=[['Andrew','Test Player D'],['Test Player B',''],['Test Player C','Test Player A']];
 const scores=[['3','4','4'],['2','4','3'],['2','3','4']];
 week.cards[0].players=ids.map((id,i)=>({id,partner1:names[i][0],partner2:names[i][1]}));
 week.players=ids.map((id,i)=>team(id,names[i][0],names[i][1],
  [...scores[i],...Array(15).fill('')]));
 return root;
}
test('real QI test scores fail closed before any Nov3 UDisc proposal',async()=>{
 const root=realNov3TestState(),before=JSON.stringify(root);
 const r=await prepareNov3Reconciliation({root,revision:root.updated_at,
  snapshot:snapshot(),decisions});
 assert.equal(r.status,'NOV03_QUARANTINE_REQUIRED_BEFORE_REAL_IMPORT');
 assert.equal(r.testEntryIds.length,3);
 assert.equal(r.quarantineStatus,'SOURCE_QUALIFIED_QUARANTINE_REVIEW_ONLY');
 assert.equal(JSON.stringify(root),before);
});
test('exact quarantined-score proposal changes only Nov3 players/card list and preserves archive',()=>{
 const root=realNov3TestState(),before=JSON.stringify(root);
 const plan=prepareNov3TestOnlyQuarantine({root,revision:root.updated_at});
 assert.equal(plan.status,'SOURCE_QUALIFIED_QUARANTINE_REVIEW_ONLY');
 assert.equal(plan.sourceArchive.players.length,3);
 assert.equal(plan.proposedWeek.players.length,0);
 assert.equal(plan.proposedWeek.cards[0].players.length,0);
 assert.deepEqual(plan.proposedWeek.acePots,root.state_json.glow.weeks[DATE].acePots);
 assert.equal(JSON.stringify(root),before);
 assert.equal(classifyNov3TestEntries(root.state_json.glow.weeks[DATE]).contaminated,true);
 root.state_json.glow.weeks[DATE].players[0].scores[3]='4';
 assert.equal(prepareNov3TestOnlyQuarantine({root,revision:root.updated_at}).status,
  'BLOCKED_TEST_PREIMAGE_DRIFT_OR_GENUINE_SCORE');
});
test('one real participant mixed with QI test rows stops surgical cleanup',()=>{
 const root=realNov3TestState(),w=root.state_json.glow.weeks[DATE];
 w.players.push(team('REAL','Chris','Pat',['3',...Array(17).fill('')]));
 assert.equal(prepareNov3TestOnlyQuarantine({root,revision:root.updated_at}).status,
  'BLOCKED_MIXED_OR_SETTLED_WEEK');
});


import {prepareNov3TagSeasonReset,NOV3_TAG_SEED} from '../scripts/hbnf-parent-release/nov03-event-source.mjs';
test('Nov3 season seed is exactly Matt1 Jason2 Andrew3 without old tags',()=>{
 const old={rusty:1,andrew:2,fox:5,jason:6,quiotee:7,dylan:8,matt:10,karl:15,danny:16};
 const currentOwners=Object.entries(old).map(([player_key,tag_number])=>({player_key,player_name:player_key,tag_number}));
 const source=JSON.stringify(currentOwners),result=prepareNov3TagSeasonReset({authorityRevision:9,currentOwners});
 assert.equal(result.status,'EXACT_NEW_SEASON_RESET_READY_FOR_SEPARATE_ADMITTED_TRANSACTION');
 assert.deepEqual(result.proposedCurrentOwners,NOV3_TAG_SEED);
 assert.equal(result.priorOwnersArchive.length,9);
 assert.equal(result.rootBagTagsMetadata.seasonStartDate,'2026-11-03');
 assert.equal(JSON.stringify(currentOwners),source);
 assert.equal(result.productionWrite,false);
});
test('season reset rejects concurrent tag authority changes and preserves manual-add workflow',()=>{
 const entries=[{player_key:'matt',tag_number:10}];
 assert.equal(prepareNov3TagSeasonReset({authorityRevision:10,currentOwners:entries}).status,
 'BLOCKED_TAG_SEASON_AUTHORITY_OR_FINALIZATION_CHANGED');
 assert.equal(prepareNov3TagSeasonReset({authorityRevision:9,currentOwners:entries}).status,
 'BLOCKED_TAG_SEASON_PREIMAGE_DRIFT');
 assert.equal(prepareNov3TagSeasonReset({authorityRevision:9,currentOwners:entries,alreadyFinalized:true}).status,
 'BLOCKED_TAG_SEASON_AUTHORITY_OR_FINALIZATION_CHANGED');
});

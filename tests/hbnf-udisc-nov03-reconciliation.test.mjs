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

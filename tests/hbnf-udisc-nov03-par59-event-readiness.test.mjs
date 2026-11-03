import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseUdiscAoA,publishSnapshot,eventDateFromUdiscFile} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/public/udisc-glow-preview.mjs';
import {buildGlowProposal,renderDestinationProposal,validateIdentityEvidence} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/public/udisc-glow-reconcile.mjs';
import {prepareGlowWeekSync} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/udisc-glow-sync.mjs';
import {parseUdiscWorkbook,exactAliasDecisions} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/udisc-glow-sync-runner.mjs';
import {planSavedGlowOverlay} from '../scripts/hbnf-glow-cart-intent.mjs';
import {chooseLive} from './fixtures/hbnf-cart-control-live-v35.ts';

const layout=JSON.parse(await readFile(new URL('./fixtures/authentic-udisc/2026-11-03-layout-150408.json',import.meta.url),'utf8'));
const eventId='hb-glow-doubles-tAP8Y5',day='2026-11-03';
const pars=layout.layout.holes.map(h=>h.par);
const headers=['division','position','position_raw','name','event_relative_score','event_total_score','usernames',...Array.from({length:18},(_,i)=>'hole_'+(i+1))];
const makeTeam=(names,handles,scores)=>({names,handles,scores});
const a=makeTeam('Ada Alpha & Bea Beta','ada,bea',[3,2]);
const b=makeTeam('Cal Cedar & Dee Delta','cal,dee',[4,3]);
const c=makeTeam('Eve Elm & Finn Ford','eve,finn',[3,3]);
function scoreColumns(scores){
 return Array.from({length:18},(_,i)=>scores[i]??'');
}
function asAoA(teams){
 return [headers,...teams.map(team=>{
  const holes=scoreColumns(team.scores),total=holes.reduce((sum,x)=>sum+(Number(x)||0),0);
  const par=holes.reduce((sum,x,i)=>sum+(x!==''?pars[i]:0),0);
  return ['GEN',holes.every(x=>x!=='')?'1':'DNF','',team.names,total-par,total,team.handles,...holes];
 })];
}
function proposal(teams,at='2026-11-04T02:00:00Z',aliasesOverride){
 const aoa=asAoA(teams);
 const snapshot=parseUdiscAoA(aoa,{eventId,observedAtLocal:at});
 const model=publishSnapshot(null,snapshot).model;
 const names=teams.flatMap(team=>team.names.split(' & '));
 const aliases=aliasesOverride??Object.fromEntries(names.map(name=>[name,name]));
 const evidence=validateIdentityEvidence({aliases,historicalNames:names,tagEvidence:[]});
 const decisions=exactAliasDecisions(model,evidence);
 return buildGlowProposal(model,evidence,decisions,{weekDate:day});
}
function cleanWeek(){
 return {date:day,activeWeek:day,scoresLocked:false,
  cards:[{id:'C1',finalized:false,players:[]}],players:[],
  scorecardText:{
   holePars:Object.fromEntries(layout.layout.holes.map(h=>[String(h.hole),String(h.par)])),
   holeNotes:Object.fromEntries(layout.layout.holes.map(h=>[String(h.hole),h.note]))
  },payouts:{ownerOnly:true},tagAssignments:{'Matt':1,'Jason':2,'Andrew':3},
  history:[{type:'historic_round_preserved'}],aceWinner:'',
  sourceLayoutEvidence:{layoutId:150408,selectedRoundAssociationVerified:false}};
}
function cell(tag){
 return {tag,children:[],className:'',textContent:'',append(node){this.children.push(node);},
  setAttribute(name,value){this[name]=value;},
  insertRow(){const row=cell('tr');this.children.push(row);return row;},
  insertCell(){const td=cell('td');this.children.push(td);return td;},
  createTHead(){const thead=cell('thead');this.children.push(thead);return thead;},
  createTBody(){const tbody=cell('tbody');this.children.push(tbody);return tbody;}};
}

test('authentic owner PAR59 layout is event-scoped and retains all hole geometry, notes and parking conflict',()=>{
 assert.equal(layout.event.eventId,eventId);
 assert.equal(layout.event.eventDate,day);
 assert.equal(layout.layout.id,150408);
 assert.equal(layout.layout.name,'HB Glow Dubs 11.3.26');
 assert.equal(layout.layout.holes.length,18);
 assert.deepEqual(layout.layout.holes.map(h=>h.hole),Array.from({length:18},(_,i)=>i+1));
 assert.equal(pars.reduce((a,b)=>a+b,0),59);
 assert.deepEqual(layout.layout.holes.filter(h=>h.par===4).map(h=>h.hole),[5,11,15,17,18]);
 assert.equal(layout.layout.holes.reduce((n,h)=>n+h.feet,0),6023);
 assert.equal(layout.layout.lengthFeetHeader,6022);
 assert.match(layout.layout.globalRule,/NO INTENTIONAL THROWS OVER PARKING LOT/);
 assert.match(layout.layout.globalRule,/DISQUALIFIED/);
 assert.match(layout.layout.holes[16].note,/double mando/);
 assert.equal(layout.layout.holes[7].basketLabelTruncated,true);
 assert.equal(layout.layout.holes[8].basketLabelTruncated,true);
 assert.equal(layout.event.roundOneSelectedLayoutIdVerified,false);
 assert.equal(layout.emptyExport.scoreRows,0);
 assert.equal(layout.emptyExport.bytes,15783);
 assert.equal(layout.emptyExport.disposition,'EMPTY_NO_IMPORT_NOT_SETUP_FAILURE');
});

test('genuine no-score A1 XLSX and header-only export cannot be coerced into a team or a hole stroke',async()=>{
 for(const rows of [[],[headers]]){
  assert.throws(()=>parseUdiscAoA(rows,{eventId}),/no standings rows/);
 }
 assert.equal(eventDateFromUdiscFile(layout.emptyExport.filename,[]),day);
 assert.equal(eventDateFromUdiscFile('hb-night-flyers-hb-glow-doubles-2026-10-24.xlsx',[]),'2026-10-24');
 const fake=[headers,['GEN','DNF','',a.names,0,0,a.handles,...Array(18).fill('')]];
 const parsed=parseUdiscAoA(fake,{eventId});
 assert.equal(parsed.rows[0].holesCompleted,0);
 assert.equal(parsed.rows[0].scores.every(n=>n===null),true);
});

test('reviewed identity names and genuine layout feed existing Glow scorecard renderer, no network',()=>{
 const model=proposal([a,b]);
 assert.equal(model.issues.unresolvedIdentityCount,0);
 assert.equal(model.issues.duplicateCanonicalTeamRows,0);
 const original=globalThis.document;let mounted;
 globalThis.document={createElement:cell};
 try{renderDestinationProposal({replaceChildren(node){mounted=node;}},model);}
 finally{globalThis.document=original;}
 assert.equal(mounted.role,'region');
 const table=mounted.children[0];
 const tbody=table.children.find(node=>node.tag==='tbody');
 assert.equal(tbody.children.length,2);
 assert.equal(tbody.children[0].children[1].textContent,'Ada Alpha / Bea Beta');
 assert.equal(tbody.children[0].children[2].textContent,'3');
 assert.equal(tbody.children[0].children[3].textContent,'2');
});

test('late-added team at front never collides with preexisting UDisc IDs; reordering preserves earlier scores and ownership',async()=>{
 const first=await prepareGlowWeekSync(cleanWeek(),proposal([a,b]));
 const firstIds=new Map(first.week.players.map(p=>[p.partner1,p.id]));
 assert.equal(first.week.players.length,2);
 const second=await prepareGlowWeekSync(first.week,proposal([c,a,b],'2026-11-04T02:01:00Z'));
 assert.equal(second.week.players.length,3);
 assert.equal(new Set(second.week.players.map(p=>p.id)).size,3);
 assert.equal(second.week.players.find(p=>p.partner1==='Ada Alpha').id,firstIds.get('Ada Alpha'));
 assert.equal(second.week.players.find(p=>p.partner1==='Cal Cedar').id,firstIds.get('Cal Cedar'));
 assert.deepEqual(second.week.payouts,first.week.payouts);
 assert.deepEqual(second.week.tagAssignments,first.week.tagAssignments);
 assert.deepEqual(second.week.history,first.week.history);
 assert.deepEqual(second.week.scorecardText,first.week.scorecardText);
 const again=await prepareGlowWeekSync(second.week,proposal([c,a,b],'2026-11-04T02:02:00Z'));
 assert.equal(again.changed,false);
});

test('scored team partnership changes do not inherit earlier pairing scores without explicit owner review',async()=>{
 const first=await prepareGlowWeekSync(cleanWeek(),proposal([a,b]));
 const revised=[makeTeam('Ada Alpha & Eve Elm','ada,eve',[3,2]),b];
 await assert.rejects(()=>prepareGlowWeekSync(first.week,proposal(revised,'2026-11-04T02:01:00Z')),/partnership|team identity|review/i);
 const noScores=makeTeam(a.names,a.handles,[]);
 const unscored=await prepareGlowWeekSync(cleanWeek(),proposal([noScores,b]));
 const shifted=await prepareGlowWeekSync(unscored.week,proposal([makeTeam('Ada Alpha & Eve Elm','ada,eve',[]),b],'2026-11-04T02:01:00Z'));
 assert.equal(shifted.week.players.find(p=>p.partner1==='Ada Alpha').id,unscored.week.players.find(p=>p.partner1==='Ada Alpha').id);
});

test('incomplete imported holes are additive, manual score corrections persist, duplicate teams and wrong week reject',async()=>{
 const first=await prepareGlowWeekSync(cleanWeek(),proposal([a,b]));
 const partial=[makeTeam(a.names,a.handles,['',2]),b];
 const second=await prepareGlowWeekSync(first.week,proposal(partial,'2026-11-04T02:01:00Z'));
 assert.equal(second.week.players.find(p=>p.partner1==='Ada Alpha').scores[0],'3');
 const manual=structuredClone(second.week);
 manual.players.find(p=>p.partner1==='Ada Alpha').scores[0]='9';
 const third=await prepareGlowWeekSync(manual,proposal([makeTeam(a.names,a.handles,[4,2]),b],'2026-11-04T02:02:00Z'));
 assert.equal(third.week.players.find(p=>p.partner1==='Ada Alpha').scores[0],'9');
 assert.ok(third.week.udiscSync.latest.manualOverrides.length>0);
 await assert.rejects(()=>prepareGlowWeekSync(cleanWeek(),proposal([a,a])),/duplicate|reuses a canonical/);
 const wrong=cleanWeek();wrong.date='2026-10-24';
 await assert.rejects(()=>prepareGlowWeekSync(wrong,proposal([a])),/does not match/);
 const unresolved=proposal([a],undefined,{});
 assert.ok(unresolved.issues.unresolvedIdentityCount>0);
});

test('existing PAR59 source→complete Glow scores→real deployed-v35 selector→canonical Cart candidate; no device writes',async()=>{
 const complete=makeTeam(a.names,a.handles,pars.map((v,i)=>i===16?v+1:v));
 const p=proposal([complete]);
 const merged=await prepareGlowWeekSync(cleanWeek(),p);
 assert.equal(merged.week.players[0].scores.length,18);
 assert.equal(merged.week.players[0].scores.reduce((sum,v)=>sum+Number(v),0),60);
 const original=globalThis.Date,at=Date.parse('2026-11-04T02:00:00Z');
 class FrozenDate extends original{constructor(...args){super(...(args.length?args:[at]));}static now(){return at;}}
 let live;
 try{globalThis.Date=FrozenDate;live=chooseLive({glow:{activeWeek:day,weeks:{[day]:merged.week}}});}
 finally{globalThis.Date=original;}
 assert.equal(live.event,'glow');
 assert.equal(live.label,'GLOW');
 assert.deepEqual(live.entries,['Ada Alpha/Bea Beta +1']);
 const week=structuredClone(merged.week);
 week.udiscSync.status={state:'fresh',lastSuccessAt:'2026-11-04T01:59:30Z'};
 const revision='2026-11-04T02:00:00.123456Z';
 const input={at,binding:{eventDate:day,eventId,persistedActiveWeek:day,
   windowStart:'2026-11-04T01:30:00Z',windowEnd:'2026-11-04T07:30:00Z',
   verifiedLeagueRevision:revision},
  liveStatus:{updated_at:revision,live},week,
  cartContext:{desired:{revision:20,state:{power:'on',overlays:[]}},fence:{active:true,epoch:9,release_id:'test-only-unadmitted-fence'}}};
 const planned=planSavedGlowOverlay(input);
 assert.equal(planned.kind,'canonical_command_candidate');
 assert.equal(planned.payload.data.entries[0],'Ada Alpha/Bea Beta +1');
 assert.equal(planned.providerReceiptRequired,true);
 assert.equal(planned.deviceReadbackRequired,true);
 assert.equal(planned.fieldVisualRequired,true);
 assert.equal(planSavedGlowOverlay({...input,cartContext:{...input.cartContext,fence:null}}).kind,'no_command');
 const wrongEvent=structuredClone(input);wrongEvent.binding.eventId='wrong-event';
 assert.equal(planSavedGlowOverlay(wrongEvent).kind,'no_command');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareGlowWeekSync} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/udisc-glow-sync.mjs';
import {runApprovedGlowSync} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/udisc-glow-auto-sync.review.mjs';

const eventId='hb-glow-doubles-tAP8Y5',day='2026-11-03';
const rev='2026-11-04T01:59:20.123456Z';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const proposal=()=>({
 schema:'hbnf.glow.proposed-week.v1',
 disposition:'PROPOSED_ONLY_NOT_DELIVERED',
 event:{eventId,weekDate:day,observedAtLocal:'2026-11-04T01:59:20Z'},
 destination:{week:{date:day,activeWeek:day,players:[{
  partner1:'A',partner2:'B',scores:['3',...Array(17).fill('')]
 }]}},
 sourceProvenance:{rowEvidence:[{sourceRow:2,sourceTeam:'A/B',sourceRank:1,
  sourceRankRaw:'1',division:'GEN',relativeScore:0,strokeTotal:3,holeStrokesTotal:3}]},
 issues:{unresolvedIdentityCount:0,duplicateCanonicalTeamRows:0}
});
async function fixture() {
 const original={
  date:day,scoresLocked:false,
  scorecardText:{holePars:{'1':'3'},holeNotes:{'1':'Confirmed Nov3 hole note'}},
  cards:[{id:'C1',finalized:false,players:[]}],players:[]
 };
 const prepared=await prepareGlowWeekSync(original,proposal(),{aliases:{}});
 assert.equal(prepared.changed,true);
 const wk=structuredClone(prepared.week);
 wk.udiscSync.status={state:'fresh',lastAttemptAt:'2026-11-04T01:59:20Z',
  lastSuccessAt:'2026-11-04T01:59:20Z',errorCode:null};
 const state={glow:{activeWeek:day,weeks:{[day]:wk},playerAliases:{}}};
 let reads=0,cas=0,failWrites=0;
 const capture=[];
 const src={
  async parseUdiscWorkbook(data){assert.ok(data instanceof ArrayBuffer);return {syntheticExportBody:true};},
  validateIdentityEvidence:()=>({aliases:{}}),
  exactAliasDecisions:()=>({}),
  buildGlowProposal:()=>proposal()
 };
 let drift=false;
 const fetch=async(url)=>{
  const u=String(url);
  if(u.includes('/hbnf_udisc_glow_event_bindings'))return json([{
   event_id:eventId,event_date:day,window_start:'2026-11-04T01:30:00Z',
   window_end:'2026-11-04T07:30:00Z'
  }]);
  if(u.includes('/rest/v1/league_state?')){
   reads++;
   const row=structuredClone(state);
   if(drift&&reads%2===0)row.glow.weeks[day].players[0].scores[0]='8';
   return json([{state_json:row,updated_at:rev}]);
  }
  if(u==='https://udisc.com/events/'+eventId+'/leaderboard/export'){
   const bytes=new Uint8Array(24);bytes[0]=80;bytes[1]=75;
   return new Response(bytes,{status:200,
    headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
  }
  if(u.includes('hbnf_apply_udisc_glow_week')){cas++;throw Error('unchanged source must not write scores');}
  if(u.includes('hbnf_record_udisc_glow_sync_status')){failWrites++;throw Error('unchanged source must not write failure');}
  throw Error('unexpected fetch route');
 };
 return {
  wk,prepared,capture,setDrift:()=>{drift=true;reads=0},
  counters:()=>({reads,cas,failWrites}),
  run:(time,dispatch)=>runApprovedGlowSync({
   UDISC_GLOW_ACCESS_APPROVED:'true',SUPABASE_URL:'https://fixture.supabase.co',
   SUPABASE_SERVICE_ROLE_KEY:'synthetic-server-private-key'
  },{now:()=>new Date(time),fetch,source:src,capture:x=>capture.push(x),onVerifiedSaved:dispatch})
 };
}

test('unchanged authentic-signature-equivalent source rechecks server then retries denied Cart without another scoring write',async()=>{
 const f=await fixture(),observed=[];
 const denied=await f.run('2026-11-04T02:00:00Z',async x=>{
  observed.push(x);return {status:'NOT_ACCEPTED',reason:'glow_native_overlay_release_not_admitted'};
 });
 assert.equal(denied.disposition,'unchanged');
 assert.equal(denied.cartIntent,'NOT_ACCEPTED');
 assert.equal(f.counters().reads,2);
 assert.equal(f.counters().cas,0);
 assert.equal(f.counters().failWrites,0);
 assert.equal(observed.length,1);
 assert.equal(observed[0].signature,f.prepared.signature);
 assert.equal(observed[0].sourceRevision,rev);
 assert.equal(f.capture.find(x=>x.stage==='persisted_readback').casApplied,false);
 const accepted=await f.run('2026-11-04T02:01:00Z',async x=>{
  observed.push(x);return {status:'DUPLICATE',relayStatus:'PENDING_OPAL_PULL'};
 });
 assert.equal(accepted.disposition,'unchanged');
 assert.equal(accepted.cartIntent,'PENDING_OPAL_PULL');
 assert.equal(observed.length,2);
 assert.equal(f.counters().cas,0);
 assert.equal(f.counters().failWrites,0);
 assert.equal(accepted.updatedAt,rev);
});
test('stale saved UDisc lastSuccessAt prevents automatic Cart after ten minutes even with unchanged signature',async()=>{
 const f=await fixture();
 let dispatches=0;
 const result=await f.run('2026-11-04T02:10:00Z',async()=>{
  dispatches++;return {status:'COMMITTED',relayStatus:'PENDING_OPAL_PULL'};
 });
 assert.equal(result.disposition,'unchanged');
 assert.equal(result.cartIntent,'DEFERRED_SOURCE');
 assert.equal(dispatches,0);
 assert.equal(f.counters().cas,0);
});
test('server week edit between first GET and independent recheck blocks Cart without interfering with manual correction',async()=>{
 const f=await fixture();f.setDrift();
 let dispatches=0;
 const result=await f.run('2026-11-04T02:00:00Z',async()=>{
  dispatches++;return {status:'COMMITTED',relayStatus:'PENDING_OPAL_PULL'};
 });
 assert.equal(result.disposition,'source_changed_no_write');
 assert.equal(result.cartIntent,'DEFERRED_SOURCE');
 assert.equal(dispatches,0);
 assert.equal(f.counters().cas,0);
 assert.equal(f.counters().failWrites,0);
});
test('reconnect loop never claims physical delivery or commingles source and Cart outcomes',async()=>{
 const f=await fixture();
 const result=await f.run('2026-11-04T02:00:00Z',async()=>({
  status:'COMMITTED',relayStatus:'PENDING_OPAL_PULL',
  deviceReadback:'NOT_CHECKED',visibleScoreboard:'NOT_CHECKED'
 }));
 assert.equal(result.disposition,'unchanged');
 assert.equal(result.cartIntent,'PENDING_OPAL_PULL');
 assert.equal(f.capture.some(x=>x.stage==='cas_acknowledged'),false);
 assert.equal(f.capture.find(x=>x.stage==='cart_intent')?.relayStatus,'PENDING_OPAL_PULL');
 assert.equal(f.counters().cas,0);
});

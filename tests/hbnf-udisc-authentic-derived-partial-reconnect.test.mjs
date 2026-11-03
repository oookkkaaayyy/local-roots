import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseUdiscAoA,publishSnapshot} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/public/udisc-glow-preview.mjs';
import {buildGlowProposal} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/public/udisc-glow-reconcile.mjs';
import {prepareGlowWeekSync} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/udisc-glow-sync.mjs';
import {runApprovedGlowSync} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/udisc-glow-auto-sync.review.mjs';

const fixture=JSON.parse(await readFile(new URL('./fixtures/authentic-udisc/2026-04-18.json',import.meta.url),'utf8'));
// Historical April workbook rows transformed into a November 3 synthetic event-window fixture.\n// NO claim about November 3 live UDisc teams, tee geometry or pars.\nconst date='2026-11-03',eventId='hb-glow-doubles-tAP8Y5';
function aoa(f){
 return [['division','position','position_raw','name','event_relative_score','event_total_score','usernames',
  ...Array.from({length:18},(_,i)=>'hole_'+(i+1))],...f.rows.map(r=>[
   r.division,r.position,r.position_raw,r.name,r.event_relative_score,r.event_total_score,r.usernames,
   ...Array.from({length:18},(_,i)=>r['hole_'+(i+1)])
 ])];
}
function proposal(rows,stamp){
 const model=publishSnapshot(null,parseUdiscAoA(rows,{eventId,observedAtLocal:stamp})).model;
 return buildGlowProposal(model,{aliases:{},historicalNames:[],tagEvidence:[]},{},{weekDate:date});
}
const base=()=>({
 date,scoresLocked:false,cards:[{id:'C1',finalized:false,players:[]}],players:[],
 // Explicitly synthetic complete-par metadata for this offline-only fixture;
 // not a claim about the authentic historic event's real tee/basket mapping.
 scorecardText:{holePars:Object.fromEntries(Array.from({length:18},(_,i)=>[String(i+1),'3'])),
  holeNotes:{'1':'Owner-defined note retained'}},
 payouts:{first:12,second:6},tagExchangeExceptions:{'MEMBER_1_1':'owner-held'},
 history:[{type:'prior_event'}],customWeekFlag:'retain'
});
test('authentic-derived partial/correction→CAS full readback→reconnect keeps owner score, metadata, history and single source write',async()=>{
 const initialRows=aoa(fixture);
 const initial=proposal(initialRows,'2026-11-04T01:59:00Z');
 const first=await prepareGlowWeekSync(base(),initial,{aliases:{}});
 assert.equal(first.changed,true);
 const week=structuredClone(first.week);
 // Authorized manual edit after the initial authentic-derived import.
 week.players[0].scores[0]='9';
 const correctedRows=initialRows.map(r=>r.slice());
 const head=correctedRows[0],c1=head.indexOf('hole_1'),c2=head.indexOf('hole_2');
 const sourceBefore=Number(correctedRows[1][c1]);
 correctedRows[1][c1]=sourceBefore+1;
 correctedRows[1][head.indexOf('event_total_score')]=Number(correctedRows[1][head.indexOf('event_total_score')])+1;
 correctedRows[1][head.indexOf('event_relative_score')]=Number(correctedRows[1][head.indexOf('event_relative_score')])+1;
 correctedRows[2][c2]=''; // simulated partial input from previously authentic-shaped rows
 const corrected=proposal(correctedRows,'2026-11-04T02:00:00Z');
 const next=await prepareGlowWeekSync(week,corrected,{aliases:{}});
 assert.equal(next.changed,true);
 assert.equal(next.week.players[0].scores[0],'9');
 assert.equal(next.week.players[1].scores[1],week.players[1].scores[1]);
 assert.deepEqual(next.week.scorecardText,week.scorecardText);
 assert.deepEqual(next.week.payouts,week.payouts);
 assert.deepEqual(next.week.tagExchangeExceptions,week.tagExchangeExceptions);
 assert.deepEqual(next.week.history,week.history);
 assert.equal(next.week.customWeekFlag,'retain');
 assert.equal(next.week.udiscSync.history.length,1);
 assert.ok(next.week.udiscSync.latest.manualOverrides.length>=1);

 let root={glow:{activeWeek:date,weeks:{[date]:week},playerAliases:{}},
  skins:{unchanged:true},bagTags:{players:{A:1}}};
 let revision='2026-11-04T01:59:00.123456Z';
 const requests={source:0,reads:0,cas:0,failWrites:0,cart:0};
 const fetch=async(url,options={})=>{
  const u=String(url);
  if(u.includes('/hbnf_udisc_glow_event_bindings'))
   return Response.json([{event_id:eventId,event_date:date,
    window_start:'2026-11-04T01:30:00Z',window_end:'2026-11-04T07:30:00Z'}]);
  if(u.includes('/rest/v1/league_state?')){
   requests.reads++;
   return Response.json([{state_json:structuredClone(root),updated_at:revision}]);
  }
  if(u==='https://udisc.com/events/'+eventId+'/leaderboard/export'){
   requests.source++;const b=new Uint8Array(24);b[0]=80;b[1]=75;
   return new Response(b,{status:200,headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
  }
  if(u.endsWith('/rpc/hbnf_apply_udisc_glow_week')){
   requests.cas++;
   const b=JSON.parse(options.body);
   assert.deepEqual(b.p_expected_week,root.glow.weeks[date]);
   root={...root,glow:{...root.glow,weeks:{...root.glow.weeks,[date]:b.p_replacement_week}}};
   revision='2026-11-04T02:00:00.123457Z';
   assert.deepEqual(root.bagTags,{players:{A:1}});
   return Response.json({applied:true});
  }
  if(u.endsWith('/rpc/hbnf_record_udisc_glow_sync_status')){
   requests.failWrites++;throw Error('not authorized in successful correction');
  }
  throw Error('unrecognized offline route');
 };
 const src={
  parseUdiscWorkbook:async()=>({fixture:'transformed authentic-derived rows, NOT actual partial XLSX bytes'}),
  validateIdentityEvidence:()=>({aliases:{}}),
  exactAliasDecisions:()=>({}),
  buildGlowProposal:()=>corrected
 };
 const offer=async()=>{requests.cart++;return {
   status:requests.cart===1?'COMMITTED':'DUPLICATE',
   relayStatus:'PENDING_OPAL_PULL'
 }};
 const env={UDISC_GLOW_ACCESS_APPROVED:'true',SUPABASE_URL:'https://fixture.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY:'synthetic-key-only'};
 const invoke=time=>runApprovedGlowSync(env,{fetch,source:src,now:()=>new Date(time),
  onVerifiedSaved:offer});
 const saved=await invoke('2026-11-04T02:00:00Z');
 assert.equal(saved.disposition,'updated');
 assert.equal(saved.cartIntent,'PENDING_OPAL_PULL');
 assert.equal(requests.cas,1);
 assert.equal(root.glow.weeks[date].players[0].scores[0],'9');
 assert.equal(root.glow.weeks[date].players[1].scores[1],week.players[1].scores[1]);
 assert.equal(root.glow.weeks[date].udiscSync.status.state,'fresh');
 assert.equal(root.glow.weeks[date].udiscSync.latest.signature,next.signature);
 const replay=await invoke('2026-11-04T02:01:00Z');
 assert.equal(replay.disposition,'unchanged');
 assert.equal(replay.cartIntent,'PENDING_OPAL_PULL');
 assert.equal(requests.cas,1);
 assert.equal(requests.failWrites,0);
 assert.equal(requests.cart,2);
 assert.equal(requests.reads,4); // initial + readback for each run
});

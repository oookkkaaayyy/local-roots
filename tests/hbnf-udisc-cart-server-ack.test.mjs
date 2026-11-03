import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sameLeagueRevision, submitVerifiedGlowCartIntent, runApprovedGlowSync
} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/udisc-glow-auto-sync.review.mjs';
import {runGlowSync} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/index.review.js';

const eventId='hb-glow-doubles-tAP8Y5',weekDate='2026-11-03';
const endpoint='https://fixture.supabase.co/functions/v1/hbnf-cart-control';
const auth={supabaseUrl:'https://fixture.supabase.co',serviceKey:'test-only-server-private-key'};
const sourceRevision='2026-11-04T02:00:00.123456+00:00';
const body={eventId,weekDate,signature:'a'.repeat(64),sourceRevision};
const ack=(revision=sourceRevision)=>new Response(JSON.stringify({
 status:'COMMITTED',desiredRevision:136,sourceRevision:revision,
 scoreFingerprint:'b'.repeat(32),relayStatus:'PENDING_OPAL_PULL',
 deviceReadback:'NOT_CHECKED',visibleScoreboard:'NOT_CHECKED'
}),{status:202,headers:{'Content-Type':'application/json'}});
test('Postgres timestamp and REST timestamp compare at all six fractional digits',()=>{
 assert.equal(sameLeagueRevision('2026-11-04 02:00:00.123456+00',sourceRevision),true);
 assert.equal(sameLeagueRevision('2026-11-04 02:00:00.123455+00',sourceRevision),false);
 assert.equal(sameLeagueRevision('bad',sourceRevision),false);
});
test('one purpose-restricted server request is acknowledged only for matching saved revision and score fingerprint',async()=>{
 const calls=[];
 const result=await submitVerifiedGlowCartIntent(async(url,opts)=>{
   calls.push({url,opts});return ack('2026-11-04 02:00:00.123456+00');
 },auth,body);
 assert.equal(result.status,'COMMITTED');
 assert.equal(result.relayStatus,'PENDING_OPAL_PULL');
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,endpoint);
 assert.equal(calls[0].opts.method,'POST');
 assert.equal(calls[0].opts.redirect,'manual');
 assert.equal(calls[0].opts.headers.apikey,auth.serviceKey);
 assert.equal(calls[0].opts.headers.Authorization,'Bearer '+auth.serviceKey);
 assert.deepEqual(JSON.parse(calls[0].opts.body),{action:'glow_scoreboard_intent',weekDate});
 assert.equal(calls[0].opts.body.includes(auth.serviceKey),false);
});
test('server denial, false acknowledgements, source drift, transport loss and invalid saved proof fail closed',async()=>{
 for(const response of [
  new Response('not deployed',{status:404}),
  new Response('{}',{status:202}),
  ack('2026-11-04T02:00:00.123457Z'),
  new Response(JSON.stringify({status:'COMMITTED',sourceRevision,relayStatus:'PENDING_OPAL_PULL',scoreFingerprint:'INVALID'}),{status:202})
 ]) {
   assert.equal((await submitVerifiedGlowCartIntent(async()=>response,auth,body)).status,'NOT_ACCEPTED');
 }
 assert.equal((await submitVerifiedGlowCartIntent(async()=>{throw Error('timeout');},auth,body)).status,'NOT_ACCEPTED');
 let count=0;
 const invalid={...body,signature:'wrong'};
 assert.equal((await submitVerifiedGlowCartIntent(async()=>{count++;return ack();},auth,invalid)).status,'NOT_ACCEPTED');
 assert.equal(count,0);
});
test('saved scores survive without a second scoring mutation when the Cart backend is not yet deployed',async()=>{
 const requests=[];
 const currentWeek={
  date:weekDate,activeWeek:weekDate,scoresLocked:false,
  scorecardText:{holePars:{'1':'3'},holeNotes:{'1':'hole note'}},
  cards:[{id:'C1',finalized:false,players:[]}],players:[]
 };
 let root={glow:{activeWeek:weekDate,weeks:{[weekDate]:currentWeek},playerAliases:{}}};
 let rev='2026-11-01T22:33:40.372437Z';
 const source={
  parseUdiscWorkbook:async()=>({source:'bounded synthetic workbook response'}),
  validateIdentityEvidence:()=>({aliases:{}}),
  exactAliasDecisions:()=>({}),
  buildGlowProposal:()=>({
   schema:'hbnf.glow.proposed-week.v1',disposition:'PROPOSED_ONLY_NOT_DELIVERED',
   event:{eventId,weekDate,observedAtLocal:'2026-11-04T02:00:00Z'},
   destination:{week:{date:weekDate,activeWeek:weekDate,players:[{
    partner1:'A',partner2:'B',scores:['3',...Array(17).fill('')]
   }]}},
   sourceProvenance:{rowEvidence:[{sourceRow:2,sourceTeam:'A/B',sourceRank:1,sourceRankRaw:'1',
     relativeScore:0,strokeTotal:3,holeStrokesTotal:3}]},
   issues:{unresolvedIdentityCount:0,duplicateCanonicalTeamRows:0}
  })
 };
 const fetch=async(url,opts={})=>{
  const u=String(url);
  requests.push(u);
  if(u.includes('udisc_glow_event_bindings'))return new Response(JSON.stringify([{
   event_id:eventId,event_date:weekDate,window_start:'2026-11-04T01:30:00Z',
   window_end:'2026-11-04T07:30:00Z'}]),{status:200});
  if(u.includes('/rest/v1/league_state?'))return new Response(JSON.stringify([{
   state_json:root,updated_at:rev}]),{status:200});
  if(u==='https://udisc.com/events/'+eventId+'/leaderboard/export'){
   const b=new Uint8Array(24);b[0]=80;b[1]=75;
   return new Response(b,{status:200,headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
  }
  if(u.endsWith('/rpc/hbnf_apply_udisc_glow_week')){
   const payload=JSON.parse(opts.body);
   assert.deepEqual(payload.p_expected_week,currentWeek);
   root={...root,glow:{...root.glow,weeks:{[weekDate]:payload.p_replacement_week}}};
   rev=sourceRevision;
   return new Response(JSON.stringify({applied:true}),{status:200});
  }
  if(u===endpoint)return new Response('not deployed',{status:404});
  throw Error('unexpected route in no-production fixture');
 };
 const outcome=await runApprovedGlowSync({
   UDISC_GLOW_ACCESS_APPROVED:'true',SUPABASE_URL:auth.supabaseUrl,
   SUPABASE_SERVICE_ROLE_KEY:auth.serviceKey
 },{fetch,source,now:()=>new Date('2026-11-04T02:00:00Z'),enableCartBackend:true});
 assert.equal(outcome.disposition,'updated');
 assert.equal(outcome.cartIntent,'NOT_ACCEPTED');
 assert.equal(outcome.updatedAt,sourceRevision);
 assert.ok(root.glow.weeks[weekDate].udiscSync.latest.signature);
 assert.equal(root.glow.weeks[weekDate].players[0].scores[0],'3');
 const iSave=requests.findIndex(x=>x.includes('/rpc/hbnf_apply_udisc_glow_week'));
 const iCart=requests.findIndex(x=>x===endpoint);
 assert.ok(iSave>=0&&iCart>iSave);
 assert.equal(requests.filter(x=>x===endpoint).length,1);
 assert.equal(requests.filter(x=>x.includes('/rpc/hbnf_record_udisc_glow_sync_status')).length,0);
});

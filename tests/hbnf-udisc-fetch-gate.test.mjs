import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {claimUdiscEventFetch,completeUdiscEventFetch,providerRetryAfterAt} from
 '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/udisc-glow-fetch-gate.review.mjs';
import {runApprovedGlowSync} from
 '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/udisc-glow-auto-sync.review.mjs';

const eventId='hb-glow-doubles-af85rU',weekDate='2026-11-10';
const now=new Date('2026-11-11T02:00:00Z');
const windowStart='2026-11-11T01:30:00Z',windowEnd='2026-11-11T07:30:00Z';
const token='123e4567-e89b-42d3-a456-426614174000';
const binding={eventId,weekDate,windowStart,windowEnd};
const config={supabaseUrl:'https://fixture.supabase.co',serviceKey:'fixture-secret'};
const response=(body,status=200,headers={})=>new Response(JSON.stringify(body),{
 status,headers:{'Content-Type':'application/json',...headers}
});

test('next-event Retry-After is bounded to event and never turned into a provider cursor',()=>{
 assert.equal(providerRetryAfterAt('1200',now,windowEnd),'2026-11-11T02:20:00.000Z');
 assert.equal(providerRetryAfterAt('Wed, 11 Nov 2026 03:01:00 GMT',now,windowEnd),
  '2026-11-11T03:01:00.000Z');
 assert.equal(providerRetryAfterAt('86400',now,windowEnd),'2026-11-11T07:31:00.000Z');
 assert.equal(providerRetryAfterAt('invalid',now,windowEnd),null);
 assert.equal(providerRetryAfterAt('-1',now,windowEnd),null);
});

test('a missing claim RPC fails closed before issuing any provider request',async()=>{
 let provider=0;
 const fetch=async url=>{
  const u=String(url);
  if(u.includes('/rest/v1/hbnf_udisc_glow_event_bindings'))
   return response([{event_id:eventId,event_date:weekDate,
    window_start:windowStart,window_end:windowEnd}]);
  if(u.includes('/rest/v1/league_state?'))return response([{
   state_json:{glow:{activeWeek:weekDate,weeks:{
    [weekDate]:{date:weekDate,players:[],cards:[],scoresLocked:false}
   }}},updated_at:'2026-11-11T01:59:00Z'
  }]);
  if(u.includes('/rpc/hbnf_claim_udisc_glow_fetch'))return response({},404);
  if(u.includes('udisc.com'))provider++;
  throw Error('unexpected downstream call');
 };
 await assert.rejects(runApprovedGlowSync({
  UDISC_GLOW_ACCESS_APPROVED:'true',SUPABASE_URL:config.supabaseUrl,
  SUPABASE_SERVICE_ROLE_KEY:config.serviceKey
 },{fetch,now:()=>now}),/HBNF_UDISC_FETCH_GATE_RPC_UNAVAILABLE/);
 assert.equal(provider,0);
});

test('one 503 Retry-After persists the long event hold through independent DB readback',async()=>{
 let providerRequests=0,claimRequests=0,finishRequests=0;
 const week={date:weekDate,players:[],cards:[],scoresLocked:false};
 const gate={event_id:eventId,week_date:weekDate,
  attempt_token:null,next_eligible_at:'2026-11-11T07:31:00Z',last_outcome:null};
 const fetch=async (url,opts={})=>{
  const u=String(url);
  if(u.includes('/rest/v1/hbnf_udisc_glow_event_bindings'))
   return response([{event_id:eventId,event_date:weekDate,
    window_start:windowStart,window_end:windowEnd}]);
  if(u.includes('/rest/v1/league_state?'))return response([{
   state_json:{glow:{activeWeek:weekDate,weeks:{[weekDate]:week}}},
   updated_at:'2026-11-11T01:59:00Z'
  }]);
  if(u.endsWith('/rpc/hbnf_claim_udisc_glow_fetch')){
   claimRequests++;gate.attempt_token=token;
   return response({allowed:true,attemptToken:token,eventId,weekDate,
    failClosedUntil:gate.next_eligible_at});
  }
  if(u.includes('/rest/v1/hbnf_udisc_glow_fetch_gate?'))return response([gate]);
  if(u.includes('/events/'+eventId+'/leaderboard/export')){
   providerRequests++;return new Response('try later',{status:503,
    headers:{'Retry-After':'1200'}});
  }
  if(u.endsWith('/rpc/hbnf_record_udisc_glow_sync_status')){
   const b=JSON.parse(opts.body);
   assert.equal(b.p_error_code,'SOURCE_RATE_LIMITED');
   week.udiscSync={status:{state:'failed',lastAttemptAt:b.p_attempted_at,
    errorCode:'SOURCE_RATE_LIMITED'}};
   return response({recorded:true});
  }
  if(u.endsWith('/rpc/hbnf_finish_udisc_glow_fetch')){
   finishRequests++;
   const b=JSON.parse(opts.body);
   assert.equal(b.p_outcome,'RATE_LIMITED');
   assert.equal(b.p_http_status,503);
   assert.equal(b.p_retry_after_at,'2026-11-11T02:20:00.000Z');
   assert.equal(b.p_attempt_token,token);
   gate.attempt_token=null;gate.last_outcome='RATE_LIMITED';
   gate.next_eligible_at=b.p_retry_after_at;
   return response({recorded:true,eventId,weekDate,outcome:'RATE_LIMITED',
    nextEligibleAt:gate.next_eligible_at});
  }
  throw Error('unexpected request: '+u);
 };
 await assert.rejects(runApprovedGlowSync({
  UDISC_GLOW_ACCESS_APPROVED:'true',SUPABASE_URL:config.supabaseUrl,
  SUPABASE_SERVICE_ROLE_KEY:config.serviceKey
 },{fetch,now:()=>now}),/UDisc source deferred/);
 assert.equal(providerRequests,1);
 assert.equal(claimRequests,1);
 assert.equal(finishRequests,1);
 assert.equal(gate.attempt_token,null);
 assert.equal(gate.next_eligible_at,'2026-11-11T02:20:00.000Z');
});

test('gate SQL is service-role-only, fail-closed at claim, and corrects installed error code',async()=>{
 const sql=await readFile(new URL('../scripts/hbnf-parent-release/sql/udisc-event-fetch-gate.review.sql',import.meta.url),'utf8');
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/GRANT SELECT, INSERT, UPDATE ON TABLE public\.hbnf_udisc_glow_fetch_gate TO service_role/);
 assert.match(sql,/v_window_end\+interval '1 minute'/);
 assert.match(sql,/ON CONFLICT \(event_id\) DO UPDATE/);
 assert.match(sql,/attempt_token=p_attempt_token/);
 assert.match(sql,/SOURCE_RATE_LIMITED/);
 assert.match(sql,/636ea2b92a9b1e6339a91e5e2eb9cec6/);
});

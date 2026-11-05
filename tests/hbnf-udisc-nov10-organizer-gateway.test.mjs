import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/index.js';
import {handleOrganizerImportRequest} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/udisc-glow-organizer-http.review.mjs';

// November 10 identity and event window originate from actual read-only Supabase
// readback + UDisc public event page. These are not fake participants or scores.
const eventId='hb-glow-doubles-af85rU',weekDate='2026-11-10';
const binding={event_id:eventId,event_date:weekDate,
  window_start:'2026-11-11T01:30:00+00:00',window_end:'2026-11-11T07:30:00+00:00'};
const url='https://hbnf.example/internal/udisc-glow-organizer-import';
const token='TEST_ONLY_NON_PRODUCTION_SCORING_OPERATOR_SECRET_0123456789abcdef';
const baseEnv={HBNF_UDISC_OPERATOR_IMPORT_ENABLED:'true',HBNF_UDISC_ORGANIZER_IMPORT_TOKEN:token,
  SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'TEST_ONLY_NON_PRODUCTION_PROVIDER_SERVICE_ROLE_SECRET',
  ASSETS:{fetch:()=>{throw Error('Asset fallback should not handle private import');}}};
const snapshot={state_json:{glow:{activeWeek:'2026-11-03',weeks:{'2026-11-03':{date:'2026-11-03',players:[]}}},
  skins:{original:'untouched'},bagTags:{protected:'untouched'}},updated_at:'2026-11-05T01:43:35.537984+00:00'};
const secretHeaders={Authorization:`Bearer ${token}`};
function provider(){
  const requests=[];
  const fetchImpl=async(u,options={})=>{
    requests.push({url:String(u),method:options.method||'GET'});
    if(String(u).includes('/hbnf_udisc_glow_event_bindings?')){
      assert.match(String(u),/event_id=eq\.hb-glow-doubles-af85rU/);
      assert.match(String(u),/event_date=eq\.2026-11-10/);
      return new Response(JSON.stringify([binding]),{status:200});
    }
    if(String(u).includes('/league_state?id=eq.1'))return new Response(JSON.stringify([snapshot]),{status:200});
    throw Error('Unexpected provider write or query in no-score preflight');
  };
  return {requests,fetchImpl};
}
test('actual shipping entrypoint hides disabled import route without asset fallback',async()=>{
  const res=await worker.fetch(new Request(url,{method:'POST'}),{
    ...baseEnv,HBNF_UDISC_OPERATOR_IMPORT_ENABLED:'false'});
  assert.equal(res.status,404);
  assert.match(await res.text(),/Not found/);
});
test('missing organizer authentication fails before reading any source, even with event ID',async()=>{
  const upstream=provider();
  const res=await handleOrganizerImportRequest(new Request(url+'?eventId='+eventId+'&weekDate='+weekDate),baseEnv,upstream);
  assert.equal(res.status,403);assert.equal(upstream.requests.length,0);
});
test('authenticated readiness uses exact persisted Nov10 binding but refuses to infer week, pars, teams or scores',async()=>{
  const upstream=provider();
  const request=new Request(url+'?eventId='+eventId+'&weekDate='+weekDate,{headers:secretHeaders});
  const res=await handleOrganizerImportRequest(request,baseEnv,upstream);
  assert.equal(res.status,200);
  const data=await res.json();
  assert.equal(data.disposition,'READINESS_READ_ONLY');
  assert.equal(data.eventId,eventId);assert.equal(data.weekDate,weekDate);
  assert.equal(data.activeWeek,'2026-11-03');
  assert.equal(data.weekInitialized,false);assert.equal(data.parCount,0);
  assert.equal(data.teamCount,0);assert.equal(data.uploaderEligible,false);
  assert.equal(data.sourceFreshness,'NOT_ASSERTED');
  assert.equal(data.cartIntent,'NOT_REQUESTED');
  assert.deepEqual(upstream.requests.map(x=>x.method),['GET','GET']);
});
test('authenticated upload cannot score uninitialized Nov10; no parser, RPC or Cart writes',async()=>{
  // Bytes are deliberately NOT a UDisc XLSX; pre-event gate must stop before parse.
  const body=new FormData();
  const bytes=new Uint8Array(24);bytes[0]=80;bytes[1]=75;
  body.append('xlsx',new File([bytes],'unscored-placeholder.xlsx',{
    type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  body.append('eventId',eventId);body.append('weekDate',weekDate);
  body.append('officialExportConfirmed','yes');
  const upstream=provider();
  const res=await handleOrganizerImportRequest(new Request(url,{
    method:'POST',headers:secretHeaders,body}),baseEnv,upstream);
  assert.equal(res.status,409);
  const data=await res.json();
  assert.equal(data.disposition,'ACTIVE_GLOW_WEEK_MISMATCH');
  assert.equal(data.wrote,false);assert.equal(data.cartIntent,'NOT_REQUESTED');
  assert.deepEqual(upstream.requests.map(x=>x.method),['GET','GET']);
});
test('enabled shipping fetch delegates to protected GET handler; no second route/writer',async()=>{
  const upstream=provider();
  const previous=globalThis.fetch;
  try{
    globalThis.fetch=upstream.fetchImpl;
    const res=await worker.fetch(new Request(url+'?eventId='+eventId+'&weekDate='+weekDate,{headers:secretHeaders}),baseEnv);
    assert.equal(res.status,200);
    assert.equal((await res.json()).uploaderEligible,false);
    assert.deepEqual(upstream.requests.map(x=>x.method),['GET','GET']);
  }finally{globalThis.fetch=previous;}
});
test('event selection cannot substitute a different organizer event or date',async()=>{
  const upstream=provider();
  const req=new Request(url+'?eventId=hb-glow-doubles-not-verified&weekDate='+weekDate,
    {headers:secretHeaders});
  const res=await handleOrganizerImportRequest(req,baseEnv,upstream);
  assert.equal(res.status,400);
  assert.equal(upstream.requests.length,0);
});
test('a malformed or cross-date provider window cannot mark an event ready',async()=>{
  let calls=0;
  const fetchImpl=async()=>{calls++;return new Response(JSON.stringify([{
    ...binding,window_end:'2026-11-12T07:30:00+00:00'
  }]),{status:200});};
  const req=new Request(url+'?eventId='+eventId+'&weekDate='+weekDate,{headers:secretHeaders});
  const res=await handleOrganizerImportRequest(req,baseEnv,{fetchImpl});
  assert.equal(res.status,409);
  assert.equal((await res.json()).disposition,'BINDING_OR_SOURCE_NOT_READY');
  assert.equal(calls,1);
});

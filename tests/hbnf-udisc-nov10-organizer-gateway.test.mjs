import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import worker from '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/index.js';
import {handleOrganizerImportRequest} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/udisc-glow-organizer-http.review.mjs';
import {importOrganizerGlowXlsx} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/udisc-glow-organizer-import.review.mjs';
import {NOV10_MAIN_LAYOUT} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/udisc-nov10-main-layout.review.mjs';

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
function provider(state=snapshot){
  const requests=[];
  const fetchImpl=async(u,options={})=>{
    requests.push({url:String(u),method:options.method||'GET'});
    if(String(u).includes('/hbnf_udisc_glow_event_bindings?')){
      assert.match(String(u),/event_id=eq\.hb-glow-doubles-af85rU/);
      assert.match(String(u),/event_date=eq\.2026-11-10/);
      return new Response(JSON.stringify([binding]),{status:200});
    }
    if(String(u).includes('/league_state?id=eq.1'))return new Response(JSON.stringify([state]),{status:200});
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
test('verified Main layout is backend-ready before any participant roster exists',async()=>{
  const week={date:weekDate,eventId,eventWindow:{start:NOV10_MAIN_LAYOUT.windowStart,end:NOV10_MAIN_LAYOUT.windowEnd},
    parLayout:{layoutId:NOV10_MAIN_LAYOUT.layoutId,layoutName:NOV10_MAIN_LAYOUT.layoutName,
      courseId:NOV10_MAIN_LAYOUT.courseId,evidenceSha256:NOV10_MAIN_LAYOUT.evidenceSha256,
      layoutSha256:NOV10_MAIN_LAYOUT.layoutSha256},
    scorecardText:{holePars:Object.fromEntries(NOV10_MAIN_LAYOUT.holes.map(h=>[String(h.number),String(h.par)]))},
    players:[],cards:[],scoresLocked:false};
  const state={state_json:{glow:{activeWeek:weekDate,weeks:{[weekDate]:week}},skins:{original:'untouched'},bagTags:{protected:'untouched'}},
    updated_at:'2026-11-06T18:00:00.000Z'};
  const upstream=provider(state);
  const res=await handleOrganizerImportRequest(new Request(url+'?eventId='+eventId+'&weekDate='+weekDate,{headers:secretHeaders}),baseEnv,upstream);
  const data=await res.json();
  assert.equal(res.status,200);assert.equal(data.layoutQualified,true);
  assert.equal(data.parCount,18);assert.equal(data.teamCount,0);assert.equal(data.uploaderEligible,true);
  assert.equal(data.sourceFreshness,'NOT_ASSERTED');assert.equal(data.cartIntent,'NOT_REQUESTED');
  assert.deepEqual(upstream.requests.map(x=>x.method),['GET','GET']);
});
test('pars alone cannot authorize Nov10 XLSX when layout witness identity is wrong',async()=>{
  const week={date:weekDate,eventId,eventWindow:{start:NOV10_MAIN_LAYOUT.windowStart,end:NOV10_MAIN_LAYOUT.windowEnd},
    parLayout:{layoutId:14840,layoutName:'Main',courseId:'A9Fe',evidenceSha256:'f'.repeat(64),layoutSha256:'8'.repeat(64)},
    scorecardText:{holePars:Object.fromEntries(NOV10_MAIN_LAYOUT.holes.map(h=>[String(h.number),String(h.par)]))},
    players:[],cards:[],scoresLocked:false};
  const state={state_json:{glow:{activeWeek:weekDate,weeks:{[weekDate]:week}}},updated_at:'2026-11-06T18:00:00.000Z'};
  const upstream=provider(state);
  const res=await handleOrganizerImportRequest(new Request(url+'?eventId='+eventId+'&weekDate='+weekDate,{headers:secretHeaders}),baseEnv,upstream);
  const data=await res.json();
  assert.equal(data.layoutQualified,false);assert.equal(data.uploaderEligible,false);
  assert.ok(data.operatorActions.includes('INITIALIZE_NOV10_WITH_AUTHORIZED_MAIN_LAYOUT_WITNESS'));
});
test('fresh export attestation outside the bound event window is rejected before state, CAS, or Cart access',async()=>{
  const bytes=Uint8Array.from([0x50,0x4b,...Array(22).fill(0)]);
  let stateReads=0,writes=0,cartCalls=0;
  const result=await importOrganizerGlowXlsx({upload:{eventId,weekDate,xlsx:bytes,
    sha256:createHash('sha256').update(bytes).digest('hex'),freshSnapshotConfirmed:true},adapters:{
    authorize:async()=>true,readBinding:async()=>[binding],receiptTime:()=> '2026-11-11T07:31:00.000Z',
    readState:async()=>{stateReads++;throw Error('must not read state');},
    applyWeek:async()=>{writes++;return {applied:true};},
    onVerifiedSaved:async()=>{cartCalls++;return {status:'COMMITTED',relayStatus:'PENDING_OPAL_PULL'};}
  }});
  assert.equal(result.disposition,'FRESH_EXPORT_OUTSIDE_BOUND_EVENT_WINDOW');
  assert.equal(stateReads,0);assert.equal(writes,0);assert.equal(cartCalls,0);
});
test('fresh export for a different event cannot reach state, CAS, or Cart',async()=>{
  const bytes=Uint8Array.from([0x50,0x4b,...Array(22).fill(0)]);
  let stateReads=0,writes=0,cartCalls=0;
  const result=await importOrganizerGlowXlsx({upload:{eventId:'hb-glow-doubles-XxY123',weekDate,
    xlsx:bytes,sha256:createHash('sha256').update(bytes).digest('hex'),freshSnapshotConfirmed:true},adapters:{
    authorize:async()=>true,readBinding:async()=>[binding],receiptTime:()=> '2026-11-11T03:30:00.000Z',
    readState:async()=>{stateReads++;throw Error('must not read state');},
    applyWeek:async()=>{writes++;return {applied:true};},
    onVerifiedSaved:async()=>{cartCalls++;return {status:'COMMITTED',relayStatus:'PENDING_OPAL_PULL'};}
  }});
  assert.equal(result.disposition,'BINDING_IDENTITY_MISMATCH');
  assert.equal(stateReads,0);assert.equal(writes,0);assert.equal(cartCalls,0);
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
  assert.deepEqual(data.operatorActions,['INITIALIZE_EVENT_WEEK_THROUGH_EXISTING_SCORING_ADMIN']);
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

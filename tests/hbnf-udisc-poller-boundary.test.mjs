import test from 'node:test';
import assert from 'node:assert/strict';
import {runApprovedGlowSync} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/udisc-glow-auto-sync.review.mjs';
import {runApprovedGlowSync as runPreservedGlowSync} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/udisc-glow-auto-sync.mjs';
import workerEntry from '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/index.review.js';

const date='2026-11-03';
const eventId='hb-glow-doubles-tAP8Y5';
const now='2026-11-04T02:00:00.000Z';
const xlsxType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const rev0='2026-11-01T22:33:40.372437Z';
const rev1='2026-11-04T02:00:00.123456Z';
const JSONResponse=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json'}});
function fixture(mode='success'){
 const capture=[],calls=[];
 const week={date,activeWeek:date,scoresLocked:false,cards:[{id:'C1',finalized:false,players:[]}],players:[]};
 if(mode==='repeated_failure')week.udiscSync={status:{state:'failed',errorCode:'SOURCE_UNAVAILABLE',lastAttemptAt:'2026-11-04T01:59:00Z'}};
 let row={state_json:{glow:{activeWeek:date,weeks:{[date]:week},playerAliases:{}}},updated_at:rev0};
 let casCount=0,statusCount=0,sourceCount=0,rootReads=0;
 const source={
  async parseUdiscWorkbook(bytes){assert.ok(bytes instanceof ArrayBuffer);return {source:'synthetic parser boundary only'};},
  validateIdentityEvidence(){return {aliases:{}};},
  exactAliasDecisions(){return {};},
  buildGlowProposal(){
   return {
    schema:'hbnf.glow.proposed-week.v1',
    disposition:'PROPOSED_ONLY_NOT_DELIVERED',
    event:{eventId,weekDate:date,observedAtLocal:now},
    destination:{week:{date,activeWeek:date,players:[{partner1:'A',partner2:'B',scores:['3',...Array(17).fill('')]}]}},
    sourceProvenance:{rowEvidence:[{sourceRow:2,sourceTeam:'A/B',sourceRank:1,sourceRankRaw:'1',division:'MPO',relativeScore:0,strokeTotal:3,holeStrokesTotal:3}]},
    issues:{unresolvedIdentityCount:0,duplicateCanonicalTeamRows:0}
   };
  }
 };
 const fetch=async(url,options={})=>{
  const u=String(url);
  if(u.includes('/hbnf_udisc_glow_event_bindings')){
    calls.push('binding');
    return JSONResponse([{event_id:eventId,event_date:date,window_start:'2026-11-04T01:30:00Z',window_end:'2026-11-04T07:30:00Z'}]);
  }
  if(u.includes('/rest/v1/league_state?')){
    calls.push('state');
    rootReads++;
    return JSONResponse([{state_json:row.state_json,updated_at:row.updated_at}]);
  }
  if(u===`https://udisc.com/events/${eventId}/leaderboard/export`){
    calls.push('source');sourceCount++;
    if(mode==='source_503'||mode==='repeated_failure')return new Response('SOURCE_UNAVAILABLE',{status:503,headers:{'Content-Type':'text/plain'}});
    const bytes=new Uint8Array(30);bytes[0]=80;bytes[1]=75;
    return new Response(bytes,{headers:{'Content-Type':xlsxType}});
  }
  if(u.endsWith('/rpc/hbnf_apply_udisc_glow_week')){
    calls.push('cas');casCount++;
    const b=JSON.parse(options.body);
    assert.equal(b.p_week_date,date);
    assert.deepEqual(b.p_expected_week,week);
    if(mode==='cas_conflict')return JSONResponse({applied:false,reason:'concurrent_change'});
    if(mode==='cas_network')throw Error('connection failed after CAS may have committed');
    row=structuredClone(row);
    row.state_json.glow.weeks[date]=b.p_replacement_week;
    row.updated_at=rev1;
    if(mode==='readback_modified')row.state_json.glow.weeks[date].players[0].scores[0]='8';
    return JSONResponse({applied:true});
  }
  if(u.endsWith('/rpc/hbnf_record_udisc_glow_sync_status')){
    calls.push('status');statusCount++;
    const b=JSON.parse(options.body);
    row=structuredClone(row);
    row.updated_at=rev1;
    row.state_json.glow.weeks[date].udiscSync={
      ...(row.state_json.glow.weeks[date].udiscSync||{}),
      status:{state:'failed',errorCode:b.p_error_code,lastAttemptAt:b.p_attempted_at}
    };
    return JSONResponse({recorded:true});
  }
  throw Error(`Unexpected fetch ${u}`);
 };
 return {
  capture,calls,source,fetch,
  counters:()=>({casCount,statusCount,sourceCount,rootReads}),
  run:(time=now)=>runApprovedGlowSync({
   UDISC_GLOW_ACCESS_APPROVED:'true',
   SUPABASE_URL:'https://fixture.supabase.co',
   SUPABASE_SERVICE_ROLE_KEY:'fixture-secret-do-not-log',
  },{now:()=>new Date(time),fetch,source,capture:entry=>capture.push(entry)})
 };
}

test('pre-event cron consults only DB bindings and does not reach source, CAS, or league state',async()=>{
 const f=fixture();
 // The test supplies an active binding, but the source selector must still
 // reject a timestamp strictly before its date window.
 const result=await f.run('2026-11-04T01:29:00Z');
 assert.equal(result.disposition,'outside_event_window');
 assert.deepEqual(f.calls,['binding']);
 assert.equal(f.capture[0].stage,'event_window');
 assert.equal(f.capture[0].eligible,false);
});
test('source unavailable is not parser or score-save success; captures HTTP 503 and only failure status',async()=>{
 const f=fixture('source_503');
 await assert.rejects(()=>f.run(),/UDisc score export unavailable/);
 assert.deepEqual(f.calls,['binding','state','source','status','state']);
 assert.equal(f.counters().casCount,0);
 assert.deepEqual(f.capture.filter(x=>x.stage==='source_http').map(x=>x.status),[503]);
 assert.equal(f.capture.some(x=>x.stage==='parser_succeeded'),false);
 assert.equal(f.capture.some(x=>x.stage==='persisted_readback'),false);
 assert.equal(f.capture.at(-1).failedStatusMutation,'recorded');
});
test('repeat unavailable XLSX response does not churn scoring root with identical failure status',async()=>{
 const f=fixture('repeated_failure');
 await assert.rejects(()=>f.run(),/UDisc score export unavailable/);
 assert.deepEqual(f.calls,['binding','state','source']);
 assert.equal(f.counters().statusCount,0);
 assert.equal(f.capture.at(-1).failedStatusMutation,'deduped');
});
test('CAS conflict does not cause follow-on status write against a concurrent legitimate score change',async()=>{
 const f=fixture('cas_conflict');
 await assert.rejects(()=>f.run(),/Glow score save conflicted/);
 assert.equal(f.counters().casCount,1);
 assert.equal(f.counters().statusCount,0);
 assert.deepEqual(f.calls,['binding','state','source','cas']);
 assert.equal(f.capture.some(x=>x.stage==='parser_succeeded'),true);
 assert.equal(f.capture.some(x=>x.stage==='persisted_readback'),false);
 assert.equal(f.capture.at(-1).failedStatusMutation,'skipped_after_cas_attempt');
});
test('ambiguous network failure after CAS request never writes failure status over possible committed score',async()=>{
 const f=fixture('cas_network');
 await assert.rejects(()=>f.run(),/connection failed/);
 assert.equal(f.counters().casCount,1);
 assert.equal(f.counters().statusCount,0);
});
test('CAS HTTP acknowledgement and matching signature are insufficient if independent GET shows changed scores',async()=>{
 const f=fixture('readback_modified');
 await assert.rejects(()=>f.run(),/could not be independently verified/);
 assert.equal(f.counters().casCount,1);
 assert.equal(f.counters().statusCount,0);
 assert.equal(f.capture.some(x=>x.stage==='cas_acknowledged'),true);
 assert.equal(f.capture.some(x=>x.stage==='persisted_readback'),false);
});
test('source HTTP→parser→guarded CAS→independent exact saved-week readback are separate successful boundaries',async()=>{
 const f=fixture();
 const result=await f.run();
 assert.equal(result.disposition,'updated');
 assert.equal(result.updatedAt,rev1);
 assert.equal(f.counters().casCount,1);
 assert.equal(f.counters().statusCount,0);
 assert.equal(f.counters().rootReads,2);
 assert.deepEqual(
  f.capture.map(x=>x.stage),
  ['event_window','source_http','source_xlsx_received','parser_succeeded','cas_requested','cas_acknowledged','persisted_readback']
 );
 assert.equal(f.capture.at(-1).verified,true);
 assert.equal(f.capture.at(-1).revision,rev1);
 assert.ok(!JSON.stringify(f.capture).includes('fixture-secret'));
});
test('observer throwing does not interrupt score import or compromise CAS/readback',async()=>{
 const f=fixture();
 const result=await runApprovedGlowSync({
  UDISC_GLOW_ACCESS_APPROVED:'true',
  SUPABASE_URL:'https://fixture.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY:'fixture-secret-do-not-log',
 },{now:()=>new Date('2026-11-04T01:00:00Z'),fetch:async()=>JSONResponse([]),capture:()=>{throw Error('observer unavailable')}});
 assert.equal(result.disposition,'outside_event_window');
});

test('review scheduled handler emits one sanitized in-window stage record, no unbounded or secret logs',async()=>{
 const f=fixture('source_503');
 const originalFetch=globalThis.fetch,originalDate=globalThis.Date;
 const originalInfo=console.info,originalError=console.error;
 const written=[],errors=[];
 const fixed=Date.parse(now);
 class FixedDate extends originalDate {
   constructor(...args){super(...(args.length?args:[fixed]));}
   static now(){return fixed;}
 }
 let promise;
 try {
   globalThis.Date=FixedDate;
   globalThis.fetch=f.fetch;
   console.info=(...args)=>written.push(args);
   console.error=(...args)=>errors.push(args);
   await workerEntry.scheduled(null,{
     UDISC_GLOW_ACCESS_APPROVED:'true',
     SUPABASE_URL:'https://fixture.supabase.co',
     SUPABASE_SERVICE_ROLE_KEY:'fixture-secret-do-not-log',
   },{waitUntil:p=>{promise=p}});
   assert.ok(promise);
   await promise;
 } finally {
   globalThis.fetch=originalFetch;
   globalThis.Date=originalDate;
   console.info=originalInfo;
   console.error=originalError;
 }
 assert.equal(written.length,1);
 assert.equal(written[0][0],'HBNF_UDISC_GLOW_BOUNDARY_V1');
 const detail=JSON.parse(written[0][1]);
 assert.equal(detail.schema,'hbnf.udisc.glow.boundary.capture.v1');
 assert.equal(detail.result,'error');
 assert.equal(detail.code,'SOURCE_UNAVAILABLE');
 assert.equal(detail.stages.find(x=>x.stage==='source_http')?.status,503);
 assert.equal(detail.stages.some(x=>x.stage==='parser_succeeded'),false);
 assert.equal(f.counters().casCount,0);
 assert.ok(!JSON.stringify(written).includes('fixture-secret'));
 assert.ok(!JSON.stringify(written).includes('scores'));
});
test('review scheduled handler logs nothing before bound event window',async()=>{
 const f=fixture();
 const originalFetch=globalThis.fetch,originalDate=globalThis.Date;
 const originalInfo=console.info,originalError=console.error;
 const written=[],errors=[];
 const fixed=Date.parse('2026-11-04T01:29:00Z');
 class FixedDate extends originalDate {
   constructor(...args){super(...(args.length?args:[fixed]));}
   static now(){return fixed;}
 }
 let promise;
 try{
   globalThis.Date=FixedDate;globalThis.fetch=f.fetch;
   console.info=(...args)=>written.push(args);
   console.error=(...args)=>errors.push(args);
   await workerEntry.scheduled(null,{
    UDISC_GLOW_ACCESS_APPROVED:'true',
    SUPABASE_URL:'https://fixture.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY:'fixture-secret-do-not-log',
   },{waitUntil:p=>{promise=p}});
   await promise;
 }finally{
   globalThis.Date=originalDate;globalThis.fetch=originalFetch;
   console.info=originalInfo;console.error=originalError;
 }
 assert.deepEqual(f.calls,['binding']);
 assert.equal(written.length,0);
 assert.equal(errors.length,0);
});

function originalRun(f){
 return runPreservedGlowSync({
  UDISC_GLOW_ACCESS_APPROVED:'true',
  SUPABASE_URL:'https://fixture.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY:'fixture-secret-do-not-log',
 },{now:()=>new Date(now),fetch:f.fetch,source:f.source});
}
test('RED/GREEN: unchanged preserved source wrongly reports saved after a same-signature intervening score edit',async()=>{
 const pre=fixture('readback_modified');
 const oldResult=await originalRun(pre);
 assert.equal(oldResult.disposition,'updated'); // Demonstrated unsafe original behavior.
 assert.equal(pre.counters().casCount,1);
 const fixed=fixture('readback_modified');
 await assert.rejects(()=>fixed.run(),/independently verified/);
 assert.equal(fixed.counters().statusCount,0);
});
test('RED/GREEN: original CAS-conflict handler causes a second scoring-root status write',async()=>{
 const pre=fixture('cas_conflict');
 await assert.rejects(()=>originalRun(pre),/Glow score save conflicted/);
 assert.equal(pre.counters().statusCount,1); // Source-level reproducible extra write.
 const fixed=fixture('cas_conflict');
 await assert.rejects(()=>fixed.run(),/Glow score save conflicted/);
 assert.equal(fixed.counters().statusCount,0);
});
test('RED/GREEN: original repeatedly rewrites identical transient failure while review candidate deduplicates',async()=>{
 const pre=fixture('repeated_failure');
 await assert.rejects(()=>originalRun(pre),/UDisc score export unavailable/);
 assert.equal(pre.counters().statusCount,1);
 const fixed=fixture('repeated_failure');
 await assert.rejects(()=>fixed.run(),/UDisc score export unavailable/);
 assert.equal(fixed.counters().statusCount,0);
});

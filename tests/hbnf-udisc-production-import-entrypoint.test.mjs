import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const snap=resolve('source-snapshots/hbnf-worker-d1a5f936-20261024');
const eventId='hb-glow-doubles-tAP8Y5', day='2026-11-03';
const revision='2026-11-04T02:00:00.123456Z';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const source={
 parseUdiscWorkbook:async()=>({fixtureOnly:true}),
 validateIdentityEvidence:()=>({aliases:{}}),
 exactAliasDecisions:()=>({}),
 buildGlowProposal:()=>({
  schema:'hbnf.glow.proposed-week.v1',disposition:'PROPOSED_ONLY_NOT_DELIVERED',
  event:{eventId,weekDate:day,observedAtLocal:'2026-11-04T02:00:00Z'},
  destination:{week:{date:day,activeWeek:day,players:[{partner1:'A',partner2:'B',scores:['3',...Array(17).fill('')]}]}},
  sourceProvenance:{rowEvidence:[{sourceRow:2,sourceTeam:'A/B',sourceRank:1,sourceRankRaw:'1',division:'GEN',relativeScore:0,strokeTotal:3,holeStrokesTotal:3,holeScores:[3,...Array(17).fill(null)]}]},
  issues:{unresolvedIdentityCount:0,duplicateCanonicalTeamRows:0}
 })
};
function mock(cartStatus){
 let week={date:day,scoresLocked:false,cards:[{id:'C1',finalized:false,players:[]}],players:[],
  scorecardText:{holePars:{'1':'3'},holeNotes:{'1':'owner note'}},
  payouts:{first:12},history:[{type:'preserved'}]};
 let revisionNow='2026-11-01T22:33:40.372437Z';
 let cas=0,cart=0,reads=0;
 const fetch=async(url,options={})=>{
  const u=String(url);
  if(u.includes('hbnf_udisc_glow_event_bindings'))return json([{
   event_id:eventId,event_date:day,window_start:'2026-11-04T01:30:00Z',window_end:'2026-11-04T07:30:00Z'
  }]);
  if(u.includes('/rest/v1/league_state?')){
   reads++;
   return json([{state_json:{glow:{activeWeek:day,weeks:{[day]:structuredClone(week)},playerAliases:{}}},updated_at:revisionNow}]);
  }
  if(u.includes('/leaderboard/export')){
   const buffer=new Uint8Array(24);buffer[0]=80;buffer[1]=75;
   return new Response(buffer,{status:200,headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
  }
  if(u.includes('/rpc/hbnf_apply_udisc_glow_week')){
   cas++;const payload=JSON.parse(options.body);
   assert.deepEqual(payload.p_expected_week,week);
   week=structuredClone(payload.p_replacement_week);
   revisionNow=revision;return json({applied:true});
  }
  if(u.endsWith('/functions/v1/hbnf-cart-control')){
   cart++;
   if(cartStatus===503)return json({error:'glow_native_overlay_release_not_admitted'},503);
   return json({status:'COMMITTED',scoreFingerprint:'b'.repeat(32),sourceRevision:revision,
    relayStatus:'PENDING_OPAL_PULL',deviceReadback:'NOT_CHECKED'},202);
  }
  throw Error('unexpected route: '+u);
 };
 return {fetch,counters:()=>({cas,cart,reads}),week:()=>week};
}
test('assembled production imports match reviewed modules; actual scheduled Worker entrypoint saves once and retries denied Cart without a second score write',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hbnf-udisc-production-import-'));
 try {
  await cp(join(snap,'src'),join(dir,'src'),{recursive:true});
  await cp(join(snap,'worker-private'),join(dir,'worker-private'),{recursive:true});
  await writeFile(join(dir,'package.json'),'{"type":"module"}');
  const review=await readFile(join(snap,'src/index.review.js'),'utf8');
  assert.match(review,/udisc-glow-auto-sync\.review\.mjs/);
  await writeFile(join(dir,'src/index.js'),review.replace("'./udisc-glow-auto-sync.review.mjs'","'./udisc-glow-auto-sync.mjs'"));
  const original=await readFile(join(snap,'src/udisc-glow-auto-sync.review.mjs'));
  await writeFile(join(dir,'src/udisc-glow-auto-sync.mjs'),original);
  const entry=await import(pathToFileURL(join(dir,'src/index.js')).href);
  const args={UDISC_GLOW_ACCESS_APPROVED:'true',SUPABASE_URL:'https://fixture.supabase.co',
   SUPABASE_SERVICE_ROLE_KEY:'SYNTHETIC_TEST_KEY'};
  const f=mock(503);
  const deps={fetch:f.fetch,source,now:()=>new Date('2026-11-04T02:00:30Z')};
  const saved=await entry.runGlowSync(args,deps);
  assert.equal(saved.disposition,'updated');assert.equal(saved.cartIntent,'NOT_ACCEPTED');
  assert.deepEqual(f.counters(),{cas:1,cart:1,reads:2});
  assert.deepEqual(f.week().history,[{type:'preserved'}]);
  assert.deepEqual(f.week().payouts,{first:12});
  const replay=await entry.runGlowSync(args,{...deps,now:()=>new Date('2026-11-04T02:01:00Z')});
  assert.equal(replay.disposition,'unchanged');
  assert.equal(replay.cartIntent,'NOT_ACCEPTED');
  assert.deepEqual(f.counters(),{cas:1,cart:2,reads:4});
  const stale=await entry.runGlowSync(args,{...deps,now:()=>new Date('2026-11-04T02:11:00Z')});
  assert.equal(stale.cartIntent,'DEFERRED_SOURCE');
  assert.equal(f.counters().cas,1);assert.equal(f.counters().cart,2);
 }finally{await rm(dir,{recursive:true,force:true});}
});

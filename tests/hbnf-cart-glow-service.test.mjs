import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {runGlowIntentAction,commandUuid} from '../staging/coordinated-backend/hbnf-cart-control/glow-intent-service.mjs';
import {patchIndex,stageV35} from '../scripts/hbnf-stage-glow-v35.mjs';
const KEY='k'.repeat(40), now=Date.parse('2026-11-04T02:00:00Z');
const REV='2026-11-04T01:59:48.123456+00:00';
const date='2026-11-03';
const syncedWeek=()=>({date,cards:[{finalized:false}],players:[{name:'A',scores:[2]}],
  udiscSync:{source:'UDisc event XLSX export',weekDate:date,eventId:'hb-glow-doubles-tAP8Y5',
    latest:{signature:'a'.repeat(64)},status:{state:'fresh',lastSuccessAt:'2026-11-04T01:59:30Z'}}});
const source=()=>({state_json:{glow:{activeWeek:date,weeks:{[date]:syncedWeek()}}},week:syncedWeek(),
  event_date:date,event_id:'hb-glow-doubles-tAP8Y5',window_start:'2026-11-04T01:30:00Z',window_end:'2026-11-04T07:30:00Z',
  source_revision:REV,fingerprint:'a'.repeat(32)});
const cart=()=>({desired:{revision:135,state:{power:'on',devices:{matrix:{brightness:83},aux:{brightness:72}},
  selectedVibe:'Heavy',tuning:{energy:65,variation:43,motion:27,audioResponse:88},overlays:[]}},
  fence:{active:true,epoch:5,release_id:'installed-r6'}});
const calls=[];
function deps(a=source(),c=cart()) {return {source:async ()=>structuredClone(a),cart:async()=>structuredClone(c),
  chooseLive:(s)=>({active:true,event:'glow',label:'GLOW',entries:['Team A/Team B -1','Team C/Team D E']}),
  reduceCartCommand:(s,type,payload,id,revision)=>{assert.equal(type,'OVERLAY_START');
    assert.equal(payload.priority,20); assert.equal(payload.ttlMs,15000);
    const state=structuredClone(s);
    state.overlays=[...(state.overlays??[]),{id:payload.overlayId,kind:payload.kind,priority:payload.priority,
      expiresAt:now+payload.ttlMs,payload:payload.data}];state.revision=revision+1;state.lastCommandId=id;return state;
  },commit:async args=>{calls.push(args);return {status:'COMMITTED',desired_revision:136}}};}
const invoke=(d=deps(),body={action:'glow_scoreboard_intent',weekDate:date},authorization=`Bearer ${KEY}`)=>
  runGlowIntentAction({body,authorization,serviceKey:KEY,deps:d,now});

test('service-role-only existing v35 selector -> canonical reducer -> fenced commit, no device sender',async()=>{
  calls.length=0;const r=await invoke();assert.equal(r.status,202);assert.equal(r.body.relayStatus,'PENDING_OPAL_PULL');
  assert.equal(r.body.visibleScoreboard,'NOT_CHECKED');assert.equal(calls.length,1);
  const x=calls[0];assert.equal(x.p_source_revision,REV);assert.equal(x.p_fingerprint,'a'.repeat(32));
  assert.equal(x.p_signature,'a'.repeat(64));assert.equal(x.p_cart_revision,135);assert.equal(x.p_fence_epoch,5);
  assert.equal(x.p_release_id,'installed-r6');assert.equal(x.p_next_state.selectedVibe,'Heavy');
  assert.deepEqual(x.p_next_state.devices,cart().desired.state.devices);
  assert.deepEqual(x.p_next_state.tuning,cart().desired.state.tuning);
  assert.equal(x.p_next_state.overlays.length,1);assert.equal(x.p_next_state.overlays[0].priority,20);
  assert.equal(x.p_next_state.glowScoreIntentCursor.sourceRevision,REV);
  assert.match(x.p_command_id,/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
test('repeated same fingerprint/revision/display bucket cannot replay through planner',async()=>{
  const c=cart();c.desired.state.glowScoreIntentCursor={key:`glow-20261103-${'a'.repeat(20)}-${Math.floor(now/240000)}`,sourceRevision:REV};
  const r=await invoke(deps(source(),c));assert.equal(r.status,409);assert.equal(r.body.reason,'SCORE_INTENT_ALREADY_DISPATCHED');
});
test('changed signature yields distinct, deterministic UUID; same source is stable',async()=>{
  const a=await commandUuid('glow-20261103-'+('a'.repeat(20))+'-1');
  const b=await commandUuid('glow-20261103-'+('a'.repeat(20))+'-1');
  const c=await commandUuid('glow-20261103-'+('b'.repeat(20))+'-1');
  assert.equal(a,b);assert.notEqual(a,c);
});
test('Owner priority 60 preempts GLOW20, no commit',async()=>{
  const c=cart();c.desired.state.overlays=[{id:'owner-text',priority:60,expiresAt:now+9000}];
  calls.length=0;const r=await invoke(deps(source(),c));assert.equal(r.status,409);assert.equal(r.body.reason,'MANUAL_OR_HIGHER_PRIORITY_OVERLAY_ACTIVE');assert.equal(calls.length,0);
});
test('guest, user bearer and empty backend secret are rejected before reading DB',async()=>{
  for (const token of ['', 'Bearer owner-session','Bearer guest','Bearer '+KEY+'wrong']){
    const d={source:()=>{throw Error('must_not_call');}};
    assert.equal((await invoke(d,{action:'glow_scoreboard_intent',weekDate:date},token)).status,403);
  }
  assert.equal((await runGlowIntentAction({body:{action:'glow_scoreboard_intent',weekDate:date},authorization:'Bearer ',serviceKey:'',deps:{}})).status,403);
});
test('caller cannot pass arbitrary score entries, priority, revision, power or guest flags',async()=>{
  for(const injected of [{entries:['HACKED']},{priority:100},{expectedRevision:999},{guest:true},{sourceFingerprint:'a'.repeat(32)}]){
    const d=deps();assert.equal((await invoke(d,{action:'glow_scoreboard_intent',weekDate:date,...injected})).status,400);
  }
});
test('event outside window, unmatched current date or stale UDisc save fail closed',async()=>{
  const a=source();a.window_end='2026-11-04T01:59:59Z';assert.equal((await invoke(deps(a))).body.reason,'EVENT_BINDING_NOT_ACTIVE');
  const b=source();b.state_json.glow.weeks[date].udiscSync.status.lastSuccessAt='2026-11-04T01:30:00Z';assert.equal((await invoke(deps(b))).body.reason,'SAVED_SOURCE_REVISION_NOT_CONFIRMED');
  assert.equal((await invoke(deps(),{action:'glow_scoreboard_intent',weekDate:'2026-11-04'})).status,400);
});
test('missing saved signature, wrong score card or no active week fails closed',async()=>{
  const a=source();delete a.state_json.glow.weeks[date].udiscSync;assert.equal((await invoke(deps(a))).status,409);
  const b=source();b.state_json.glow.weeks[date].cards[0].finalized=true;assert.equal((await invoke(deps(b))).body.reason,'WEEK_NOT_ADMISSIBLE');
  const c=source();c.state_json.glow.activeWeek='2026-10-30';assert.equal((await invoke(deps(c))).body.error,'active_week_changed');
});
test('fence inactive, power off, revision missing -> no canonical write',async()=>{
  for(const modify of [x=>x.fence.active=false,x=>x.desired.state.power='off',x=>x.desired.revision=-1]){
    const c=cart();modify(c);calls.length=0;assert.equal((await invoke(deps(source(),c))).status,409);assert.equal(calls.length,0);
  }
});
test('backend commit drift/fence mismatch is not presented as success',async()=>{
  const d=deps();d.commit=async()=>{throw Error('serialization_failure')};
  assert.equal((await invoke(d)).body.error,'canonical_commit_unavailable_or_stale');
});
test('v35 staging patch adds backend action, preserves Owner/Guest and Opal next route exactly',()=>{
  const s='import { handleMatrixRelay } from "./matrix-relay.ts";\n'+
    '  if (req.headers.has("x-hbnf-relay-id")) return await handleMatrixRelay(req);\n'+
    '  const action = String(request.action ?? "");\n'+
    '  const x=runGuestCommand(request);\n'+
    '  const y=reduceCartCommand(row.state, "OVERLAY_START", {}, "", 1);\n';
  const patched=patchIndex(s);
  assert.ok(patched.includes('runGlowIntentAction'));assert.ok(patched.includes('"glow_scoreboard_intent"'));
  for(const x of ['handleMatrixRelay(req)','runGuestCommand(request)','reduceCartCommand(row.state']) assert.ok(patched.includes(x));
  assert.ok(!patched.includes('MQTT') && !patched.includes('WLED'));
  assert.ok(!patched.includes('Math.max(80')); // Preserve Owner's existing priority=60 semantics
});
test('unknown v35 source anchors fail closed and source staging never overwrites',()=>{
  assert.throws(()=>patchIndex('not provider v35'),/unexpected_v35_anchor/);
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cart-glow-stage-'));
  assert.throws(()=>stageV35({sourceDir:tmp,destinationDir:path.join(tmp,'out'),sourceReceipt:{slug:'hbnf-cart-control',version:34},plannerFile:'missing',adapterFile:'missing'}),/unverified_provider_baseline/);
  fs.rmSync(tmp,{recursive:true,force:true});
});
test('SQL migration binds source/Cart row locks, same bridge and no public execute or score writes',()=>{
  const file=new URL('../staging/coordinated-backend/migrations/20261103000100_hbnf_cart_glow_backend_intent_REVIEW_ONLY.sql',import.meta.url);
  const sql=fs.readFileSync(file,'utf8');
  for(const needle of ['FOR SHARE','FOR UPDATE','hbnf_cart_commit_command_bridge','cart_actuator_fence','request.jwt.claim.role','TO service_role','FROM PUBLIC,anon,authenticated','v_fingerprint','p_fence_epoch','sourceRevision','p_intent_key','p_next_state'])assert.ok(sql.includes(needle),needle);
  assert.ok(!/UPDATE\s+public\.league_state/i.test(sql));assert.ok(!/INSERT\s+INTO\s+public\.league_state/i.test(sql));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runGlowIntentAction} from '../../candidate-source/glow-intent-service.mjs';
import {planSavedGlowOverlay} from '../../candidate-source/hbnf-glow-cart-intent.mjs';

const secret='k'.repeat(48),auth='Bearer '+secret;
const date='2026-11-10',eventId='hb-glow-doubles-af85rU';
const now=Date.parse('2026-11-11T02:00:00Z');
const signature='b'.repeat(64),fingerprint='a'.repeat(32);
const revision='2026-11-11T01:59:59.000000Z';
const bindings={
  event_date:date,event_id:eventId,
  window_start:'2026-11-11T01:30:00.000000Z',
  window_end:'2026-11-11T07:30:00.000000Z'
};
function fixture({fresh=true,event=eventId,changedRevision=false,history=false}={}){
 const t='2026-11-11T01:59:00Z';
 const w={date,cards:[],scoresLocked:false};
 if(history){
   w.udiscSync={source:'UDisc event XLSX export',eventId:event,weekDate:date,
      latest:{signature,rows:[{sourceTeam:'Team A',sourceRank:'1',strokeTotal:48,relativeScore:-11}]}};
 }else{
   w.udiscLive={schema:'hbnf.udisc.live-lineage.v1',eventId:event,weekDate:date,
     sourceIdentity:event,sourceMode:'EXPLICITLY_AUTHORIZED_IN_ROUND',
     sourceFreshness:'VERIFIED_PROVIDER_RECENT',roundId:'round1',cursor:8,
     sourceUpdatedAt:t,receivedAt:t,permissionReference:'udisc-permit-1234',
     envelopeDigest:signature,acceptedHoles:{teamA:{hole1:{strokes:'3'}}}};
   w.udiscSync={source:'UDisc explicitly authorized live source',eventId:event,weekDate:date,
     latest:{signature,sourceUpdatedAt:t,observedAt:t,sourceCursor:8,liveSourceReceipt:true},
     ...(fresh?{status:{state:'fresh',lastSuccessAt:t}}:{})};
 }
 return {...bindings,delivery_policy:history?'HISTORICAL_PREVIEW_ONLY_NO_ACTUATION':'WINDOW_OPEN_SOURCE_FRESHNESS_STILL_REQUIRED',
   fingerprint,source_revision:changedRevision?'2026-11-11T01:58:00.000000Z':revision,
   week:w,state_json:{glow:{activeWeek:date,weeks:{[date]:w}}}};
}
const live={active:true,event:'glow',label:'GLOW',entries:['Team A -11']};
const cart={desired:{revision:135,state:{cartId:'hbnf-cart',power:'on',revision:135,overlays:[],devices:{}}},
  fence:{active:true,epoch:5,release_id:'hbnf-cart-foundation-v1-20260925'}};
function dependencies(src=fixture(),overrides={}){
 let calls={source:0,cart:0,reduce:0,commit:0},args;
 const deps={nativeOverlayAdmitted:true,
   source:async()=>{calls.source++;return src;},
   cart:async()=>{calls.cart++;return structuredClone(cart);},
   chooseLive:()=>live,
   reduceCartCommand:(state,type,payload,commandId,rev)=>{
     calls.reduce++;
     return {...state,revision:rev+1,lastCommandId:commandId,
       overlays:[{id:payload.overlayId,kind:payload.kind,priority:payload.priority,
         expiresAt:now+payload.ttlMs,payload:payload.data}]};
   },
   commit:async data=>{calls.commit++;args=data;return {status:'COMMITTED',desired_revision:136};},
   ...overrides
 };
 return {deps,calls,getArgs:()=>args};
}
const request=(action='glow_scoreboard_intent')=>({action,weekDate:date});
async function invoke(d,body=request(),authorization=auth){
 return runGlowIntentAction({body,authorization,serviceKey:secret,deps:d.deps,now});
}

test('C7: real historical preview is explicitly read-only and never contacts Cart/commit',async()=>{
 const f=fixture({fresh:false,history:true});
 f.week.udiscSync.latest.rows=[
   {sourceTeam:'A',sourceRank:'1',strokeTotal:48,relativeScore:-11},
   {sourceTeam:'B',sourceRank:'T2',strokeTotal:52,relativeScore:-7},
   {sourceTeam:'C',sourceRank:'T2',strokeTotal:52,relativeScore:-7},
   {sourceTeam:'D',sourceRank:'4',strokeTotal:57,relativeScore:-2}];
 const d=dependencies(f,{cart:async()=>{throw Error('preview_cannot_contact_cart');},
    commit:async()=>{throw Error('preview_cannot_commit');},
    reduceCartCommand:()=>{throw Error('preview_cannot_reduce');},
    nativeOverlayAdmitted:false});
 const r=await invoke(d,request('glow_scoreboard_preview'));
 assert.equal(r.status,200);
 assert.equal(r.body.mode,'HISTORICAL_READ_ONLY');
 assert.equal(r.body.actuationAllowed,false);
 assert.equal(r.body.deviceCommandIssued,false);
 assert.deepEqual(r.body.standings.map(x=>x.strokes),[48,52,52,57]);
 assert.equal(d.calls.cart,0);assert.equal(d.calls.commit,0);
});

test('C7: preview rejects forged event/source and fresh-event use',async()=>{
 const f=fixture({history:true,event:'hb-glow-doubles-WRONG1'});
 assert.equal((await invoke(dependencies(f),request('glow_scoreboard_preview'))).status,409);
 assert.equal((await invoke(dependencies(fixture()),request('glow_scoreboard_preview'))).status,409);
});

test('C7: authenticated fresh upcoming binding produces exactly one canonical Cart commit',async()=>{
 const d=dependencies();
 const r=await invoke(d);
 assert.equal(r.status,202);
 assert.equal(r.body.status,'COMMITTED');
 assert.equal(d.calls.commit,1);
 const a=d.getArgs();
 assert.deepEqual(
   [a.p_week_date,a.p_source_revision,a.p_fingerprint,a.p_signature,
    a.p_cart_revision,a.p_fence_epoch,a.p_release_id],
   [date,revision,fingerprint,signature,135,5,'hbnf-cart-foundation-v1-20260925']);
 assert.match(a.p_intent_key,/^glow-20261110-b{20}-[0-9]+$/);
 assert.equal(a.p_next_state.glowScoreIntentCursor.sourceRevision,revision);
 assert.equal(a.p_next_state.glowScoreIntentCursor.key,a.p_intent_key);
});

test('C7: duplicate receipt is projected without second client dispatch',async()=>{
 const d=dependencies(fixture(),{commit:async()=>({status:'DUPLICATE',desired_revision:136})});
 const r=await invoke(d);
 assert.equal(r.status,202);assert.equal(r.body.status,'DUPLICATE');
 assert.equal(r.body.deviceReadback,'NOT_CHECKED');
});

test('C7: stale missing freshness is rejected with no commit',async()=>{
 const d=dependencies(fixture({fresh:false}));
 const r=await invoke(d);
 assert.equal(r.status,409);assert.equal(r.body.reason,'SAVED_SOURCE_REVISION_NOT_CONFIRMED');
 assert.equal(d.calls.commit,0);
});

test('C7: expired event window and mismatched event ID reject prior to reducer',async()=>{
 const src=fixture();
 const d=dependencies(src);
 assert.equal((await runGlowIntentAction({body:request(),authorization:auth,
    serviceKey:secret,deps:d.deps,now:Date.parse('2026-11-12T08:00:00Z')})).status,409);
 assert.equal(d.calls.commit,0);
 const cross=dependencies(fixture({event:'hb-glow-doubles-WRONG1'}));
 assert.equal((await invoke(cross)).status,409);
 assert.equal(cross.calls.commit,0);
});


test('C8: manual organizer XLSX marked fresh can NEVER become a live Cart command',async()=>{
 const f=fixture();f.week.udiscSync.source='UDisc event XLSX export';
 const d=dependencies(f);
 const r=await invoke(d);
 assert.equal(r.status,409);assert.equal(r.body.reason,'SAVED_SOURCE_REVISION_NOT_CONFIRMED');
 assert.equal(d.calls.commit,0);
});

test('C8: cursor, provider permission, observed digest or source timestamp mismatch rejects live intent',async()=>{
 for(const change of [
   f=>f.week.udiscLive.permissionReference='',
   f=>f.week.udiscSync.latest.sourceCursor=9,
   f=>f.week.udiscLive.envelopeDigest='a'.repeat(64),
   f=>f.week.udiscLive.sourceUpdatedAt='2026-11-10T00:00:00Z',
   f=>f.week.udiscLive.acceptedHoles={},
   f=>f.week.udiscSync.latest.liveSourceReceipt=false
 ]){
   const f=fixture();change(f);
   const d=dependencies(f);const r=await invoke(d);
   assert.equal(r.status,409);assert.equal(r.body.reason,'SAVED_SOURCE_REVISION_NOT_CONFIRMED');
   assert.equal(d.calls.commit,0);
 }
});

test('C7: Owner text priority and inactive native release prevent score actuation',async()=>{
 const d=dependencies();
 d.deps.cart=async()=>({desired:{...cart.desired,
   state:{...cart.desired.state,overlays:[{id:'manual',priority:60,expiresAt:now+10000}]}},fence:cart.fence});
 assert.equal((await invoke(d)).status,409);assert.equal(d.calls.commit,0);
 const disabled=dependencies(fixture(),{nativeOverlayAdmitted:false});
 assert.equal((await invoke(disabled)).body.error,'glow_native_overlay_release_not_admitted');
 assert.equal(disabled.calls.source,0);assert.equal(disabled.calls.commit,0);
});

test('C7: only service role accepted, event date request bounded',async()=>{
 assert.equal((await invoke(dependencies(),request(),'Bearer user-token')).status,403);
 assert.equal((await invoke(dependencies(),{action:'glow_scoreboard_intent',weekDate:'2026-11-03',isFresh:true})).status,400);
 assert.equal((await invoke(dependencies(),{action:'glow_scoreboard_intent',weekDate:'bad'})).status,400);
});

test('C7: versioned SQL creates exact required RPC names and guarded reverse',()=>{
 const up=readFileSync(new URL('../../migrations/20261103_cart_glow_overlay_v1_REVIEW_ONLY.sql',import.meta.url),'utf8');
 const down=readFileSync(new URL('../../migrations/20261103_cart_glow_overlay_v1_REVIEW_ONLY.down.sql',import.meta.url),'utf8');
 for(const name of ['hbnf_cart_glow_source_snapshot','hbnf_cart_commit_glow_intent']){
  assert.match(up,new RegExp('CREATE FUNCTION public\\.'+name+'\\('));
  assert.match(up,new RegExp('GRANT EXECUTE ON FUNCTION public\\.'+name+'\\('));
  assert.match(down,new RegExp('DROP FUNCTION IF EXISTS public\\.'+name+'\\('));
 }
 for(const frag of [
  "FROM public.hbnf_udisc_glow_event_bindings",
  "FROM public.league_state WHERE id=1 FOR SHARE",
  "md5(v_week::text) IS DISTINCT FROM p_fingerprint",
  "v_week#>>'{udiscSync,status,state}' IS DISTINCT FROM 'fresh'",
  "v_week#>>'{udiscSync,source}' IS DISTINCT FROM 'UDisc explicitly authorized live source'",
  "v_week#>>'{udiscLive,sourceMode}' IS DISTINCT FROM 'EXPLICITLY_AUTHORIZED_IN_ROUND'",
  "v_week#>>'{udiscLive,envelopeDigest}' IS DISTINCT FROM p_signature",
  "v_week#>>'{udiscSync,latest,liveSourceReceipt}' IS DISTINCT FROM 'true'",
  "historical_source_not_qualified",
  "live_provider_timestamp_stale",
  "v_now NOT BETWEEN v_event.window_start AND v_event.window_end",
  "p_fence_epoch","p_cart_revision","p_intent_key",
  "hbnf_internal.hbnf_cart_commit_command","manual_or_owner_overlay_active",
  "non_overlay_canonical_state_change","service_role_required"
 ]) assert.ok(up.includes(frag),'missing source contract: '+frag);
 assert.ok(down.includes('unresolved_overlay_v1_challenge_requires_device_recovery'));
 assert.doesNotMatch(down,/DROP FUNCTION IF EXISTS public\.hbnf_cart_matrix_relay_/);
});

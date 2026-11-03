import test from 'node:test';
import assert from 'node:assert/strict';
import {captureReviewPreimage, proposeOverlayOnly, inspectOverlayLifecycle,
  REVIEW_CONTROL_HEAD} from '../staging/cart116-glow-v35-exact-review/matrix-overlay-ack-review.mjs';
import {enforcePreservedGlowRelay,GLOW_PROJECTION_BLOCK_REASON} from '../staging/cart116-glow-v35-exact-review/candidate-source/glow-relay-preservation.mjs';

// These are synthetic structural fixtures, NOT a captured device preimage.
const release='hbnf-cart2-phase2-r6-skins-readable-20261014';
const overlayId='hbnf-'+'b'.repeat(32);
const ownerId='hbnf-'+'c'.repeat(32);
const clone=x=>structuredClone(x);
const fixture=()=>({
 matrixInfo:{mac:'70:4b:ca:5b:34:5c',ver:'16.0.1',leds:{count:534}},
 matrixBuild:{release_id:release},
 matrixState:{on:true,bri:255,ps:60,HBNF:{schema:'foundation-v1',candidate:release,
  effectId:223,scene:0,vibe:2,motion:37,audioResponse:78,matrixBrightness:184,
  auxBrightness:111,palette:{mode:'wled',index:3},overlayId:null,energy:72,variation:43,
  variantSignature:'dynamic-not-compared'},
  seg:[{id:0,start:0,stop:512,fx:223,on:true,bri:255,pal:3,sx:125,ix:144},
       {id:1,start:512,stop:534,fx:223,on:true,bri:255,pal:3,sx:125,ix:144}]},
 auxInfo:{mac:'8c:94:df:55:c3:4c',ip:'192.168.77.11',leds:{count:24},live:true,
  lm:'DDP',lip:'192.168.77.10'},
 auxState:{on:true,bri:111,lor:0,seg:[
  {id:0,start:0,stop:22,fx:1,on:true,bri:111},
  {id:1,start:22,stop:23,fx:0,on:false,bri:0},
  {id:2,start:23,stop:24,fx:0,on:false,bri:0}]},
 auxConfig:{if:{live:{maxbri:false}}},
 // Synthetic assertion below is NOT backed by actual native AUX geometry.
 auxMapping:{source:'authenticated-aux-config-plus-ddp-readback',
  evidenceSha256:'a'.repeat(64),configuredPixels:24,ddpPhysicalPixels:22,
  reservedPixels:2,uvOutputsOff:true},
 cart:{revision:77,fenceEpoch:9,ownerPriorityClear:true}
});
const proposal=()=>({id:overlayId,kind:'scoreboard',label:'GLOW',
 entries:['A -2','B -1'],ttlMs:15000});
const challenge=()=>({id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',overlayId,
 revision:77,fenceEpoch:9,oneUse:true,createdAt:1000,expiresAt:21000,
 overlayExpiresAt:16000,applies:1,applyAuthorized:true});
function cycle(phase,modify=()=>{},additional={}){
 const base=fixture(),pre=captureReviewPreimage(base),post=clone(base);
 modify(post);
 return inspectOverlayLifecycle({review:pre,readback:post,challenge:challenge(),
 phase,now:2000,owner:{higherPriorityActive:false},...additional});
}
test('current Controls review source head is identified explicitly',()=>{
 assert.equal(REVIEW_CONTROL_HEAD,'1f38a99240d77077ad5fd772aea83aaf41164357');
});
test('real current v35 protective guard rejects full-state Glow projection',()=>{
 const old={matrix:{bri:255,seg:[{id:0,fx:142},{id:1,fx:142}],
 HBNF:{overlay:{kind:'scoreboard',label:'GLOW',entries:['A -2']}}},aux:{on:true,bri:255}};
 assert.throws(()=>enforcePreservedGlowRelay({wledPayload:old}),{message:GLOW_PROJECTION_BLOCK_REASON});
});
test('AUX 24 configured is NOT proof of 22 active DDP without mapping',()=>{
 const f=fixture();delete f.auxMapping;
 assert.equal(captureReviewPreimage(f).reason,'aux_24_configured_22_active_mapping_unproven');
});
test('synthetic fully evidenced preimage stays REVIEW_ONLY, no admission',()=>{
 const r=captureReviewPreimage(fixture());assert.equal(r.pass,true);
 assert.equal(r.mutationAuthorized,false);assert.equal(r.reviewOnly,true);
});
test('WOW MAX active effect mismatch rejects preimage',()=>{
 const f=fixture();f.matrixState.seg[0].fx=142;
 assert.equal(captureReviewPreimage(f).reason,'wow60_native_effect_or_brightness_unproven');
});
test('WOW preset 60 is required, not merely effect name',()=>{
 const f=fixture();f.matrixState.ps=59;
 assert.equal(captureReviewPreimage(f).pass,false);
});
test('Owner priority must be authoritatively clear',()=>{
 const f=fixture();delete f.cart.ownerPriorityClear;
 assert.equal(captureReviewPreimage(f).reason,'canonical_owner_revision_fence_unproven');
});
test('only HBNF overlay is proposed, not brightness/fx/aux/audio/Vibe',()=>{
 const x=captureReviewPreimage(fixture());const before=clone(x);
 const p=proposeOverlayOnly(x,proposal());
 assert.equal(p.pass,true);assert.equal(p.mutationAuthorized,false);
 assert.deepEqual(p.payload,{HBNF:{overlay:proposal()}});
 assert.deepEqual(x,before);
});
test('malformed overlay is rejected without risking firmware invalid-clear',()=>{
 const bad=proposal();bad.entries=[''];
 assert.equal(proposeOverlayOnly(captureReviewPreimage(fixture()),bad).pass,false);
});
test('ACK requires exact overlay ID and stable source control preimage',()=>{
 const r=cycle('ack',p=>{p.matrixState.HBNF.overlayId=overlayId;
   p.matrixState.HBNF.variantSignature='naturally-advanced-frame';});
 assert.equal(r.phase,'OVERLAY_ID_READBACK_ONLY');
 assert.equal(r.deviceVisualAccepted,false);
 assert.equal(r.providerNonceConsumed,false);
});
test('ACK fails when no overlay was applied, even with HTTP success',()=>{
 const r=cycle('ack');assert.equal(r.reason,'overlay_id_not_acknowledged');
});
test('ACK does not accept an Owner overlay ID as Glow confirmation',()=>{
 const r=cycle('ack',p=>{p.matrixState.HBNF.overlayId=ownerId;});
 assert.equal(r.pass,false);
});
test('ACK fails on changed Audio response or Vibe',()=>{
 const r=cycle('ack',p=>{p.matrixState.HBNF.overlayId=overlayId;
 p.matrixState.HBNF.audioResponse=10;p.matrixState.HBNF.vibe=1;});
 assert.equal(r.reason,'effect_audio_brightness_preset_or_aux_drift');
});
test('ACK fails if WLED master/Matrix brightness changes',()=>{
 const r=cycle('ack',p=>{p.matrixState.HBNF.overlayId=overlayId;p.matrixState.bri=120;});
 assert.equal(r.pass,false);
});
test('ACK fails on lost WOW preset or fx identity',()=>{
 const r=cycle('ack',p=>{p.matrixState.HBNF.overlayId=overlayId;p.matrixState.ps=-1;p.matrixState.seg[0].fx=142;});
 assert.equal(r.pass,false);
});
test('ACK fails on AUX DDP/receiver/segment drift',()=>{
 const r=cycle('ack',p=>{p.matrixState.HBNF.overlayId=overlayId;p.auxState.seg[0].bri=255;});
 assert.equal(r.pass,false);
});
test('one-use challenge and revision/fence required',()=>{
 const c=challenge();c.fenceEpoch=11;
 const r=cycle('ack',p=>{p.matrixState.HBNF.overlayId=overlayId;},{challenge:c});
 assert.equal(r.reason,'stale_or_unfenced_challenge');
});
test('duplicate apply is never accepted as one ACK',()=>{
 const c=challenge();c.applies=2;
 const r=cycle('ack',p=>{p.matrixState.HBNF.overlayId=overlayId;},{challenge:c});
 assert.equal(r.reason,'stale_duplicate_or_owner_preempted');
});
test('late ACK after challenge/overlay expiry cannot succeed',()=>{
 const r=cycle('ack',p=>{p.matrixState.HBNF.overlayId=overlayId;},{now:21001});
 assert.equal(r.pass,false);
});
test('Owner preemption requires owner ID readback, not priority label alone',()=>{
 const owner={higherPriorityActive:true,overlayId:ownerId};
 const yes=cycle('owner_preempt',p=>{p.matrixState.HBNF.overlayId=ownerId;},{owner});
 assert.equal(yes.phase,'OWNER_ID_PREEMPTION_READBACK_ONLY');
 const no=cycle('owner_preempt',p=>{p.matrixState.HBNF.overlayId=overlayId;},{owner});
 assert.equal(no.reason,'owner_preemption_unverified');
});
test('TTL expiry must restore full stable WOW/Audio/brightness/AUX core',()=>{
 const yes=cycle('expiry_restore',p=>{p.matrixState.HBNF.overlayId=null;},{now:17000});
 assert.equal(yes.phase,'CORE_RESTORED_BY_READBACK_ONLY');
 const no=cycle('expiry_restore',p=>{p.matrixState.HBNF.overlayId=overlayId;},{now:17000});
 assert.equal(no.reason,'expiry_or_prior_visual_not_restored');
});
test('timeout/reconnect never implies resend or clearing an Owner overlay',()=>{
 for(const phase of ['timeout','reconnect']){
   const r=cycle(phase,p=>{p.matrixState.HBNF.overlayId=ownerId;},{now:99999});
   assert.equal(r.phase,'REOBSERVE_ONLY_NEVER_RETRY');
   assert.equal(r.commandsIssued,0);assert.equal(r.retryPermitted,false);
   assert.equal(r.overlayClearPermitted,false);
 }
});
test('invalid ACK challenge cannot silently bypass nonce/TTL requirements',()=>{
 const c=challenge();delete c.overlayExpiresAt;
 const r=cycle('ack',p=>{p.matrixState.HBNF.overlayId=overlayId;},{challenge:c});
 assert.equal(r.reason,'invalid_challenge');
});
test('fresh post-ACK Matrix identity/release cannot silently drift',()=>{
 const r=cycle('ack',p=>{p.matrixState.HBNF.overlayId=overlayId;
  p.matrixInfo.mac='de:ad:be:ef:00:00';p.matrixBuild.release_id='other';});
 assert.equal(r.reason,'effect_audio_brightness_preset_or_aux_drift');
});
test('ACK requires explicit canonical Owner-priority readback, not absence',()=>{
 const r=cycle('ack',p=>{p.matrixState.HBNF.overlayId=overlayId;},{owner:{}});
 assert.equal(r.reason,'stale_duplicate_or_owner_preempted');
});
test('changed AUX active-DDP evidence digest blocks ACK',()=>{
 const r=cycle('ack',p=>{p.matrixState.HBNF.overlayId=overlayId;
  p.auxMapping.evidenceSha256='f'.repeat(64);});
 assert.equal(r.reason,'effect_audio_brightness_preset_or_aux_drift');
});

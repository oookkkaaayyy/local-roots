import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectAux22DdpWithOffPwm,proposeNativeOverlayOnly,R6_OWNER_PRIORITY_RELEASE} from '../candidate-source/matrix-overlay-safe-review.mjs';
import {captureOverlayProfile,overlayPreimageHash} from '../candidate-source/glow-overlay-v1-handler.mjs';
import {assessRelayRuntimeOrigin,HISTORICAL_SKINS_PATHS,PROPOSED_GLOW_PATHS} from '../opal/relay-startup-origin.mjs';
const release='hbnf-cart2-phase2-r6-skins-readable-20261014';
const clone=x=>structuredClone(x);
function fixture(){
 const info={mac:'70:4b:ca:5b:34:5c',ver:'16.0.1',leds:{count:534}},
 state={on:true,ps:-1,bri:255,AudioReactive:{on:true},HBNF:{candidate:release,schema:'foundation-v1',effectId:142,overlayId:null,energy:12,variation:17,motion:5,matrixBrightness:0,auxBrightness:0},
 seg:[{id:0,start:0,stop:512,on:true,fx:142,bri:0},{id:1,start:512,stop:534,on:true,fx:142,bri:0}]},
 build={release_id:release},
 auxInfo={ip:'192.168.77.11',mac:'8c:94:df:55:c3:4c',leds:{count:24},live:true,lm:'DDP',lip:'192.168.77.10'},
 auxState={on:true,bri:0,lor:0,seg:[{id:0,start:0,stop:22,on:true},{id:1,start:22,stop:23,on:false},{id:2,start:23,stop:24,on:false}]},
 auxConfig={hw:{led:{ins:[{start:0,len:22,type:22,pin:[16]}, {start:22,len:1,type:41,pin:[25]}, {start:23,len:1,type:41,pin:[26]}]}},if:{live:{maxbri:false}}};
 return {info,state,build,auxInfo,auxState,auxConfig};
}
const proposal=x=>proposeNativeOverlayOnly({matrixInfo:x.info,matrixState:x.state,matrixBuild:x.build,auxInfo:x.auxInfo,auxState:x.auxState,auxConfig:x.auxConfig,ownerPriorityClear:true,overlay:{id:'hbnf-'+'b'.repeat(32),kind:'scoreboard',label:'GLOW',entries:['Player A -3'],ttlMs:9000}});
test('observed 24 configured = 22 GPIO16 RGB + two OFF one-channel PWM on GPIO25/26',()=>{
 const x=fixture(), r=inspectAux22DdpWithOffPwm(x);
 assert.equal(r.compatible,true);assert.equal(r.configuredLeds,24);assert.equal(r.ddpRgbPixels,22);
 assert.deepEqual(r.pwmOffPins,[25,26]);assert.equal(x.auxState.bri,0);
});
test('unknown bus count, pin, kind, overlap and the 24->22 normalization are rejected',()=>{
 const mutators=[x=>x.auxInfo.leds.count=22,x=>x.auxConfig.hw.led.ins.pop(),
 x=>x.auxConfig.hw.led.ins[0].pin=[17],x=>x.auxConfig.hw.led.ins[2].type=40,
 x=>x.auxConfig.hw.led.ins[1].start=21,x=>x.auxConfig.hw.led.ins[0].type=41,
 x=>x.auxConfig.hw.led.ins[1].pin.push(13)];
 for(const m of mutators){const x=fixture();m(x);assert.equal(inspectAux22DdpWithOffPwm(x).compatible,false);}
});
test('PWM segment on, missing segment, wrong extent, or DDP source rejected',()=>{
 const changes=[x=>x.auxState.seg[1].on=true,x=>x.auxState.seg[2].on=true,
 x=>x.auxState.seg.pop(),x=>x.auxState.seg[0].stop=24,
 x=>x.auxInfo.lip='192.168.77.50',x=>x.auxConfig.if.live.maxbri=true];
 for(const f of changes){const x=fixture();f(x);assert.equal(inspectAux22DdpWithOffPwm(x).compatible,false);}
});
test('current actual ps=-1, fx142 both matching: no forced preset, no mutation, still not eligible',()=>{
 const x=fixture(),r=proposal(x);assert.equal(r.eligible,false);
 assert.equal(r.reason,'native_wled_unity_brightness_unproven');
 assert.equal(x.state.ps,-1);assert.deepEqual(x.state.seg.map(y=>y.fx),[142,142]);
 assert.equal(x.state.HBNF.matrixBrightness,0);
});
test('preset60 source profile does not bypass brightness and native Owner priority',()=>{
 const x=fixture();x.state.ps=60;const r=proposal(x);
 assert.equal(r.eligible,false);assert.equal(r.reason,'native_wled_unity_brightness_unproven');
 assert.equal(r.mutationAuthorized,false);
});
test('effect mismatch/Owner priority both deny even when native support and DDP exact',()=>{
 const x=fixture();x.state.ps=60;x.state.seg[1].fx=143;
 assert.equal(proposal(x).reason,'active_foundation_effect_unproven');
 x.state.seg[1].fx=142;const p=proposeNativeOverlayOnly({...{matrixInfo:x.info,matrixState:x.state,matrixBuild:x.build,auxInfo:x.auxInfo,auxState:x.auxState,auxConfig:x.auxConfig},ownerPriorityClear:false,overlay:{}});
 assert.equal(p.reason,'owner_priority_not_cleared');
});
test('preimage fingerprint includes independent PWM bus and segment state, never zeros out brightness',async()=>{
 const x=fixture(),profile=captureOverlayProfile(x);assert.equal(profile.aux.leds,24);
 assert.equal(profile.aux.global.bri,0);assert.equal(profile.matrix.hbnf.auxBrightness,0);
 const a=await overlayPreimageHash(x);
 const y=clone(x);y.auxState.seg[2].on=true;
 assert.throws(()=>captureOverlayProfile(y),/aux_pwm_not_proven_off/);
 const z=clone(x);z.state.HBNF.energy=13;
 assert.notEqual(await overlayPreimageHash(z),a);
});
test('unverified historical procd path does not assert no running relay or grant a substitute Skins service',()=>{
 const files=Object.fromEntries([...HISTORICAL_SKINS_PATHS,...PROPOSED_GLOW_PATHS].map(p=>[p,{kind:'absent'}]));
 const r=assessRelayRuntimeOrigin({files,services:[],processes:[{pid:99,exePath:'/opt/other/hbnf-relay',service:'custom'}],sessionId:'capture-20261103'});
 assert.equal(r.admitted,false);assert.equal(r.reason,'new_relay_paths_absent_origin_not_verified');assert.equal(r.observedPotentialRelayProcesses,1);
});
test('incomplete process or file inventory fails closed; historical procd alone cannot authorize',()=>{
 assert.equal(assessRelayRuntimeOrigin({}).admitted,false);
 const files=Object.fromEntries([...HISTORICAL_SKINS_PATHS,...PROPOSED_GLOW_PATHS].map(p=>[p,{kind:'absent'}]));
 delete files['/usr/libexec/hbnf-skins-relay'];
 assert.equal(assessRelayRuntimeOrigin({files,services:[],processes:[],sessionId:'x'}).reason,'runtime_path_not_inventoried');
});

test('existing procd START95 points to libexec, never proposed absent /usr/lib executable',()=>{
 assert.deepEqual(PROPOSED_GLOW_PATHS,['/usr/libexec/hbnf-matrix-relay','/usr/lib/hbnf-glow-overlay-v1.sh']);
 const f=assessRelayRuntimeOrigin({files:Object.fromEntries([...HISTORICAL_SKINS_PATHS,...PROPOSED_GLOW_PATHS].map(p=>[p,{kind:'absent'}])),services:[],processes:[],sessionId:'physical-receipt-6613457326'});
 assert.equal(f.admitted,false);assert.equal(f.reason,'new_relay_paths_absent_origin_not_verified');
});

function visibleUnityR6(x) {
  x.state.bri=255;
  x.state.seg[0].bri=255;
  x.state.seg[1].bri=255;
  x.state.HBNF.matrixBrightness=24;
  return x;
}
test('original R6 remains Owner-priority blocked; exact successor recognized but never admitted',()=>{
  const original=visibleUnityR6(fixture());
  const old=proposal(original);
  assert.equal(old.reason,'installed_r6_owner_text_priority_not_enforced');
  assert.equal(old.eligible,false);
  const patched=clone(original);
  patched.build.release_id=R6_OWNER_PRIORITY_RELEASE;
  patched.build.features=['native-overlay-owner-text-priority-v1'];
  patched.state.HBNF.candidate=R6_OWNER_PRIORITY_RELEASE;
  const next=proposal(patched);
  assert.equal(next.reason,'native_owner_priority_source_gate_not_admitted');
  assert.equal(next.eligible,false);
  assert.equal(next.mutationAuthorized,false);
  assert.equal(next.reviewOnly,true);
  assert.deepEqual(patched.state.seg.map(v=>[v.start,v.stop,v.fx,v.bri]),[[0,512,142,255],[512,534,142,255]]);
  assert.equal(patched.state.ps,-1);
  assert.equal(patched.state.HBNF.matrixBrightness,24);
  assert.equal(patched.auxState.seg[1].on,false);
  assert.equal(patched.auxState.seg[2].on,false);
});
test('wrong/mismatched build marker and missing/forged feature are never accepted',()=>{
  const base=visibleUnityR6(fixture());
  const mismatch=clone(base);
  mismatch.build.release_id=R6_OWNER_PRIORITY_RELEASE;
  mismatch.build.features=['native-overlay-owner-text-priority-v1'];
  assert.equal(proposal(mismatch).reason,'installed_release_not_verified');
  const unknown=clone(base);
  unknown.build.release_id='unapproved-new-firmware';
  unknown.state.HBNF.candidate='unapproved-new-firmware';
  assert.equal(proposal(unknown).reason,'installed_release_not_verified');
  const noFeature=clone(base);
  noFeature.build.release_id=R6_OWNER_PRIORITY_RELEASE;
  noFeature.state.HBNF.candidate=R6_OWNER_PRIORITY_RELEASE;
  assert.equal(proposal(noFeature).reason,'installed_r6_owner_text_priority_not_enforced');
  const forgedOld=clone(base);
  forgedOld.build.features=['native-overlay-owner-text-priority-v1'];
  assert.equal(proposal(forgedOld).reason,'installed_r6_owner_text_priority_not_enforced');
});

test('DORA C1 Opal helper binds corrected R6 only and keeps both actuation locks closed',()=>{
 const sh=readFileSync(new URL('../opal/hbnf-glow-overlay-v1.sh',import.meta.url),'utf8');
 assert.match(sh,/HBNF_OVERLAY_V1_SOURCE_ADMITTED=false/);
 assert.match(sh,/HBNF_NATIVE_OWNER_TEXT_PRIORITY_ADMITTED=false/);
 assert.match(sh,/\[ "\$HBNF_OVERLAY_V1_SOURCE_ADMITTED" = true \]/);
 assert.match(sh,/\[ "\$HBNF_NATIVE_OWNER_TEXT_PRIORITY_ADMITTED" = true \]/);
 // Two exact independently reviewed Owner-safe R6 release IDs; no prefix match.
 assert.ok(sh.includes('case "$native_owner_safe_release" in'));
 assert.ok(sh.includes("'"+R6_OWNER_PRIORITY_RELEASE+"'|'hbnf-cart2-r6-owner-safe-tuning-persist-review-20261104')"));
 assert.ok(sh.includes('*) return 1 ;;'));
 assert.ok(sh.includes('build.json" -e \'@.release_id\')'));
 assert.ok(sh.includes('state.json" -e \'@.HBNF.candidate\')'));
 assert.ok(!sh.includes("= 'hbnf-cart2-phase2-r6-skins-readable-20261014'"));
 assert.ok(!sh.includes('curl -X POST http://192.168.77.11'));
});
test('genuine four-team Nov 3 standing is OFFLINE fixture only; no scoreboard actuation',()=>{
 // Source: #115 issuecomment-6627720510, original scored organizer XLSX.
 // Not a live league_state readback, payment, ace, rank write, or activation.
 const rows=[
  {team:'Fox & Jason mintzer',holes:[2,2,3,2,3,3,3,3,2,2,4,2,2,2,3,3,4,3],strokes:48,relative:-11,rank:1},
  {team:'Andrew & Matthew Levinson',holes:[3,2,3,3,4,2,2,2,2,3,4,2,2,3,3,3,5,4],strokes:52,relative:-7,rank:2},
  {team:'Kyle Gundlach & Dylan Jones',holes:[2,2,3,3,3,3,4,3,2,2,4,2,2,3,3,3,5,3],strokes:52,relative:-7,rank:2},
  {team:'Zimgirdib & Tony Howell',holes:[3,3,3,3,3,3,2,3,2,3,4,3,3,3,5,3,4,4],strokes:57,relative:-2,rank:4}
 ];
 assert.deepEqual(rows.map(r=>r.holes.reduce((a,b)=>a+b,0)),rows.map(r=>r.strokes));
 assert.deepEqual(rows.map(r=>r.strokes-59),rows.map(r=>r.relative));
 assert.deepEqual(rows.map(r=>r.rank),[1,2,2,4]);
 const entries=rows.map(r=>r.team+' '+r.strokes+' ('+r.relative+')');
 assert.equal(entries.length,4);
 assert.ok(entries.every(x=>x.length<=63));
 const x=visibleUnityR6(fixture());
 x.build.release_id=R6_OWNER_PRIORITY_RELEASE;
 x.build.features=['native-overlay-owner-text-priority-v1'];
 x.state.HBNF.candidate=R6_OWNER_PRIORITY_RELEASE;
 const before=JSON.stringify(x);
 const result=proposeNativeOverlayOnly({matrixInfo:x.info,matrixState:x.state,matrixBuild:x.build,
  auxInfo:x.auxInfo,auxState:x.auxState,auxConfig:x.auxConfig,
  ownerPriorityClear:true,overlay:{id:'hbnf-'+'b'.repeat(32),kind:'scoreboard',label:'GLOW',entries,ttlMs:12000}});
 assert.equal(result.eligible,false);
 assert.equal(result.mutationAuthorized,false);
 assert.equal(result.reason,'native_owner_priority_source_gate_not_admitted');
 assert.equal(JSON.stringify(x),before);
});

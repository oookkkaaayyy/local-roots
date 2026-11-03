import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectAux22DdpWithOffPwm,proposeNativeOverlayOnly} from '../candidate-source/matrix-overlay-safe-review.mjs';
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
 assert.equal(r.reason,'native_overlay_ps_minus1_renderer_not_proven');
 assert.equal(x.state.ps,-1);assert.deepEqual(x.state.seg.map(y=>y.fx),[142,142]);
 assert.equal(x.state.HBNF.matrixBrightness,0);
});
test('preset60 supported source path also omits all AUX/FX/brightness writes',()=>{
 const x=fixture();x.state.ps=60;const r=proposal(x);
 assert.equal(r.eligible,true);assert.deepEqual(Object.keys(r.payload),['HBNF']);
 assert.deepEqual(Object.keys(r.payload.HBNF),['overlay']);assert.equal(r.mutationAuthorized,false);
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

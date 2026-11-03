import test from 'node:test';
import assert from 'node:assert/strict';
import {proposeNativeOverlayOnly,inspectAux22DdpWithOffPwm} from '../staging/cart116-glow-v35-exact-review/candidate-source/matrix-overlay-safe-review.mjs';
import {proposeCanonicalOverlay} from '../staging/cart116-glow-v35-exact-review/candidate-source/glow-overlay-v1-handler.mjs';

const release='hbnf-cart2-phase2-r6-skins-readable-20261014';
const overlay={id:'hbnf-'+'a'.repeat(32),kind:'scoreboard',label:'GLOW',ttlMs:10000,entries:['F1 -2']};
function physical(matrixBrightness=0){return {
 matrixInfo:{mac:'704bca5b345c',ver:'16.0.1',leds:{count:534}},
 matrixBuild:{release_id:release},
 matrixState:{on:true,ps:-1,bri:255,seg:[
 {id:0,start:0,stop:512,fx:142,on:true,bri:255},
 {id:1,start:512,stop:534,fx:142,on:true,bri:255}],
 HBNF:{schema:'foundation-v1',candidate:release,effectId:142,
 matrixBrightness,auxBrightness:0,overlayId:null,
 energy:50,variation:37,motion:62,audioResponse:88,vibe:4}},
 auxInfo:{mac:'8c94df55c34c',ip:'192.168.77.11',leds:{count:24},live:true,lm:'DDP',lip:'192.168.77.10'},
 auxState:{lor:0,on:true,bri:0,seg:[{id:0,start:0,stop:22,on:true,fx:0,bri:0},{id:1,start:22,stop:23,on:false,fx:0,bri:0},{id:2,start:23,stop:24,on:false,fx:0,bri:0}]},
 auxConfig:{hw:{led:{ins:[{start:0,len:22,type:22,pin:[16]},{start:22,len:1,type:41,pin:[25]},{start:23,len:1,type:41,pin:[26]}]}},if:{live:{maxbri:false}}},
 ownerPriorityClear:true,overlay:structuredClone(overlay)
};}
const check=f=>proposeNativeOverlayOnly(f);
test('real ps=-1 native profile is source-qualified, but zero is INVISIBLE',()=>{
 const v=physical();const before=structuredClone(v),r=check(v);
 assert.equal(r.eligible,false);assert.equal(r.reason,'matrix_brightness_zero_invisible_scoreboard');assert.deepEqual(v,before);
});
test('nonzero user-selected value retains ps=-1 FX142, proposes ONLY HBNF.overlay, never authorizes',()=>{
 const v=physical(75),before=structuredClone(v),r=check(v);
 assert.equal(r.eligible,true);assert.equal(r.mutationAuthorized,false);assert.equal(r.reviewOnly,true);
 assert.equal(r.baseline.preset,-1);assert.equal(r.baseline.effectId,142);
 assert.deepEqual(Object.keys(r.payload),['HBNF']);assert.deepEqual(Object.keys(r.payload.HBNF),['overlay']);assert.deepEqual(v,before);
});
test('ps60 is not required or applied; other presets fail closed',()=>{
 const v=physical(75);v.matrixState.ps=60;assert.equal(check(v).eligible,true);
 v.matrixState.ps=61;assert.equal(check(v).eligible,false);
});
test('ps=-1 requires exact current compiled effect FX142; no legacy FX replacement',()=>{
 const v=physical(75);v.matrixState.HBNF.effectId=143;v.matrixState.seg.forEach(s=>s.fx=143);
 assert.equal(check(v).reason,'ps_minus1_requires_verified_r6_fx142');
});
test('FX mismatch refuses admission',()=>{
 const v=physical(75);v.matrixState.seg[0].fx=141;
 assert.equal(check(v).reason,'active_foundation_effect_unproven');
});
for(const [name,mutate] of [
 ['global bri',v=>v.matrixState.bri=128],['matrix segment bri',v=>v.matrixState.seg[0].bri=128],
 ['companion segment bri',v=>v.matrixState.seg[1].bri=128]])
 test('exact native brightness rejects '+name,()=>{
 const v=physical(75);mutate(v);assert.equal(check(v).reason,'native_wled_unity_brightness_unproven');
});
for(const value of [-1,256,'75',null])test('invalid native Matrix brightness '+String(value),()=>{
 const v=physical(75);v.matrixState.HBNF.matrixBrightness=value;
 assert.equal(check(v).reason,'native_matrix_brightness_unproven');
});
test('24 configured = 22 GPIO16 RGB + two separate OFF PWM; never normalized to 22',()=>{
 const v=physical(75);const p=inspectAux22DdpWithOffPwm(v);
 assert.equal(p.compatible,true);assert.equal(p.configuredLeds,24);assert.equal(p.ddpRgbPixels,22);assert.deepEqual(p.pwmOffPins,[25,26]);
});
test('PWM-on blocks Glow before any command',()=>{
 const v=physical(75);v.auxState.seg[2].on=true;assert.equal(check(v).reason,'aux_pwm_not_proven_off');
});
test('Owner priority cannot be preempted by Glow',()=>{
 const v=physical(75);v.ownerPriorityClear=false;assert.equal(check(v).reason,'owner_priority_not_cleared');
});
test('invalid Glow is refused before native invalid-overlay clear',()=>{
 const v=physical(75);v.overlay.entries=[''];assert.equal(check(v).reason,'glow_overlay_invalid');
});
function glowContext(now){
 return {desired:{revision:42,state:{power:'on',overlays:[{
 id:'glow-20261103-abcdef123456789',kind:'scoreboard',priority:20,
 payload:{label:'GLOW',entries:['F1 -2']},expiresAt:now+15000}]}},
 fence:{active:true,epoch:4,release_id:'review-only-not-admitted'}};
}
function snapshot(v){return {info:v.matrixInfo,state:v.matrixState,build:v.matrixBuild,auxInfo:v.auxInfo,auxState:v.auxState,auxConfig:v.auxConfig};}
test('real Controls Glow intent planner proposes ps=-1 overlay only, without mutation',async()=>{
 const now=1000000,v=physical(75),s=snapshot(v),copy=structuredClone(s);
 const result=await proposeCanonicalOverlay(glowContext(now),s,now);
 assert.equal(result.proposal.eligible,true);assert.equal(result.proposal.mutationAuthorized,false);
 assert.deepEqual(Object.keys(result.proposal.payload),['HBNF']);assert.equal(result.proposal.baseline.preset,-1);
 assert.deepEqual(s,copy);
});
test('real Controls Glow intent planner refuses invisible zero-brightness overlay',async()=>{
 const now=1000000;await assert.rejects(
 proposeCanonicalOverlay(glowContext(now),snapshot(physical(0)),now),/matrix_brightness_zero_invisible_scoreboard/);
});

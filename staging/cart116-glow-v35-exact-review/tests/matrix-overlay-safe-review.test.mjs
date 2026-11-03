import test from 'node:test';
import assert from 'node:assert/strict';
import {proposeNativeOverlayOnly} from '../matrix-overlay-safe-review.mjs';

const make = () => ({
  matrixInfo: {mac:'70:4b:ca:5b:34:5c',ver:'16.0.1',leds:{count:534}},
  matrixBuild: {release_id:'hbnf-cart2-phase2-r6-skins-readable-20261014'},
  matrixState: {on:true,ps:60,bri:219,
    HBNF:{schema:'foundation-v1',candidate:'hbnf-cart2-phase2-r6-skins-readable-20261014',effectId:223,
      motion:37,audioResponse:82,matrixBrightness:181,auxBrightness:106,overlayId:null,vibe:2},
    seg:[{id:0,start:0,stop:512,fx:223,on:true,bri:181},
         {id:1,start:512,stop:534,fx:223,on:true,bri:106}]},
  auxInfo:{mac:'8c:94:df:55:c3:4c',ip:'192.168.77.11',leds:{count:22},live:true,lm:'DDP',lip:'192.168.77.10'},
  auxState:{lor:0,bri:106,on:true}, ownerPriorityClear:true,
  overlay:{id:'hbnf-'+'a'.repeat(32),kind:'scoreboard',label:'GLOW',entries:['PLAYER -2'],ttlMs:15000}
});

test('no destructive WLED or AUX fields, no mutation permission',()=>{
  const input=make(), before=structuredClone(input), result=proposeNativeOverlayOnly(input);
  assert.equal(result.eligible,true);assert.equal(result.reviewOnly,true);
  assert.equal(result.mutationAuthorized,false);assert.deepEqual(input,before);
  assert.deepEqual(Object.keys(result.payload),['HBNF']);
  assert.deepEqual(Object.keys(result.payload.HBNF),['overlay']);
  assert.equal(result.payload.HBNF.overlay.label,'GLOW');
  for(const k of ['seg','fx','on','bri','ps','preset','pal','scene','vibe','motion','audioResponse','matrixBrightness','auxBrightness'])
    assert.equal(JSON.stringify(result.payload).includes('"'+k+'"'),false,k);
  assert.equal(Object.hasOwn(result.payload,'aux'),false);
});
for(const [name,modify,reason] of [
  ['owner priority',v=>v.ownerPriorityClear=false,'owner_priority_not_cleared'],
  ['unknown owner priority',v=>delete v.ownerPriorityClear,'owner_priority_not_cleared'],
  ['wrong matrix MAC',v=>v.matrixInfo.mac='00:00:00:00:00:00','target_or_topology_mismatch'],
  ['wrong AUX address',v=>v.auxInfo.ip='192.168.77.82','target_or_topology_mismatch'],
  ['reported AUX count 24 is not silently reclassified as 22',v=>v.auxInfo.leds.count=24,'target_or_topology_mismatch'],
  ['stale R6 identity',v=>v.matrixBuild.release_id='unverified','installed_release_not_verified'],
  ['not WOW MAX 60',v=>v.matrixState.ps=12,'wow_max_runtime_unproven'],
  ['not native HBNF effect',v=>v.matrixState.seg[0].fx=142,'active_foundation_effect_unproven'],
  ['extra segment',v=>v.matrixState.seg.push({id:2}),'segment_geometry_unproven'],
  ['existing overlay',v=>v.matrixState.HBNF.overlayId='owner-abcdef','existing_overlay_not_preemptible'],
  ['AUX wrong DDP source',v=>v.auxInfo.lip='192.168.77.82','aux_ddp_not_verified'],
  ['non-Glow overlay',v=>v.overlay.label='B9','glow_overlay_invalid'],
  ['invalid TTL',v=>v.overlay.ttlMs=50000,'glow_overlay_invalid']
]) test('fail closed: '+name,()=>{
  const input=make();modify(input);const result=proposeNativeOverlayOnly(input);
  assert.equal(result.eligible,false);assert.equal(result.mutationAuthorized,false);
  assert.equal(result.reason,reason);assert.equal(Object.hasOwn(result,'payload'),false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {stageGlowOverlayReadback,checkGlowOverlayReadback} from '../glow-overlay-ack-review.mjs';
const NOW=1793710000000;
function fixture(){return {
  matrixInfo:{mac:'704bca5b345c',ver:'16.0.1',leds:{count:534}},
  matrixBuild:{release_id:'hbnf-cart2-phase2-r6-skins-readable-20261014'},
  matrixState:{on:true,ps:60,bri:219,HBNF:{candidate:'hbnf-cart2-phase2-r6-skins-readable-20261014',schema:'foundation-v1',effectId:223,overlayId:null,vibe:2,energy:61,variation:44,motion:37,audioResponse:82,matrixBrightness:181,auxBrightness:106,palette:{mode:'legacy'}},seg:[{id:0,start:0,stop:512,fx:223,on:true,bri:181},{id:1,start:512,stop:534,fx:223,on:true,bri:106}]},
  auxInfo:{mac:'8c94df55c34c',ip:'192.168.77.11',leds:{count:22},live:true,lm:'DDP',lip:'192.168.77.10'},
  auxState:{on:true,bri:106,lor:0,seg:[{id:0,start:0,stop:22,fx:0,on:true,bri:106}]},
  ownerPriorityClear:true,overlay:{id:'hbnf-'+ 'a'.repeat(32),kind:'scoreboard',label:'GLOW',ttlMs:15000,entries:['A -1']}};}
function start(input=fixture()){return stageGlowOverlayReadback({input,capturedAt:NOW-500,now:NOW});}
function check(ticket,input,phase='apply_ack',now=NOW+1000){return checkGlowOverlayReadback({ticket,matrixState:input.matrixState,auxInfo:input.auxInfo,auxState:input.auxState,ownerPriorityClear:input.ownerPriorityClear,phase,now});}
test('overlay-only request and exact preimage is source-only, never an apply permit',()=>{
  const input=fixture();const before=structuredClone(input);const ticket=start(input);
  assert.equal(ticket.eligible,true);assert.equal(ticket.mutationAuthorized,false);assert.deepEqual(input,before);
  assert.deepEqual(Object.keys(ticket.payload),['HBNF']);assert.deepEqual(Object.keys(ticket.payload.HBNF),['overlay']);
  assert.equal(ticket.preimage.matrix.HBNF.energy,61);assert.equal(ticket.preimage.matrix.HBNF.variation,44);
  assert.equal(ticket.preimage.aux.configured,22);
});
test('matching overlay-ID is JSON-only ACK and preserves WOW MAX/brightness/audio/AUX',()=>{
  const input=fixture(),ticket=start(input);input.matrixState.HBNF.overlayId=ticket.expectedOverlayId;
  const result=check(ticket,input);assert.equal(result.eligible,true);
  assert.equal(result.jsonOverlayIdConfirmed,true);assert.equal(result.physicalDisplayConfirmed,false);
  assert.equal(result.mutationAuthorized,false);
});
test('missing overlay ID never confirms',()=>{const input=fixture();assert.equal(check(start(input),input).reason,'overlay_id_not_acknowledged');});
test('expired overlay ACK never confirms',()=>{const input=fixture(),ticket=start(input);input.matrixState.HBNF.overlayId=ticket.expectedOverlayId;assert.equal(check(ticket,input,'apply_ack',NOW+15000).reason,'overlay_challenge_ttl_elapsed');});
test('recovery requires removal and preservation, not merely elapsed TTL',()=>{const input=fixture(),ticket=start(input);input.matrixState.HBNF.overlayId=ticket.expectedOverlayId;assert.equal(check(ticket,input,'restore',NOW+16000).reason,'overlay_not_restored');input.matrixState.HBNF.overlayId=null;const r=check(ticket,input,'restore',NOW+16000);assert.equal(r.jsonRestorationConfirmed,true);assert.equal(r.physicalRestorationConfirmed,false);});
for(const [name,mutate] of [
 ['WOW MAX preset',x=>x.matrixState.ps=59],['matrix global brightness',x=>x.matrixState.bri=255],
 ['matrix original effect',x=>x.matrixState.seg[0].fx=142],['Matrix Vibe',x=>x.matrixState.HBNF.vibe=5],
 ['Energy',x=>x.matrixState.HBNF.energy=99],['Variation',x=>x.matrixState.HBNF.variation=0],
 ['Motion',x=>x.matrixState.HBNF.motion=5],['Audio',x=>x.matrixState.HBNF.audioResponse=0],
 ['AUX brightness',x=>x.auxState.bri=255],['AUX segment',x=>x.auxState.seg[0].stop=24],
 ['AUX configured 24',x=>x.auxInfo.leds.count=24],['DDP source',x=>x.auxInfo.lip='192.168.77.82']])
 test('fail closed on changed '+name,()=>{const input=fixture(),ticket=start(input);input.matrixState.HBNF.overlayId=ticket.expectedOverlayId;mutate(input);assert.equal(check(ticket,input).reason,'preimage_profile_or_aux_changed');});
test('Owner priority change preempts any prior Glow ticket',()=>{const input=fixture(),ticket=start(input);input.matrixState.HBNF.overlayId=ticket.expectedOverlayId;input.ownerPriorityClear=false;assert.equal(check(ticket,input).reason,'owner_priority_changed');});
test('stale preimage and 24-configured AUX both fail before proposal',()=>{const input=fixture();assert.equal(stageGlowOverlayReadback({input,now:NOW,capturedAt:NOW-5001}).reason,'fresh_authenticated_preimage_required');input.auxInfo.leds.count=24;assert.equal(start(input).reason,'target_or_topology_mismatch');});
test('untrusted ticket cannot confirm',()=>{const input=fixture(),ticket={...start(input),mutationAuthorized:true};input.matrixState.HBNF.overlayId=ticket.expectedOverlayId;assert.equal(check(ticket,input).reason,'untrusted_or_incomplete_review_ticket');});

test('premature restore readback cannot count as expiry restoration',()=>{const input=fixture(),ticket=start(input);assert.equal(check(ticket,input,'restore',NOW+1000).reason,'restore_ttl_not_elapsed');});

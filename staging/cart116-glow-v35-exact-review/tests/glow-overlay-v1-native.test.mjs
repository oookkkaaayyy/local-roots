import test from 'node:test';
import assert from 'node:assert/strict';
import {proposeCanonicalOverlay,runOverlayV1,overlayPreimageHash,captureOverlayProfile} from '../candidate-source/glow-overlay-v1-handler.mjs';
const NOW=1793710000000;
const UUID='c7bbad0a-c7bb-4d62-aead-7a90e844f409';
const RELEASE='hbnf-cart2-phase2-r6-skins-readable-20261014';
const id='glow-20261103-a987654321cdef-11';
function snapshot(){return {
 info:{mac:'70:4b:ca:5b:34:5c',ver:'16.0.1',leds:{count:534}},build:{release_id:RELEASE},
 state:{on:true,bri:198,ps:60,AudioReactive:{on:true},HBNF:{candidate:RELEASE,schema:'foundation-v1',effectId:223,vibe:2,energy:65,variation:37,motion:36,audioResponse:78,matrixBrightness:173,auxBrightness:100,palette:{mode:'legacy'},overlayId:null},seg:[{id:0,start:0,stop:512,fx:223,on:true,bri:173},{id:1,start:512,stop:534,fx:223,on:true,bri:100}]},
 auxInfo:{mac:'8c:94:df:55:c3:4c',ip:'192.168.77.11',leds:{count:22},live:true,lm:'DDP',lip:'192.168.77.10'},
 auxState:{on:true,bri:100,lor:0,seg:[{id:0,start:0,stop:22,fx:0,on:true,bri:100}]},
 auxConfig:{if:{live:{maxbri:false}}}
};}
function context(){return {desired:{revision:27,state:{power:'on',overlays:[{id,kind:'scoreboard',priority:20,expiresAt:NOW+15000,payload:{label:'GLOW',entries:['Team -1','Team E']}}]}},fence:{active:true,epoch:3,release_id:RELEASE}};}
const form=(s,extra={})=>({get(k){if(k==='relayId')return 'opal-hbnf-cart';if(Object.hasOwn(extra,k))return extra[k];if(Object.hasOwn(s,k))return {size:JSON.stringify(s[k]).length,text:async()=>JSON.stringify(s[k])};return null;}});
function db(c=context()){const calls=[];let applied=false,acked=false,restored=false;let storedHash, storedId;return {calls,rpc:async (op,args)=>{
 calls.push({op,args});if(op==='hbnf_cart_get_context')return {data:c};
 if(op==='hbnf_cart_glow_overlay_v1_issue'){storedHash=args.p_preimage_sha256;storedId=args.p_native_overlay_id;return {data:UUID};}
 if(op==='hbnf_cart_glow_overlay_v1_authorize'){const good=!applied&&args.p_preimage_sha256===storedHash&&args.p_native_overlay_id===storedId;applied=good||applied;return {data:good};}
 if(op==='hbnf_cart_glow_overlay_v1_ack'){const good=applied&&!acked&&args.p_preimage_sha256===storedHash&&args.p_native_overlay_id===storedId;acked=good||acked;return {data:good};}
 if(op==='hbnf_cart_glow_overlay_v1_restored'){const good=acked&&!restored&&args.p_preimage_sha256===storedHash&&args.p_observed_overlay_id===null;restored=good||restored;return {data:good};}
 return {error:{message:'unexpected rpc'}}; }};}
const send=(operation,db_,s=snapshot(),extra={},now=NOW,admitted=true)=>runOverlayV1({operation,db:db_,form:form(s,extra),relayId:'opal-hbnf-cart',admitted,now});

test('versioned request cannot be enabled by user payload or environment',async()=>{
 const d=db();const r=await send('overlay_v1_next',d,snapshot(),{nativeOverlayAdmitted:true},NOW,false);
 assert.equal(r.status,503);assert.equal(r.body.error,'native_overlay_v1_not_admitted');assert.deepEqual(d.calls,[]);
});
test('source-based overlay-only challenge, single authorize, ID-specific ACK and restored readback',async()=>{
 const d=db(),s=snapshot();const first=await send('overlay_v1_next',d,s,{},NOW);
 assert.equal(first.status,200);assert.equal(first.body.challengeId,UUID);assert.equal(first.body.applyAuthorized,false);
 assert.deepEqual(Object.keys(first.body.matrixPayload),['HBNF']);
 assert.deepEqual(Object.keys(first.body.matrixPayload.HBNF),['overlay']);
 const overlayId=first.body.overlayId;
 const apply=await send('overlay_v1_authorize',d,s,{challengeId:UUID,overlayId},NOW+400);
 assert.equal(apply.status,200);assert.equal(apply.body.status,'apply_once');
 assert.equal(apply.body.overlayId,overlayId);assert.equal(apply.body.auxWriteRequired,false);
 assert.ok(apply.body.matrixPayload.HBNF.overlay.ttlMs<first.body.matrixPayload.HBNF.overlay.ttlMs);
 assert.equal((await send('overlay_v1_authorize',d,s,{challengeId:UUID,overlayId},NOW+450)).status,409);
 s.state.HBNF.overlayId=overlayId;
 const ack=await send('overlay_v1_ack',d,s,{challengeId:UUID},NOW+500);
 assert.equal(ack.status,200);assert.equal(ack.body.matrixOverlayIdConfirmed,true);assert.equal(ack.body.physicalDisplayConfirmed,false);
 s.state.HBNF.overlayId=null;
 const restore=await send('overlay_v1_restored',d,s,{challengeId:UUID},NOW+22000);
 assert.equal(restore.status,200);assert.equal(restore.body.physicalRestorationConfirmed,false);
 assert.deepEqual(d.calls.map(x=>x.op),[
 'hbnf_cart_get_context','hbnf_cart_glow_overlay_v1_issue','hbnf_cart_get_context','hbnf_cart_glow_overlay_v1_authorize',
 'hbnf_cart_get_context','hbnf_cart_glow_overlay_v1_authorize','hbnf_cart_get_context','hbnf_cart_glow_overlay_v1_ack',
 'hbnf_cart_get_context','hbnf_cart_glow_overlay_v1_restored']);
});

test('stale configured AUX 24 fails closed before SQL issuance',async()=>{const d=db(),s=snapshot();s.auxInfo.leds.count=24;const r=await send('overlay_v1_next',d,s);assert.equal(r.status,422);assert.equal(r.body.error,'target_or_topology_mismatch');assert.equal(d.calls.length,1);});
test('Owner priority preempts issuance and cannot be bypassed with client approval',async()=>{const c=context();c.desired.state.overlays.push({id:'owner-msg',kind:'text',priority:60,expiresAt:NOW+8000});const d=db(c);const r=await send('overlay_v1_next',d);assert.equal(r.status,422);assert.equal(r.body.error,'owner_priority_or_glow_source_unavailable');assert.equal(d.calls.length,1);});
test('Glow never sends full-state or AUX writes',async()=>{const d=db();const r=await send('overlay_v1_next',d);const json=JSON.stringify(r.body.matrixPayload);for(const k of ['fx','seg','bri','ps','on','AudioReactive','scene','vibe','energy','variation','motion','audioResponse','aux']) assert.equal(json.includes('"'+k+'"'),false,k);});
for(const [name,change] of [
 ['wrong Matrix MAC',x=>x.info.mac='bad'],['preset changed',x=>x.state.ps=59],['effect identity mismatch',x=>x.state.seg[0].fx=142],['existing Owner overlay',x=>x.state.HBNF.overlayId='owner'],['AUX source drift',x=>x.auxInfo.lip='192.168.77.82'],['AUX forceMaxBrightness',x=>x.auxConfig.if.live.maxbri=true],['Matrix release wrong',x=>x.build.release_id='wrong']
]) test('before issuance fails closed: '+name,async()=>{const d=db(),s=snapshot();change(s);const r=await send('overlay_v1_next',d,s);assert.equal(r.status,422);assert.equal(d.calls.length,1);});
test('profile excludes only overlay ID; preserve audio, FX, tuning, AUX segments',async()=>{
 const a=snapshot(),b=snapshot();b.state.HBNF.overlayId='hbnf-'+ 'f'.repeat(32);
 assert.deepEqual(captureOverlayProfile(a),captureOverlayProfile(b));
 assert.equal(await overlayPreimageHash(a),await overlayPreimageHash(b));
 b.state.bri=255;assert.notEqual(await overlayPreimageHash(a),await overlayPreimageHash(b));
});
test('ACK after unrelated Matrix brightness drift rejects fingerprint',async()=>{const d=db(),s=snapshot();const first=await send('overlay_v1_next',d,s);const apply=await send('overlay_v1_authorize',d,s,{challengeId:UUID,overlayId:first.body.overlayId},NOW+100);assert.equal(apply.status,200);s.state.HBNF.overlayId=first.body.overlayId;s.state.bri=255;const a=await send('overlay_v1_ack',d,s,{challengeId:UUID});assert.equal(a.status,409);});
test('schema has independent four RPCs, one-use authorization, no legacy function replacement or score writes',async()=>{
 const fs=await import('node:fs');const sql=fs.readFileSync(new URL('../migrations/20261103_cart_glow_overlay_v1_REVIEW_ONLY.sql',import.meta.url),'utf8');
 assert.equal((sql.match(/CREATE FUNCTION public.hbnf_cart_glow_overlay_v1_/g)||[]).length,4);
 assert.ok(sql.includes('FOR UPDATE'));assert.ok(sql.includes('apply_authorized_at IS NOT NULL'));
 assert.ok(sql.includes("current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role'"));
 assert.ok(!/UPDATE\s+(?:public\.)?league_state/i.test(sql));
 assert.ok(!/CREATE OR REPLACE FUNCTION public\.hbnf_cart_matrix_relay_/.test(sql));
});

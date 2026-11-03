import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {overlayPreimageHash,runOverlayV1} from '../candidate-source/glow-overlay-v1-handler.mjs';

const NOW=1793710000000;
const REL='hbnf-cart2-phase2-r6-skins-readable-20261014';
const CID='glow-20261103-abc123def456ghi789';
const UUID='d61b8b87-28b1-4f54-928b-4c80ed24916d';
function snapshot(){return {
 info:{mac:'70:4b:ca:5b:34:5c',ver:'16.0.1',leds:{count:534}},
 state:{on:true,ps:60,bri:184,AudioReactive:{on:true,inputLevel:255},HBNF:{candidate:REL,schema:'foundation-v1',effectId:223,overlayId:null,scene:'course-flow',vibe:2,energy:17,variation:72,motion:51,audioResponse:94,matrixBrightness:184,auxBrightness:113,palette:{mode:'legacy',id:'hbnf-balanced'}},seg:[{id:0,start:0,stop:512,fx:223,on:true,bri:184},{id:1,start:512,stop:534,fx:223,on:true,bri:113}]},
 build:{release_id:REL},auxInfo:{mac:'8c:94:df:55:c3:4c',ip:'192.168.77.11',leds:{count:22},live:true,lm:'DDP',lip:'192.168.77.10'},
 auxState:{on:true,bri:113,lor:0,seg:[{id:0,start:0,stop:22,fx:0,on:true,bri:113}]},auxConfig:{if:{live:{maxbri:false}}}};
}
function context(){return {desired:{revision:37,state:{power:'on',overlays:[{id:CID,kind:'scoreboard',priority:20,expiresAt:NOW+15000,payload:{label:'GLOW',entries:['A -1','B E']}}]}},fence:{epoch:8,active:true,release_id:REL}};}
function form(s=snapshot(),values={}){
 const f=new FormData();f.set('relayId','opal-hbnf-cart');
 for(const [key,value] of Object.entries(s))f.set(key,new File([JSON.stringify(value)],key+'.json',{type:'application/json'}));
 for(const [k,v] of Object.entries(values))f.set(k,v);
 return f;
}
class FakeRPC{
 constructor(c=context()){this.ctx=c;this.calls=[];this.challenge=null;this.fail=new Set();}
 async rpc(name,args){this.calls.push({name,args});if(this.fail.has(name))return {error:{code:'XX000'}};
  if(name==='hbnf_cart_get_context')return {data:structuredClone(this.ctx)};
  if(name.endsWith('_issue')){if(this.challenge&&!this.challenge.restored)return {error:{code:'23505'}};
    this.challenge={...args,authorized:false,acked:false,restored:false};return {data:UUID};}
  const p=this.challenge;if(!p)return {data:false};
  if(name.endsWith('_authorize')){const allowed=!p.authorized&&p.p_native_overlay_id===args.p_native_overlay_id&&p.p_preimage_sha256===args.p_preimage_sha256;
    if(allowed)p.authorized=true;return {data:allowed};}
  if(name.endsWith('_ack')){const ok=p.authorized&&!p.acked&&p.p_native_overlay_id===args.p_native_overlay_id&&p.p_preimage_sha256===args.p_preimage_sha256;
    if(ok)p.acked=true;return {data:ok};}
  if(name.endsWith('_restored')){const ok=p.acked&&!p.restored&&args.p_preimage_sha256===p.p_preimage_sha256&&args.p_observed_overlay_id===null;
    if(ok)p.restored=true;return {data:ok};}
  return {error:{code:'UNEXPECTED'}};
 }
}
const run=(db,op,s=snapshot(),extra={},time=NOW,admitted=true)=>runOverlayV1({db,operation:op,form:form(s,extra),relayId:'opal-hbnf-cart',now:time,admitted});

test('wire-level multipart FormData + File round-trip uses versioned RPC after source & topology preflight',async()=>{
 const d=new FakeRPC(),s=snapshot();const first=await run(d,'overlay_v1_next',s);assert.equal(first.status,200);
 assert.equal(d.challenge.p_desired_revision,37);assert.equal(d.challenge.p_fence_epoch,8);
 assert.equal(d.challenge.p_ttl_ms,15000);assert.equal(d.challenge.p_preimage_sha256,await overlayPreimageHash(s));
 assert.deepEqual(Object.keys(first.body.matrixPayload),['HBNF']);
 const auth=await run(d,'overlay_v1_authorize',s,{challengeId:UUID,overlayId:first.body.overlayId},NOW+200);
 assert.equal(auth.status,200);assert.equal(d.challenge.authorized,true);
 s.state.HBNF.overlayId=first.body.overlayId;
 const ack=await run(d,'overlay_v1_ack',s,{challengeId:UUID},NOW+500);
 assert.equal(ack.status,200);assert.equal(ack.body.matrixOverlayIdConfirmed,true);assert.equal(ack.body.physicalDisplayConfirmed,false);
 s.state.HBNF.overlayId=null;
 const restore=await run(d,'overlay_v1_restored',s,{challengeId:UUID},NOW+21000);
 assert.equal(restore.status,200);assert.equal(restore.body.physicalRestorationConfirmed,false);
 assert.equal(d.challenge.restored,true);
});
test('hard false admission rejects even well-formed file upload before DB access',async()=>{
 const d=new FakeRPC(),r=await run(d,'overlay_v1_next',snapshot(),{},NOW,false);
 assert.equal(r.status,503);assert.deepEqual(d.calls,[]);
});
test('same challenge cannot authorize, ACK or claim restoration twice',async()=>{
 const d=new FakeRPC(),s=snapshot();const first=await run(d,'overlay_v1_next');const extra={challengeId:UUID,overlayId:first.body.overlayId};
 assert.equal((await run(d,'overlay_v1_authorize',s,extra)).status,200);
 assert.equal((await run(d,'overlay_v1_authorize',s,extra)).status,409);
 s.state.HBNF.overlayId=first.body.overlayId;
 assert.equal((await run(d,'overlay_v1_ack',s,{challengeId:UUID})).status,200);
 assert.equal((await run(d,'overlay_v1_ack',s,{challengeId:UUID})).status,409);
 s.state.HBNF.overlayId=null;
 assert.equal((await run(d,'overlay_v1_restored',s,{challengeId:UUID},NOW+21000)).status,200);
 assert.equal((await run(d,'overlay_v1_restored',s,{challengeId:UUID},NOW+21000)).status,409);
});
test('live desired revision/Owner change before authorization prevents one-use consumption',async()=>{
 const d=new FakeRPC(),first=await run(d,'overlay_v1_next');
 d.ctx.desired.revision+=1;d.ctx.desired.state.overlays.push({id:'owner',priority:80,expiresAt:NOW+10000});
 const out=await run(d,'overlay_v1_authorize',snapshot(),{challengeId:UUID,overlayId:first.body.overlayId},NOW+100);
 assert.equal(out.status,422);assert.equal(d.challenge.authorized,false);
});
test('AUX DDP config or Matrix preset drift fails before apply RPC',async()=>{
 const d=new FakeRPC(),first=await run(d,'overlay_v1_next');
 const s=snapshot();s.auxConfig.if.live.maxbri=true;
 assert.equal((await run(d,'overlay_v1_authorize',s,{challengeId:UUID,overlayId:first.body.overlayId})).status,422);
 assert.equal(d.challenge.authorized,false);
 s.auxConfig.if.live.maxbri=false;s.state.ps=59;
 assert.equal((await run(d,'overlay_v1_authorize',s,{challengeId:UUID,overlayId:first.body.overlayId})).status,422);
});
test('Post-WLED Owner tune drift rejects exact fingerprint while physical outcome remains unknown',async()=>{
 const d=new FakeRPC(),s=snapshot();const next=await run(d,'overlay_v1_next');
 assert.equal((await run(d,'overlay_v1_authorize',s,{challengeId:UUID,overlayId:next.body.overlayId})).status,200);
 s.state.HBNF.overlayId=next.body.overlayId;s.state.HBNF.energy=80;
 assert.equal((await run(d,'overlay_v1_ack',s,{challengeId:UUID})).status,409);
 assert.equal(d.challenge.acked,false);
});
test('Only ID-free readback with identical AUX and profile can claim restoration',async()=>{
 const d=new FakeRPC(),s=snapshot();const next=await run(d,'overlay_v1_next');
 await run(d,'overlay_v1_authorize',s,{challengeId:UUID,overlayId:next.body.overlayId});
 s.state.HBNF.overlayId=next.body.overlayId;await run(d,'overlay_v1_ack',s,{challengeId:UUID});
 assert.equal((await run(d,'overlay_v1_restored',s,{challengeId:UUID},NOW+22000)).status,409);
 s.state.HBNF.overlayId=null;s.auxState.bri=255;
 assert.equal((await run(d,'overlay_v1_restored',s,{challengeId:UUID},NOW+22000)).status,409);
 assert.equal(d.challenge.restored,false);
});
test('Malformed multipart rejects without challenge issuance',async()=>{
 const d=new FakeRPC();const f=form();f.set('state',new File([new Uint8Array(100001)],'huge.json'));
 const res=await runOverlayV1({db:d,operation:'overlay_v1_next',form:f,relayId:'opal-hbnf-cart',admitted:true,now:NOW});
 assert.equal(res.status,422);assert.equal(d.calls.length,0);
});
test('Backend RPC outage fails closed before a device-capability response',async()=>{
 const d=new FakeRPC();d.fail.add('hbnf_cart_glow_overlay_v1_issue');const res=await run(d,'overlay_v1_next');
 assert.equal(res.status,409);assert.equal(res.body.matrixPayload,undefined);
});
// SQL is not executed against production. Static assertions anchor design to
// source, with concurrent model checks above. True PostgreSQL transaction
// tests remain a separately identified native runner gate.
test('migration contract: one unresolved challenge per Cart, service-only RPC, canonical fence and guarded inverse',()=>{
 const sql=fs.readFileSync(new URL('../migrations/20261103_cart_glow_overlay_v1_REVIEW_ONLY.sql',import.meta.url),'utf8');
 const down=fs.readFileSync(new URL('../migrations/20261103_cart_glow_overlay_v1_REVIEW_ONLY.down.sql',import.meta.url),'utf8');
 assert.match(sql,/CREATE UNIQUE INDEX cart_glow_overlay_v1_open_cart_idx[\s\S]*?WHERE restored_at IS NULL/);
 assert.equal((sql.match(/PERFORM pg_catalog\.pg_advisory_xact_lock/g)||[]).length,4);
 assert.equal((sql.match(/CREATE FUNCTION public\.hbnf_cart_glow_overlay_v1_/g)||[]).length,4);
 assert.equal((sql.match(/GRANT EXECUTE ON FUNCTION public\.hbnf_cart_glow_overlay_v1_/g)||[]).length,4);
 assert.match(sql,/apply_authorized_at IS NOT NULL/);assert.match(sql,/jsonb_typeof\(v_d\.state->'overlays'\)/);
 assert.match(down,/unresolved_overlay_v1_challenge_requires_device_recovery/);
 assert.doesNotMatch(sql+down,/\b(?:UPDATE|INSERT INTO|DELETE FROM)\s+(?:public\.)?league_state\b/i);
 assert.doesNotMatch(sql+down,/\b(?:CREATE OR REPLACE|DROP) FUNCTION public\.hbnf_cart_matrix_relay_/i);
});

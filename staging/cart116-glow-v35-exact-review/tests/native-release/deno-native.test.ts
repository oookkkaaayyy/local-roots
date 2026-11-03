// Real Deno V2 APIs; isolated fixture only. No prod credentials/network/devices.
import { runOverlayV1, overlayPreimageHash, proposeCanonicalOverlay } from '../../candidate-source/glow-overlay-v1-handler.mjs';
import { strict as assert } from 'node:assert';

const RELEASE='hbnf-cart2-phase2-r6-skins-readable-20261014';
const NOW=Date.now();
const CHALLENGE='01234567-89ab-4cde-8f01-23456789abcd';
function snapshot(){return {
 info:{mac:'70:4b:ca:5b:34:5c',ver:'16.0.1',leds:{count:534}},
 state:{on:true,ps:60,bri:168,AudioReactive:{on:true},seg:[{id:0,start:0,stop:512,fx:221,on:true,bri:168,pal:5},{id:1,start:512,stop:534,fx:221,on:true,bri:168,pal:5}],HBNF:{candidate:RELEASE,schema:'foundation-v1',effectId:221,overlayId:null,energy:70,variation:65,motion:60,audioResponse:90,matrixBrightness:168,auxBrightness:160,vibe:2,scene:'course-flow',palette:{mode:'wled',index:5}}},
 build:{release_id:RELEASE},
 auxInfo:{mac:'8c:94:df:55:c3:4c',ip:'192.168.77.11',leds:{count:22},live:true,lm:'DDP',lip:'192.168.77.10'},
 auxState:{on:true,bri:160,lor:0,seg:[{id:0,start:0,stop:22,fx:0,on:true}]},
 auxConfig:{if:{live:{maxbri:false}}}
};}
function context(){return {desired:{revision:7,state:{power:'on',overlays:[{id:'glow-20261103-nativecase',kind:'scoreboard',priority:20,expiresAt:NOW+18000,payload:{label:'GLOW',entries:['Player A -2']}}]}},fence:{active:true,epoch:3,release_id:'test-release-123'}};}
function form(s=snapshot(),extra={}){
 const f=new FormData();f.append('relayId','opal-hbnf-cart');
 for(const [k,v] of Object.entries(s)){f.append(k,new File([JSON.stringify(v)],`${k}.json`,{type:'application/json'}));}
 for(const [k,v] of Object.entries(extra))f.append(k,String(v));
 return f;
}
function db(ctx=context()){
 const calls=[];
 return {calls,async rpc(name,args){calls.push({name,args});if(name==='hbnf_cart_get_context')return {data:ctx};if(name.endsWith('_issue'))return {data:CHALLENGE};if(name.endsWith('_authorize')||name.endsWith('_ack')||name.endsWith('_restored'))return {data:true};throw Error('unexpected RPC '+name);}};
}
const call=(operation,opts={})=>runOverlayV1({operation,form:opts.form??form(snapshot(),{challengeId:CHALLENGE}),db:opts.db??db(),relayId:'opal-hbnf-cart',admitted:opts.admitted??true,now:NOW});

Deno.test('Deno native WebCrypto preimage fingerprint stable excluding native overlayId',async()=>{
 const s=snapshot(),h=await overlayPreimageHash(s);assert.match(h,/^[a-f0-9]{64}$/);
 s.state.HBNF.overlayId='hbnf-0123456789abcdef0123456789abcdef';
 assert.equal(await overlayPreimageHash(s),h);
 s.state.HBNF.energy++;assert.notEqual(await overlayPreimageHash(s),h);
});
Deno.test('Deno actual Web FormData issue -> SQL RPC with native overlay-only payload',async()=>{
 const d=db(),res=await call('overlay_v1_next',{db:d});assert.equal(res.status,200);assert.equal(res.body.challengeId,CHALLENGE);
 const p=res.body.matrixPayload;assert.deepEqual(Object.keys(p),['HBNF']);assert.deepEqual(Object.keys(p.HBNF),['overlay']);
 assert.equal(p.HBNF.overlay.label,'GLOW');assert.equal(d.calls.filter(c=>c.name.endsWith('_issue')).length,1);
});
Deno.test('Deno native authorize binds identical ID and stable preimage',async()=>{
 const d=db(),p=await proposeCanonicalOverlay(context(),snapshot(),NOW);
 const r=await call('overlay_v1_authorize',{db:d,form:form(snapshot(),{challengeId:CHALLENGE,overlayId:p.proposal.expectedOverlayId})});
 assert.equal(r.status,200);assert.equal(r.body.auxWriteRequired,false);assert.equal(d.calls.find(c=>c.name.endsWith('_authorize')).args.p_preimage_sha256,p.preimageHash);
});
Deno.test('admission false blocks all RPCs and sends',async()=>{const d=db(),r=await call('overlay_v1_next',{db:d,admitted:false});assert.equal(r.status,503);assert.equal(d.calls.length,0);});
Deno.test('Owner higher-priority overlay blocks issuance in actual Deno',async()=>{
 const c=context();c.desired.state.overlays.push({id:'owner',priority:60,expiresAt:NOW+10000});const d=db(c),r=await call('overlay_v1_next',{db:d});assert.equal(r.status,422);assert.equal(d.calls.some(x=>x.name.endsWith('_issue')),false);
});
Deno.test('AUX 24 configured rejects native operation, no issue',async()=>{
 const s=snapshot();s.auxInfo.leds.count=24;const d=db(),r=await call('overlay_v1_next',{db:d,form:form(s,{challengeId:CHALLENGE})});assert.equal(r.status,422);assert.equal(d.calls.some(x=>x.name.endsWith('_issue')),false);
});
Deno.test('ACK accepts only observed native overlay ID and unchanged preimage',async()=>{
 const s=snapshot(),p=await proposeCanonicalOverlay(context(),s,NOW);s.state.HBNF.overlayId=p.proposal.expectedOverlayId;
 const d=db(),r=await call('overlay_v1_ack',{db:d,form:form(s,{challengeId:CHALLENGE})});assert.equal(r.status,200);
 assert.equal(d.calls.find(c=>c.name.endsWith('_ack')).args.p_preimage_sha256,p.preimageHash);
});
Deno.test('Post-TTL restore never claims physical device visibility',async()=>{
 const d=db(),r=await call('overlay_v1_restored',{db:d});assert.equal(r.status,200);assert.equal(r.body.physicalRestorationConfirmed,false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname,resolve,join } from 'node:path';
import {fileURLToPath} from 'node:url';
import {proposeNativeOverlayOnly,inspectAux22DdpWithOffPwm} from '../candidate-source/matrix-overlay-safe-review.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const hash=p=>createHash('sha256').update(readFileSync(join(root,p))).digest('hex');
const owner='opal/owner-v1201-7target/owner-pwa/';
const transport='opal/owner-v1201-7target/mission-control-local/local-transport.js';
const release='hbnf-cart2-phase2-r6-skins-readable-20261014';
function fresh(brightness=0){return {
 matrixInfo:{mac:'704bca5b345c',ver:'16.0.1',leds:{count:534}},
 matrixBuild:{release_id:release},
 matrixState:{on:true,ps:-1,bri:255,HBNF:{candidate:release,schema:'foundation-v1',effectId:142,overlayId:null,matrixBrightness:brightness,auxBrightness:0,motion:10,energy:15,variation:9,audioResponse:80},seg:[{id:0,start:0,stop:512,on:true,fx:142,bri:255},{id:1,start:512,stop:534,on:true,fx:142,bri:255}]},
 auxInfo:{ip:'192.168.77.11',mac:'8c94df55c34c',leds:{count:24},live:true,lm:'DDP',lip:'192.168.77.10'},
 auxState:{lor:0,seg:[{id:0,start:0,stop:22,on:true},{id:1,start:22,stop:23,on:false},{id:2,start:23,stop:24,on:false}]},
 auxConfig:{if:{live:{maxbri:false}},hw:{led:{ins:[{start:0,len:22,type:22,pin:[16]},{start:22,len:1,type:41,pin:[25]},{start:23,len:1,type:41,pin:[26]}]}}},
 ownerPriorityClear:true,overlay:{kind:'scoreboard',label:'GLOW',id:'hbnf-'+'a'.repeat(32),entries:['A -2'],ttlMs:12000}
};}
test('Track B accepted direct module has exact hashed transport query with no new target',()=>{
 assert.equal(hash(transport),'b48f5d7a4b3ea850307b13596857d753d2ff2ee4b9991b859e66b41d0338b37a');
 const s=read(owner+'hbnf-cart-local.js');
 assert.equal((s.match(/local-transport\.js\?v=b48f5d7a4b3ea850/g)||[]).length,1);
 assert.doesNotMatch(s,/import\("http:\/\/192\.168\.77\.1\/mission-control-local\/local-transport\.js"\)/);
 assert.match(s,/this\.opalDirect = options\.opalDirect === true/);
 assert.equal(hash(owner+'hbnf-cart-local.js'),'f2bec69f5d14760d6910c06a57d40288070171814c5affbfe2a9b4baa566e419');
});
test('all 17 Owner served-asset sums retain B source SHA and only local module changes',()=>{
 const bytes=read(owner+'.hbnf-payload.sha256');
 assert.equal(hash(owner+'.hbnf-payload.sha256'),'a32f5a4e25603116400c09eacee0cfd87cd1f8d1d5c22421b1a9d39b20d10c9e');
 const rows=bytes.trim().split('\n');assert.equal(rows.length,17);
 assert.ok(rows.includes(hash(owner+'hbnf-cart-local.js')+'  hbnf-cart-local.js'));
 assert.equal(new Set(rows.map(x=>x.split('  ')[1])).size,17);
});
test('native R6 ps=-1 FX142 and 22 RGB plus two OFF PWM are source-qualified topology, not device actuation',()=>{
 const x=fresh(0);
 assert.deepEqual(x.matrixState.seg.map(s=>s.fx),[142,142]);
 const r=inspectAux22DdpWithOffPwm(x);
 assert.equal(r.compatible,true);assert.equal(r.ddpRgbPixels,22);assert.deepEqual(r.pwmOffPins,[25,26]);
 assert.equal(proposeNativeOverlayOnly(x).reason,'matrix_brightness_zero_invisible_scoreboard');
 assert.equal(x.matrixState.ps,-1);assert.equal(x.matrixState.HBNF.matrixBrightness,0);
});
test('normally selected nonzero brightness is still no authorization because installed R6 can override Owner text',()=>{
 const x=fresh(70);const before=JSON.stringify(x);
 const r=proposeNativeOverlayOnly(x);assert.equal(r.eligible,false);
 assert.equal(r.reason,'installed_r6_owner_text_priority_not_enforced');
 assert.equal(JSON.stringify(x),before);
 assert.equal(r.mutationAuthorized,false);
});
test('R6 unity, FX142, native AUX PWM safety and Owner preflight independently fail closed',()=>{
 const x=fresh(90);
 x.matrixState.seg[1].bri=100;assert.equal(proposeNativeOverlayOnly(x).reason,'native_wled_unity_brightness_unproven');
 x.matrixState.seg[1].bri=255;x.matrixState.seg[0].fx=141;
 assert.equal(proposeNativeOverlayOnly(x).reason,'active_foundation_effect_unproven');
 x.matrixState.seg[0].fx=142;x.auxState.seg[2].on=true;
 assert.equal(proposeNativeOverlayOnly(x).reason,'aux_pwm_not_proven_off');
 x.auxState.seg[2].on=false;x.ownerPriorityClear=false;
 assert.equal(proposeNativeOverlayOnly(x).reason,'owner_priority_not_cleared');
});
test('Opal helper retains TWO build-time false gates, ps=-1+FX142 and no AUX writes',()=>{
 const s=read('opal/hbnf-glow-overlay-v1.sh');
 assert.match(s,/HBNF_OVERLAY_V1_SOURCE_ADMITTED=false/);
 assert.match(s,/HBNF_NATIVE_OWNER_TEXT_PRIORITY_ADMITTED=false/);
 assert.match(s,/60\|-1\) : ;;/);
 assert.match(s,/matrix_brightness.*jsonfilter/);
 assert.match(s,/\$matrix_brightness.*-ge 1/);
 assert.match(s,/\$ps.*!= -1/);
 assert.match(s,/ps.*!= -1.*fx/);
 assert.doesNotMatch(s,/(?:curl|wget|http_post).*192\.168\.77\.11\/json\/state/);
 assert.ok(s.includes('{"HBNF":{"overlay":%s}}'));
});
test('procd cannot start after only service+overlay gates change; native Owner priority gate is separate',()=>{
 const init=read('opal/new-service/etc/init.d/hbnf-cart-glow-bridge');
 assert.match(init,/HBNF_NATIVE_OWNER_TEXT_PRIORITY_ADMITTED=true/);
 assert.match(init,/procd_set_param command "\$BIN"/);
 const b=read('opal/new-service/usr/libexec/hbnf-cart-glow-bridge');
 assert.match(b,/HBNF_CART_GLOW_SOURCE_ADMITTED=false/);
 assert.match(b,/one-process/);
 assert.doesNotMatch(b,/\b(?:uci set|sysupgrade|reboot|mosquitto_pub)\b/);
});
test('SAME 11-target TSV exact byte identities and seven Owner targets; generated secret config absent',()=>{
 const rows=read('release/TARGETS.PENDING.tsv').trim().split('\n').map(x=>x.split('\t'));
 assert.equal(rows.length,11);assert.equal(rows.filter(x=>x[0].startsWith('/www/')).length,7);
 const file=rows.find(x=>x[0].endsWith('/hbnf-cart-local.js'));
 assert.equal(file[2],hash(owner+'hbnf-cart-local.js'));
 const sums=rows.find(x=>x[0].endsWith('/.hbnf-payload.sha256'));
 assert.equal(sums[2],hash(owner+'.hbnf-payload.sha256'));
 const helper=rows.find(x=>x[0]==='/usr/lib/hbnf-glow-overlay-v1.sh');
 assert.equal(helper[2],hash('opal/hbnf-glow-overlay-v1.sh'));
 const init=rows.find(x=>x[0]==='/etc/init.d/hbnf-cart-glow-bridge');
 assert.equal(init[2],hash('opal/new-service/etc/init.d/hbnf-cart-glow-bridge'));
 assert.equal(rows.some(x=>x[0]==='/etc/hbnf-cart-glow-bridge.conf'),false);
});

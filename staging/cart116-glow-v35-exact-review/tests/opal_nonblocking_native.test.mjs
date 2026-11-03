import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

// Real BusyBox ash executes the reviewed Opal source with *only fake* curl,
// jsonfilter and sleep. The source's hard FALSE activation is changed only in
// a disposable sandbox copy; no production endpoint/device is contacted.
const source=fs.readFileSync(new URL('./hbnf-glow-overlay-v1.sh',import.meta.url),'utf8');
const REL='hbnf-cart2-phase2-r6-skins-readable-20261014';
const OVERLAY='hbnf-'+'a'.repeat(32);
const ID='ab12cd34-1234-4234-8234-123456abcdef';
const fakeJsonfilter=String.raw`#!/usr/bin/env node
const fs=require('fs'),a=process.argv.slice(2),file=a[a.indexOf('-i')+1],query=a[a.indexOf('-e')+1];
try {let value=JSON.parse(fs.readFileSync(file,'utf8'));
for(const key of query.slice(2).split('.')) {if (key) value=value?.[key];}
if(value===undefined||value===null)process.exit(1);
process.stdout.write(typeof value==='object'?JSON.stringify(value):String(value));}
catch(e){process.exit(1);}
`;
const fakeCurl=String.raw`#!/usr/bin/env node
const fs=require('fs'),a=process.argv.slice(2),statePath=process.env.HBNF_FAKE;
const data=JSON.parse(fs.readFileSync(statePath,'utf8'));
const outIndex=a.indexOf('-o'),out=outIndex<0?null:a[outIndex+1];
const url=a.find(x=>/^https?:\/\//.test(x))||'';
const form=a.filter((x,i)=>a[i-1]==='-F');
const operation=(form.find(s=>s.startsWith('op='))||'').slice(3);
const writeArg=a.find(x=>x.startsWith('@')&&a[a.indexOf(x)-1]==='--data-binary');
let body={},status=200,kind='GET',fail=false;
if(url.endsWith('192.168.77.10/json/si')) body={info:data.matrixInfo,state:data.matrixState};
else if(url.endsWith('192.168.77.10/hbnf/build.json')) body={release_id:data.release};
else if(url.endsWith('192.168.77.11/json/si')) body={info:data.auxInfo,state:data.auxState};
else if(url.endsWith('192.168.77.11/json/cfg')) body=data.auxConfig;
else if(url.endsWith('192.168.77.10/json/state')){
 kind='MATRIX_WRITE';
 const raw=fs.readFileSync(writeArg.slice(1),'utf8');body={};
 const payload=JSON.parse(raw);data.writePayloads.push(payload);
 if(!data.modes.includes('post_fail'))data.matrixState.HBNF.overlayId=payload.HBNF?.overlay?.id||null;
 if(data.modes.includes('post_fail'))fail=true;
}
else if(url.includes('supabase.co/functions/v1/hbnf-cart-control')){
 kind=operation;
 if(operation==='overlay_v1_next')body={protocol:'hbnf-native-glow-overlay-v1',challengeId:'ab12cd34-1234-4234-8234-123456abcdef',overlayId:'hbnf-'+ 'a'.repeat(32),matrixPayload:{HBNF:{overlay:{id:'hbnf-'+'a'.repeat(32),kind:'scoreboard',label:'GLOW',entries:['Team -1'],ttlMs:9000}}}};
 else if(operation==='overlay_v1_authorize'){
  if(data.modes.includes('owner_denied')){status=409;body={error:'owner_priority_changed'};}
  else body={status:'apply_once',overlayId:'hbnf-'+ 'a'.repeat(32),auxWriteRequired:false,matrixPayload:{HBNF:{overlay:{id:'hbnf-'+ 'a'.repeat(32),kind:'scoreboard',label:data.modes.includes('bad_payload')?'OTHER':'GLOW',entries:['Team -1'],ttlMs:9000}}}};
 }
 else if(operation==='overlay_v1_ack')body={matrixOverlayIdConfirmed:data.matrixState.HBNF.overlayId==='hbnf-'+'a'.repeat(32)&&!data.modes.includes('bad_ack')};
 else if(operation==='overlay_v1_restored')body={matrixOriginalProfileConfirmed:data.matrixState.HBNF.overlayId===null&&!data.modes.includes('bad_restore')};
 else {status=400;body={error:'unexpected_operation'};}
}
else {data.unexpectedUrls.push(url);fail=true;}
data.events.push({kind,url,status});
fs.writeFileSync(statePath,JSON.stringify(data));
if(out&&out!=='/dev/null')fs.writeFileSync(out,JSON.stringify(body));
if(a.includes('-w'))process.stdout.write(String(status));
if(fail)process.exit(22);
`;
const fakeDate=String.raw`#!/usr/bin/env node
const fs=require('fs'),d=JSON.parse(fs.readFileSync(process.env.HBNF_FAKE,'utf8'));
if(process.argv[2]!=='+%s')process.exit(1);
process.stdout.write(String(d.nowS));
`;
function harness(modes=[]){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cart116-native-ash-'));
 const bin=path.join(dir,'bin');fs.mkdirSync(bin);
 for(const [name,body] of [['curl',fakeCurl],['jsonfilter',fakeJsonfilter],['date',fakeDate]]){
   const p=path.join(bin,name);fs.writeFileSync(p,body,{mode:0o755});fs.chmodSync(p,0o755);
 }
 const conf=path.join(dir,'relay.conf'),tmp=path.join(dir,'tmp'),lockout=path.join(dir,'glow.lock'),legacy=path.join(dir,'legacy.lock');
 fs.writeFileSync(conf,`RELAY_ID=opal-hbnf-cart\nRELAY_TOKEN=${'A'.repeat(64)}\nRELAY_API_KEY=${'B'.repeat(40)}\nSUPABASE_RELAY_URL=https://phcpbvuqibyarpfrftgx.supabase.co/functions/v1/hbnf-cart-control\n`,{mode:0o600});
 fs.chmodSync(conf,0o600);
 const sim=path.join(dir,'sim.json');
 const fixture={modes,nowS:1000,release:REL,matrixInfo:{mac:'70:4b:ca:5b:34:5c',ver:'16.0.1',leds:{count:534}},matrixState:{on:true,bri:198,ps:60,AudioReactive:{on:true},HBNF:{candidate:REL,schema:'foundation-v1',effectId:223,overlayId:null,vibe:1},seg:[{id:0,start:0,stop:512,fx:223,on:true,bri:173},{id:1,start:512,stop:534,fx:223,on:true,bri:100}]},auxInfo:{mac:'8c:94:df:55:c3:4c',ip:'192.168.77.11',leds:{count:modes.includes('aux_24')?24:22},live:true,lm:'DDP',lip:'192.168.77.10'},auxState:{on:true,bri:100,lor:0,seg:[{id:0,fx:1}]},auxConfig:{if:{live:{maxbri:false}}},events:[],writePayloads:[],unexpectedUrls:[]};
 fs.writeFileSync(sim,JSON.stringify(fixture));
 const script=path.join(dir,'run.sh');
 let txt=source.replace('HBNF_OVERLAY_V1_SOURCE_ADMITTED=false','HBNF_OVERLAY_V1_SOURCE_ADMITTED=true');
 txt=txt.replaceAll('/etc/hbnf-matrix-relay.conf',conf).replaceAll('/etc/hbnf-matrix-relay.partial-failure',legacy).replaceAll('/etc/hbnf-glow-overlay-v1.partial-failure',lockout).replaceAll('/tmp/hbnf-glow-overlay-v1',tmp);
 fs.writeFileSync(script,txt,{mode:0o700});
 const run=()=>spawnSync('/usr/bin/busybox',['ash',script],{env:{...process.env,PATH:bin+':'+process.env.PATH,HBNF_FAKE:sim},encoding:'utf8',timeout:15000});
 const read=()=>JSON.parse(fs.readFileSync(sim,'utf8'));
 const advance=(seconds)=>{const d=read();d.nowS+=seconds;
 if(!d.modes.includes('no_expiry'))d.matrixState.HBNF.overlayId=null;
 fs.writeFileSync(sim,JSON.stringify(d));};
 return {dir,bin,conf,tmp,lockout,legacy,script,run,read,advance,cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};
}


test('unchanged shipped source denies admission without one device or backend call',()=>{
 const h=harness();try {const r=spawnSync('/usr/bin/busybox',['ash','-c',source],{env:{...process.env,PATH:h.bin+':'+process.env.PATH,HBNF_FAKE:path.join(h.dir,'sim.json')},encoding:'utf8'});
 assert.equal(r.status,0);assert.equal(h.read().events.length,0);
 }finally{h.cleanup();}
});
test('one-loop GLOW: apply+ACK returns without sleep; later TTL restore releases lockout, never AUX',()=>{
 const h=harness();try{
 const before=h.read(),first=h.run();assert.equal(first.status,0,first.stderr);
 let f=h.read();assert.equal(f.writePayloads.length,1);assert.equal(fs.existsSync(h.lockout),true);
 assert.equal(f.events.filter(x=>x.kind==='SLEEP').length,0);
 assert.deepEqual(f.events.filter(x=>x.kind.startsWith('overlay_v1_')).map(x=>x.kind),['overlay_v1_next','overlay_v1_authorize','overlay_v1_ack']);
 const early=h.run();assert.equal(early.status,0);assert.equal(h.read().writePayloads.length,1);
 h.advance(12);const second=h.run();assert.equal(second.status,0,second.stderr);f=h.read();
 assert.equal(fs.existsSync(h.lockout),false);assert.equal(f.writePayloads.length,1);
 assert.equal(f.events.filter(x=>x.kind==='overlay_v1_restored').length,1);
 assert.deepEqual(f.auxState,before.auxState);assert.deepEqual(f.matrixState.seg,before.matrixState.seg);
 assert.equal(f.events.filter(x=>x.url?.endsWith('192.168.77.11/json/state')).length,0);
 }finally{h.cleanup();}
});
test('Owner priority denial prevents any write in new first phase',()=>{
 const h=harness(['owner_denied']);try{
 const r=h.run();assert.notEqual(r.status,0);assert.equal(h.read().writePayloads.length,0);assert.equal(fs.existsSync(h.lockout),false);
 }finally{h.cleanup();}
});
test('AUX count24 blocks any new GLOW before challenge',()=>{
 const h=harness(['aux_24']);try{
 const r=h.run();assert.notEqual(r.status,0);assert.equal(h.read().events.filter(x=>x.kind==='MATRIX_WRITE').length,0);assert.equal(fs.existsSync(h.lockout),false);
 }finally{h.cleanup();}
});
test('post-authorize JSON mismatch persists lockout, never retries on subsequent cycle',()=>{
 const h=harness(['bad_payload']);try{
 const r=h.run();assert.notEqual(r.status,0);assert.equal(fs.existsSync(h.lockout),true);
 const next=h.run();assert.notEqual(next.status,0);assert.equal(h.read().writePayloads.length,0);
 }finally{h.cleanup();}
});
test('indeterminate Matrix POST cannot replay even next cycle',()=>{
 const h=harness(['post_fail']);try{
 const r=h.run();assert.notEqual(r.status,0);assert.equal(h.read().writePayloads.length,1);
 const next=h.run();assert.notEqual(next.status,0);assert.equal(h.read().writePayloads.length,1);assert.equal(fs.existsSync(h.lockout),true);
 }finally{h.cleanup();}
});
test('bad ACK never creates a pending-replay capability',()=>{
 const h=harness(['bad_ack']);try{
 const r=h.run();assert.notEqual(r.status,0);assert.equal(fs.existsSync(h.lockout),true);
 const next=h.run();assert.notEqual(next.status,0);assert.equal(h.read().writePayloads.length,1);
 }finally{h.cleanup();}
});
test('nonexpiry or changed Owner state retains lockout after due',()=>{
 const h=harness(['no_expiry']);try{
 assert.equal(h.run().status,0);h.advance(12);const r=h.run();assert.notEqual(r.status,0);
 assert.equal(fs.existsSync(h.lockout),true);assert.equal(h.read().writePayloads.length,1);
 }finally{h.cleanup();}
});
test('reboot loses tmp cursor but retains lockout; no replay',()=>{
 const h=harness();try{
 assert.equal(h.run().status,0);fs.rmSync(h.tmp,{recursive:true,force:true});
 const r=h.run();assert.notEqual(r.status,0);assert.equal(fs.existsSync(h.lockout),true);assert.equal(h.read().writePayloads.length,1);
 }finally{h.cleanup();}
});
test('main relay continues legacy Owner loop after native helper quarantine, no second daemon',()=>{
 const main=fs.readFileSync(new URL('./hbnf-matrix-relay',import.meta.url),'utf8');
 assert.match(main,/if \/bin\/ash "\$OVERLAY_HELPER"; then/);
 assert.match(main,/native overlay v1 quarantined; legacy Owner relay retained/);
 assert.match(main,/if ! snapshot; then sleep 5; continue; fi/);
 assert.doesNotMatch(source,/sleep 21/);
 assert.equal((main.match(/OVERLAY_HELPER=\/usr\/lib\/hbnf-glow-overlay-v1\.sh/g)||[]).length,1);
});

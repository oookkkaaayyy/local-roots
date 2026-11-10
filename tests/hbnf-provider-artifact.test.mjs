import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createAuthenticatedStageAdapter} from '../scripts/hbnf-parent-release/providers-live.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
function zip(entries) {
 const locals=[],centers=[];let off=0;
 for(const [name,value] of Object.entries(entries)) {
  const file=Buffer.from(value),key=Buffer.from(name),l=Buffer.alloc(30+key.length);
  l.writeUInt32LE(0x04034b50,0);l.writeUInt16LE(20,4);l.writeUInt32LE(file.length,18);
  l.writeUInt32LE(file.length,22);l.writeUInt16LE(key.length,26);key.copy(l,30);
  const c=Buffer.alloc(46+key.length);c.writeUInt32LE(0x02014b50,0);
  c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt32LE(file.length,20);
  c.writeUInt32LE(file.length,24);c.writeUInt16LE(key.length,28);c.writeUInt32LE(off,42);key.copy(c,46);
  locals.push(l,file);centers.push(c);off+=l.length+file.length;
 }
 const central=Buffer.concat(centers),end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(centers.length,8);
 end.writeUInt16LE(centers.length,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(off,16);
 return Buffer.concat([...locals,central,end]);
}
const names=['hbnf-tag-editor','hbnf-tags-live'];
const source=Object.fromEntries(names.map((slug,i)=>[slug,'// mock index.ts '+i+'\n']));
const payload=zip({
 'functions/hbnf-tag-editor/index.ts':source['hbnf-tag-editor'],
 'functions/hbnf-tags-live/index.ts':source['hbnf-tags-live'],
 'manifest.json':JSON.stringify({schemaVersion:1,
  sourceFunctionVersions:{'hbnf-tag-editor':'v5','hbnf-tags-live':'v4'},
  candidateDigests:Object.fromEntries(names.map(slug=>[slug,sha(Buffer.from(source[slug]))]))})
});
const token={SUPABASE_ACCESS_TOKEN:'fake',CLOUDFLARE_API_TOKEN:'fake'};
const pinned=(b,other={})=>({driveFileId:'fake-drive',bytes:b.length,sha256:sha(b),...other});
function harness(bytes,tx={transactionId:'one',targets:[]},reply=async()=>new Response('{}',{status:201})){
 const calls=[];
 const a=createAuthenticatedStageAdapter({tx,env:token,
 readAdapter:{readOnly:true,readAllTargets:async()=>({})},
 readArtifact:async()=>bytes,verifyImmediateProviderGate:async()=>true,
 fetchImpl:async(url,init)=>{calls.push({url,init});return reply(url,init)}});
 return {a,calls};
}
test('actual candidate ZIP selects separate single-source Edge files for Management API multipart',async()=>{
 for(const slug of names){
  const id=slug==='hbnf-tag-editor'?'edge-tag-editor':'edge-tags-live';
  const {a,calls}=harness(payload,undefined,async()=>new Response(JSON.stringify({slug,status:'ACTIVE',version:10}),{status:201}));
  const s=pinned(payload,{memberSha256:sha(Buffer.from(source[slug])),
   runtime:{entrypoint_path:'index.ts',verify_jwt:false,import_map:false}});
  const ack=await a.apply({id,targetId:id,candidate:s});
  assert.equal(ack.acknowledged,true);
  assert.equal(calls.length,1);
  assert.equal(await calls[0].init.body.get('file').text(),source[slug]);
  assert.equal(calls[0].init.body.get('file').name,'index.ts');
  assert.equal(JSON.parse(calls[0].init.body.get('metadata')).verify_jwt,false);
 }
});
test('restore reads actual BOM-prefixed Edge snapshot and uses installed source only',async()=>{
 const installed='// exact installed index.ts\n';
 const backup=Buffer.from('\uFEFF'+JSON.stringify({projectId:'phcpbvuqibyarpfrftgx',
 sources:[{slug:'hbnf-tag-editor',verifyJwt:false,providerCodeSha256:'b'.repeat(64),
 files:[{name:'index.ts',content:installed}]}]}));
 const {a,calls}=harness(backup,undefined,async()=>new Response(
  JSON.stringify({slug:'hbnf-tag-editor',status:'ACTIVE',version:6}),{status:201}));
 const s=pinned(backup,{memberSha256:sha(Buffer.from(installed)),providerCodeSha256:'b'.repeat(64),
 runtime:{entrypoint_path:'index.ts',verify_jwt:false,import_map:false}});
 assert.equal((await a.restore({id:'edge-tag-editor',targetId:'edge-tag-editor',restore:s})).acknowledged,true);
 assert.equal(await calls[0].init.body.get('file').text(),installed);
});
test('corrupted ZIP member hash or wrong runtime blocks provider request entirely',async()=>{
 const {a,calls}=harness(payload);
 for(const s of [
 pinned(payload,{memberSha256:'c'.repeat(64),runtime:{entrypoint_path:'index.ts',verify_jwt:false,import_map:false}}),
 pinned(payload,{memberSha256:sha(Buffer.from(source['hbnf-tag-editor'])),runtime:{entrypoint_path:'index.ts',verify_jwt:true,import_map:false}})
 ]) await assert.rejects(()=>a.apply({id:'edge-tag-editor',targetId:'edge-tag-editor',candidate:s}));
 assert.equal(calls.length,0);
});
test('Cloudflare deployment uses required strategy, version and annotations, with exact acknowledgment',async()=>{
 const baseline='48ffa87e-3c83-46d0-a6ca-db7bf0b064e6';
 const version='08633e43-dbaa-4421-a072-5af56f75d4b7';
 const tx={transactionId:'one',targets:[{id:'cloudflare-worker',baselineProviderVersionId:baseline,rollback:{providerVersionId:baseline}}]};
 const b=Buffer.from('worker'), {a,calls}=harness(b,tx,async()=>new Response(JSON.stringify({success:true,result:{
 id:'d7ae51b6-a2ec-412d-8d22-f0fb9b8afbe8',versions:[{version_id:version,percentage:100}]}}),{status:200}));
 const ack=await a.apply({id:'worker-vnext',targetId:'cloudflare-worker',
  candidate:pinned(b,{providerVersionId:version,uploadedVersionAndBindingsVerified:true})});
 assert.equal(ack.acknowledged,true);
 const body=JSON.parse(calls[0].init.body);
 assert.equal(body.strategy,'percentage');assert.equal(body.versions[0].version_id,version);
 assert(body.annotations['workers/message'].includes('same-manifest'));assert.equal(body.force,undefined);
});
test('Cloudflare exact baseline rollback only after retained-version binding proof, not candidate-upload flag',async()=>{
 const baseline='48ffa87e-3c83-46d0-a6ca-db7bf0b064e6';
 const tx={transactionId:'one',targets:[{id:'cloudflare-worker',baselineProviderVersionId:baseline,rollback:{providerVersionId:baseline}}]};
 const b=Buffer.from('worker'),{a,calls}=harness(b,tx,async()=>new Response(JSON.stringify({success:true,result:{
 id:'d7ae51b6-a2ec-412d-8d22-f0fb9b8afbe8',versions:[{version_id:baseline,percentage:100}]}}),{status:200}));
 const spec=pinned(b,{providerVersionId:baseline,retainedVersionAndBindingsVerified:true});
 await assert.rejects(()=>a.restore({id:'worker-vnext',targetId:'cloudflare-worker',restore:
 {...spec,retainedVersionAndBindingsVerified:false}}),/WORKER_RETAINED_ROLLBACK/);
 assert.equal(calls.length,0);
 assert.equal((await a.restore({id:'worker-vnext',targetId:'cloudflare-worker',restore:spec})).acknowledged,true);
});
test('false Cloudflare version acknowledgment never qualifies as accepted deployment',async()=>{
 const baseline='48ffa87e-3c83-46d0-a6ca-db7bf0b064e6';
 const tx={transactionId:'one',targets:[{id:'cloudflare-worker',baselineProviderVersionId:baseline,rollback:{providerVersionId:baseline}}]};
 const b=Buffer.from('worker'),{a}=harness(b,tx,async()=>new Response(JSON.stringify({success:true,result:{
 id:'d7ae51b6-a2ec-412d-8d22-f0fb9b8afbe8',versions:[{version_id:baseline,percentage:100}]}}),{status:200}));
 const ack=await a.apply({id:'worker-vnext',targetId:'cloudflare-worker',candidate:
 pinned(b,{providerVersionId:'08633e43-dbaa-4421-a072-5af56f75d4b7',uploadedVersionAndBindingsVerified:true})});
 assert.equal(ack.acknowledged,false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {executeAdmittedProviderSaga} from '../scripts/hbnf-parent-release/driver.mjs';
import {createAuthenticatedStageAdapter} from '../scripts/hbnf-parent-release/providers-live.mjs';
import {createHash} from 'node:crypto';
const sha=x=>createHash('sha256').update(x).digest('hex');
test('unadmitted source manifest refuses all actual provider writes before verifier/journal/network',async()=>{
 let invoked=0;
 const out=await executeAdmittedProviderSaga({schemaVersion:1,mode:'review-only',liveExecutionEnabled:false},
   {authenticated:true,readOnly:false,readTarget:()=>{invoked++},apply:()=>{invoked++},restore:()=>{invoked++}},
   {atomicOneTimeClaim:true,durableDownloadBack:true,claim:()=>{invoked++},append:()=>{invoked++}},
   {status:'PENDING_NOT_ADMITTED',productionMutationAuthorized:false}, {});
 assert.equal(out.status,'NOT_ADMITTED_NO_MUTATION');assert.equal(invoked,0);
});
test('five-target stage adapter refuses missing credentials and unverified routes before network',()=>{
 let calls=0;
 assert.throws(()=>createAuthenticatedStageAdapter({tx:{transactionId:'t'},env:{},readAdapter:{readOnly:true,readAllTargets:async()=>({})},
 readArtifact:async()=>Buffer.from('x'),verifyImmediateProviderGate:async()=>true,fetchImpl:async()=>{calls++;}}),/AUTHENTICATED_PROVIDER_STAGE_PREREQUISITES_MISSING/);
 assert.equal(calls,0);
});
test('DB stage requires exact candidate bytes and immediate pre-change gate before POST',async()=>{
 let calls=0;
 const bytes=Buffer.from('select 1;'),spec={driveFileId:'b',sha256:sha(bytes),bytes:bytes.length};
 const adapter=createAuthenticatedStageAdapter({tx:{transactionId:'t'},env:{SUPABASE_ACCESS_TOKEN:'fake',CLOUDFLARE_API_TOKEN:'fake'},
 readAdapter:{readOnly:true,readAllTargets:async()=>({'supabase-schema':{id:1}})},readArtifact:async()=>bytes,
 verifyImmediateProviderGate:async()=>false,fetchImpl:async()=>{calls++;throw Error('POST forbidden')}});
 const op={id:'db-revision',targetId:'supabase-schema',candidate:spec};
 await assert.rejects(()=>adapter.apply(op),/IMMEDIATE_PRECHANGE/);
 assert.equal(calls,0);
});
test('verified SQL stage calls only the exact Supabase query route, never a generic URL',async()=>{
 const sql=Buffer.from('select 1;'); const calls=[];
 const adapter=createAuthenticatedStageAdapter({tx:{transactionId:'t'},env:{SUPABASE_ACCESS_TOKEN:'fake',CLOUDFLARE_API_TOKEN:'fake'},
 readAdapter:{readOnly:true,readAllTargets:async()=>({'supabase-schema':{id:1}})},
 readArtifact:async()=>sql,verifyImmediateProviderGate:async()=>true,
 fetchImpl:async(u,i)=>{calls.push({u,i});return new Response('{}',{status:201})}});
 const op={id:'db-revision',targetId:'supabase-schema',candidate:{driveFileId:'b',sha256:sha(sql),bytes:sql.length}};
 const out=await adapter.apply(op);assert.equal(out.acknowledged,true);
 assert.equal(calls.length,1);assert(calls[0].u.endsWith('/database/query'));
 assert.equal(JSON.parse(calls[0].i.body).query,'select 1;');
 assert.equal(JSON.parse(calls[0].i.body).read_only,false);
});
test('worker deploy rejects unretained candidate and is never confused with rollback',async()=>{
 const bytes=Buffer.from('candidate');const spec={driveFileId:'x',sha256:sha(bytes),bytes:bytes.length,
 providerVersionId:'08633e43-dbaa-4421-a072-5af56f75d4b7',uploadedVersionAndBindingsVerified:false};
 let calls=0;
 const a=createAuthenticatedStageAdapter({tx:{transactionId:'t',targets:[{id:'cloudflare-worker',baselineProviderVersionId:'48ffa87e-3c83-46d0-a6ca-db7bf0b064e6',rollback:{providerVersionId:'48ffa87e-3c83-46d0-a6ca-db7bf0b064e6'}}]},env:{SUPABASE_ACCESS_TOKEN:'fake',CLOUDFLARE_API_TOKEN:'fake'},
 readAdapter:{readOnly:true,readAllTargets:async()=>({'cloudflare-worker':{}})},readArtifact:async()=>bytes,
 verifyImmediateProviderGate:async()=>true,fetchImpl:async()=>{calls++;}});
 await assert.rejects(()=>a.apply({id:'worker-vnext',targetId:'cloudflare-worker',candidate:spec}),/WORKER_VERSION_UPLOAD_AND_BINDINGS_NOT_VERIFIED/);
 assert.equal(calls,0);
});

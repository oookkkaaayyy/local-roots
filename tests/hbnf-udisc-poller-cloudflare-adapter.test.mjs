import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  createCloudflarePollerProvider,createPollerOneTimeClaims,createPollerCloseoutStore
} from '../scripts/hbnf-udisc-poller-cloudflare-adapter.mjs';
import {POLLER_RELEASE,createPollerManifest,manifestBytes,manifestSha256,
  disablePoller,restorePoller} from '../scripts/hbnf-udisc-poller-config-gate.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const original=POLLER_RELEASE.workerVersion,staged='11111111-2222-4333-8444-555555555555';
const releaseId='hbnf-udisc-nov3-cloudflare-test-20261102';

function mock({authorized=false,invalidAssetProof=false}={}){
  let installed=original,versionAvailable=false,serverTime='Mon, 02 Nov 2026 16:00:00 GMT';
  let db={projectId:POLLER_RELEASE.supabaseProject,updatedAt:POLLER_RELEASE.supabaseUpdatedAt,
    stateFingerprint:POLLER_RELEASE.supabaseStateFingerprint};
  const calls=[],wrangler=[],head={get:()=>serverTime};
  const fetchImpl=async(url,options)=>{
    calls.push({url,method:options.method,hasAuth:options.headers?.Authorization?.startsWith('Bearer ')});
    let result;
    if(url.endsWith('/deployments')){
      result={deployments:[{versions:[{percentage:100,version_id:installed}]}]};
    }else if(url.endsWith('/schedules')){
      result={schedules:[{cron:'* * * * *'}]};
    }else if(url.includes('/versions/')){
      const versionId=url.split('/').at(-1);
      if(versionId!==original&&(!versionAvailable||versionId!==staged))throw Error('unrecognized version');
      result={resources:{bindings:[
        {type:'plain_text',name:POLLER_RELEASE.approvalBinding,text:versionId===original?'true':'false'},
        {type:'secret_text',name:'SUPABASE_SERVICE_ROLE_KEY'}
      ]}};
    }else throw Error('mock requested unknown Cloudflare API endpoint');
    return {status:200,headers:head,async json(){return {success:true,errors:[],result}}};
  };
  const provider=createCloudflarePollerProvider({
    apiToken:'fixture_not_a_secret_0000000000000000',fetchImpl,
    readSupabase:async()=>db,readRoute:async()=> 'hbnightflyers.com',
    attestVersion:async id=>({
      versionId:id,artifactBytesDigestVerified:!invalidAssetProof,
      independentVersionReceiptId:'test-immutable-v'+id,
      packageSha256:id===original?POLLER_RELEASE.workerSha256:POLLER_RELEASE.candidateSha256,
      packageBytes:id===original?POLLER_RELEASE.workerBytes:POLLER_RELEASE.candidateBytes,
      publicAssetCount:46,publicAssetsSha256:POLLER_RELEASE.publicAssetsSha256
    }),
    runWrangler:async(args)=>{
      wrangler.push(args);
      if(args[1]==='upload'){versionAvailable=true;return {code:0,stdout:'Version ID: '+staged};}
      if(args[1]==='deploy'){
        installed=args[2].split('@')[0];
        return {code:0,stdout:'deployed'};
      }
      return {code:1};
    },
    verifyCandidate:async()=>({
      sha256:POLLER_RELEASE.candidateSha256,downloadBackVerified:true,
      configValue:'false',publicAssetsSha256:POLLER_RELEASE.publicAssetsSha256
    }),
    permitMutation:async()=>authorized,candidateWorkingDirectory:'/sandbox/test-candidate'
  });
  return {provider,calls,wrangler,
    setTime(value){serverTime=value;},
    advanceScoring(){db={...db,updatedAt:'2026-11-04T07:31:21.234Z',stateFingerprint:'f'.repeat(32)};},
    get state(){return {installed,db}}
  };
}
function stores(){
  const claims=new Map(),files=new Map(),drive=new Map();let next=0;
  const createFile=async({path,content})=>{
    if(claims.has(path))return {isError:true,content:[{type:'text',text:'422 already exists'}]};
    const commit_sha=String(++next).padStart(40,'0');
    claims.set(path,{commit_sha,content:Buffer.from(content).toString('base64')});
    return {structuredContent:{commit_sha}};
  };
  const fetchFile=async({path,ref})=>{
    const rec=claims.get(path);assert.equal(rec?.commit_sha,ref);
    return {structuredContent:{content:rec.content}};
  };
  const lock=createPollerOneTimeClaims({createFile,fetchFile,releaseId});
  const store=createPollerCloseoutStore({
    writeLocal:async(name,bytes)=>{files.set(name,Buffer.from(bytes));return name},
    uploadFile:async({file_uri})=>{
      const id='drive-'+(++next);drive.set(id,Buffer.from(files.get(file_uri)));
      return {structuredContent:{id}};
    },
    fetchFile:async(id)=>({structuredContent:{b64_string:drive.get(id)?.toString('base64')}}),
    cleanupLocal:async()=>{}
  });
  return {lock,store,claims,drive};
}
function admission(manifest){
  return {status:'ADMISSION_PASS',releaseId:manifest.releaseId,
    manifestSha256:manifestSha256(manifest),gateSourceCommit:manifest.gateSourceCommit,
    candidateSha256:manifest.candidate.sha256,rollbackSha256:manifest.rollback.packageSha256,
    baselineWorkerVersion:manifest.baseline.workerVersion,
    supabaseStateFingerprint:manifest.baseline.supabase.stateFingerprint,
    downloadBackVerified:true};
}
const manifest=createPollerManifest({releaseId,
  gateSourceCommit:'0e08365ec4045e67e230386c644597fc15d7f622'});
const bytes=manifestBytes(manifest),downloads={
  manifestDownloadedBack:true,candidateDownloadedBack:true,rollbackDownloadedBack:true
};

test('real Cloudflare REST route is fail-closed without scoped credentials, source proof or mutation authority',async()=>{
  assert.throws(()=>createCloudflarePollerProvider({}),/token missing/);
  const bad=mock({invalidAssetProof:true});
  await assert.rejects(bad.provider.readTarget(),/attestation missing/);
  const p=mock();
  const read=await p.provider.readTarget();
  assert.equal(read.versionId,original);
  assert.equal(read.cron[0],'* * * * *');
  assert.equal(read.vars[POLLER_RELEASE.approvalBinding],'true');
  assert.equal(read.packageSha256,POLLER_RELEASE.workerSha256);
  assert.ok(p.calls.every(x=>x.method==='GET'&&x.hasAuth));
  const {lock,store}=stores();
  await assert.rejects(disablePoller({
    manifest,bytes,decision:admission(manifest),provider:p.provider,store,claims:lock,
    downloadBack:downloads
  }),/no current per-operation admission/);
  assert.equal(p.wrangler.length,0,'denied mutation cannot invoke Wrangler');
});
test('one-time atomic claims reject duplicate or wrong release/manifest identifiers',async()=>{
  const {lock,claims}=stores();
  const hash=sha(bytes);
  assert.equal(await lock.claimOnce(releaseId,'disable',hash),true);
  assert.equal(await lock.claimOnce(releaseId,'disable',hash),false);
  assert.equal(await lock.claimOnce(releaseId,'restore',hash),true);
  assert.equal(claims.size,2);
  await assert.rejects(lock.claimOnce('different','disable',hash),/identity mismatch/);
});
test('injected authenticated path models same-manifest disable, durable closeout and event-safe restore; NO actual Cloudflare mutation',async()=>{
  const p=mock({authorized:true}),{lock,store,claims,drive}=stores();
  const disabled=await disablePoller({
    manifest,bytes,decision:admission(manifest),provider:p.provider,store,claims:lock,
    downloadBack:downloads
  });
  assert.equal(disabled.status,'DISABLED_READBACK_PASS');
  assert.equal(p.state.installed,staged);
  assert.equal(claims.size,1);
  assert.ok(drive.has(disabled.receiptDurability.id));
  assert.equal(disabled.receiptDurability.sha256.length,64);
  assert.deepEqual(p.wrangler[0],['versions','upload','--cwd','/sandbox/test-candidate',
    '--config','wrangler.jsonc','--name','hbnf','--keep-vars','--strict']);
  assert.deepEqual(p.wrangler[1],['versions','deploy',staged+'@100%',
    '--name','hbnf','--yes']);
  await assert.rejects(disablePoller({
    manifest,bytes,decision:admission(manifest),provider:p.provider,store,claims:lock,
    downloadBack:downloads
  }),/Worker version|baseline changed/);
  p.advanceScoring();
  p.setTime('Wed, 04 Nov 2026 07:31:30 GMT');
  const restored=await restorePoller({
    manifest,bytes,decision:admission(manifest),disableReceipt:disabled,
    provider:p.provider,store,claims:lock,downloadBack:downloads
  });
  assert.equal(restored.status,'EXACT_RESTORE_READBACK_PASS');
  assert.equal(p.state.installed,original);
  assert.equal(p.state.db.stateFingerprint,'f'.repeat(32));
  assert.equal(restored.supabaseStateAdvancedDuringEvent,true);
  assert.equal(claims.size,2);
  assert.equal(drive.has(restored.receiptDurability.id),true);
  assert.deepEqual(p.wrangler[2],['versions','deploy',original+'@100%',
    '--name','hbnf','--yes']);
});
test('restore before event end fails even with synthetic admission and no mutation',async()=>{
  const p=mock({authorized:true}),{lock,store}=stores();
  const disabled=await disablePoller({
    manifest,bytes,decision:admission(manifest),provider:p.provider,store,claims:lock,
    downloadBack:downloads
  });
  await assert.rejects(restorePoller({
    manifest,bytes,decision:admission(manifest),disableReceipt:disabled,
    provider:p.provider,store,claims:lock,downloadBack:downloads
  }),/not permitted until/);
  assert.equal(p.wrangler.length,2);
});

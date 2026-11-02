// HBNF Nov 3 poller: authenticated REST readback + gated Wrangler mutation route.
// This module NEVER reads secrets. No production mutation is possible without a
// caller-provided exact-release admit/permit AND a valid Cloudflare credential.
// Source-only qualification does not establish production admission.
import {createHash} from 'node:crypto';
import {
  createGitHubExecutionLockAdapter,
  createGoogleDriveEvidenceStore,
} from './hbnf-two-target-provider-adapters.mjs';
import {POLLER_RELEASE} from './hbnf-udisc-poller-config-gate.mjs';

const fail=msg=>{throw new Error(msg)};
const digest=b=>createHash('sha256').update(b).digest('hex');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const account=POLLER_RELEASE.accountId;
const script=POLLER_RELEASE.worker;
const prefix='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/'+script;
const basic=(b)=>b&&typeof b==='object'&&typeof b.versionId==='string'&&uuid.test(b.versionId);
const requiredMethods=(pairs)=>{
  for(const [name,fn] of Object.entries(pairs))if(typeof fn!=='function')fail('poller adapter missing '+name);
};
function cleanBinding(bindings,name){
  const b=(Array.isArray(bindings)?bindings:[]).find(x=>x&&x.name===name);
  if(!b)return null;
  // Fail on ambiguous/unrecognized binding types instead of reading secret values.
  if(name===POLLER_RELEASE.approvalBinding){
    if(b.type!=='plain_text' || !['true','false'].includes(b.text))fail('approval binding type/value is unverified');
    return b.text;
  }
  if(b.type!=='secret_text')fail('secret binding has unexpected type');
  return 'PRESENT';
}
function requireEvidence(source,versionId){
  if(!source||source.versionId!==versionId||source.artifactBytesDigestVerified!==true||
    !/^[a-f0-9]{64}$/.test(source.packageSha256||'')||
    !Number.isSafeInteger(source.packageBytes)||source.packageBytes<=0||
    source.publicAssetCount!==46||!/^[a-f0-9]{64}$/.test(source.publicAssetsSha256||'')||
    !source.independentVersionReceiptId)fail('fresh exact immutable-version asset/package attestation missing');
  // Cloudflare's metadata/script ETag is not a SHA-256 of the deployable ZIP.
  // Do NOT mislabel that ETag or a package filename as verified package bytes.
  return source;
}
export function createCloudflarePollerProvider({
  apiToken,fetchImpl=fetch,readSupabase,readRoute,attestVersion,
  runWrangler,verifyCandidate,permitMutation,candidateWorkingDirectory,
}={}){
  if(typeof apiToken!=='string'||apiToken.length<20)fail('authenticated Cloudflare API token missing');
  requiredMethods({fetchImpl,readSupabase,readRoute,attestVersion,
    runWrangler,verifyCandidate,permitMutation});
  if(!candidateWorkingDirectory||typeof candidateWorkingDirectory!=='string')fail('pinned candidate working directory missing');
  let authHealth=false;
  async function get(path){
    const url=prefix+path;
    // Fixed target host; never follow redirects outside Cloudflare API.
    const response=await fetchImpl(url,{
      method:'GET',redirect:'error',
      headers:{Authorization:'Bearer '+apiToken,Accept:'application/json'}
    });
    if(!response||response.status!==200)fail('authenticated Cloudflare readback failed');
    const payload=await response.json();
    if(payload?.success!==true||payload?.errors?.length)fail('Cloudflare authenticated response failed');
    authHealth=true;
    return {result:payload.result,serverTime:response.headers?.get('date')||''};
  }
  async function version(id){
    if(!uuid.test(id))fail('invalid immutable Cloudflare version ID');
    const v=await get('/versions/'+id),resources=v.result?.resources;
    const bindings=resources?.bindings;
    if(!Array.isArray(bindings))fail('Cloudflare version did not expose an inspectable binding inventory');
    const approval=cleanBinding(bindings,POLLER_RELEASE.approvalBinding);
    const secret=cleanBinding(bindings,'SUPABASE_SERVICE_ROLE_KEY');
    if(approval===null||secret!=='PRESENT')fail('version approval/secret-name binding missing');
    const attested=requireEvidence(await attestVersion(id,v.result),id);
    return {versionId:id,vars:{[POLLER_RELEASE.approvalBinding]:approval},
      secretNamePresent:'SUPABASE_SERVICE_ROLE_KEY',
      packageSha256:attested.packageSha256,packageBytes:attested.packageBytes,
      publicAssetsSha256:attested.publicAssetsSha256,publicAssetCount:attested.publicAssetCount,
      attestationReceiptId:attested.independentVersionReceiptId,
      serverTime:v.serverTime};
  }
  async function readTarget(){
    const d=await get('/deployments'),versions=d.result?.deployments?.[0]?.versions;
    if(!Array.isArray(versions)||versions.length!==1||versions[0].percentage!==100||
      !uuid.test(versions[0].version_id))fail('Worker is not at an unambiguous single 100% deployment');
    const id=versions[0].version_id;
    const [v,schedule,route,supabase]=await Promise.all([
      version(id),get('/schedules'),readRoute(),readSupabase()
    ]);
    const cron=schedule.result?.schedules?.map(x=>x.cron);
    if(!Array.isArray(cron)||cron.some(x=>typeof x!=='string'))fail('Cron readback missing');
    if(route!=='hbnightflyers.com')fail('Cloudflare route verification not exact');
    if(supabase?.projectId!==POLLER_RELEASE.supabaseProject)fail('Supabase project identity differs');
    const result={worker:script,accountId:account,versionId:id,
      trafficPercent:100,route,cron,serverTime:d.serverTime,
      ...v,supabase};
    return result;
  }
  async function mutationPermit(verb,subject){
    // Permit must validate the same manifest, one-time claim and admission,
    // current target readback and exact artifact; never infer from env alone.
    if(authHealth!==true||await permitMutation({verb,subject})!==true)
      fail('no current per-operation admission/claim authority');
  }
  async function uploadVersion({artifact,sha256,keepVars,strict}={}){
    if(sha256!==POLLER_RELEASE.candidateSha256||artifact?.sha256!==sha256||
      artifact.bytes!==POLLER_RELEASE.candidateBytes||artifact.driveFileId!==POLLER_RELEASE.candidateDriveId||
      keepVars!==true||strict!==true)fail('candidate artifact and preservation switches changed');
    const qualified=await verifyCandidate({workingDirectory:candidateWorkingDirectory,
      sha256,bytes:artifact.bytes,driveFileId:artifact.driveFileId});
    if(qualified?.sha256!==sha256||qualified?.downloadBackVerified!==true||
      qualified?.configValue!=='false'||qualified?.publicAssetsSha256!==POLLER_RELEASE.publicAssetsSha256)
      fail('exact candidate ZIP / Wrangler config / durable copy not independently verified');
    await mutationPermit('versions-upload',sha256);
    const out=await runWrangler(['versions','upload','--cwd',candidateWorkingDirectory,
      '--config','wrangler.jsonc','--name',script,'--keep-vars','--strict']);
    if(out?.code!==0)fail('Wrangler authenticated immutable-version upload failed');
    const versions=[...String(out.stdout||'').matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi)].map(x=>x[0]);
    if(versions.length!==1)fail('uploaded version has no unique immutable ID');
    return {versionId:versions[0]};
  }
  async function deployVersion({versionId,trafficPercent}={}){
    if(!uuid.test(versionId)||trafficPercent!==100)fail('nonexact deployment version or traffic split');
    await mutationPermit('versions-deploy',versionId);
    const out=await runWrangler(['versions','deploy',versionId+'@100%',
      '--name',script,'--yes']);
    if(out?.code!==0)fail('Wrangler authenticated version deployment failed');
    // The core gate must still fetch a new independent provider readback
    // after this acknowledgement before marking the operation successful.
    return {versionId};
  }
  return {readTarget,readVersion:version,uploadVersion,deployVersion};
}

// Atomic GitHub create-file claims are unique to each release + operation;
// only authenticated existing provider methods may supply the primitive.
export function createPollerOneTimeClaims({
  createFile,fetchFile,releaseId,branch='review/hbnf-udisc-poller-disable-gate-20261102'
}={}){
  requiredMethods({createFile,fetchFile});
  if(!/^[a-zA-Z0-9._-]{20,100}$/.test(releaseId||''))fail('unique release ID required for claims');
  const locks={};
  for(const kind of ['disable','restore']){
    locks[kind]=createGitHubExecutionLockAdapter({
      createFile,fetchFile,repository:'oookkkaaayyy/local-roots',branch,
      claimPath:'release-claims/'+releaseId+'.'+kind+'.execution-claim.json'
    });
  }
  return {async claimOnce(id,kind,manifestSha256){
    if(id!==releaseId||!locks[kind]||!/^[a-f0-9]{64}$/.test(manifestSha256||''))
      fail('one-time release/operation/manifest identity mismatch');
    const bytes=Buffer.from(JSON.stringify({releaseId:id,operation:kind,manifestSha256})+'\n');
    const r=await locks[kind].createExclusive(kind,bytes);
    if(!r.created)return false;
    const read=await locks[kind].read(r.id);
    if(!Buffer.from(read).equals(bytes))fail('immutable claim readback differs');
    return true;
  }};
}
export function createPollerCloseoutStore(adapters={}){
  return createGoogleDriveEvidenceStore(adapters);
}

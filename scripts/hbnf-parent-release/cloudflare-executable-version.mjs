// Scoring P0 #115/#147 / PR151: Cloudflare executable version construction.
// This module never grants admission. The original rev10 parent owns the durable
// five-target claim, prechange readback, deployment, rollback and closeout.
// API: https://developers.cloudflare.com/workers/static-assets/direct-upload/
import {createHash} from 'node:crypto';
import {extname} from 'node:path';
import {validateCloudflareWorkerModules} from '../validate-cloudflare-worker-multipart.mjs';
import {readWranglerToken} from './capture-cloudflare-current-readonly.mjs';

const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const workerIdPattern=/^(?:[a-f0-9]{32}|[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/i;
const hex64=/^[a-f0-9]{64}$/i;
const P0_ACCOUNT='e3bc6b78f1104fa0c2a01245084594cf';
const P0_WORKER='hbnf';
const P0_V348='48ffa87e-3c83-46d0-a6ca-db7bf0b064e6';
const P0_V348_ETAG='c3ea6bde761a6a5735a6a8b50334821b809baf57096c64cbb71b50a17ceb5b25';
const P0_BETA_CANDIDATE_SHA256='1b391b7db096a81cf75ed61b3ff074d034987f512c296fc8c6f4bdb7ce5f845e';
const P0_BETA_CANDIDATE_BYTES=274519;
const P0_BETA_REQUEST_SHA256='36017fbb2191ae9c6e46b4b08f5cdf72442222a1f59beaa6194d22851c3d6f11';
const P0_BETA_REQUEST_BYTES=269030;
const goodPath=p=>typeof p==='string'&&p.startsWith('/')&&!p.includes('..')&&!p.includes('//')&&!p.includes('\\');
const fail=(condition,message)=>{if(!condition)throw Error('P0_CLOUDFLARE_'+message);};
export const sha256=b=>createHash('sha256').update(b).digest('hex');
export const assetHash=(path,bytes)=>sha256(Buffer.from(Buffer.from(bytes).toString('base64')+extname(path).slice(1))).slice(0,32);
export const inventoryDigest=(paths,digests)=>sha256(Buffer.from(paths.slice().sort()
  .map(p=>`${p}\0${digests.get(p)}\n`).join('')));

function requireInventoryWitness(witness,{workerName,baselineVersionId,installedPaths,installedDigests}){
  fail(witness&&witness.complete===true&&witness.workerName===workerName&&
    witness.versionId===baselineVersionId&&witness.readOnly===true,'COMPLETE_ASSETS_NOT_PROVEN');
  fail(Array.isArray(witness.paths)&&witness.paths.length===installedPaths.length&&
    witness.paths.slice().sort().every((p,i)=>p===installedPaths.slice().sort()[i]),'INVENTORY_WITNESS_PATHS');
  fail(witness.digests instanceof Object,'INVENTORY_WITNESS_DIGESTS');
  for(const p of installedPaths)fail(hex64.test(witness.digests[p]||'')&&
    witness.digests[p]===installedDigests.get(p),'INVENTORY_WITNESS_HASH_'+p);
  fail(witness.inventoryDigest===inventoryDigest(installedPaths,installedDigests),'INVENTORY_WITNESS_DIGEST');
  return witness;
}

function normalizeVersionSettings(settings){
  const runtime=settings?.runtime||settings||{};
  const assetRuntime=runtime.assets;
  const assetConfig=settings?.assetConfig||(
    assetRuntime&&typeof assetRuntime.base_path==='string'&&
    assetRuntime.static_routing&&assetRuntime.static_routing.user_worker!==undefined
      ? {base_path:assetRuntime.base_path,run_worker_first:assetRuntime.static_routing.user_worker}
      : null);
  return {
    compatibility_date:settings?.compatibility_date||runtime.compatibility_date,
    compatibility_flags:settings?.compatibility_flags||runtime.compatibility_flags||[],
    usage_model:settings?.usage_model||runtime.usage_model,
    bindings:settings?.bindings,
    assetConfig,
  };
}

function assetConfigWithHelperRoute(config){
  if(config.run_worker_first===true)return {...config};
  const routes=config.run_worker_first===false?[]:config.run_worker_first;
  fail(Array.isArray(routes)&&routes.every(x=>typeof x==='string'&&x.startsWith('/')),
    'WORKER_FIRST_ROUTES');
  return {...config,run_worker_first:[...new Set([...routes,'/glow-save-sync.mjs'])]};
}

export function validateAssetBuckets(manifest,buckets){
  fail(Array.isArray(buckets),'BUCKET_SHAPE');
  const allowed=new Set(Object.values(manifest).map(x=>x.hash));
  const seen=new Set();
  for(const bucket of buckets){
    fail(Array.isArray(bucket)&&bucket.length>0,'BUCKET_SHAPE');
    for(const hash of bucket){
      fail(allowed.has(hash)&&!seen.has(hash),'BUCKET_UNRECOGNIZED_HASH');
      seen.add(hash);
    }
  }
  return seen;
}

// No partial ZIP, stale historic archive, or inferred asset completeness is accepted.
// assetDigests are hashes of original installed BYTES, not redirected HTML responses.
export function buildExactVersion({assets,installedPaths,installedDigests,changedPath='/glow-save-sync.mjs',
  modules,moduleDigests,settings,baselineVersionId,assetJwt}) {
  fail(uuid.test(baselineVersionId),'BASE_VERSION');
  settings=normalizeVersionSettings(settings);
  fail(assets instanceof Map&&Array.isArray(installedPaths)&&assets.size===installedPaths.length,'INVENTORY_LENGTH');
  const paths=[...assets.keys()].sort();
  fail(paths.length>0&&installedPaths.length===new Set(installedPaths).size&&
    installedPaths.every(goodPath)&&installedPaths.slice().sort().every((p,i)=>p===paths[i]),'INVENTORY_SET');
  fail(installedDigests instanceof Map&&installedDigests.size===paths.length,'ORIGINAL_HASHES');
  fail(paths.includes(changedPath),'CHANGED_PATH_ABSENT');
  let changed=0;const manifest={};
  for(const path of paths){
    const bytes=Buffer.from(assets.get(path)||[]);
    fail(bytes.length>0&&hex64.test(installedDigests.get(path)||''),'ASSET_SOURCE_NOT_EXACT');
    const digest=sha256(bytes),original=installedDigests.get(path);
    if(path===changedPath)fail(digest!==original,'SAVE_ACK_NOT_CHANGED');
    else fail(digest===original,'UNEXPECTED_CHANGE_'+path);
    if(digest!==original)changed++;
    manifest[path]={hash:assetHash(path,bytes),size:bytes.length};
  }
  fail(changed===1,'NOT_ONE_FILE');
  fail(Array.isArray(modules)&&modules.some(m=>m.name==='index.js')&&
    moduleDigests instanceof Map&&modules.length===moduleDigests.size,'MODULE_INVENTORY');
  const moduleNames=new Set();
  const parts=modules.map(m=>{
    const bytes=Buffer.from(m.bytes||[]);
    fail(typeof m.name==='string'&&!moduleNames.has(m.name)&&bytes.length>0&&
      sha256(bytes)===moduleDigests.get(m.name),'MODULE_BYTES_DRIFT');
    moduleNames.add(m.name);
    return {name:m.name,content_type:m.contentType||
      (m.name.endsWith('.map')?'application/source-map':'application/javascript+module'),
      content_base64:bytes.toString('base64')};
  });
  // Gate the exact JSON/base64 module payload before any Cloudflare upload.
  validateCloudflareWorkerModules(parts,'index.js');
  fail(settings?.compatibility_date&&/^20\d\d-\d\d-\d\d$/.test(settings.compatibility_date),'COMPAT_DATE');
  fail(settings.assetConfig&&typeof settings.assetConfig==='object'&&
    typeof settings.assetConfig.base_path==='string'&&
    (typeof settings.assetConfig.run_worker_first==='boolean'||Array.isArray(settings.assetConfig.run_worker_first)),
    'CURRENT_ASSET_ROUTING_CONFIG_UNVERIFIED');
  if(settings.assetConfig.html_handling!==undefined)
    fail(['auto-trailing-slash','force-trailing-slash','drop-trailing-slash','none'].includes(settings.assetConfig.html_handling),'HTML_HANDLING');
  if(settings.assetConfig.not_found_handling!==undefined)
    fail(['none','404-page','single-page-application'].includes(settings.assetConfig.not_found_handling),'NOT_FOUND_HANDLING');
  fail(settings.usage_model==='standard','WORKER_USAGE_MODEL_DRIFT');
  fail(Array.isArray(settings.bindings)&&settings.bindings.some(b=>b.name==='ASSETS'&&b.type==='assets'),'ASSETS_BINDING');
  const seen=new Set();
  const bindings=settings.bindings.map(b=>{
    fail(b.name&&!seen.has(b.name),'DUPLICATE_BINDING');seen.add(b.name);
    return b.type==='assets'?{name:b.name,type:'assets'}:
      {name:b.name,type:'inherit',version_id:baselineVersionId};
  });
  fail(typeof assetJwt==='string'&&assetJwt.length>15,'ASSET_JWT');
  return {manifest,body:{main_module:'index.js',modules:parts,
    compatibility_date:settings.compatibility_date,
    compatibility_flags:settings.compatibility_flags||[],usage_model:settings.usage_model,
    bindings,assets:{jwt:assetJwt,config:assetConfigWithHelperRoute(settings.assetConfig)},
    annotations:{'workers/message':'HBNF P0 one-file Glow save ACK; rev10 parent admission required',
      'workers/tag':'hbnf-p0-'+sha256(assets.get(changedPath)).slice(0,32)}},
    receipt:{baselineVersionId,changedPath,changedDigest:sha256(assets.get(changedPath)),
      assetCount:paths.length,unchangedCount:paths.length-1,
      manifestDigest:sha256(Buffer.from(JSON.stringify(manifest))),
      modules:parts.map(m=>({name:m.name,sha256:sha256(Buffer.from(m.content_base64,'base64'))}))}};
}
function apiClient({token,accountId,workerName,fetchImpl}){
  fail(typeof token==='string'&&token.length>12&&!/\s/.test(token),'CREDENTIAL');
  fail(/^[a-f0-9]{32}$/.test(accountId||''),'ACCOUNT_ID');
  fail(/^[\w-]+$/.test(workerName),'WORKER_NAME');
  const prefix='https://api.cloudflare.com/client/v4/accounts/'+accountId;
  async function callEnvelope(path,method='GET',body,authorization=token){
    const init={method,headers:{Authorization:'Bearer '+authorization}};
    if(body!==undefined){
      init.body=body instanceof FormData?body:JSON.stringify(body);
      if(!(body instanceof FormData))init.headers['Content-Type']='application/json';
    }
    const response=await fetchImpl(prefix+path,init);
    fail(response?.ok,'HTTP_'+method+'_'+response?.status);
    const payload=await response.json();
    fail(payload?.success!==false&&(!Array.isArray(payload?.errors)||payload.errors.length===0),'PROVIDER_RESPONSE');
    return payload;
  }
  async function call(path,method='GET',body,authorization=token){
    return (await callEnvelope(path,method,body,authorization))?.result;
  }
  const script='/workers/scripts/'+workerName;
  const worker='/workers/workers/'+workerName;
  return {call,callEnvelope,script,worker};
}

function versionListItems(envelope,{expectedCount,expectedLatestVersionId,requiredIds=[]}={}){
  const result=envelope?.result;
  const items=Array.isArray(result)?result:
    Array.isArray(result?.result)?result.result:
    Array.isArray(result?.versions)?result.versions:null;
  fail(Array.isArray(items),'VERSION_LIST_RESULT_SHAPE');
  if(expectedCount!==undefined){
    const total=Number(envelope?.result_info?.total_count??result?.result_info?.total_count);
    fail(Number.isSafeInteger(total)&&total===expectedCount,'VERSION_LIST_TOTAL_COUNT');
  }
  if(expectedLatestVersionId){
    const latest=items.reduce((a,b)=>Number(b.number)>Number(a.number)?b:a);
    fail(latest?.id===expectedLatestVersionId,'LATEST_VERSION_ID');
  }
  for(const id of requiredIds)fail(items.some(v=>v.id===id),'VERSION_LIST_REQUIRED_VERSION');
  return items;
}
// Constructs a true new, UNDEPLOYED executable Worker version. All three
// proof callbacks must be implemented by the real rev10 parent; a boolean
// or injected "approved" field alone is not authorization.
export async function stageExecutableVersion({
  token,accountId,workerName='hbnf',fetchImpl=fetch,assets,installedPaths,installedDigests,
  changedPath='/glow-save-sync.mjs',modules,moduleDigests,settings,baselineVersionId,scriptEtag,
  parentRecord,requireParentAdmission,requireProviderCompleteInventory,requireFreshFiveTargetPreimage
}){
  settings=normalizeVersionSettings(settings);
  fail(typeof requireParentAdmission==='function'&&
    typeof requireProviderCompleteInventory==='function'&&
    typeof requireFreshFiveTargetPreimage==='function','PARENT_PROOF_CALLBACKS');
  fail((await requireParentAdmission(parentRecord))===true,'PARENT_NOT_ADMITTED');
  requireInventoryWitness(await requireProviderCompleteInventory(installedPaths,installedDigests),
    {workerName,baselineVersionId,installedPaths,installedDigests});
  fail((await requireFreshFiveTargetPreimage())===true,'FIVE_TARGET_PREIMAGE_NOT_FRESH');
  const c=apiClient({token,accountId,workerName,fetchImpl});
  const worker=await c.call(c.worker);
  fail(workerIdPattern.test(worker?.id||'')&&worker?.name===workerName,'WORKER_ID');
  const workerPath='/workers/workers/'+worker.id;
  const active=await c.call(c.script+'/deployments');
  fail(active?.deployments?.[0]?.versions?.length===1&&
    active.deployments[0].versions[0].version_id===baselineVersionId&&
    active.deployments[0].versions[0].percentage===100,'BASELINE_DRIFT');
  const oldVersion=await c.call(c.script+'/versions/'+baselineVersionId);
  fail(oldVersion?.id===baselineVersionId&&oldVersion?.resources?.script?.etag===scriptEtag,'SCRIPT_DRIFT');
  const placeholder=buildExactVersion({assets,installedPaths,installedDigests,changedPath,
    modules,moduleDigests,settings,baselineVersionId,assetJwt:'PLACEHOLDER_STAGING_TOKEN'});
  let session;
  try{session=await c.call(c.script+'/assets-upload-session','POST',{manifest:placeholder.manifest});}
  catch(e){
    // There is no documented read endpoint for an upload session. Read the
    // version inventory once, then stop; never repeat an ambiguous POST.
    try{await c.call(workerPath+'/versions?per_page=100');}catch{}
    throw Object.assign(Error('P0_CLOUDFLARE_AMBIGUOUS_ASSET_SESSION_NO_RETRY'),{cause:e});
  }
  fail(typeof session?.jwt==='string'&&Array.isArray(session?.buckets),'SESSION');
  const byHash=new Map(Object.entries(placeholder.manifest).map(([p,v])=>[v.hash,p]));
  const used=new Set();let completion=session.jwt;
  validateAssetBuckets(placeholder.manifest,session.buckets);
  for(const bucket of session.buckets){
    fail(Array.isArray(bucket)&&bucket.length>0,'BUCKET_SHAPE');
    const form=new FormData();
    for(const h of bucket){
      fail(byHash.has(h)&&!used.has(h),'BUCKET_UNRECOGNIZED_HASH');
      used.add(h);const p=byHash.get(h);
      const mime=p.endsWith('.mjs')||p.endsWith('.js')?'text/javascript':
        p.endsWith('.html')?'text/html':p.endsWith('.css')?'text/css':
        p.endsWith('.webmanifest')?'application/manifest+json':'application/octet-stream';
      form.append(h,new Blob([Buffer.from(assets.get(p)).toString('base64')],{type:mime}));
    }
    let uploaded;
    try{uploaded=await c.call('/workers/assets/upload?base64=true','POST',form,session.jwt);}
    catch(e){
      // Read version state for evidence, but asset-upload has no documented
      // per-session readback. A second upload is never attempted here.
      try{await c.call(workerPath+'/versions?per_page=100');}catch{}
      throw Object.assign(Error('P0_CLOUDFLARE_AMBIGUOUS_ASSET_UPLOAD_NO_RETRY'),{cause:e});
    }
    if(uploaded?.jwt)completion=uploaded.jwt;
  }
  fail(completion?.length>15&&(!session.buckets.length||completion!==session.jwt),'UPLOAD_INCOMPLETE');
  const result=buildExactVersion({assets,installedPaths,installedDigests,changedPath,
    modules,moduleDigests,settings,baselineVersionId,assetJwt:completion});
  fail((await requireFreshFiveTargetPreimage())===true,'FIVE_TARGET_PREIMAGE_NOT_FRESH');
  const justBefore=await c.call(c.script+'/deployments');
  fail(justBefore?.deployments?.[0]?.versions?.[0]?.version_id===baselineVersionId&&
    justBefore.deployments[0].versions[0].percentage===100,'PRECREATE_DRIFT');
  // This is the NEW Workers Beta Versions API: JSON modules with content_base64.
  // The older /workers/scripts/{name}/versions upload API instead requires multipart.
  let newVersion;
  const requestBody={version:result.body};
  try{newVersion=await c.call(workerPath+'/versions?deploy=false','POST',requestBody);}
  catch(e){
    // Reconcile the unique candidate marker through the read-only version list;
    // if it cannot be uniquely identified, stop without a second create.
    const list=await c.call(workerPath+'/versions?per_page=100');
    const tag=requestBody.version.annotations['workers/tag'];
    const matches=(list?.result||list?.versions||[]).filter(v=>v.annotations?.['workers/tag']===tag);
    fail(matches.length===1,'AMBIGUOUS_VERSION_CREATE_UNRESOLVED');
    newVersion=matches[0];
    if(!newVersion.id)throw Object.assign(Error('P0_CLOUDFLARE_AMBIGUOUS_VERSION_CREATE_UNRESOLVED'),{cause:e});
  }
  fail(uuid.test(newVersion?.id)&&newVersion.id!==baselineVersionId,'VERSION_CREATE');
  const verified=await c.call(workerPath+'/versions/'+newVersion.id);
  fail(verified?.id===newVersion.id&&verified.compatibility_date===settings.compatibility_date&&
    verified.annotations?.['workers/tag']===result.body.annotations['workers/tag'],'VERSION_READBACK');
  fail(JSON.stringify(verified.assets?.config)===JSON.stringify(requestBody.version.assets.config),
    'VERSION_ASSET_CONFIG_READBACK');
  const actual=(verified.bindings||[]).map(x=>{
    if(x.type==='inherit')fail(x.version_id===baselineVersionId,'BINDING_INHERITANCE_VERSION');
    return x.name+':'+x.type;
  }).sort();
  const expected=requestBody.version.bindings.map(x=>x.name+':'+x.type).sort();
  fail(actual.join('|')===expected.join('|'),'BINDING_READBACK');
  const after=await c.call(c.script+'/deployments');
  fail(after?.deployments?.[0]?.versions?.length===1&&
    after.deployments[0].versions[0].version_id===baselineVersionId&&
    after.deployments[0].versions[0].percentage===100,'ACTIVE_TRAFFIC_CHANGED');
  const retained=await c.call(c.script+'/versions/'+baselineVersionId);
  fail(retained?.id===baselineVersionId,'ROLLBACK_VERSION_NOT_RETAINED');
  return {status:'EXECUTABLE_VERSION_CREATED_NOT_DEPLOYED',versionId:newVersion.id,receipt:result.receipt};
}

// Stage the already-built Beta JSON candidate that inherits the exact v348
// ASSETS binding. This route uploads no asset files and never changes traffic.
// Real parent callbacks must verify the same-manifest Stage-A admission,
// downloaded candidate bytes, fresh five-target baseline, and a durable
// atomic one-time claim before the single POST can occur.
export async function stageInheritedBetaVersion({
  token,accountId,workerName='hbnf',fetchImpl=fetch,
  candidateBytes,candidateSha256,requestSha256,baselineVersionId,scriptEtag,manifestSha256,
  expectedLatestVersionId,expectedVersionCount,expectedTransactionId,expectedSourceHead,
  parentRecord,requireParentAdmission,verifyCandidateDownloadback,
  requireFreshFiveTargetPreimage,claimOnce
}){
  fail(typeof requireParentAdmission==='function'&&
    typeof verifyCandidateDownloadback==='function'&&
    typeof requireFreshFiveTargetPreimage==='function'&&
    typeof claimOnce==='function','INHERITED_STAGE_A_PROOF_CALLBACKS');
  fail(accountId===P0_ACCOUNT&&workerName===P0_WORKER&&baselineVersionId===P0_V348&&
    scriptEtag===P0_V348_ETAG&&hex64.test(manifestSha256||''),
    'INHERITED_STAGE_A_IDENTITY');
  const attempts=parentRecord?.cloudflareAssetRetentionAmendment?.stageAExecutionAttempts||[];
  const priorAttempt=[...attempts].reverse().find(a=>a?.status==='STOPPED_BEFORE_VERSION_CREATE');
  fail(priorAttempt?.status==='STOPPED_BEFORE_VERSION_CREATE'&&
    priorAttempt?.providerVersionCreatePostSent===false&&
    priorAttempt?.postAttemptReadback?.activeVersionId===baselineVersionId&&
    priorAttempt?.postAttemptReadback?.activePercentage===100&&
    expectedLatestVersionId===priorAttempt.postAttemptReadback.latestVersionId&&
    expectedVersionCount===priorAttempt.postAttemptReadback.versionCount,
    'INHERITED_STAGE_A_PRIOR_ATTEMPT_NOT_RECONCILED');
  const raw=Buffer.from(candidateBytes||[]);
  fail(raw.length===P0_BETA_CANDIDATE_BYTES&&candidateSha256===P0_BETA_CANDIDATE_SHA256&&
    sha256(raw)===candidateSha256,
    'INHERITED_CANDIDATE_ARTIFACT_HASH');
  const prepared=attempts.at(-1);
  fail(prepared?.status==='PREFLIGHT_READY_FOR_STAGE_A'&&
    prepared?.transactionId===expectedTransactionId&&
    prepared?.sourceHead===expectedSourceHead&&
    prepared?.candidateSha256===candidateSha256&&
    prepared?.requestSha256===requestSha256&&
    prepared?.latestVersionId===expectedLatestVersionId&&
    prepared?.versionCount===expectedVersionCount,
    'INHERITED_STAGE_A_PREFLIGHT_NOT_BOUND');
  let candidate;
  try{candidate=JSON.parse(raw.toString('utf8'));}catch{fail(false,'INHERITED_CANDIDATE_JSON');}
  const operation=candidate?.operation,request=candidate?.request,version=request?.version;
  const requestBytes=Buffer.from(JSON.stringify(request||{}));
  fail(operation?.method==='POST'&&
    operation?.path==='/accounts/{account_id}/workers/workers/{worker_id}/versions?deploy=false'&&
    operation?.contentType==='application/json'&&operation?.createsUndeployedVersion===true&&
    operation?.productionTrafficChange===false&&operation?.uploadsAssets===false&&
    requestBytes.length===P0_BETA_REQUEST_BYTES&&requestSha256===P0_BETA_REQUEST_SHA256&&
    operation?.requestBytes===requestBytes.length&&operation?.requestSha256===requestSha256&&
    sha256(requestBytes)===requestSha256,'INHERITED_CANDIDATE_REQUEST_HASH');
  fail(Object.keys(request||{}).length===1&&version&&
    !Object.hasOwn(version,'routes')&&!Object.hasOwn(version,'crons'),
    'INHERITED_CANDIDATE_VERSION_ENVELOPE');
  const assetBinding=(version.bindings||[]).find(b=>b.name==='ASSETS');
  fail(assetBinding?.type==='inherit'&&assetBinding?.version_id===baselineVersionId,
    'INHERITED_ASSETS_BINDING_NOT_PINNED');
  fail(Array.isArray(version.bindings)&&version.bindings.length===8&&
    version.bindings.every(b=>b?.name&&b.type==='inherit'&&b.version_id===baselineVersionId)&&
    new Set(version.bindings.map(b=>b.name)).size===version.bindings.length,
    'INHERITED_BINDINGS_NOT_EXACT');
  fail(version.assets&&Object.keys(version.assets).length===1&&version.assets.config&&
    !version.assets.jwt&&!version.assets.manifest,'INHERITED_ASSET_UPLOAD_PRESENT');
  const workerFirst=version.assets.config.run_worker_first;
  fail(version.assets.config.base_path==='/'&&Array.isArray(workerFirst)&&
    ['/api/*','/internal/*','/glow-save-sync.mjs'].every(p=>workerFirst.includes(p)),
    'INHERITED_HELPER_WORKER_FIRST');
  fail(typeof version.annotations?.['workers/tag']==='string'&&
    version.annotations['workers/tag'].startsWith('hbnf-p0-')&&
    version.compatibility_date&&version.usage_model==='standard'&&
    Array.isArray(version.modules)&&version.modules.length>0,
    'INHERITED_CANDIDATE_METADATA');
  validateCloudflareWorkerModules(version.modules,version.main_module);
  const mainModule=version.modules.find(m=>m.name===version.main_module);
  const mainBytes=Buffer.from(mainModule.content_base64||'','base64');
  fail(mainBytes.length>0&&sha256(mainBytes)===candidate.source?.candidateModuleSha256,
    'INHERITED_MAIN_MODULE_SOURCE_PARITY');
  fail(candidate.source?.helperSha256==='674f8712d7313fa73cf8bd761d458b7d6e5613b1eb147a24a0a0682e88f1d54a',
    'INHERITED_HELPER_SOURCE_PARITY');
  fail((await requireParentAdmission(parentRecord,{manifestSha256,candidateSha256,requestSha256}))===true,
    'INHERITED_STAGE_A_NOT_ADMITTED');
  const downloaded=await verifyCandidateDownloadback({candidateSha256,bytes:raw.length});
  fail(downloaded?.verified===true&&downloaded.sha256===candidateSha256&&downloaded.bytes===raw.length,
    'INHERITED_CANDIDATE_DOWNLOADBACK');
  fail((await requireFreshFiveTargetPreimage())===true,'INHERITED_FIVE_TARGET_PREIMAGE_NOT_FRESH');
  const c=apiClient({token,accountId,workerName,fetchImpl});
  const worker=await c.call(c.worker);
  fail(workerIdPattern.test(worker?.id||'')&&worker?.name===workerName,'INHERITED_WORKER_ID');
  const workerPath='/workers/workers/'+worker.id;
  const priorVersions=versionListItems(await c.callEnvelope(workerPath+'/versions?per_page=100'),{
    expectedCount:expectedVersionCount,expectedLatestVersionId,
    requiredIds:[baselineVersionId,expectedLatestVersionId]});
  const active=await c.call(c.script+'/deployments');
  fail(Array.isArray(active?.deployments)&&active.deployments.length>=1&&
    active.deployments[0]?.versions?.length===1&&
    active.deployments[0].versions[0].version_id===baselineVersionId&&
    active.deployments[0].versions[0].percentage===100,'INHERITED_BASELINE_DRIFT');
  const oldVersion=await c.call(c.script+'/versions/'+baselineVersionId);
  fail(oldVersion?.id===baselineVersionId&&oldVersion?.resources?.script?.etag===scriptEtag,
    'INHERITED_V348_ETAG_DRIFT');
  const baselineBindings=oldVersion?.resources?.bindings||oldVersion?.bindings;
  fail(Array.isArray(baselineBindings)&&baselineBindings.length===8&&
    baselineBindings.map(x=>x.name).sort().join('|')===version.bindings.map(x=>x.name).sort().join('|'),
    'INHERITED_BASELINE_BINDING_SET');
  // All provider response shapes and exact lineage checks pass before claiming.
  // The local one-use claim is acquired immediately before the single POST.
  const finalPreimage=await requireFreshFiveTargetPreimage();
  fail(finalPreimage===true,'INHERITED_IMMEDIATE_PRECHANGE_READBACK');
  const claim=await claimOnce({manifestSha256,candidateSha256,requestSha256,baselineVersionId,
    expectedLatestVersionId,expectedVersionCount,expectedTransactionId,workerId:worker.id});
  fail(claim?.acquired===true&&claim?.durable===true&&claim?.manifestSha256===manifestSha256&&
    typeof claim?.transactionId==='string'&&claim.transactionId===expectedTransactionId,
    'INHERITED_STAGE_A_ATOMIC_CLAIM');
  let created;
  try{created=await c.call(workerPath+'/versions?deploy=false','POST',request);}
  catch(error){
    // The create may have committed despite a lost response. Read once by the
    // exact candidate tag; never issue a second POST on an ambiguous outcome.
    let listEnvelope;
    try{listEnvelope=await c.callEnvelope(workerPath+'/versions?per_page=100');}
    catch{throw Object.assign(Error('P0_INHERITED_BETA_CREATE_AMBIGUOUS_READBACK_FAILED'),{cause:error});}
    const items=versionListItems(listEnvelope);
    const matches=items.filter(v=>v.annotations?.['workers/tag']===version.annotations['workers/tag']);
    fail(matches.length===1,'INHERITED_BETA_CREATE_AMBIGUOUS_NOT_UNIQUE');
    created=matches[0];
    if(!created?.id)throw Object.assign(Error('P0_INHERITED_BETA_CREATE_AMBIGUOUS_NO_ID'),{cause:error});
  }
  fail(uuid.test(created?.id)&&created.id!==baselineVersionId,'INHERITED_BETA_VERSION_CREATE');
  const verified=await c.call(workerPath+'/versions/'+created.id);
  fail(verified?.id===created.id&&verified.annotations?.['workers/tag']===version.annotations['workers/tag']&&
    verified.compatibility_date===version.compatibility_date,'INHERITED_BETA_VERSION_READBACK');
  const settings=verified.resources?.script_runtime||verified;
  const actualConfig=verified.assets?.config||(()=>{
    const a=settings.assets;
    if(!a)return null;
    return {base_path:a.base_path,run_worker_first:a.static_routing?.user_worker||a.raw_run_worker_first};
  })();
  fail(actualConfig?.base_path===version.assets.config.base_path&&
    JSON.stringify(actualConfig.run_worker_first)===JSON.stringify(workerFirst),
    'INHERITED_BETA_ASSET_CONFIG_READBACK');
  const actualBindings=verified.resources?.bindings||verified.bindings||[];
  const canon=items=>items.map(b=>({name:b.name,type:b.type,version_id:b.version_id||null}))
    .sort((a,b)=>a.name.localeCompare(b.name));
  fail(JSON.stringify(canon(actualBindings))===JSON.stringify(canon(version.bindings)),
    'INHERITED_BETA_BINDING_READBACK');
  const after=await c.call(c.script+'/deployments');
  fail(Array.isArray(after?.deployments)&&after.deployments.length>=1&&
    after.deployments[0]?.versions?.length===1&&
    after.deployments[0].versions[0].version_id===baselineVersionId&&
    after.deployments[0].versions[0].percentage===100,'INHERITED_ACTIVE_TRAFFIC_CHANGED');
  const retained=await c.call(c.script+'/versions/'+baselineVersionId);
  fail(retained?.id===baselineVersionId&&retained?.resources?.script?.etag===scriptEtag,
    'INHERITED_V348_ROLLBACK_NOT_RETAINED');
  return {status:'INHERITED_BETA_VERSION_CREATED_NOT_DEPLOYED',versionId:created.id,
    manifestSha256,candidateSha256,requestSha256,transactionId:claim.transactionId,
    activeVersionId:baselineVersionId,activePercentage:100};
}

// Use Wrangler's supported credential retrieval so the existing Mac OAuth
// session can authorize the Beta JSON call without an API token being passed,
// printed, or persisted by the caller.
export async function stageInheritedBetaVersionWithWranglerOAuth({
  wranglerBinary=process.env.WRANGLER_BIN,
  readToken=readWranglerToken,...options
}={}){
  fail(typeof wranglerBinary==='string'&&wranglerBinary.startsWith('/'),
    'INHERITED_WRANGLER_BINARY_PATH');
  fail(typeof readToken==='function','INHERITED_WRANGLER_TOKEN_READER');
  const token=await readToken(wranglerBinary);
  fail(typeof token==='string'&&token.length>12&&!/\s/.test(token),
    'INHERITED_WRANGLER_OAUTH_UNAVAILABLE');
  return stageInheritedBetaVersion({...options,token});
}
// Called only inside the same rev10 admitted saga; no separate deployment driver.
export async function deployRetainedVersion({token,accountId,workerName='hbnf',fetchImpl=fetch,
  targetVersionId,currentVersionId,manifestSha256,verifyExclusiveParentClaim}){
  fail(hex64.test(manifestSha256||'')&&
    typeof verifyExclusiveParentClaim==='function','PARENT_CLAIM');
  fail((await verifyExclusiveParentClaim(manifestSha256,currentVersionId,targetVersionId))===true,
    'EXCLUSIVE_PARENT_CLAIM_NOT_GRANTED');
  const c=apiClient({token,accountId,workerName,fetchImpl});
  const before=await c.call(c.script+'/deployments');
  fail(before?.deployments?.[0]?.versions?.length===1&&
    before.deployments[0].versions[0].version_id===currentVersionId&&
    before.deployments[0].versions[0].percentage===100,'DEPLOY_CONCURRENT_DRIFT');
  const retained=await c.call(c.script+'/versions/'+targetVersionId);
  fail(retained?.id===targetVersionId,'RETAINED_VERSION_ABSENT');
  try{
    await c.call(c.script+'/deployments','POST',{strategy:'percentage',
      versions:[{version_id:targetVersionId,percentage:100}]});
  }catch(e){
    const observed=await c.call(c.script+'/deployments');
    const versions=observed?.deployments?.[0]?.versions||[];
    if(versions.length===1&&versions[0].version_id===targetVersionId&&versions[0].percentage===100)
      return {status:'VERSION_DEPLOY_READBACK_RECONCILED',versionId:targetVersionId,manifestSha256};
    throw Object.assign(Error('P0_CLOUDFLARE_AMBIGUOUS_DEPLOY_READBACK_REQUIRED_NO_RETRY'),{cause:e});
  }
  const after=await c.call(c.script+'/deployments');
  fail(after?.deployments?.[0]?.versions?.length===1&&
    after.deployments[0].versions[0].version_id===targetVersionId&&
    after.deployments[0].versions[0].percentage===100,'DEPLOY_READBACK');
  return {status:'VERSION_DEPLOY_READBACK',versionId:targetVersionId,manifestSha256};
}

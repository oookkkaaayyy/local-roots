// Scoring P0 #115/#147 / PR151: Cloudflare executable version construction.
// This module never grants admission. The original rev10 parent owns the durable
// five-target claim, prechange readback, deployment, rollback and closeout.
// API: https://developers.cloudflare.com/workers/static-assets/direct-upload/
import {createHash} from 'node:crypto';
import {extname} from 'node:path';
import {validateCloudflareWorkerModules} from '../validate-cloudflare-worker-multipart.mjs';

const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const hex64=/^[a-f0-9]{64}$/i;
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
  async function call(path,method='GET',body,authorization=token){
    const init={method,headers:{Authorization:'Bearer '+authorization}};
    if(body!==undefined){
      init.body=body instanceof FormData?body:JSON.stringify(body);
      if(!(body instanceof FormData))init.headers['Content-Type']='application/json';
    }
    const response=await fetchImpl(prefix+path,init);
    fail(response?.ok,'HTTP_'+method+'_'+response?.status);
    const payload=await response.json();
    fail(payload?.success!==false&&(!Array.isArray(payload?.errors)||payload.errors.length===0),'PROVIDER_RESPONSE');
    return payload?.result;
  }
  const script='/workers/scripts/'+workerName;
  const worker='/workers/workers/'+workerName;
  return {call,script,worker};
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
  fail(uuid.test(worker?.id)&&worker?.name===workerName,'WORKER_ID');
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

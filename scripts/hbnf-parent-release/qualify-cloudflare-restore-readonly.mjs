// Read-only qualification of the CURRENT immutable Cloudflare Worker restore route.
// Consumes the owner-private, SHA-verified live source backup. Never POST or mutate.
// Keep source bytes, asset bytes and non-secret configuration in 0600 local files.
import {createHash} from 'node:crypto';
import {readFile,open} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readWranglerToken} from './capture-cloudflare-current-readonly.mjs';

const API='https://api.cloudflare.com/client/v4';
const ACCOUNT='e3bc6b78f1104fa0c2a01245084594cf';
const ZONE='f126298df13dcb1d8b58b62b47f52a20';
const WORKER='hbnf';
const PUBLIC='https://hbnightflyers.com';
const ASSETS=Object.freeze([
  "/admin.html",
  "/apple-touch-icon.png",
  "/bag-tags-prominence.js",
  "/cart.html",
  "/config.js",
  "/fonts/cabin-latin-400.woff2",
  "/fonts/cabin-latin-700.woff2",
  "/glow-save-sync.mjs",
  "/glow.html",
  "/hbnf-bone-ink-logo.png",
  "/hbnf-bone-ink-theme.css",
  "/hbnf-cart-features.mjs",
  "/hbnf-cart-icon-180.png",
  "/hbnf-cart-icon-512.png",
  "/hbnf-cart-manifest.webmanifest",
  "/hbnf-cart-semantic.mjs",
  "/hbnf-cart-skins-score.mjs",
  "/hbnf-cart-ui-v6.css",
  "/hbnf-cart-ui-v6.mjs",
  "/hbnf-cart.html",
  "/hbnf-cart.js",
  "/hbnf-favicon-32.png",
  "/hbnf-main-cart-shell.js",
  "/hbnf-main-icon-180.png",
  "/hbnf-main-icon-192.png",
  "/hbnf-main-icon-512.png",
  "/hbnf-main-manifest.webmanifest",
  "/hbnf-mobile-ux.js",
  "/index.html",
  "/league-state-cas.mjs",
  "/matrix-apple-touch-icon.png",
  "/matrix-build.json",
  "/matrix-control.js",
  "/matrix-icon-512.png",
  "/matrix-manifest.webmanifest",
  "/matrix-quick-controls.js",
  "/matrix-show-library.json",
  "/matrix.html",
  "/random.html",
  "/round-tags.js",
  "/skills.html",
  "/skins-tag-editor.js",
  "/skins-tag-projection-modal.js",
  "/skins-tag-tracker.js",
  "/skins-ux-polish.js",
  "/skins.html"
]);
// Exact bounded 46-path known v48 package inventory. A match does not prove no unseen assets.
const EXPECTED_ENVELOPE_SHA='ffbfa97c3cbb6f6122220996c9c1b2595106dfd8a2722cde5d9546178f41f2cd';
const sha=b=>createHash('sha256').update(b).digest('hex');
const fail=code=>{throw Error('CF_RESTORE_'+code);};
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const safe=e=>/^CF_RESTORE_[A-Z0-9_]+$/.test(e?.message||'')?e.message:'CF_RESTORE_UNCLASSIFIED';
const bytesFromJson=b=>JSON.parse(b.toString('utf8').replace(/^\uFEFF/,''));

export function validateCurrentCapture(bytes,expectedSha=EXPECTED_ENVELOPE_SHA){
  if(!Buffer.isBuffer(bytes)||sha(bytes)!==expectedSha)fail('BACKUP_SHA_MISMATCH');
  let c;
  try{c=bytesFromJson(bytes);}catch{fail('BACKUP_JSON_INVALID');}
  if(c.schema!=='hbnf.cloudflare.current.observation.v1'||c.worker!==WORKER||
     !uuid(c.before?.versionId)||c.before?.versionId!==c.after?.versionId||
     c.before?.deploymentId!==c.after?.deploymentId||
     c.version?.state!=='OBSERVED'||c.version?.data?.matchesActive!==true||
     c.route?.state!=='OBSERVED'||c.route?.data?.matched!==true||
     c.schedules?.state!=='OBSERVED'||c.settings?.state!=='OBSERVED')
    fail('BACKUP_IDENTITY_INVALID');
  let binary;
  try{binary=Buffer.from(c.source.multipartBase64,'base64');}catch{fail('BACKUP_SOURCE_INVALID');}
  if(binary.length!==c.source.bytes||sha(binary)!==c.source.sha256||
     binary.length<30000||binary.length>24*1024*1024)fail('BACKUP_SOURCE_HASH_MISMATCH');
  return c;
}
async function bounded(response,limit=5*1024*1024){
  const reader=response.body?.getReader?.();if(!reader)fail('RESPONSE_STREAM_REQUIRED');
  const chunks=[];let total=0;
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>limit)fail('RESPONSE_TOO_LARGE');
      chunks.push(Buffer.from(value));
    }
  }finally{reader.releaseLock();}
  return Buffer.concat(chunks,total);
}
async function get(stage,url,token,fetchImpl){
  let r;
  try{r=await fetchImpl(url,{method:'GET',redirect:'manual',
    headers:url.startsWith(API)?{Authorization:'Bearer '+token}:{Accept:'*/*'},
    signal:AbortSignal.timeout(12000)});
  }catch(e){fail(stage+'_NETWORK_OR_TIMEOUT');}
  if(r.status!==200)fail(stage+'_HTTP_'+r.status);
  return r;
}
async function json(stage,path,token,fetchImpl){
  const r=await get(stage,API+path,token,fetchImpl);
  const b=await bounded(r,2*1024*1024);
  let o;try{o=bytesFromJson(b);}catch{fail(stage+'_JSON');}
  if(!o||o.success!==true||o.result==null)fail(stage+'_API_REJECTED');
  return o.result;
}
function active(deployments){
  const d=deployments?.deployments?.[0];
  if(!uuid(d?.id)||!Array.isArray(d?.versions)||d.versions.length!==1||
     d.versions[0]?.percentage!==100||!uuid(d.versions[0]?.version_id))
    fail('ACTIVE_DEPLOYMENT_AMBIGUOUS');
  return {deploymentId:d.id,versionId:d.versions[0].version_id};
}
function redactSettings(settings){
  const names=new Set(['SUPABASE_URL','UDISC_GLOW_ACCESS_APPROVED','UDISC_GLOW_EVENT_DATE',
    'UDISC_GLOW_EVENT_ID','UDISC_GLOW_WINDOW_START','UDISC_GLOW_WINDOW_END']);
  const bindings=Array.isArray(settings.bindings)?settings.bindings:[];
  if(!bindings.length)fail('SETTINGS_BINDINGS_EMPTY');
  const safeBindings=bindings.map(b=>{
    const result={name:b.name,type:b.type};
    if(b.type==='plain_text'&&names.has(b.name)&&typeof b.text==='string'&&b.text.length<1024)
      result.text=b.text;
    if(b.type==='secret_text')result.secretValue='NOT_CAPTURED_VERSION_RETENTION_REQUIRED';
    return result;
  });
  const allowed=['compatibility_date','compatibility_flags','usage_model','placement',
    'limits','observability','logpush','main_module'];
  const options={};
  for(const name of allowed)if(settings[name]!==undefined)options[name]=settings[name];
  return {bindings:safeBindings,options};
}
async function captureStaticAssets(fetchImpl){
  const out=[];
  for(const path of ASSETS){
    try{
      const originalUrl=PUBLIC+path;
      let response;
      try{
        response=await fetchImpl(originalUrl,{method:'GET',redirect:'manual',
          headers:{Accept:'*/*'},signal:AbortSignal.timeout(12000)});
      }catch{fail('ASSET_NETWORK_OR_TIMEOUT');}
      let redirectTo=null;
      if(response.status===307){
        // Native Cloudflare HTML canonicalization: .html -> extensionless,
        // index.html -> root. Never follow arbitrary or cross-origin redirects.
        if(!path.endsWith('.html'))fail('ASSET_REDIRECT_UNEXPECTED');
        const expected=path==='/index.html'?'/':path.slice(0,-5);
        const loc=response.headers?.get?.('location');
        if(!loc)fail('ASSET_REDIRECT_NO_LOCATION');
        let target;
        try{target=new URL(loc,originalUrl);}catch{fail('ASSET_REDIRECT_INVALID');}
        if(target.origin!==PUBLIC||target.pathname!==expected||
           target.search||target.hash||target.username||target.password)
          fail('ASSET_REDIRECT_NOT_CANONICAL');
        redirectTo=target.pathname;
        response=await get('ASSET',target.href,null,fetchImpl);
      }else if(response.status!==200)fail('ASSET_HTTP_'+response.status);
      const raw=await bounded(response,5*1024*1024);
      if(!raw.length)fail('ASSET_EMPTY');
      const finalType=response.headers?.get?.('content-type')??null;
      if(path.endsWith('.html')&&!/^text\/html(?:\s*;|$)/i.test(finalType??''))
        fail('ASSET_CONTENT_TYPE_NOT_HTML');
      out.push({path,state:'OBSERVED',redirectTo,bytes:raw.length,sha256:sha(raw),
        contentType:finalType,bytesBase64:raw.toString('base64')});
    }catch(e){out.push({path,state:'UNVERIFIED',errorCode:safe(e)});}
  }
  return out;
}
export async function qualify({backupBytes,token,fetchImpl=fetch,assets=true,expectedCaptureSha=EXPECTED_ENVELOPE_SHA}={}){
  const c=validateCurrentCapture(backupBytes,expectedCaptureSha);
  if(typeof token!=='string'||token.length<15||/\s/.test(token))fail('TOKEN_FORMAT');
  const suffix='/accounts/'+ACCOUNT+'/workers/scripts/'+WORKER;
  const start=active(await json('DEPLOYMENTS',suffix+'/deployments',token,fetchImpl));
  if(start.deploymentId!==c.before.deploymentId||start.versionId!==c.before.versionId)
    fail('ACTIVE_BASELINE_CHANGED');
  const [specific,version,list,settings,schedules,routes]=await Promise.all([
    json('DEPLOYMENT',suffix+'/deployments/'+c.before.deploymentId,token,fetchImpl),
    json('VERSION',suffix+'/versions/'+c.before.versionId,token,fetchImpl),
    json('VERSIONS',suffix+'/versions?deployable=true&per_page=100',token,fetchImpl),
    json('SETTINGS',suffix+'/settings',token,fetchImpl),
    json('SCHEDULES',suffix+'/schedules',token,fetchImpl),
    json('ROUTES','/zones/'+ZONE+'/workers/routes',token,fetchImpl),
  ]);
  if(specific.id!==c.before.deploymentId||specific.versions?.length!==1||
     specific.versions[0].version_id!==c.before.versionId||specific.versions[0].percentage!==100)
    fail('DEPLOYMENT_DETAILS_CHANGED');
  if(version.id!==c.before.versionId||version.number!==c.version.data.number)
    fail('VERSION_IDENTITY_CHANGED');
  const resourcesHash=sha(Buffer.from(JSON.stringify(version.resources??null)));
  if(resourcesHash!==c.version.data.resourceMetadataSha256)
    fail('VERSION_RESOURCES_CHANGED');
  if(version.resources?.script?.etag!==c.version.data.scriptEtag)
    fail('VERSION_SCRIPT_ETAG_CHANGED');
  // Cloudflare's list-versions API returns {items:[...]}, NOT a bare array.
  // If the response shape drifts, fail rather than silently misclassify rollback.
  if(!list||!Array.isArray(list.items))fail('DEPLOYABLE_VERSIONS_SHAPE_INVALID');
  const deployable=list.items.some(x=>x.id===c.before.versionId);
  const routeItems=Array.isArray(routes)?routes.filter(x=>x.script===WORKER)
    .map(x=>({id:x.id??null,pattern:x.pattern,script:x.script,zone_id:x.zone_id??null})):[];
  if(!routeItems.some(x=>x.pattern?.startsWith('hbnightflyers.com')))
    fail('ROUTE_MISSING');
  const cronItems=Array.isArray(schedules.schedules)?schedules.schedules:
    (Array.isArray(schedules)?schedules:[]);
  if(cronItems.length!==c.schedules.data.cronCount)fail('CRON_COUNT_CHANGED');
  const normalized=redactSettings(settings);
  const sourceNames=(c.settings.data.bindings||[]).map(x=>x.name+'|'+x.type).sort();
  const liveNames=normalized.bindings.map(x=>x.name+'|'+x.type).sort();
  if(JSON.stringify(sourceNames)!==JSON.stringify(liveNames))
    fail('BINDING_METADATA_CHANGED');
  const assetRows=assets?await captureStaticAssets(fetchImpl):[];
  const end=active(await json('DEPLOYMENTS',suffix+'/deployments',token,fetchImpl));
  if(end.deploymentId!==start.deploymentId||end.versionId!==start.versionId)
    fail('DEPLOYMENT_CHANGED_DURING_QUALIFICATION');

  return {
    schema:'hbnf.cloudflare.restore.preflight.readonly.v1',
    controllingManifestId:'hbnf-p0-pr151-udisc-20261103-52e120-review-only',
    sourceCaptureDriveId:'1NQVVsTsLyOYwF7AUTFT0AydDEvptAbsI',
    sourceCaptureSha256:sha(backupBytes),
    capturedAt:new Date().toISOString(),
    currentVersionId:start.versionId, currentDeploymentId:start.deploymentId,
    sourceMultipart:{bytes:c.source.bytes,sha256:c.source.sha256,
      oldHistoricalRawHashMatched:c.historicalSourceHashStillMatches,
      historicalRawDifferenceUnresolved:!c.historicalSourceHashStillMatches},
    version:{number:version.number,scriptEtag:version.resources?.script?.etag,
      resourcesSha256:resourcesHash,retainedInDeployableList:deployable,
      metadata:{created_on:version.metadata?.created_on??null,
        source:version.metadata?.source??null}},
    routes:routeItems,
    cron:cronItems.map(x=>({cron:x.cron,created_on:x.created_on??null,modified_on:x.modified_on??null})),
    settings:normalized,
    servedStaticAssets:assetRows,
    rollbackProcedure:{status:deployable?'RETAINED_VERSION_REQUEST_SOURCE_QUALIFIED_NOT_EXECUTED':
      'RETAINED_VERSION_UNVERIFIED_NOT_EXECUTED',
      method:'POST',path:suffix+'/deployments',force:false,
      request:{strategy:'percentage',versions:[{version_id:start.versionId,percentage:100}]},
      conditions:['fresh same-manifest prechange match','current version retained',
        'single Scoring release owner','provider permission for rollback',
        'post-rollback deployment+source+assets provider readback']},
    failClosed:{
      versionSpecificRestoreActuallyExecuted:false,
      fullAssetsInventoryCaptured:false,
      sameManifestAdmitted:false,
      productionMutated:false,
      functionalAcceptance:false,
    },
  };
}

export function publicReceipt(r){
  return {
    status:'READ_ONLY_NO_RELEASE_ADMISSION',
    versionId:r.currentVersionId,
    versionRetainedInDeployableList:r.version.retainedInDeployableList,
    versionMetadataMatch:true,routeCount:r.routes.length,
    cronCount:r.cron.length,bindingCount:r.settings.bindings.length,
    knownAssetInventorySize:ASSETS.length,
    sampledAssetsObserved:r.servedStaticAssets.filter(x=>x.state==='OBSERVED').length,
    sampledAssetsMissing:r.servedStaticAssets.filter(x=>x.state!=='OBSERVED')
      .map(x=>({path:x.path,errorCode:x.errorCode??null})),
    sampledBytes:r.servedStaticAssets.reduce((n,x)=>n+(x.bytes||0),0),
    assetFingerprint:sha(Buffer.from(r.servedStaticAssets.map(x=>
      [x.path,x.state,x.sha256??'UNVERIFIED'].join('|')).join('\n'))),
    rollbackProcedure:r.rollbackProcedure.status,
    historicalMultipartDiffStillUnresolved:r.sourceMultipart.historicalRawDifferenceUnresolved,
  };
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const input=resolve(process.argv[2]||''),output=resolve(process.argv[3]||'');
  if(process.argv.length!==4||!input.startsWith(process.env.HOME+'/Downloads/')||
     !output.startsWith(process.env.HOME+'/Downloads/')||!output.endsWith('.json')||
     input===output){process.stderr.write('CF_RESTORE_LOCAL_DOWNLOADS_PATH_REQUIRED\n');process.exitCode=2;}
  else{
    try{
      const bytes=await readFile(input);
      const token=readWranglerToken(process.env.WRANGLER_BIN);
      const record=await qualify({backupBytes:bytes,token});
      const f=await open(output,'wx',0o600);
      try{await f.writeFile(JSON.stringify(record)+'\n');await f.sync();}
      finally{await f.close();}
      process.stdout.write('RESTORE_PREFLIGHT_READ_ONLY '+JSON.stringify(publicReceipt(record))+'\n');
      process.stdout.write('PRIVATE_FILE_SAVED '+output+'\n');
    }catch(e){process.stderr.write(safe(e)+'\n');process.exitCode=1;}
  }
}

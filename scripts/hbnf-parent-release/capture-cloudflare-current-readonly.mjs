// Diagnostic/recovery GETs ONLY. Independent of the historical rev7 pinned baseline.
// Local PRIVATE source observation, not a durable rollback or release admission.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {open} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const API='https://api.cloudflare.com/client/v4';
const ACCOUNT='e3bc6b78f1104fa0c2a01245084594cf';
const ZONE='f126298df13dcb1d8b58b62b47f52a20';
const WORKER='hbnf';
const EXPECTED='48ffa87e-3c83-46d0-a6ca-db7bf0b064e6';
const PRIOR_SOURCE_HASH='fd45197dc2bcf23505490c0d64b3b622ad1d7e782a06907be59cc0081ff4eefc';
const MAX_SOURCE_BYTES=24*1024*1024;
const sha=b=>createHash('sha256').update(b).digest('hex');
const isUuid=s=>typeof s==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(s);
const code=(stage,suffix)=>'CF_'+stage+'_'+suffix;
const fail=(stage,suffix)=>{throw Error(code(stage,suffix));};
const safe=x=>typeof x==='string'&&/^[A-Z0-9_]+$/.test(x)?x:'CF_UNCLASSIFIED_LOCAL_ERROR';

function tokenCheck(token){
  if(typeof token!=='string'||token.length<15||token.length>4096||/[\s]/.test(token)||token.startsWith('Bearer '))
    fail('AUTH','TOKEN_NOT_PLAIN_SINGLE_LINE');
}

// Wrangler --json is the documented machine-readable credential output.
// Never print, persist, or place its raw stdout in an error message.
export function parseWranglerTokenJson(raw) {
  let value;
  try { value=JSON.parse(raw); }
  catch { fail('AUTH','WRANGLER_JSON_INVALID'); }
  if(value?.type==='api_key')fail('AUTH','API_KEY_EMAIL_NOT_SUPPORTED');
  if(value?.type!=='oauth'&&value?.type!=='api_token')
    fail('AUTH','WRANGLER_TOKEN_TYPE_UNSUPPORTED');
  tokenCheck(value.token);
  return value.token;
}

export function readWranglerToken(wranglerBinary,run=execFileSync){
  if(typeof wranglerBinary!=='string'||!wranglerBinary.startsWith('/')||
     wranglerBinary.includes('\\n')||wranglerBinary.includes('\\r'))
    fail('AUTH','WRANGLER_BINARY_PATH_INVALID');
  let stdout;
  try {
    stdout=run(wranglerBinary,['auth','token','--json'],{
      encoding:'utf8',timeout:20000,maxBuffer:65536,stdio:['ignore','pipe','pipe']
    });
  } catch { fail('AUTH','WRANGLER_COMMAND_FAILED'); }
  return parseWranglerTokenJson(stdout);
}

async function request(stage,path,token,fetchImpl){
  let r;
  try{
    r=await fetchImpl(API+path,{method:'GET',redirect:'manual',headers:{authorization:'Bearer '+token},
      signal:AbortSignal.timeout(12000)});
  }catch(e){fail(stage,e?.name==='TimeoutError'?'TIMEOUT':'NETWORK_OR_TLS');}
  if(r.status!==200)fail(stage,'HTTP_'+r.status);
  return r;
}
async function json(stage,path,token,fetchImpl){
  const r=await request(stage,path,token,fetchImpl);
  try{
    const v=await r.json();
    if(!v||v.success===false)fail(stage,'API_REJECTED');
    return v.result;
  }catch(e){if(typeof e?.message==='string'&&/^CF_[A-Z0-9_]+$/.test(e.message))throw e;fail(stage,'JSON_FORMAT');}
}
async function deployment(token,fetchImpl){
  const d=await json('DEPLOYMENTS','/accounts/'+ACCOUNT+'/workers/scripts/'+WORKER+'/deployments',token,fetchImpl);
  const active=d?.deployments?.[0];
  if(!active?.id||!Array.isArray(active.versions)||active.versions.length!==1||
     active.versions[0]?.percentage!==100||!isUuid(active.versions[0]?.version_id))
    fail('DEPLOYMENTS','NO_SINGLE_ACTIVE_VERSION');
  return {deploymentId:active.id,versionId:active.versions[0].version_id};
}
async function optional(stage,path,token,fetchImpl,extract){
  try{return {state:'OBSERVED',data:extract(await json(stage,path,token,fetchImpl))};}
  catch(e){return {state:'UNVERIFIED',code:safe(e?.message)};}
}
async function source(token,fetchImpl){
  const r=await request('SOURCE','/accounts/'+ACCOUNT+'/workers/scripts/'+WORKER,token,fetchImpl);
  const declared=Number(r.headers?.get?.('content-length'));
  if(Number.isFinite(declared)&&declared>MAX_SOURCE_BYTES)fail('SOURCE','TOO_LARGE');
  if(!r.body||typeof r.body.getReader!=='function')fail('SOURCE','STREAM_REQUIRED');
  const reader=r.body.getReader(),chunks=[];
  let n=0;
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      n+=value.byteLength;
      if(n>MAX_SOURCE_BYTES)fail('SOURCE','TOO_LARGE');
      chunks.push(Buffer.from(value));
    }
  }catch(e){if(typeof e?.message==='string'&&/^CF_[A-Z0-9_]+$/.test(e.message))throw e;fail('SOURCE','INTERRUPTED_STREAM');}
  finally{reader.releaseLock();}
  if(!n)fail('SOURCE','EMPTY');
  const bytes=Buffer.concat(chunks,n);
  return {bytes,sha256:sha(bytes)};
}

export async function captureCurrentCloudflareReadOnly({token,fetchImpl=fetch}={}){
  tokenCheck(token);
  const before=await deployment(token,fetchImpl);
  const [route,version,schedules,settings]=await Promise.all([
    optional('ROUTES','/zones/'+ZONE+'/workers/routes',token,fetchImpl,
      data=>({matched:Array.isArray(data)&&data.some(x=>x.script===WORKER&&
        String(x.pattern||'').startsWith('hbnightflyers.com'))})),
    optional('VERSION','/accounts/'+ACCOUNT+'/workers/scripts/'+WORKER+'/versions/'+before.versionId,token,fetchImpl,
      data=>({matchesActive:data?.id===before.versionId,number:data?.number??null,
        scriptEtag:data?.resources?.script?.etag??null,
        resourceMetadataSha256:sha(Buffer.from(JSON.stringify(data?.resources??null)))})),
    optional('SCHEDULES','/accounts/'+ACCOUNT+'/workers/scripts/'+WORKER+'/schedules',token,fetchImpl,
      data=>({cronCount:Array.isArray(data?.schedules)?data.schedules.length:
        Array.isArray(data)?data.length:null})),
    optional('SETTINGS','/accounts/'+ACCOUNT+'/workers/scripts/'+WORKER+'/settings',token,fetchImpl,
      data=>({bindings:Array.isArray(data?.bindings)?data.bindings.map(b=>({type:b?.type??null,name:b?.name??null})):null})),
  ]);
  // Source must be captured regardless of missing optional route/settings permissions.
  const captured=await source(token,fetchImpl);
  const after=await deployment(token,fetchImpl);
  if(before.deploymentId!==after.deploymentId||before.versionId!==after.versionId)
    fail('DEPLOYMENTS','CHANGED_DURING_CAPTURE');

  const record={
    schema:'hbnf.cloudflare.current.observation.v1',
    status:'LOCAL_READ_ONLY_SOURCE_NOT_DURABLE_OR_RELEASE_ADMITTED',
    origin:'AUTHENTICATED_CLOUDFLARE_GET',worker:WORKER,
    observedAt:new Date().toISOString(),before,after,
    expectedHistoricalVersion:EXPECTED,
    historicalVersionStillActive:before.versionId===EXPECTED,
    historicalSourceHashStillMatches:captured.sha256===PRIOR_SOURCE_HASH,
    route,version,schedules,settings,
    source:{bytes:captured.bytes.length,sha256:captured.sha256,
      multipartBase64:captured.bytes.toString('base64')},
    forbiddenConclusions:{versionSpecificExecutableRollbackQualified:false,
      independentlyDurableDownloadBack:false,prechangeReleaseAdmission:false,
      productionDeployment:false},
  };
  return record;
}

export function publicReceipt(record){
  return {
    outcome:record.status,
    activeVersionId:record.before.versionId,
    historicalVersionStillActive:record.historicalVersionStillActive,
    currentSourceBytes:record.source.bytes,
    currentSourceSha256:record.source.sha256,
    historicalSourceHashStillMatches:record.historicalSourceHashStillMatches,
    route:record.route.state==='OBSERVED'?(record.route.data.matched?'MATCH':'NOT_MATCHED'):record.route.code,
    version:record.version.state==='OBSERVED'?(record.version.data.matchesActive?'MATCH':'MISMATCH'):record.version.code,
    schedules:record.schedules.state,
    settings:record.settings.state,
    releaseAdmission:'NOT_ADMITTED',
  };
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const out=process.argv[2];
  if(process.argv.length!==3||!out||!out.endsWith('.json')||!resolve(out).startsWith(process.env.HOME+'/Downloads/')){
    process.stderr.write('CF_LOCAL_PRIVATE_DOWNLOADS_JSON_PATH_REQUIRED\n');process.exitCode=2;
  }else{
    try{
      // Existing explicit token still works; on the owner Mac prefer Wrangler's
      // structured output in memory, not shell command-substitution output.
      const token=process.env.CLOUDFLARE_API_TOKEN ||
        readWranglerToken(process.env.WRANGLER_BIN);
      const result=await captureCurrentCloudflareReadOnly({token});
      const f=await open(out,'wx',0o600);
      try{await f.writeFile(JSON.stringify(result)+'\n');await f.sync();}
      finally{await f.close();}
      process.stdout.write('CLOUDFLARE_READ_ONLY_CAPTURE '+JSON.stringify(publicReceipt(result))+'\n');
      process.stdout.write('PRIVATE_FILE_SAVED '+out+'\n');
    }catch(e){process.stderr.write('CLOUDFLARE_DIAGNOSTIC '+safe(e?.message)+'\n');process.exitCode=1;}
  }
}

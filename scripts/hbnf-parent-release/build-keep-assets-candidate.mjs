// Build a local candidate that reuses the provider's existing asset collection.
// It makes no network calls and does not create a Worker version.
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {basename,resolve} from 'node:path';

const sha=b=>createHash('sha256').update(b).digest('hex');
const EXPECTED_VERSION='48ffa87e-3c83-46d0-a6ca-db7bf0b064e6';
const HELPER_PATH='/glow-save-sync.mjs';

export function parseMultipart(bytes){
  const first=bytes.indexOf(10);
  if(first<0)throw Error('MULTIPART_BOUNDARY_MISSING');
  const boundary=bytes.subarray(0,first).toString().replace(/^--/,'').trim();
  if(!boundary)throw Error('MULTIPART_BOUNDARY_INVALID');
  const parts=new Map();
  for(const raw of bytes.toString('latin1').split(`--${boundary}`)){
    const match=raw.match(/Content-Disposition: form-data; name="([^"]+)"/i);
    if(!match)continue;
    const split=raw.indexOf('\r\n\r\n');
    if(split<0)throw Error('MULTIPART_PART_INVALID');
    const body=raw.slice(split+4).replace(/\r\n$/, '');
    const content=Buffer.from(body,'latin1');
    // Wrangler's source endpoint emits base64 module bodies for map parts.
    const decoded=match[1].endsWith('.map')?Buffer.from(content.toString(),'base64'):content;
    parts.set(match[1],decoded);
  }
  if(!parts.has('index.js'))throw Error('WORKER_MODULE_MISSING');
  return {boundary,parts};
}

export function buildKeepAssetsCandidate({capture,helper,workerSettings,versionId=EXPECTED_VERSION}){
  if(capture?.before?.versionId!==versionId||capture?.after?.versionId!==versionId||
     capture?.origin!=='AUTHENTICATED_CLOUDFLARE_GET')throw Error('V348_CAPTURE_MISMATCH');
  const captureBytes=Buffer.from(capture.source?.multipartBase64||'','base64');
  if(captureBytes.length!==capture.source?.bytes||sha(captureBytes)!==capture.source?.sha256)
    throw Error('CAPTURE_BYTES_HASH_MISMATCH');
  const {parts}=parseMultipart(captureBytes);
  if(parts.size!==2||!parts.has('index.js.map'))throw Error('MODULE_CLOSURE_UNEXPECTED');
  const original=parts.get('index.js').toString();
  const marker='    if (path === EXPORT_PATH || path === EVENTS_PATH || path === GLOW_SYNC_PATH) return errorResponse(404, "Not found.");';
  if(!original.includes(marker)||original.split(marker).length!==2)throw Error('FETCH_DISPATCH_ANCHOR_MISMATCH');
  const helperText=Buffer.from(helper).toString('utf8');
  if(!helperText.includes('createGlowSaveCoordinator')||!helperText.includes('compareAndSwap'))
    throw Error('HELPER_SOURCE_NOT_VERIFIED');
  const literal=JSON.stringify(helperText);
  const insertion=`var glowSaveAckSource = ${literal};\n`;
  let patched=original.replace('var index_default = {',insertion+'var index_default = {');
  if(patched===original)throw Error('WORKER_ENTRY_ANCHOR_MISMATCH');
  const route=`    if (path === "${HELPER_PATH}") {\n      if (request.method !== "GET" && request.method !== "HEAD") return errorResponse(405, "Method not allowed.", { "Allow": "GET, HEAD" });\n      return new Response(request.method === "HEAD" ? null : glowSaveAckSource, { headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" } });\n    }\n`;
  patched=patched.replace(marker,route+marker);
  const raw=workerSettings?.runtime?.assets?.static_routing?.user_worker;
  if(!Array.isArray(raw)||!raw.includes('/api/*')||!raw.includes('/internal/*'))
    throw Error('EXISTING_ASSET_ROUTING_UNVERIFIED');
  if(workerSettings?.runtime?.assets?.serve_directly!==true||workerSettings?.runtime?.assets?.base_path!=='/')
    throw Error('EXISTING_ASSET_RUNTIME_UNVERIFIED');
  const runWorkerFirst=[...raw.filter(x=>x!=='/glow-save-sync.mjs'),'/glow-save-sync.mjs'];
  const metadata={main_module:'index.js',keep_assets:true,compatibility_date:'2026-07-28',
    compatibility_flags:[],usage_model:'standard',
    assets:{config:{base_path:'/',run_worker_first:runWorkerFirst}},
    bindings:[{name:'ASSETS',type:'assets'},
      ...workerSettings.bindings.filter(b=>b.name!=='ASSETS').map(b=>({name:b.name,type:'inherit',version_id:'latest'}))]};
  const result={schema:'hbnf.cloudflare.keep-assets-candidate.v1',status:'LOCAL_CANDIDATE_NOT_UPLOADED',
    baselineVersionId:versionId,sourceCaptureSha256:capture.source.sha256,
    originalModuleSha256:sha(parts.get('index.js')),originalMapSha256:sha(parts.get('index.js.map')),
    helperSha256:sha(Buffer.from(helper)),candidateModuleSha256:sha(Buffer.from(patched)),
    unchangedMap:true,metadata,modules:[{name:'index.js',content_type:'application/javascript+module',content_base64:Buffer.from(patched).toString('base64')},{name:'index.js.map',content_type:'application/source-map',content_base64:parts.get('index.js.map').toString('base64')}],
    API:{method:'POST',path:`/accounts/<account>/workers/scripts/hbnf/versions?bindings_inherit=strict`,encoding:'multipart/form-data',
      deploymentIsSeparateOperation:true,
      inheritance:'latest with bindings_inherit=strict; immediately-before-upload version-list readback must prove latest is v348',
      metadataFields:{keep_assets:true,assetsConfig:metadata.assets.config},providerRetentionReadbackRequired:true},
    preservation:{assetCollection:'provider-retained via keep_assets; no inventory reconstruction',
      cartAssets:'retained as part of unchanged provider collection; byte identities not independently enumerated',
      otherWorkerPaths:'existing index.js retained except helper dispatch addition; routing list retains /api/* and /internal/*',
      cron:'existing scheduled handler source unchanged',rollbackVersionId:versionId},
    acceptance:{versionCreationEndpointKeepAssetsSemantics:'DOCUMENTED_NOT_LIVE_VERIFIED',
      moduleResponseFixture:'NOT_YET_RUN',retainedRollbackReadback:'NOT_YET_RUN',productionAdmission:'NOT_ADMITTED'}};
  const boundary='hbnf-keep-assets-'+sha(Buffer.from(patched)).slice(0,24);
  const chunks=[];
  const part=(name,type,body)=>{
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"${name==='metadata'?'':'; filename="'+name+'"'}\r\nContent-Type: ${type}\r\n\r\n`));
    chunks.push(Buffer.from(body));chunks.push(Buffer.from('\r\n'));
  };
  part('metadata','application/json',Buffer.from(JSON.stringify(metadata)));
  part('index.js','application/javascript+module',Buffer.from(patched));
  part('index.js.map','application/source-map',parts.get('index.js.map'));
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  const multipart=Buffer.concat(chunks);
  result.upload={bytes:multipart.length,sha256:sha(multipart),contentType:`multipart/form-data; boundary=${boundary}`};
  return {module:Buffer.from(patched),metadata,multipart,result};
}

if(import.meta.url===`file://${process.argv[1]}`){
  const [capturePath,helperPath,settingsPath,outDir]=process.argv.slice(2);
  if(!capturePath||!helperPath||!settingsPath||!outDir)throw Error('USAGE capture.json helper.mjs safe-settings.json output-dir');
  const capture=JSON.parse(await readFile(resolve(capturePath),'utf8'));
  const helper=await readFile(resolve(helperPath));
  const settings=JSON.parse(await readFile(resolve(settingsPath),'utf8'));
  const built=buildKeepAssetsCandidate({capture,helper,workerSettings:settings});
  const out=resolve(outDir);await (await import('node:fs/promises')).mkdir(out,{recursive:true});
  await writeFile(resolve(out,'index.js'),built.module,{mode:0o600});
  await writeFile(resolve(out,'index.mjs'),built.module,{mode:0o600});
  await writeFile(resolve(out,'candidate.json'),JSON.stringify(built.result,null,2)+'\n',{mode:0o600});
  await writeFile(resolve(out,'candidate-envelope.json'),JSON.stringify({metadata:built.metadata,modules:built.result.modules},null,2)+'\n',{mode:0o600});
  await writeFile(resolve(out,'candidate.multipart'),built.multipart,{mode:0o600});
  process.stdout.write(JSON.stringify({status:built.result.status,moduleSha256:built.result.candidateModuleSha256,helperSha256:built.result.helperSha256,metadataSha256:sha(Buffer.from(JSON.stringify(built.metadata)))})+'\n');
}

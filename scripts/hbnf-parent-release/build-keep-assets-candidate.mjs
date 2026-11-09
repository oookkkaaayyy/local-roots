// Build a local candidate that reuses the provider's existing asset collection.
// It makes no network calls and does not create a Worker version.
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

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
    // Source-map parts can be returned as raw JSON or base64 text by source
    // capture adapters. Decode only a base64 body that itself contains valid
    // Source Map v3 JSON; never reinterpret raw JSON bytes as base64.
    let decoded=content;
    if(match[1].endsWith('.map')){
      const validMap=bytes=>{
        try{return JSON.parse(bytes.toString('utf8'))?.version===3;}catch{return false;}
      };
      if(!validMap(content)){
        const text=content.toString('ascii').trim();
        if(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)){
          const candidate=Buffer.from(text,'base64');
          if(validMap(candidate))decoded=candidate;
        }
      }
    }
    parts.set(match[1],decoded);
  }
  if(!parts.has('index.js'))throw Error('WORKER_MODULE_MISSING');
  return {boundary,parts};
}

export function buildKeepAssetsCandidate({capture,helper,workerSettings,versionId=EXPECTED_VERSION,
  workerFirstMode='selective',sourceHead}){
  if(capture?.before?.versionId!==versionId||capture?.after?.versionId!==versionId||
     capture?.origin!=='AUTHENTICATED_CLOUDFLARE_GET')throw Error('V348_CAPTURE_MISMATCH');
  const captureBytes=Buffer.from(capture.source?.multipartBase64||'','base64');
  if(captureBytes.length!==capture.source?.bytes||sha(captureBytes)!==capture.source?.sha256)
    throw Error('CAPTURE_BYTES_HASH_MISMATCH');
  const {parts}=parseMultipart(captureBytes);
  if(parts.size!==2||!parts.has('index.js.map'))throw Error('MODULE_CLOSURE_UNEXPECTED');
  const originalRaw=parts.get('index.js').toString();
  const sourceMapDirective=/^[ \t]*\/\/[#@]\s*sourceMappingURL=index\.js\.map[ \t]*\r?$/gm;
  const sourceMapReferences=originalRaw.match(sourceMapDirective)||[];
  if(sourceMapReferences.length!==1)throw Error('SOURCE_MAP_DIRECTIVE_NOT_EXACTLY_ONE');
  // The captured provider map is opaque binary and Cloudflare rejects it as
  // non-v3 on version upload. Remove only the debug directive and omit that
  // non-executable module; preserve every executable baseline byte otherwise.
  const original=originalRaw.replace(sourceMapDirective,'');
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
  // The legacy multipart endpoint only supports type=inherit ("latest").
  // Do not assume that "latest" means the active deployment: require an
  // authenticated immediately-preflight version-list result binding both IDs.
  const latestLineageVerified=typeof workerSettings?.latestVersionId==='string'&&
    workerSettings.latestVersionId===workerSettings.firstListedVersionId&&
    Number.isInteger(workerSettings.latestVersionNumber)&&workerSettings.latestVersionNumber>=348&&
    workerSettings.latestVersionNumber===workerSettings.firstListedVersionNumber&&
    workerSettings.versionListTotalCount===workerSettings.latestVersionNumber&&
    workerSettings.latestBindingsMatchBaseline===true&&workerSettings.latestRuntimeMatchesBaseline===true;
  if(workerSettings?.activeVersionId!==versionId||!latestLineageVerified||
     workerSettings?.newestFirstVerified!==true||workerSettings?.versionListPageSize!==100)
    throw Error('INHERITED_BINDING_LATEST_NOT_ACTIVE_V348');
  // Request only the helper path in addition to the unchanged routes. The
  // provider may ignore this config with keep_assets; Stage A must reject that
  // readback and never broaden routing to all assets as a workaround.
  if(!['selective','global-approved-stage-a'].includes(workerFirstMode))
    throw Error('WORKER_FIRST_MODE_INVALID');
  if(sourceHead!==undefined&&!/^[0-9a-f]{40}$/i.test(sourceHead))
    throw Error('SOURCE_HEAD_INVALID');
  // Cloudflare's documented global Worker-first value is the boolean true.
  // A catch-all array (['/*']) was accepted but read back as the prior routes
  // when combined with keep_assets, so never treat it as equivalent input.
  const runWorkerFirst=workerFirstMode==='global-approved-stage-a'?true:
    [...raw.filter(x=>x!=='/glow-save-sync.mjs'),'/glow-save-sync.mjs'];
  const metadata={main_module:'index.js',keep_assets:true,compatibility_date:'2026-07-28',
    compatibility_flags:[],usage_model:'standard',
    assets:{config:{base_path:'/',run_worker_first:runWorkerFirst}},
    bindings:[{name:'ASSETS',type:'assets'},
      ...workerSettings.bindings.filter(b=>b.name!=='ASSETS').map(b=>({name:b.name,type:'inherit'}))]};
  const result={schema:'hbnf.cloudflare.keep-assets-candidate.v1',status:workerFirstMode==='global-approved-stage-a'?
    'STAGE_A_GLOBAL_WORKER_FIRST_OWNER_APPROVED_PROVIDER_READBACK_REQUIRED':
    'BLOCKED_LEGACY_API_ROUTE_CONFIG_NOT_PROVIDER_VERIFIED',
    routingScope:workerFirstMode==='global-approved-stage-a'?'GLOBAL_WORKER_FIRST_STAGE_A_ONLY':'SELECTIVE_WORKER_FIRST',
    assetStrategy:`legacy-keep-assets-strict-latest-v${workerSettings.latestVersionNumber}`,
    baselineVersionId:versionId,sourceCaptureSha256:capture.source.sha256,
    originalModuleSha256:sha(parts.get('index.js')),originalMapSha256:sha(parts.get('index.js.map')),
    helperSha256:sha(Buffer.from(helper)),candidateModuleSha256:sha(Buffer.from(patched)),
    sourceMapDisposition:'PROVIDER_REJECTED_OPAQUE_NON_V3_MAP; REMOVE_ONLY_SOURCE_MAPPING_URL_AND_OMIT_DEBUG_MODULE',metadata,
    modules:[{name:'index.js',content_type:'application/javascript+module',content_base64:Buffer.from(patched).toString('base64')}],
    API:{method:'POST',path:`/accounts/<account>/workers/scripts/hbnf/versions?bindings_inherit=strict`,encoding:'multipart/form-data',
      uploadEligible:false,
      deploymentIsSeparateOperation:true,
      inheritance:'legacy endpoint type=inherit resolves latest; Stage A adapter must verify active v348 and exact first-listed latest version with matching bindings/runtime immediately before version creation',
      metadataFields:{keep_assets:true,assetsConfig:metadata.assets.config},
      routeConfig:'requested in metadata; candidate Worker-first helper route must be verified by version readback',
      sourceMap:'omit opaque v348 source map; Cloudflare rejected it with code 10021 because it is not Source Map v3',
      providerRetentionReadbackRequired:true},
    preservation:{assetCollection:'keep_assets requested; provider asset identity and file bytes not enumerated',
      cartAssets:'separate Worker routes; no Cart asset mutation or byte-level verification in this HBNF operation',
      otherWorkerPaths:workerFirstMode==='global-approved-stage-a'?
        'run_worker_first:true sends all static asset requests through the unchanged Worker dispatch; non-helper paths fall through to unchanged ASSETS.fetch(request); staging only, production traffic separately gated':
        'existing index.js retained except helper dispatch addition; routing list retains /api/* and /internal/*',
      cron:'existing scheduled handler source unchanged',rollbackVersionId:versionId},
    lineage:{activeVersionId:workerSettings.activeVersionId,latestVersionId:workerSettings.latestVersionId,
      latestVersionNumber:workerSettings.latestVersionNumber,versionListPageSize:workerSettings.versionListPageSize,
      latestBindingsMatchBaseline:workerSettings.latestBindingsMatchBaseline===true,
      latestRuntimeMatchesBaseline:workerSettings.latestRuntimeMatchesBaseline===true,
      versionListCount:workerSettings.versionListCount,totalVersionCount:workerSettings.totalVersionCount,
      firstListedVersionId:workerSettings.firstListedVersionId,firstListedVersionNumber:workerSettings.firstListedVersionNumber,
      versionListOrder:workerSettings.versionListOrder,
      newestFirstVerified:workerSettings.newestFirstVerified===true,
      latestVersionGuard:'PASS_FOR_CAPTURE_ONLY_RECHECK_BEFORE_VERSION_CREATE'},
    acceptance:{versionCreationEndpointKeepAssetsSemantics:'DOCUMENTED_KEEP_ASSETS; PROVIDER ACCEPTANCE PENDING',
      helperWorkerFirstReadback:'PENDING_NEW_VERSION_READBACK',
      releaseEligible:false,
      moduleResponseFixture:'LOCAL_FOCUSED_FIXTURE_PASS; NOT PROVIDER OR BROWSER ACCEPTANCE',
      v348RetainedInVersionList:true,restoreExecution:'NOT_TESTED',productionAdmission:'NOT_ADMITTED'}};
  const boundary='hbnf-keep-assets-'+sha(Buffer.from(patched)).slice(0,24);
  if(sourceHead)result.sourceHead=sourceHead;
  const chunks=[];
  const part=(name,type,body)=>{
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"${name==='metadata'?'':'; filename="'+name+'"'}\r\nContent-Type: ${type}\r\n\r\n`));
    chunks.push(Buffer.from(body));chunks.push(Buffer.from('\r\n'));
  };
  part('metadata','application/json',Buffer.from(JSON.stringify(metadata)));
  part('index.js','application/javascript+module',Buffer.from(patched));
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  const multipart=Buffer.concat(chunks);
  result.upload={bytes:multipart.length,sha256:sha(multipart),contentType:`multipart/form-data; boundary=${boundary}`};
  return {module:Buffer.from(patched),metadata,multipart,result};
}

if(import.meta.url===`file://${process.argv[1]}`){
  const [capturePath,helperPath,settingsPath,outDir,workerFirstMode='selective',sourceHead]=process.argv.slice(2);
  if(!capturePath||!helperPath||!settingsPath||!outDir)throw Error('USAGE capture.json helper.mjs safe-settings.json output-dir');
  const capture=JSON.parse(await readFile(resolve(capturePath),'utf8'));
  const helper=await readFile(resolve(helperPath));
  const settings=JSON.parse(await readFile(resolve(settingsPath),'utf8'));
  const built=buildKeepAssetsCandidate({capture,helper,workerSettings:settings,workerFirstMode,sourceHead});
  const out=resolve(outDir);await (await import('node:fs/promises')).mkdir(out,{recursive:true});
  await writeFile(resolve(out,'index.js'),built.module,{mode:0o600});
  await writeFile(resolve(out,'index.mjs'),built.module,{mode:0o600});
  await writeFile(resolve(out,'candidate.json'),JSON.stringify(built.result,null,2)+'\n',{mode:0o600});
  await writeFile(resolve(out,'candidate-envelope.json'),JSON.stringify({metadata:built.metadata,modules:built.result.modules},null,2)+'\n',{mode:0o600});
  await writeFile(resolve(out,'candidate.multipart'),built.multipart,{mode:0o600});
  process.stdout.write(JSON.stringify({status:built.result.status,moduleSha256:built.result.candidateModuleSha256,helperSha256:built.result.helperSha256,metadataSha256:sha(Buffer.from(JSON.stringify(built.metadata)))})+'\n');
}

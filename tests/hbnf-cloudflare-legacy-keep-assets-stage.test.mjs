import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {buildKeepAssetsCandidate,buildFrozenV355SelectiveRouteCandidate,parseMultipart} from '../scripts/hbnf-parent-release/build-keep-assets-candidate.mjs';
import {stageLegacyKeepAssetsVersion,verifyLegacyKeepAssetsArtifact,verifyGlowHelperModuleDelta,sha256} from '../scripts/hbnf-parent-release/cloudflare-executable-version.mjs';
import {prepareLegacyKeepAssetsCloudflareVersionUnderParent} from '../scripts/hbnf-parent-release/providers-live.mjs';

const account='e3bc6b78f1104fa0c2a01245084594cf';
const workerId='eeac337b989f4378bd38a555833f5dbb';
const v348='48ffa87e-3c83-46d0-a6ca-db7bf0b064e6';
const v349='049a35e1-64b5-4e76-9378-ca4ffa0a7d47';
const v350='34d5b215-33af-4c2a-a990-34a71937d31d';
const manifestSha256='a'.repeat(64);
const transactionId='hbnf-stagea-legacy-test-001';
const sourceHead='9a7713a8189e42210ab1d63ffe799dfaaca42a2f';
const candidateFileId='drive-candidate-file-id';
const etags={v348:'c3ea6bde761a6a5735a6a8b50334821b809baf57096c64cbb71b50a17ceb5b25',
 v349:'f54505dfb357ca96e52232309de2f3cb067556508d924c2088a2561fdc8d2720'};
const settings={activeVersionId:v348,latestVersionId:v349,latestVersionNumber:349,firstListedVersionId:v349,
 firstListedVersionNumber:349,versionListPageSize:100,versionListTotalCount:349,newestFirstVerified:true,
 latestBindingsMatchBaseline:true,latestRuntimeMatchesBaseline:true,
 runtime:{compatibility_date:'2026-07-28',compatibility_flags:[],usage_model:'standard',
  assets:{base_path:'/',serve_directly:true,static_routing:{user_worker:['/api/*','/internal/*','/glow-save-sync.mjs']}}},
 bindings:[{name:'ASSETS',type:'assets'},{name:'SUPABASE_SERVICE_ROLE_KEY',type:'secret_text'},
  {name:'SUPABASE_URL',type:'plain_text'},{name:'UDISC_GLOW_ACCESS_APPROVED',type:'plain_text'},
  {name:'UDISC_GLOW_EVENT_DATE',type:'plain_text'},{name:'UDISC_GLOW_EVENT_ID',type:'plain_text'},
  {name:'UDISC_GLOW_WINDOW_END',type:'plain_text'},{name:'UDISC_GLOW_WINDOW_START',type:'plain_text'}]};
const helper=await readFile(new URL('../public/glow-save-sync.mjs',import.meta.url));
const original=`const EXPORT_PATH='/api/export';\nconst EVENTS_PATH='/api/events';\nconst GLOW_SYNC_PATH='/internal/sync';\nfunction errorResponse(s,m,h={}){return new Response(m,{status:s,headers:h});}\nvar index_default = {\n fetch(request,env){const path=new URL(request.url).pathname;\n    if (path === EXPORT_PATH || path === EVENTS_PATH || path === GLOW_SYNC_PATH) return errorResponse(404, "Not found.");\n  return env.ASSETS.fetch(request);\n },\n async scheduled(c,env,ctx){ctx.waitUntil(Promise.resolve());}\n};\nexport {index_default as default};\n//# sourceMappingURL=index.js.map\n`;
const boundary='legacy-stage-fixture';
const captureBody=Buffer.concat([
 Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="index.js"; filename="index.js"\r\nContent-Type: application/javascript+module\r\n\r\n${original}\r\n`),
 Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="index.js.map"; filename="index.js.map"\r\nContent-Type: application/source-map\r\n\r\n{"version":3,"sources":["index.js"],"names":[],"mappings":""}\r\n--${boundary}--\r\n`)
]);
const capture={origin:'AUTHENTICATED_CLOUDFLARE_GET',before:{versionId:v348},after:{versionId:v348},
 source:{bytes:captureBody.length,sha256:sha256(captureBody),multipartBase64:captureBody.toString('base64')}};
const candidateGlowHtml=await readFile(new URL('../public/glow.html',import.meta.url),'utf8');
const correctedSaveLocal=(()=>{const i=candidateGlowHtml.indexOf('const saveLocal='),j=candidateGlowHtml.indexOf(';const getWeek',i);return candidateGlowHtml.slice(i,j+1)})();
const liveSaveLocal="const saveLocal=()=>{if(!ctx.remoteSyncing)hbnfMaybeAutoSnapshot('Auto backup before save');const raw=JSON.stringify(ctx.state);let queued=false;try{if(ctx.saveCoordinator&&!ctx.remoteSyncing&&ctx.syncReady){ctx.saveCoordinator.queue(ctx.state,ctx.remoteUpdatedAt,ctx.rootState?.glow||null);queued=true}}catch(e){setGlowSaveStatus('local-failure');throw e}try{localStorage.setItem(ctx.localKey,raw)}catch(e){if(queued){setGlowSaveStatus('pending');return}setGlowSaveStatus('local-failure');throw e}};ctx.saveLocal=saveLocal;";
const liveGlowHtml=candidateGlowHtml.replace(correctedSaveLocal,liveSaveLocal);
const liveGlowHtmlEvidence={origin:'PRODUCTION_HTTPS_GET',path:'/glow',status:200,contentType:'text/html',bytes:Buffer.byteLength(liveGlowHtml),sha256:sha256(Buffer.from(liveGlowHtml))};
const build=(opts={})=>buildKeepAssetsCandidate({capture:opts.capture||capture,helper,workerSettings:opts.workerSettings||settings,workerFirstMode:opts.workerFirstMode||'selective',sourceHead:opts.sourceHead||sourceHead,liveGlowHtml,candidateGlowHtml,liveGlowHtmlEvidence});
const built=build();
const candidate={...built.result,baselineVersionId:v348,sourceHead};
const candidateBytes=built.multipart;
const candidateSha256=sha256(candidateBytes);
const parentRecordFor=(c,bytes,hash,{globalApproved=false}={})=>({scopedReleaseAuthority:{cloudflareOnlySaveAck:{stageA:{transactionId,candidateFileId,
 candidateSha256:hash,sourceHead,candidateBytes:bytes.length,assetStrategy:c.assetStrategy,
 routingScope:c.routingScope,globalWorkerFirstOwnerApproved:globalApproved,moduleSha256:c.candidateModuleSha256,
 expectedLatestVersionId:v349,productionTrafficAuthorized:false}}}});
const parentRecord=parentRecordFor(candidate,candidateBytes,candidateSha256);
const jsonResponse=(result,{total=349,status=200}={})=>new Response(JSON.stringify({success:true,errors:[],result,
 result_info:{page:1,per_page:100,total_count:total}}),{status,headers:{'content-type':'application/json'}});
const bindings=settings.bindings.map(({name,type})=>({name,type}));
const runtime={compatibility_date:'2026-07-28',compatibility_flags:[],usage_model:'standard',
 assets:{base_path:'/',static_routing:{user_worker:['/api/*','/internal/*','/glow-save-sync.mjs']}}};
const oldVersion=(id,retainOriginalRouting=false,globalRouting=false)=>({id,resources:{script:{etag:id===v348?etags.v348:etags.v349},bindings,
 script_runtime:retainOriginalRouting?{...runtime,assets:{...runtime.assets,static_routing:{user_worker:['/api/*','/internal/*']}}}:
 globalRouting?{...runtime,assets:{base_path:'/',raw_run_worker_first:true}}:runtime}});
function provider({ambiguous=false,drift=false,rejected=false,omitHelperRoute=false,globalWorkerFirst=false,
 retainOriginalRouting=false,candidateSha=candidateSha256,readbackCandidate=candidate}={}){
 const calls=[];let created=false;
 const fetchImpl=async(url,init={})=>{
  const u=new URL(url);const path=u.pathname;const method=init.method||'GET';calls.push({path,method});
  if(path.endsWith('/workers/workers/hbnf'))return jsonResponse({name:'hbnf',id:workerId});
  if(path.endsWith('/scripts/hbnf/versions')&&method==='POST'){
   assert.equal(sha256(Buffer.from(init.body)),candidateSha);
   if(rejected)return new Response(JSON.stringify({success:false,errors:[{code:10305,
    message:'Cannot use an assets binding without assets.'}]}),{status:400,
    headers:{'content-type':'application/json'}});
   if(ambiguous){created=true;throw Error('response lost after provider commit');}
   created=true;return jsonResponse({id:v350,number:350});
  }
  if(path.endsWith(`/workers/workers/${workerId}/versions`)){
   if(method==='POST'){
    if(ambiguous){created=true;throw Error('response lost after provider commit');}
    created=true;return jsonResponse({id:v350,number:350});
   }
   const items=created?[{id:v350,number:350},{id:v349,number:349},{id:v348,number:348}]:
    drift?[{id:v349,number:349},{id:v348,number:348}]:[{id:v349,number:349},{id:v348,number:348}];
   return jsonResponse(items,{total:created?350:349});
  }
  if(path.endsWith('/scripts/hbnf/deployments'))return jsonResponse({deployments:[{id:'c4f4ce98-4635-4010-a5e6-55e791b77c51',
   versions:[{version_id:drift?v349:v348,percentage:100}]}]});
  if(path.endsWith(`/scripts/hbnf/versions/${v348}`))return jsonResponse(oldVersion(v348,retainOriginalRouting));
  if(path.endsWith(`/scripts/hbnf/versions/${v349}`))return jsonResponse(oldVersion(v349,retainOriginalRouting,globalWorkerFirst));
  if(path.endsWith(`/workers/workers/${workerId}/versions/${v350}`))return jsonResponse({id:v350,
   modules:readbackCandidate.modules,resources:{bindings,script_runtime:{...runtime,assets:{base_path:'/',
    static_routing:{user_worker:omitHelperRoute?['/api/*','/internal/*']:globalWorkerFirst?['/*']:
     ['/api/*','/internal/*','/glow-save-sync.mjs']}}}}});
  throw Error(`unexpected ${method} ${path}`);
 };
 return {fetchImpl,calls};
}
const common={token:'test-token-never-real',accountId:account,candidate,candidateBytes,candidateSha256,
 candidateFileId,expectedSourceHead:sourceHead,expectedModuleSha256:candidate.candidateModuleSha256,
 expectedHelperSha256:candidate.helperSha256,manifestSha256,expectedTransactionId:transactionId,parentRecord,
 requireParentAdmission:async()=>true,verifyCandidateDownloadback:async({candidateSha256:hash,bytes})=>({verified:true,sha256:hash,bytes}),
 requireFreshFiveTargetPreimage:async()=>true,claimOnce:async()=>({acquired:true,durable:true,manifestSha256,transactionId})};

test('legacy keep-assets route pins latest v349 inheritance, reads candidate back, and never deploys',async()=>{
 const p=provider();const out=await stageLegacyKeepAssetsVersion({...common,fetchImpl:p.fetchImpl});
 assert.equal(out.status,'LEGACY_KEEP_ASSETS_VERSION_CREATED_NOT_DEPLOYED');assert.equal(out.versionId,v350);
 assert.equal(out.activeVersionId,v348);assert.equal(out.activePercentage,100);
 assert.deepEqual(out.bindingInheritance,{mode:'bindings_inherit=strict',resolvedAgainstVersionAtPrechange:v349,
  secretValuesDirectlyReadable:false});
 const posts=p.calls.filter(x=>x.method==='POST');assert.equal(posts.length,1);
 assert.equal(posts[0].path,`/client/v4/accounts/${account}/workers/scripts/hbnf/versions`);
 const deployPosts=p.calls.filter(x=>x.method==='POST'&&x.path.endsWith('/deployments'));
 assert.equal(deployPosts.length,0);
});

test('explicit Stage A owner approval binds a global Worker-first candidate without promoting traffic',async()=>{
 const builtGlobal=build({workerFirstMode:'global-approved-stage-a'});
 const globalCandidate={...builtGlobal.result,baselineVersionId:v348,sourceHead};
 assert.equal(globalCandidate.metadata.assets.config.run_worker_first,true);
 assert.equal(globalCandidate.sourceHead,sourceHead);
 const globalBytes=builtGlobal.multipart,globalSha=sha256(globalBytes);
 const unapprovedRecord=parentRecordFor(globalCandidate,globalBytes,globalSha);
 const unapprovedProvider=provider({globalWorkerFirst:true,candidateSha:globalSha,readbackCandidate:globalCandidate});
 let admissions=0,claims=0;
 await assert.rejects(stageLegacyKeepAssetsVersion({...common,candidate:globalCandidate,candidateBytes:globalBytes,
  candidateSha256:globalSha,parentRecord:unapprovedRecord,fetchImpl:unapprovedProvider.fetchImpl,
  requireParentAdmission:async()=>{admissions++;return true;},claimOnce:async()=>{claims++;return {};}}),
  /LEGACY_STAGE_NOT_BOUND_TO_REV10/);
 assert.equal(admissions,0);assert.equal(claims,0);
 assert.equal(unapprovedProvider.calls.some(x=>x.method==='POST'),false);
 const parentRecord=parentRecordFor(globalCandidate,globalBytes,globalSha,{globalApproved:true});
 const {parts}=parseMultipart(globalBytes);
 const submitted=JSON.parse(parts.get('metadata').toString('utf8'));
 assert.equal(submitted.keep_assets,true);
 assert.equal(submitted.assets.config.run_worker_first,true);
 const p=provider({candidateSha:globalSha,readbackCandidate:globalCandidate,globalWorkerFirst:true});
 const staged=await stageLegacyKeepAssetsVersion({...common,candidate:globalCandidate,candidateBytes:globalBytes,
  candidateSha256:globalSha,parentRecord,fetchImpl:p.fetchImpl,claimOnce:async()=>{claims++;return {acquired:true,durable:true,manifestSha256,transactionId};}});
 assert.equal(staged.status,'LEGACY_KEEP_ASSETS_VERSION_CREATED_NOT_DEPLOYED');
 assert.deepEqual(staged.workerFirst,['/*']);assert.equal(staged.activeVersionId,v348);assert.equal(staged.activePercentage,100);
 assert.equal(claims,1);assert.equal(p.calls.filter(x=>x.method==='POST'&&x.path.endsWith('/versions')).length,1);
 assert.equal(p.calls.some(x=>x.method==='POST'&&x.path.endsWith('/deployments')),false);
});

test('live v348 routing mismatch blocks the helper candidate before claim or upload',async()=>{
 const p=provider({retainOriginalRouting:true});let claims=0;
 await assert.rejects(stageLegacyKeepAssetsVersion({...common,fetchImpl:p.fetchImpl,
  claimOnce:async()=>{claims++;return {};}}),/LEGACY_KEEP_ASSETS_ROUTING_CHANGE_UNSUPPORTED/);
 assert.equal(claims,0);
 assert.equal(p.calls.filter(x=>x.method==='POST'&&x.path.endsWith('/versions')).length,0);
 assert.equal(p.calls.some(x=>x.method==='POST'&&x.path.endsWith('/deployments')),false);
});

test('legacy inheritance drift fails before exclusive claim or provider mutation',async()=>{
 const p=provider({drift:true});let claims=0;
 await assert.rejects(stageLegacyKeepAssetsVersion({...common,fetchImpl:p.fetchImpl,claimOnce:async()=>{claims++;return {};}}),
  /LEGACY_ACTIVE_DEPLOYMENT_DRIFT|LEGACY_VERSION_LIST_TOTAL_COUNT/);
 assert.equal(claims,0);assert.equal(p.calls.some(x=>x.method==='POST'),false);
});

test('ambiguous multipart create is read back by exact module hash without retry',async()=>{
 const p=provider({ambiguous:true});const out=await stageLegacyKeepAssetsVersion({...common,fetchImpl:p.fetchImpl});
 assert.equal(out.versionId,v350);
 assert.equal(p.calls.filter(x=>x.method==='POST'&&x.path.endsWith('/versions')).length,1);
 assert.equal(p.calls.some(x=>x.method==='POST'&&x.path.endsWith('/deployments')),false);
});

test('provider readback that omits the selective helper path is rejected after one create',async()=>{
 const p=provider({omitHelperRoute:true});
 await assert.rejects(stageLegacyKeepAssetsVersion({...common,fetchImpl:p.fetchImpl}),/LEGACY_VERSION_ASSET_ROUTING_READBACK/);
 assert.equal(p.calls.filter(x=>x.method==='POST'&&x.path.endsWith('/versions')).length,1);
 assert.equal(p.calls.some(x=>x.method==='POST'&&x.path.endsWith('/deployments')),false);
 assert.ok(p.calls.some(x=>x.path.endsWith(`/workers/workers/${workerId}/versions/${v350}`)));
});

test('authorized global Worker-first candidate fails closed when provider readback narrows routing',async()=>{
 const builtGlobal=build({workerFirstMode:'global-approved-stage-a'});
 const globalCandidate={...builtGlobal.result,baselineVersionId:v348,sourceHead};
 const bytes=builtGlobal.multipart,hash=sha256(bytes);
 const record=parentRecordFor(globalCandidate,bytes,hash,{globalApproved:true});
 const p=provider({candidateSha:hash,readbackCandidate:globalCandidate,globalWorkerFirst:true,omitHelperRoute:true});
 await assert.rejects(stageLegacyKeepAssetsVersion({...common,candidate:globalCandidate,candidateBytes:bytes,
  candidateSha256:hash,parentRecord:record,fetchImpl:p.fetchImpl}),/LEGACY_VERSION_ASSET_ROUTING_READBACK/);
 assert.equal(p.calls.filter(x=>x.method==='POST'&&x.path.endsWith('/versions')).length,1);
 assert.equal(p.calls.some(x=>x.method==='POST'&&x.path.endsWith('/deployments')),false);
});

test('rejected create preserves sanitized provider failure and noncommit readback without retry',async()=>{
 const p=provider({rejected:true});
 await assert.rejects(stageLegacyKeepAssetsVersion({...common,fetchImpl:p.fetchImpl}),error=>{
  assert.equal(error.providerFailure.httpStatus,400);
  assert.deepEqual(error.providerFailure.errors,[{code:10305,message:'Cannot use an assets binding without assets.'}]);
  assert.deepEqual(error.providerReadback,{versionCount:349,latestVersionId:v349,
   candidateModuleMatches:0,uploadRetried:false});
  return true;
 });
 assert.equal(p.calls.filter(x=>x.method==='POST'&&x.path.endsWith('/versions')).length,1);
 assert.equal(p.calls.some(x=>x.method==='POST'&&x.path.endsWith('/deployments')),false);
});

test('multipart bytes, module closure, keep-assets metadata, and inherited bindings are exact',()=>{
 assert.equal(prepareLegacyKeepAssetsCloudflareVersionUnderParent,stageLegacyKeepAssetsVersion);
 assert.equal(candidate.upload.bytes,candidateBytes.length);
 assert.equal(candidate.upload.sha256,candidateSha256);
 assert.equal(createHash('sha256').update(Buffer.from(candidate.modules[0].content_base64,'base64')).digest('hex'),
  candidate.candidateModuleSha256);
 assert.equal(candidate.metadata.keep_assets,true);
 assert.deepEqual(candidate.metadata.assets.config.run_worker_first,
  ['/api/*','/internal/*','/glow-save-sync.mjs']);
 assert.match(Buffer.from(candidate.modules[0].content_base64,'base64').toString(),/return env\.ASSETS\.fetch\(request\);/);
 assert.equal(candidate.metadata.bindings.length,8);
 assert.ok(candidate.metadata.bindings.filter(x=>x.name!=='ASSETS').every(x=>x.type==='inherit'&&!('version_id' in x)));
});

test('frozen v355 selective-route request changes metadata only and keeps other assets direct',()=>{
 const helperText=helper.toString('utf8');
 const source=`var glowSaveAckSource = ${JSON.stringify(helperText)};\nvar index_default = { fetch(request,env){const path=new URL(request.url).pathname; if (path === "/glow" || path === "/glow.html") return env.ASSETS.fetch(request); if (path === "/glow-save-sync.mjs") return new Response(glowSaveAckSource); if (path === EXPORT_PATH || path === EVENTS_PATH || path === GLOW_SYNC_PATH) return errorResponse(404,"Not found."); return env.ASSETS.fetch(request); }, async scheduled(){} };`;
 const frozen=Buffer.from(source),bindings=[{name:'ASSETS',type:'assets'},
  ...settings.bindings.filter(b=>b.name!=='ASSETS').map(b=>({name:b.name,type:b.type}))];
 const readback={accountId:account,worker:'hbnf',versionId:'1553524d-c71f-4ad0-9bbf-4c8713df8173',versionNumber:355,
  module:{name:'index.js',contentType:'application/javascript+module',bytes:frozen.length,
   sha256:sha256(frozen),content_base64:frozen.toString('base64')},
  scriptRuntime:{compatibility_date:'2026-07-28',compatibility_flags:[],usage_model:'standard',
   assetConfig:{base_path:'/',html_handling:'auto-trailing-slash',not_found_handling:'none',run_worker_first:true}},
  bindingNamesAndTypes:bindings};
 const built=buildFrozenV355SelectiveRouteCandidate({readback,sourceHead,sourceReadbackSha256:'c'.repeat(64),expectedModuleSha256:sha256(frozen)});
 const {candidate}=built,{parts}=parseMultipart(built.multipart);
 assert.equal(candidate.candidateModuleSha256,sha256(frozen));
 assert.equal(Buffer.compare(built.module,frozen),0);
 assert.deepEqual(candidate.metadata.assets.config.run_worker_first,
  ['/api/*','/internal/*','/glow','/glow.html','/glow-save-sync.mjs']);
 assert.deepEqual(Object.keys(candidate.metadata.assets.config).sort(),
  ['base_path','html_handling','not_found_handling','run_worker_first']);
 assert.deepEqual([...parts.keys()].sort(),['index.js','metadata']);
 assert.equal(Buffer.compare(parts.get('index.js'),frozen),0);
 assert.deepEqual(JSON.parse(parts.get('metadata').toString()).assets.config,candidate.metadata.assets.config);
 for(const path of ['/','/cart.html','/admin.html','/random.html','/skills.html','/favicon.ico'])
  assert.ok(!candidate.metadata.assets.config.run_worker_first.includes(path));
 assert.equal(candidate.API.deploy,false);
 assert.deepEqual(candidate.API.assetFileParts,[]);
});

test('legacy candidate omits rejected opaque source-map module and preserves only executable delta',()=>{
 const boundary='opaque-provider-capture';
 const rawMap=Buffer.from([0xbd,0xea,0xec,0x8a,0x89,0xf7,0x7e,0x29,0x5e,0x8a,0x77,0x5e]);
 const pieces=[];const part=(name,type,bytes)=>pieces.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${name}"\r\nContent-Type: ${type}\r\n\r\n`),Buffer.from(bytes),Buffer.from('\r\n'));
 part('index.js','application/javascript+module',Buffer.from(original));
 part('index.js.map','application/source-map',rawMap);
 pieces.push(Buffer.from(`--${boundary}--\r\n`));const bytes=Buffer.concat(pieces);
 const opaqueCapture={...capture,source:{bytes:bytes.length,sha256:sha256(bytes),multipartBase64:bytes.toString('base64')}};
 const rebuilt=build({capture:opaqueCapture});
 assert.equal(rebuilt.result.originalMapSha256,sha256(rawMap));
 assert.deepEqual(rebuilt.result.modules.map(m=>m.name),['index.js']);
 assert.doesNotMatch(rebuilt.module.toString('utf8'),/sourceMappingURL/);
 assert.equal(rebuilt.result.sourceMapDisposition,
  'PROVIDER_REJECTED_OPAQUE_NON_V3_MAP; REMOVE_ONLY_SOURCE_MAPPING_URL_AND_OMIT_DEBUG_MODULE');
 assert.equal(rebuilt.result.helperSha256,sha256(helper));
 assert.match(rebuilt.module.toString('utf8'),/ctx\.earlyLocalDraft=true/);
 assert.match(rebuilt.module.toString('utf8'),/async scheduled\(c,env,ctx\)/);
 assert.equal(verifyLegacyKeepAssetsArtifact({candidate:rebuilt.result,candidateBytes:rebuilt.multipart,
  candidateSha256:sha256(rebuilt.multipart),expectedModuleSha256:rebuilt.result.candidateModuleSha256,
  expectedHelperSha256:rebuilt.result.helperSha256}).moduleCount,1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {buildKeepAssetsCandidate} from '../scripts/hbnf-parent-release/build-keep-assets-candidate.mjs';
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
const settings={activeVersionId:v348,latestVersionId:v348,latestVersionNumber:348,firstListedVersionId:v348,
 firstListedVersionNumber:348,versionListPageSize:100,newestFirstVerified:true,
 runtime:{compatibility_date:'2026-07-28',compatibility_flags:[],usage_model:'standard',
  assets:{base_path:'/',serve_directly:true,static_routing:{user_worker:['/api/*','/internal/*']}}},
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
const built=buildKeepAssetsCandidate({capture,helper,workerSettings:settings});
const candidate={...built.result,baselineVersionId:v348,sourceHead};
const candidateBytes=built.multipart;
const candidateSha256=sha256(candidateBytes);
const parentRecord={scopedReleaseAuthority:{cloudflareOnlySaveAck:{stageA:{transactionId,candidateFileId,
 candidateSha256,sourceHead,candidateBytes:candidateBytes.length,assetStrategy:'legacy-keep-assets-strict-latest-v349',
 expectedLatestVersionId:v349,productionTrafficAuthorized:false}}}};
const jsonResponse=(result,{total=349,status=200}={})=>new Response(JSON.stringify({success:true,errors:[],result,
 result_info:{page:1,per_page:100,total_count:total}}),{status,headers:{'content-type':'application/json'}});
const bindings=settings.bindings.map(({name,type})=>({name,type}));
const runtime={compatibility_date:'2026-07-28',compatibility_flags:[],usage_model:'standard',
 assets:{base_path:'/',static_routing:{user_worker:['/api/*','/internal/*']}}};
const oldVersion=id=>({id,resources:{script:{etag:id===v348?etags.v348:etags.v349},bindings,
 script_runtime:runtime}});
function provider({ambiguous=false,drift=false,rejected=false}={}){
 const calls=[];let created=false;
 const fetchImpl=async(url,init={})=>{
  const u=new URL(url);const path=u.pathname;const method=init.method||'GET';calls.push({path,method});
  if(path.endsWith('/workers/workers/hbnf'))return jsonResponse({name:'hbnf',id:workerId});
  if(path.endsWith('/scripts/hbnf/versions')&&method==='POST'){
   assert.equal(sha256(Buffer.from(init.body)),candidateSha256);
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
  if(path.endsWith(`/scripts/hbnf/versions/${v348}`))return jsonResponse(oldVersion(v348));
  if(path.endsWith(`/scripts/hbnf/versions/${v349}`))return jsonResponse(oldVersion(v349));
  if(path.endsWith(`/workers/workers/${workerId}/versions/${v350}`))return jsonResponse({id:v350,
   modules:candidate.modules,resources:{bindings,script_runtime:{...runtime,assets:{base_path:'/',
    static_routing:{user_worker:['/api/*','/internal/*','/glow-save-sync.mjs']}}}}});
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
 assert.ok(candidate.metadata.assets.config.run_worker_first.includes('/glow-save-sync.mjs'));
 assert.equal(candidate.metadata.bindings.length,8);
 assert.ok(candidate.metadata.bindings.filter(x=>x.name!=='ASSETS').every(x=>x.type==='inherit'&&!('version_id' in x)));
});

test('legacy candidate omits rejected opaque source-map module and preserves only executable delta',()=>{
 const boundary='opaque-provider-capture';
 const rawMap=Buffer.from([0xbd,0xea,0xec,0x8a,0x89,0xf7,0x7e,0x29,0x5e,0x8a,0x77,0x5e]);
 const pieces=[];const part=(name,type,bytes)=>pieces.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${name}"\r\nContent-Type: ${type}\r\n\r\n`),Buffer.from(bytes),Buffer.from('\r\n'));
 part('index.js','application/javascript+module',Buffer.from(original));
 part('index.js.map','application/source-map',rawMap);
 pieces.push(Buffer.from(`--${boundary}--\r\n`));const bytes=Buffer.concat(pieces);
 const opaqueCapture={...capture,source:{bytes:bytes.length,sha256:sha256(bytes),multipartBase64:bytes.toString('base64')}};
 const rebuilt=buildKeepAssetsCandidate({capture:opaqueCapture,helper,workerSettings:settings});
 assert.equal(rebuilt.result.originalMapSha256,sha256(rawMap));
 assert.deepEqual(rebuilt.result.modules.map(m=>m.name),['index.js']);
 assert.doesNotMatch(rebuilt.module.toString('utf8'),/sourceMappingURL/);
 assert.equal(rebuilt.result.sourceMapDisposition,
  'PROVIDER_REJECTED_OPAQUE_NON_V3_MAP; REMOVE_ONLY_SOURCE_MAPPING_URL_AND_OMIT_DEBUG_MODULE');
 assert.equal(verifyGlowHelperModuleDelta(Buffer.from(original),rebuilt.module).helperSha256,sha256(helper));
 assert.equal(verifyLegacyKeepAssetsArtifact({candidate:rebuilt.result,candidateBytes:rebuilt.multipart,
  candidateSha256:sha256(rebuilt.multipart),expectedModuleSha256:rebuilt.result.candidateModuleSha256,
  expectedHelperSha256:rebuilt.result.helperSha256}).moduleCount,1);
});

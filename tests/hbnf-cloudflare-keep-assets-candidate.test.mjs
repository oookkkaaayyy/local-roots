import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildKeepAssetsCandidate,parseMultipart,replaceGlowSaveLocal} from '../scripts/hbnf-parent-release/build-keep-assets-candidate.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const versionId='48ffa87e-3c83-46d0-a6ca-db7bf0b064e6';
const helper=await readFile(new URL('../public/glow-save-sync.mjs',import.meta.url));
const candidateGlowHtml=await readFile(new URL('../public/glow.html',import.meta.url),'utf8');
const liveSaveLocal="const saveLocal=()=>{if(!ctx.remoteSyncing)hbnfMaybeAutoSnapshot('Auto backup before save');const raw=JSON.stringify(ctx.state);let queued=false;try{if(ctx.saveCoordinator&&!ctx.remoteSyncing&&ctx.syncReady){ctx.saveCoordinator.queue(ctx.state,ctx.remoteUpdatedAt,ctx.rootState?.glow||null);queued=true}}catch(e){setGlowSaveStatus('local-failure');throw e}try{localStorage.setItem(ctx.localKey,raw)}catch(e){if(queued){setGlowSaveStatus('pending');return}setGlowSaveStatus('local-failure');throw e}};ctx.saveLocal=saveLocal;";
const correctedSaveLocal=(()=>{const i=candidateGlowHtml.indexOf('const saveLocal='),j=candidateGlowHtml.indexOf(';const getWeek',i);return candidateGlowHtml.slice(i,j+1)})();
const liveGlowHtml=candidateGlowHtml.replace(correctedSaveLocal,liveSaveLocal);
const liveGlowHtmlEvidence={origin:'PRODUCTION_HTTPS_GET',path:'/glow',status:200,contentType:'text/html; charset=utf-8',bytes:Buffer.byteLength(liveGlowHtml),sha256:sha(Buffer.from(liveGlowHtml))};
const settings={activeVersionId:versionId,latestVersionId:versionId,latestVersionNumber:348,
 firstListedVersionId:versionId,firstListedVersionNumber:348,versionListPageSize:100,newestFirstVerified:true,
 versionListTotalCount:348,latestBindingsMatchBaseline:true,latestRuntimeMatchesBaseline:true,
 runtime:{assets:{static_routing:{user_worker:['/api/*','/internal/*']},serve_directly:true,base_path:'/'},compatibility_date:'2026-07-28',usage_model:'standard'},
 bindings:[{name:'ASSETS',type:'assets'},{name:'SUPABASE_SERVICE_ROLE_KEY',type:'secret_text'},
 {name:'SUPABASE_URL',type:'plain_text'},{name:'UDISC_GLOW_ACCESS_APPROVED',type:'plain_text'},
 {name:'UDISC_GLOW_EVENT_DATE',type:'plain_text'},{name:'UDISC_GLOW_EVENT_ID',type:'plain_text'},
 {name:'UDISC_GLOW_WINDOW_END',type:'plain_text'},{name:'UDISC_GLOW_WINDOW_START',type:'plain_text'}]};

function captureFixture(){
 const original=`const EXPORT_PATH='/api/udisc-glow-export';\nconst EVENTS_PATH='/api/udisc-glow-events';\nconst GLOW_SYNC_PATH='/internal/udisc-glow-sync';\nfunction errorResponse(status,message,headers={}){return new Response(message,{status,headers});}\nvar index_default = {\n  fetch(request, env) {\n    const path = new URL(request.url).pathname;\n    if (path === EXPORT_PATH || path === EVENTS_PATH || path === GLOW_SYNC_PATH) return errorResponse(404, "Not found.");\n    return env.ASSETS.fetch(request);\n  },\n  async scheduled(_controller, env, ctx) {\n    ctx.waitUntil(Promise.resolve());\n  }\n};\nexport { index_default as default };\n//# sourceMappingURL=index.js.map\n`;
 const map=Buffer.from('{"version":3,"sources":["index.js"],"mappings":""}');
 const boundary='portable-capture-fixture';
 const chunks=[];
 const part=(name,type,body)=>{chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${name}"\r\nContent-Type: ${type}\r\n\r\n`));chunks.push(Buffer.from(body));chunks.push(Buffer.from('\r\n'));};
 part('index.js','application/javascript+module',Buffer.from(original));
 part('index.js.map','application/source-map',map.toString('base64'));
 chunks.push(Buffer.from(`--${boundary}--\r\n`));
 const bytes=Buffer.concat(chunks);
 return {origin:'AUTHENTICATED_CLOUDFLARE_GET',before:{versionId},after:{versionId},
  source:{bytes:bytes.length,sha256:sha(bytes),multipartBase64:bytes.toString('base64')}};
}

const temp=await mkdtemp(join(tmpdir(),'hbnf-keep-assets-'));
const built=buildKeepAssetsCandidate({capture:captureFixture(),helper,workerSettings:settings,liveGlowHtml,candidateGlowHtml,liveGlowHtmlEvidence});
await writeFile(join(temp,'index.mjs'),built.module);
test.after(async()=>rm(temp,{recursive:true,force:true}));
const worker=await import(pathToFileURL(join(temp,'index.mjs')).href);

test('candidate returns the exact corrected helper for GET and HEAD',async()=>{
 const assets={fetch:async()=>{throw Error('helper path fell through to asset store')}};
 const get=await worker.default.fetch(new Request('https://hbnightflyers.com/glow-save-sync.mjs'),{ASSETS:assets});
 assert.equal(get.status,200);
 assert.equal(get.headers.get('content-type'),'text/javascript; charset=utf-8');
 assert.equal(get.headers.get('cache-control'),'no-cache');
 assert.equal(get.headers.get('x-content-type-options'),'nosniff');
 assert.equal(await get.text(),helper.toString());
 const head=await worker.default.fetch(new Request('https://hbnightflyers.com/glow-save-sync.mjs',{method:'HEAD'}),{ASSETS:assets});
 assert.equal(head.status,200);assert.equal(await head.text(),'');
 const post=await worker.default.fetch(new Request('https://hbnightflyers.com/glow-save-sync.mjs',{method:'POST'}),{ASSETS:assets});
 assert.equal(post.status,405);assert.equal(post.headers.get('allow'),'GET, HEAD');
});


test('Worker rewrites only the authenticated deployed Glow save function and fails closed on drift',async()=>{
 const assets={fetch:async request=>new Response(request.url.endsWith('/drift')?'unknown html':liveGlowHtml,{headers:{'content-type':'text/html; charset=utf-8','etag':'old','content-length':'7'}})};
 const response=await worker.default.fetch(new Request('https://hbnightflyers.com/glow'),{ASSETS:assets});
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('etag'),null);assert.equal(response.headers.get('content-length'),null);
 const html=await response.text();assert.ok(html.includes(correctedSaveLocal));assert.ok(!html.includes(liveSaveLocal));
 const drift=await worker.default.fetch(new Request('https://hbnightflyers.com/glow'),{ASSETS:{fetch:async()=>new Response('unknown html',{headers:{'content-type':'text/html'}})}});
 assert.equal(drift.status,503);assert.equal(await drift.text(),'Glow save path version mismatch');
});

test('known original export endpoint remains blocked while API fallback behavior is unchanged',async()=>{
 const env={ASSETS:{fetch:async()=>new Response('unexpected fallback')}};
 const response=await worker.default.fetch(new Request('https://hbnightflyers.com/api/udisc-glow-export'),env);
 assert.equal(response.status,404);
});

test('offline helper replaces precisely one save function and rejects ambiguous anchors',()=>{
 const result=replaceGlowSaveLocal(liveGlowHtml,liveSaveLocal,correctedSaveLocal);
 assert.equal(result.status,'patched');assert.ok(result.html.includes(correctedSaveLocal));
 assert.throws(()=>replaceGlowSaveLocal(liveGlowHtml+liveSaveLocal,liveSaveLocal,correctedSaveLocal),/ANCHOR_NOT_EXACT/);
});

test('other assets and API paths preserve the original Worker ASSETS dispatch',async()=>{
 const seen=[];const env={ASSETS:{fetch:async req=>{seen.push(req.url);return new Response('retained asset fixture')}}};
 for(const path of ['/cart.html','/api/unrecognized','/internal/unrecognized']){
  const request=new Request('https://hbnightflyers.com'+path);
  const response=await worker.default.fetch(request,env);
  assert.equal(response.status,200);assert.equal(await response.text(),'retained asset fixture');assert.equal(seen.at(-1),request.url);
 }
});

test('candidate is fail-closed when legacy route metadata cannot activate the helper',()=>{
 assert.equal(built.result.status,'BLOCKED_LEGACY_API_ROUTE_CONFIG_NOT_PROVIDER_VERIFIED');
 assert.equal(built.result.baselineVersionId,versionId);
 assert.equal(built.result.API.uploadEligible,false);
 assert.equal(built.result.acceptance.releaseEligible,false);
 assert.equal(built.result.acceptance.v348RetainedInVersionList,true);
 assert.equal(built.result.acceptance.restoreExecution,'NOT_TESTED');
 assert.equal(built.metadata.keep_assets,true);
 assert.deepEqual(built.metadata.assets.config.run_worker_first,['/api/*','/internal/*','/glow-save-sync.mjs']);
 assert.equal(built.metadata.compatibility_date,'2026-07-28');
 assert.deepEqual(built.metadata.bindings.map(x=>x.name),settings.bindings.map(x=>x.name));
 assert.ok(built.metadata.bindings.filter(x=>x.type==='inherit').every(x=>Object.keys(x).sort().join(',')==='name,type'));
 assert.equal(built.result.lineage.activeVersionId,versionId);
 assert.equal(built.result.lineage.latestVersionId,versionId);
 assert.equal(built.result.API.path.endsWith('?bindings_inherit=strict'),true);
 assert.match(built.result.preservation.cartAssets,/separate Worker routes/);
 assert.equal(built.result.acceptance.productionAdmission,'NOT_ADMITTED');
 assert.throws(()=>buildKeepAssetsCandidate({capture:captureFixture(),helper,
  workerSettings:{...settings,latestVersionId:'0506298c-6cf5-48ea-a5ff-ea3c1bdc4341'},liveGlowHtml,candidateGlowHtml,liveGlowHtmlEvidence}),/INHERITED_BINDING_LATEST_NOT_ACTIVE_V348/);
 assert.throws(()=>buildKeepAssetsCandidate({capture:captureFixture(),helper,
  workerSettings:{...settings,firstListedVersionId:'0506298c-6cf5-48ea-a5ff-ea3c1bdc4341'},liveGlowHtml,candidateGlowHtml,liveGlowHtmlEvidence}),/INHERITED_BINDING_LATEST_NOT_ACTIVE_V348/);
});

test('capture module closure is exact and source map bytes are preserved',()=>{
 const source=Buffer.from(captureFixture().source.multipartBase64,'base64');
 const parts=parseMultipart(source).parts;
 assert.equal(parts.size,2);assert.ok(parts.has('index.js'));assert.ok(parts.has('index.js.map'));
 assert.equal(built.result.originalMapSha256,sha(parts.get('index.js.map')));
 assert.equal(built.result.sourceCaptureSha256,captureFixture().source.sha256);
 assert.match(built.module.toString(),/glow-save-sync\.mjs/);
});

test('multipart parser preserves raw Source Map v3 JSON bytes',()=>{
 const map=Buffer.from('{"version":3,"sources":["index.js"],"names":[],"mappings":""}');
 const boundary='raw-source-map-fixture';
 const body=Buffer.concat([
  Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="index.js"; filename="index.js"\r\nContent-Type: application/javascript+module\r\n\r\nexport default {};\r\n`),
  Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="index.js.map"; filename="index.js.map"\r\nContent-Type: application/source-map\r\n\r\n`),map,
  Buffer.from(`\r\n--${boundary}--\r\n`)
 ]);
 assert.deepEqual(parseMultipart(body).parts.get('index.js.map'),map);
});

test('multipart upload body binds metadata and exact module parts',()=>{
 const body=built.multipart.toString('latin1');
 assert.match(body,/name="metadata"/);
 assert.match(body,/name="index\.js"; filename="index\.js"/);
 assert.doesNotMatch(body,/name="index\.js\.map"/);
 assert.match(body,/"keep_assets":true/);
 assert.equal(built.result.upload.bytes,built.multipart.length);
 assert.equal(built.result.upload.sha256,sha(built.multipart));
});

test('actual Glow source invokes the helper and its CAS backend',async()=>{
 const html=await readFile(new URL('../public/glow.html',import.meta.url),'utf8');
 assert.match(html,/import\('\.\/glow-save-sync\.mjs'\)/);
 assert.match(html,/createGlowSaveCoordinator\(\{storage:localStorage,onStatus:setGlowSaveStatus\}\)/);
 assert.match(html,/ctx\.supabaseClient\.rpc\('hbnf_save_league_state_v1'/);
 assert.match(html,/\.eq\('id',1\)\.single\(\)/);
});

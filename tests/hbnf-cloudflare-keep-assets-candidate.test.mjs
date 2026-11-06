import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildKeepAssetsCandidate,parseMultipart} from '../scripts/hbnf-parent-release/build-keep-assets-candidate.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const versionId='48ffa87e-3c83-46d0-a6ca-db7bf0b064e6';
const helper=await readFile(new URL('../public/glow-save-sync.mjs',import.meta.url));
const settings={activeVersionId:versionId,latestVersionId:versionId,latestVersionNumber:348,
 firstListedVersionId:versionId,firstListedVersionNumber:348,versionListPageSize:100,newestFirstVerified:true,
 runtime:{assets:{static_routing:{user_worker:['/api/*','/internal/*']},serve_directly:true,base_path:'/'},compatibility_date:'2026-07-28',usage_model:'standard'},
 bindings:[{name:'ASSETS',type:'assets'},{name:'SUPABASE_SERVICE_ROLE_KEY',type:'secret_text'},
 {name:'SUPABASE_URL',type:'plain_text'},{name:'UDISC_GLOW_ACCESS_APPROVED',type:'plain_text'},
 {name:'UDISC_GLOW_EVENT_DATE',type:'plain_text'},{name:'UDISC_GLOW_EVENT_ID',type:'plain_text'},
 {name:'UDISC_GLOW_WINDOW_END',type:'plain_text'},{name:'UDISC_GLOW_WINDOW_START',type:'plain_text'}]};

function captureFixture(){
 const original=`const EXPORT_PATH='/api/udisc-glow-export';\nconst EVENTS_PATH='/api/udisc-glow-events';\nconst GLOW_SYNC_PATH='/internal/udisc-glow-sync';\nfunction errorResponse(status,message,headers={}){return new Response(message,{status,headers});}\nvar index_default = {\n  fetch(request, env) {\n    const path = new URL(request.url).pathname;\n    if (path === EXPORT_PATH || path === EVENTS_PATH || path === GLOW_SYNC_PATH) return errorResponse(404, "Not found.");\n    return env.ASSETS.fetch(request);\n  },\n  async scheduled(_controller, env, ctx) {\n    ctx.waitUntil(Promise.resolve());\n  }\n};\nexport { index_default as default };\n`;
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
const built=buildKeepAssetsCandidate({capture:captureFixture(),helper,workerSettings:settings});
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

test('other assets and API paths preserve the original Worker ASSETS dispatch',async()=>{
 const seen=[];const env={ASSETS:{fetch:async req=>{seen.push(req.url);return new Response('retained asset fixture')}}};
 for(const path of ['/cart.html','/api/unrecognized','/internal/unrecognized']){
  const request=new Request('https://hbnightflyers.com'+path);
  const response=await worker.default.fetch(request,env);
  assert.equal(response.status,200);assert.equal(await response.text(),'retained asset fixture');assert.equal(seen.at(-1),request.url);
 }
});

test('candidate uses keep_assets metadata, selective routing and exact latest lineage guard',()=>{
 assert.equal(built.result.status,'LOCAL_CANDIDATE_NOT_UPLOADED');
 assert.equal(built.result.baselineVersionId,versionId);
 assert.equal(built.metadata.keep_assets,true);
 assert.deepEqual(built.metadata.assets.config.run_worker_first,['/api/*','/internal/*','/glow-save-sync.mjs']);
 assert.equal(built.metadata.compatibility_date,'2026-07-28');
 assert.deepEqual(built.metadata.bindings.map(x=>x.name),settings.bindings.map(x=>x.name));
 assert.ok(built.metadata.bindings.filter(x=>x.type==='inherit').every(x=>Object.keys(x).sort().join(',')==='name,type'));
 assert.equal(built.result.lineage.activeVersionId,versionId);
 assert.equal(built.result.lineage.latestVersionId,versionId);
 assert.equal(built.result.API.path.endsWith('?bindings_inherit=strict'),true);
 assert.equal(built.result.preservation.cartAssets.includes('not independently enumerated'),true);
 assert.equal(built.result.acceptance.productionAdmission,'NOT_ADMITTED');
 assert.throws(()=>buildKeepAssetsCandidate({capture:captureFixture(),helper,
  workerSettings:{...settings,latestVersionId:'0506298c-6cf5-48ea-a5ff-ea3c1bdc4341'}}),/INHERITED_BINDING_LATEST_NOT_ACTIVE_V348/);
 assert.throws(()=>buildKeepAssetsCandidate({capture:captureFixture(),helper,
  workerSettings:{...settings,firstListedVersionId:'0506298c-6cf5-48ea-a5ff-ea3c1bdc4341'}}),/INHERITED_BINDING_LATEST_NOT_ACTIVE_V348/);
});

test('capture module closure is exact and source map bytes are preserved',()=>{
 const source=Buffer.from(captureFixture().source.multipartBase64,'base64');
 const parts=parseMultipart(source).parts;
 assert.equal(parts.size,2);assert.ok(parts.has('index.js'));assert.ok(parts.has('index.js.map'));
 assert.equal(built.result.originalMapSha256,sha(parts.get('index.js.map')));
 assert.equal(built.result.sourceCaptureSha256,captureFixture().source.sha256);
 assert.match(built.module.toString(),/glow-save-sync\.mjs/);
});

test('multipart upload body binds metadata and exact module parts',()=>{
 const body=built.multipart.toString('latin1');
 assert.match(body,/name="metadata"/);
 assert.match(body,/name="index\.js"; filename="index\.js"/);
 assert.match(body,/name="index\.js\.map"; filename="index\.js\.map"/);
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

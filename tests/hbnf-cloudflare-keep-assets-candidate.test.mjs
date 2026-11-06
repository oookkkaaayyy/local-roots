import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildKeepAssetsCandidate,parseMultipart} from '../scripts/hbnf-parent-release/build-keep-assets-candidate.mjs';

const capturePath='/Users/andrew/Downloads/hbnf-cloudflare-readonly-20261106.json';
const helperPath=new URL('../public/glow-save-sync.mjs',import.meta.url);
const rawCapture=JSON.parse(await readFile(capturePath,'utf8'));
const helper=await readFile(helperPath);
const settings={runtime:{assets:{static_routing:{user_worker:['/api/*','/internal/*']},serve_directly:true,base_path:'/'},compatibility_date:'2026-07-28',usage_model:'standard'},bindings:[
 {name:'ASSETS',type:'assets'},{name:'SUPABASE_SERVICE_ROLE_KEY',type:'secret_text'},{name:'SUPABASE_URL',type:'plain_text'},
 {name:'UDISC_GLOW_ACCESS_APPROVED',type:'plain_text'},{name:'UDISC_GLOW_EVENT_DATE',type:'plain_text'},
 {name:'UDISC_GLOW_EVENT_ID',type:'plain_text'},{name:'UDISC_GLOW_WINDOW_END',type:'plain_text'},{name:'UDISC_GLOW_WINDOW_START',type:'plain_text'}]};
const built=buildKeepAssetsCandidate({capture:rawCapture,helper,workerSettings:settings});
const modulePath=`file:///Users/andrew/Downloads/hbnf-keep-assets-candidate/index.mjs`;

test('candidate returns the exact corrected helper for GET and HEAD',async()=>{
  const worker=await import(modulePath+`?case=${Date.now()}`);
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

test('non-helper static assets and existing API dispatch remain unchanged',async()=>{
  const worker=await import(modulePath+`?case=${Date.now()}`);let seen;
  const env={ASSETS:{fetch:async req=>{seen=req.url;return new Response('original asset fixture')}}};
  const assetRequest=new Request('https://hbnightflyers.com/cart.html');
  const asset=await worker.default.fetch(assetRequest,env);assert.equal(await asset.text(),'original asset fixture');assert.equal(seen,assetRequest.url);
  const apiRequest=new Request('https://hbnightflyers.com/api/unrecognized');
  const api=await worker.default.fetch(apiRequest,env);
  assert.equal(api.status,200);assert.equal(seen,apiRequest.url);
  const internalRequest=new Request('https://hbnightflyers.com/internal/unrecognized');
  const internal=await worker.default.fetch(internalRequest,env);
  assert.equal(internal.status,200);assert.equal(seen,internalRequest.url);
});

test('candidate uses keep_assets metadata and adds one selective worker-first route',()=>{
  assert.equal(built.result.status,'LOCAL_CANDIDATE_NOT_UPLOADED');
  assert.equal(built.result.baselineVersionId,'48ffa87e-3c83-46d0-a6ca-db7bf0b064e6');
  assert.equal(built.metadata.keep_assets,true);
  assert.deepEqual(built.metadata.assets.config.run_worker_first,['/api/*','/internal/*','/glow-save-sync.mjs']);
  assert.equal(built.metadata.compatibility_date,'2026-07-28');
  assert.deepEqual(built.metadata.bindings.map(x=>x.name),settings.bindings.map(x=>x.name));
  assert.ok(built.metadata.bindings.filter(x=>x.type==='inherit').every(x=>x.version_id==='latest'));
  assert.equal(built.result.API.path.endsWith('?bindings_inherit=strict'),true);
  assert.equal(built.result.preservation.cartAssets.includes('not independently enumerated'),true);
  assert.equal(built.result.acceptance.productionAdmission,'NOT_ADMITTED');
});

test('candidate uses actual authenticated two-module capture and preserves map bytes',()=>{
  const source=Buffer.from(rawCapture.source.multipartBase64,'base64');
  const parts=parseMultipart(source).parts;
  assert.equal(parts.size,2);assert.ok(parts.has('index.js'));assert.ok(parts.has('index.js.map'));
  assert.match(built.result.originalMapSha256,/^[a-f0-9]{64}$/);
  assert.equal(built.result.sourceCaptureSha256,rawCapture.source.sha256);
  assert.match(built.module.toString(),/glow-save-sync\.mjs/);
});

test('multipart upload body binds metadata and exact module bytes for the documented legacy endpoint',()=>{
  const body=built.multipart.toString('latin1');
  assert.match(body,/name="metadata"/);
  assert.match(body,/name="index\.js"; filename="index\.js"/);
  assert.match(body,/name="index\.js\.map"; filename="index\.js\.map"/);
  assert.match(body,/"keep_assets":true/);
  assert.equal(built.result.upload.bytes,built.multipart.length);
  assert.match(built.result.upload.sha256,/^[a-f0-9]{64}$/);
});

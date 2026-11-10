import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLatestGlobalWorkerFirstPatch,sha256,verifyLatestGlobalWorkerFirstPatch} from
 '../scripts/hbnf-parent-release/cloudflare-executable-version.mjs';

const sourceHead='8f0b460215518908ac5767d4095621389907e98f';
const v348='48ffa87e-3c83-46d0-a6ca-db7bf0b064e6';
const v353='b9b301b2-006d-4887-8dc1-7d55a582d368';
const helper='export function saveAck(){return "persisted";}';
const moduleText=`var glowSaveAckSource = ${JSON.stringify(helper)};\nexport default {fetch(){}};`;
const moduleBytes=Buffer.from(moduleText);
const moduleHash=sha256(moduleBytes);
const helperHash=sha256(Buffer.from(helper));
const tag='hbnf-p0-'+sha256(Buffer.from(sourceHead+'\0run_worker_first=true')).slice(0,32);
const patch=buildLatestGlobalWorkerFirstPatch({tag});
const bindings=[{name:'ASSETS',type:'assets'},{name:'SUPABASE_URL',type:'plain_text',text:'https://example.invalid'}];
const latest={id:v353,number:353,main_module:'index.js',modules:[{name:'index.js',content_base64:moduleBytes.toString('base64')}],
 annotations:{'workers/tag':'prior'},assets:{jwt:'opaque-assets-collection',config:{base_path:'/',html_handling:'auto-trailing-slash',not_found_handling:'none',run_worker_first:['/api/*','/internal/*']}},
 bindings,compatibility_date:'2026-07-28',compatibility_flags:[],usage_model:'standard'};
const created={...latest,id:'b9b301b2-006d-4887-8dc1-7d55a582d369',number:354,
 annotations:{'workers/tag':tag},assets:{...latest.assets,config:{...latest.assets.config,run_worker_first:true}}};
const activeDeployment={versions:[{version_id:v348,percentage:100}]};

function mergePatch(target,patchValue){
 if(!patchValue||typeof patchValue!=='object'||Array.isArray(patchValue))return patchValue;
 const out=target&&typeof target==='object'&&!Array.isArray(target)?structuredClone(target):{};
 for(const [key,value] of Object.entries(patchValue)){
  if(value===null)delete out[key];
  else out[key]=value&&typeof value==='object'&&!Array.isArray(value)?mergePatch(out[key],value):value;
 }
 return out;
}

test('PATCH payload is a minimal explicit no-deploy merge patch',()=>{
 assert.equal(patch.endpoint,'PATCH /accounts/{account_id}/workers/workers/{worker_id}/versions/latest?deploy=false');
 assert.equal(patch.contentType,'application/merge-patch+json');assert.equal(patch.deploy,false);
 assert.deepEqual(patch.request,{annotations:{'workers/message':'HBNF P0 helper route Stage A; no traffic deployment','workers/tag':tag},
  assets:{config:{run_worker_first:true}}});
 assert.equal(sha256(patch.requestBytes),patch.requestSha256);
 assert.equal(Object.hasOwn(patch.request,'modules'),false);
 assert.equal(Object.hasOwn(patch.request,'bindings'),false);
 assert.equal(Object.hasOwn(patch.request.assets,'jwt'),false);
});

test('RFC 7396 inheritance preserves executable, bindings, asset collection, and unchanged asset settings',()=>{
 const merged=mergePatch(latest,patch.request);
 assert.deepEqual(merged.modules,latest.modules);assert.deepEqual(merged.bindings,latest.bindings);
 assert.equal(merged.assets.jwt,latest.assets.jwt);
 assert.deepEqual(merged.assets.config,{...latest.assets.config,run_worker_first:true});
 assert.equal(merged.compatibility_date,latest.compatibility_date);
 assert.equal(merged.usage_model,latest.usage_model);
});

test('provider readback requires exact module/helper bytes, route setting and v348 at 100%',()=>{
 const out=verifyLatestGlobalWorkerFirstPatch({patch,requestSha256:patch.requestSha256,expectedTag:tag,
  latestVersion:latest,createdVersion:created,activeDeployment,expectedMainModuleSha256:moduleHash,
  expectedHelperSha256:helperHash});
 assert.equal(out.versionId,created.id);assert.equal(out.runWorkerFirst,true);assert.equal(out.deploy,false);
 assert.throws(()=>verifyLatestGlobalWorkerFirstPatch({patch,requestSha256:patch.requestSha256,expectedTag:tag,
  latestVersion:latest,createdVersion:created,activeDeployment:{versions:[{version_id:created.id,percentage:100}]},
  expectedMainModuleSha256:moduleHash,expectedHelperSha256:helperHash}),/LATEST_PATCH_ACTIVE_TRAFFIC_CHANGED/);
});

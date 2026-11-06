// Focused test of the PR151 executable provider route; no production requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256,assetHash,buildExactVersion,stageExecutableVersion,deployRetainedVersion} from '../scripts/hbnf-parent-release/cloudflare-executable-version.mjs';
const old='48ffa87e-3c83-46d0-a6ca-db7bf0b064e6';
const next='66a779c0-d8fd-4449-a154-7b6eab9aebeb';
const workerId='09111111-2222-4333-8444-555555555555';
const accountId='e3bc6b78f1104fa0c2a01245084594cf';
const assets=new Map([['/glow-save-sync.mjs',Buffer.from('new valid one-file save ACK')],
  ['/cart.html',Buffer.from('current Cart unchanged')]]);
const installedPaths=[...assets.keys()];
const installedDigests=new Map([['/glow-save-sync.mjs',sha256(Buffer.from('old helper'))],
  ['/cart.html',sha256(assets.get('/cart.html'))]]);
const modules=[{name:'index.js',bytes:Buffer.from('export default {fetch(){return new Response("ok")}}')}];
const moduleDigests=new Map([['index.js',sha256(modules[0].bytes)]]);
const settings={compatibility_date:'2026-07-28',usage_model:'standard',
 assetConfig:{base_path:'/',html_handling:'auto-trailing-slash',not_found_handling:'none',run_worker_first:false},bindings:[
  {name:'ASSETS',type:'assets'}, {name:'SUPABASE_SERVICE_ROLE_KEY',type:'secret_text'},
  {name:'SUPABASE_URL',type:'plain_text'}]};
const args={assets,installedPaths,installedDigests,modules,moduleDigests,settings,baselineVersionId:old};
const response=(result,status=200)=>new Response(JSON.stringify({success:true,errors:[],result}),
  {status,headers:{'content-type':'application/json'}});
test('published base64-extension asset hash, complete manifest and exact secret inheritance',()=>{
  const b=Buffer.from('hello');
  assert.equal(assetHash('/x.html',b),sha256(Buffer.from(b.toString('base64')+'html')).slice(0,32));
  const result=buildExactVersion({...args,assetJwt:'COMPLETED_FAKE_TEST_JWT'});
  assert.equal(Object.keys(result.manifest).length,2);
  assert.equal(result.receipt.unchangedCount,1);
  assert.equal(result.body.bindings.find(x=>x.name==='SUPABASE_SERVICE_ROLE_KEY').version_id,old);
});
test('refuses omitted asset, altered Cart, changed runtime, and absent original admission',async()=>{
  assert.throws(()=>buildExactVersion({...args,assetJwt:'COMPLETED_FAKE_TEST_JWT',
    installedPaths:['/glow-save-sync.mjs']}),/INVENTORY_LENGTH/);
  const changed=new Map(assets);changed.set('/cart.html',Buffer.from('lost'));
  assert.throws(()=>buildExactVersion({...args,assets:changed,assetJwt:'COMPLETED_FAKE_TEST_JWT'}),
    /UNEXPECTED_CHANGE/);
  assert.throws(()=>buildExactVersion({...args,moduleDigests:new Map([['index.js','f'.repeat(64)]]),
    assetJwt:'COMPLETED_FAKE_TEST_JWT'}),/MODULE_BYTES_DRIFT/);
  await assert.rejects(stageExecutableVersion({...args,token:'test_token_long_enough',accountId,
    requireParentAdmission:async()=>{throw Error('NOT_ADMITTED')},
    requireProviderCompleteInventory:async()=>{},requireFreshFiveTargetPreimage:async()=>{},
    fetchImpl:()=>{throw Error('should not call provider')}}),/NOT_ADMITTED/);
});
test('hash-reuse upload creates undeployed version; old Cart never uploaded',async()=>{
  const helperHash=assetHash('/glow-save-sync.mjs',assets.get('/glow-save-sync.mjs'));
  const calls=[];let checked=0;
  const fetchImpl=async(url,init={})=>{
    const p=new URL(url).pathname,m=init.method||'GET';calls.push(m+' '+p);
    if(p.endsWith('/workers/workers/hbnf'))return response({name:'hbnf',id:workerId});
    if(p.endsWith('/scripts/hbnf/deployments'))return response({
      deployments:[{versions:[{version_id:old,percentage:100}]}]});
    if(p.endsWith('/scripts/hbnf/versions/'+old))return response({id:old,resources:{script:{etag:'etag'}}});
    if(p.endsWith('/scripts/hbnf/assets-upload-session')){
      const data=JSON.parse(init.body);assert.equal(Object.keys(data.manifest).length,2);
      return response({jwt:'FIRST_SESSION_JWT_LONG',buckets:[[helperHash]]});
    }
    if(p.endsWith('/workers/assets/upload')){
      assert.equal(init.headers.Authorization,'Bearer FIRST_SESSION_JWT_LONG');
      assert.equal(init.body.has(helperHash),true);
      assert.equal(init.body.has(assetHash('/cart.html',assets.get('/cart.html'))),false);
      return response({jwt:'FINAL_COMPLETED_JWT_LONG'},201);
    }
    if(p.endsWith('/workers/workers/'+workerId+'/versions')){
      // New /workers/workers/{id}/versions API uses JSON with base64 modules;
      // do not confuse it with the older /workers/scripts/{name}/versions API.
      assert.equal(init.headers['Content-Type'],'application/json');
      assert.equal(typeof init.body,'string');
      const data=JSON.parse(init.body);
      assert.equal(data.assets.jwt,'FINAL_COMPLETED_JWT_LONG');
      assert.equal(data.bindings.find(x=>x.name==='SUPABASE_SERVICE_ROLE_KEY').version_id,old);
      assert.equal(data.main_module,'index.js');
      assert.equal(data.modules.length,1);
      assert.equal(data.modules[0].content_type,'application/javascript+module');
      assert.equal(Buffer.from(data.modules[0].content_base64,'base64').toString('utf8'),
        modules[0].bytes.toString('utf8'));
      assert.equal(m,'POST');return response({id:next});
    }
    if(p.endsWith('/workers/workers/'+workerId+'/versions/'+next))
      return response({id:next,compatibility_date:'2026-07-28',bindings:settings.bindings,assets:{config:settings.assetConfig}});
    throw Error('unexpected '+m+' '+p);
  };
  const result=await stageExecutableVersion({...args,token:'test_token_long_enough',accountId,
    scriptEtag:'etag',fetchImpl,requireParentAdmission:async()=>true,
    requireProviderCompleteInventory:async()=>true,requireFreshFiveTargetPreimage:async()=>{checked++;return true}});
  assert.equal(result.status,'EXECUTABLE_VERSION_CREATED_NOT_DEPLOYED');
  assert.equal(result.receipt.assetCount,2);assert.equal(checked,2);
  assert.equal(calls.filter(x=>x.endsWith('/deployments')&&x.startsWith('POST')).length,0);
});
test('retained version restore conditional readback and ambiguous deploy fail closed',async()=>{
  let current=next;let postCount=0;
  const fetchImpl=async(url,init={})=>{
    const p=new URL(url).pathname;
    if(p.endsWith('/versions/'+old))return response({id:old});
    if(p.endsWith('/deployments')){
      if(init.method==='POST'){postCount++;current=old;return response({versions:[{version_id:old,percentage:100}]})}
      return response({deployments:[{versions:[{version_id:current,percentage:100}]}]});
    }
    throw Error('unexpected');
  };
  const inputs={accountId,token:'test_token_long_enough',targetVersionId:old,
    currentVersionId:next,manifestSha256:'b'.repeat(64),verifyExclusiveParentClaim:async()=>true};
  const ok=await deployRetainedVersion({...inputs,fetchImpl});
  assert.equal(ok.versionId,old);assert.equal(postCount,1);
  current=next;
  await assert.rejects(deployRetainedVersion({...inputs,fetchImpl:async(url,init={})=>
    init.method==='POST'?Promise.reject(Error('ambiguous')):fetchImpl(url,init)}),
    /AMBIGUOUS_DEPLOY_PARENT_RECOVERY_REQUIRED/);
});

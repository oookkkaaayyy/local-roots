// Focused fixtures for the rev10-gated Cloudflare Beta version route. No real
// provider requests are made by this suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256,assetHash,inventoryDigest,buildExactVersion,validateAssetBuckets,stageExecutableVersion,stageInheritedBetaVersion,deployRetainedVersion} from '../scripts/hbnf-parent-release/cloudflare-executable-version.mjs';
import {readFile} from 'node:fs/promises';

const old='48ffa87e-3c83-46d0-a6ca-db7bf0b064e6';
const next='66a779c0-d8fd-4449-a154-7b6eab9aebeb';
const workerId='09111111-2222-4333-8444-555555555555';
const accountId='e3bc6b78f1104fa0c2a01245084594cf';
const assets=new Map([
  ['/glow-save-sync.mjs',Buffer.from('new valid one-file save ACK')],
  ...Array.from({length:8},(_,i)=>[`/cart-${i+1}.html`,Buffer.from(`unchanged Cart asset ${i+1}`)])
]);
const installedPaths=[...assets.keys()];
const installedDigests=new Map([...assets].map(([p,b])=>[p,sha256(p==='/glow-save-sync.mjs'?Buffer.from('old helper'):b)]));
const modules=[{name:'index.js',bytes:Buffer.from('export default {fetch(){return new Response("ok")}}')}];
const moduleDigests=new Map([['index.js',sha256(modules[0].bytes)]]);
const settings={runtime:{compatibility_date:'2026-07-28',usage_model:'standard',assets:{
 static_routing:{user_worker:['/api/*','/internal/*']},serve_directly:true,base_path:'/'}},bindings:[
  {name:'ASSETS',type:'assets'}, {name:'SUPABASE_SERVICE_ROLE_KEY',type:'secret_text'},
  {name:'SUPABASE_URL',type:'plain_text'}, {name:'UDISC_GLOW_ACCESS_APPROVED',type:'plain_text'},
  {name:'UDISC_GLOW_EVENT_DATE',type:'plain_text'}, {name:'UDISC_GLOW_EVENT_ID',type:'plain_text'},
  {name:'UDISC_GLOW_WINDOW_END',type:'plain_text'}, {name:'UDISC_GLOW_WINDOW_START',type:'plain_text'}]};
const args={assets,installedPaths,installedDigests,modules,moduleDigests,settings,baselineVersionId:old};
const witness={complete:true,readOnly:true,workerName:'hbnf',versionId:old,paths:installedPaths,
  digests:Object.fromEntries(installedDigests),inventoryDigest:inventoryDigest(installedPaths,installedDigests)};
const response=(result,status=200)=>new Response(JSON.stringify({success:true,errors:[],result}),
  {status,headers:{'content-type':'application/json'}});

const inheritedCandidatePath=process.env.HBNF_BETA_CANDIDATE_PATH;
const readInheritedCandidate=async()=>{
  assert.ok(inheritedCandidatePath,'set HBNF_BETA_CANDIDATE_PATH to the independently downloaded frozen candidate');
  return readFile(inheritedCandidatePath);
};

test('inherited Beta route creates one v348-bound version, preserves active traffic, and reads it back',{
  skip:!inheritedCandidatePath
},async()=>{
  const raw=await readInheritedCandidate(),candidate=JSON.parse(raw);
  const calls=[];let postCount=0;
  const fetchImpl=async(url,init={})=>{
    const u=new URL(url),p=u.pathname,m=init.method||'GET';calls.push({method:m,path:p,search:u.search});
    if(p.endsWith('/workers/workers/hbnf'))return response({name:'hbnf',id:workerId});
    if(p.endsWith('/scripts/hbnf/deployments'))return response({deployments:[{versions:[{version_id:old,percentage:100}]}]});
    if(p.endsWith('/scripts/hbnf/versions/'+old))return response({id:old,resources:{script:{etag:'c3ea6bde761a6a5735a6a8b50334821b809baf57096c64cbb71b50a17ceb5b25'},bindings:candidate.request.version.bindings}});
    if(p.endsWith('/workers/workers/'+workerId+'/versions')&&m==='POST'){
      postCount++;
      assert.equal(u.search,'?deploy=false');
      assert.equal(init.headers['Content-Type'],'application/json');
      assert.deepEqual(JSON.parse(init.body),candidate.request);
      return response({id:next});
    }
    if(p.endsWith('/workers/workers/'+workerId+'/versions/'+next))return response({
      id:next,annotations:candidate.request.version.annotations,
      compatibility_date:candidate.request.version.compatibility_date,
      bindings:candidate.request.version.bindings,
      assets:{config:candidate.request.version.assets.config}
    });
    throw Error('unexpected '+m+' '+p);
  };
  const callsByClaim=[];
  const result=await stageInheritedBetaVersion({
    token:'test_token_long_enough',accountId,workerName:'hbnf',fetchImpl,candidateBytes:raw,
    candidateSha256:sha256(raw),requestSha256:candidate.operation.requestSha256,
    baselineVersionId:old,scriptEtag:'c3ea6bde761a6a5735a6a8b50334821b809baf57096c64cbb71b50a17ceb5b25',
    manifestSha256:'a'.repeat(64),parentRecord:{id:'existing-rev14'},
    requireParentAdmission:async()=>true,
    verifyCandidateDownloadback:async()=>({verified:true,sha256:sha256(raw),bytes:raw.length}),
    requireFreshFiveTargetPreimage:async()=>true,
    claimOnce:async()=>{callsByClaim.push('claimed');return {acquired:true,durable:true,manifestSha256:'a'.repeat(64),transactionId:'stage-a-test-claim'};}
  });
  assert.equal(result.status,'INHERITED_BETA_VERSION_CREATED_NOT_DEPLOYED');
  assert.equal(result.versionId,next);assert.equal(result.activePercentage,100);
  assert.equal(postCount,1);assert.deepEqual(callsByClaim,['claimed']);
  assert.equal(calls.some(x=>x.method==='POST'&&x.path.endsWith('/deployments')),false);
  assert.equal(calls.some(x=>x.path.endsWith('/assets-upload-session')||x.path.endsWith('/workers/assets/upload')),false);
  assert.equal(calls.some(x=>x.method!=='GET'&&/\/(routes|schedules)(?:\?|$)/.test(x.path)),false);
  assert.equal(calls.filter(x=>x.method==='GET'&&x.path.endsWith('/scripts/hbnf/deployments')).length,2);
});

test('inherited Beta route reconciles ambiguous create by tag readback and never retries',{
  skip:!inheritedCandidatePath
},async()=>{
  const raw=await readInheritedCandidate(),candidate=JSON.parse(raw),calls=[];
  const fetchImpl=async(url,init={})=>{
    const u=new URL(url),p=u.pathname,m=init.method||'GET';calls.push({method:m,path:p,search:u.search});
    if(p.endsWith('/workers/workers/hbnf'))return response({name:'hbnf',id:workerId});
    if(p.endsWith('/scripts/hbnf/deployments'))return response({deployments:[{versions:[{version_id:old,percentage:100}]}]});
    if(p.endsWith('/scripts/hbnf/versions/'+old))return response({id:old,resources:{script:{etag:'c3ea6bde761a6a5735a6a8b50334821b809baf57096c64cbb71b50a17ceb5b25'},bindings:candidate.request.version.bindings}});
    if(p.endsWith('/workers/workers/'+workerId+'/versions')&&m==='POST')throw Error('response lost after create may have committed');
    if(p.endsWith('/workers/workers/'+workerId+'/versions')&&m==='GET')return response({result:[{id:next,annotations:candidate.request.version.annotations}]});
    if(p.endsWith('/workers/workers/'+workerId+'/versions/'+next))return response({
      id:next,annotations:candidate.request.version.annotations,
      compatibility_date:candidate.request.version.compatibility_date,
      bindings:candidate.request.version.bindings,
      assets:{config:candidate.request.version.assets.config}
    });
    throw Error('unexpected '+m+' '+p);
  };
  const result=await stageInheritedBetaVersion({token:'test_token_long_enough',accountId,fetchImpl,
    candidateBytes:raw,candidateSha256:sha256(raw),requestSha256:candidate.operation.requestSha256,
    baselineVersionId:old,scriptEtag:'c3ea6bde761a6a5735a6a8b50334821b809baf57096c64cbb71b50a17ceb5b25',
    manifestSha256:'b'.repeat(64),requireParentAdmission:async()=>true,
    verifyCandidateDownloadback:async()=>({verified:true,sha256:sha256(raw),bytes:raw.length}),
    requireFreshFiveTargetPreimage:async()=>true,
    claimOnce:async()=>({acquired:true,durable:true,manifestSha256:'b'.repeat(64),transactionId:'stage-a-ambiguous-test'})
  });
  assert.equal(result.versionId,next);
  assert.equal(calls.filter(x=>x.method==='POST'&&x.path.endsWith('/versions')).length,1);
  assert.equal(calls.filter(x=>x.method==='GET'&&x.path.endsWith('/versions')).length,1);
  assert.equal(calls.some(x=>x.method==='POST'&&x.path.endsWith('/deployments')),false);
});

test('inherited Beta route rejects an unfrozen candidate before any provider request',async()=>{
  let providerCalls=0;
  await assert.rejects(stageInheritedBetaVersion({
    token:'test_token_long_enough',accountId,baselineVersionId:old,
    candidateBytes:Buffer.from('{"request":{}}'),candidateSha256:'0'.repeat(64),
    requestSha256:'0'.repeat(64),scriptEtag:'c3ea6bde761a6a5735a6a8b50334821b809baf57096c64cbb71b50a17ceb5b25',
    manifestSha256:'c'.repeat(64),
    requireParentAdmission:async()=>true,verifyCandidateDownloadback:async()=>({verified:true}),
    requireFreshFiveTargetPreimage:async()=>true,claimOnce:async()=>({acquired:true,durable:true}),
    fetchImpl:async()=>{providerCalls++;throw Error('provider must not be called')}
  }),/INHERITED_CANDIDATE_ARTIFACT_HASH/);
  assert.equal(providerCalls,0);
});

test('requires a complete v348 inventory, preserves unchanged bytes and validates every requested bucket',()=>{
  const b=Buffer.from('hello');
  assert.equal(assetHash('/x.html',b),sha256(Buffer.from(b.toString('base64')+'html')).slice(0,32));
  const result=buildExactVersion({...args,assetJwt:'COMPLETED_FAKE_TEST_JWT'});
  assert.equal(Object.keys(result.manifest).length,9);
  assert.equal(result.receipt.unchangedCount,8);
  for(const [p,bytes] of assets)if(p!=='/glow-save-sync.mjs')
    assert.equal(result.manifest[p].hash,assetHash(p,bytes),`${p} must retain its exact bytes`);
  assert.equal(result.body.bindings.length,8);
  assert.deepEqual(result.body.bindings.map(x=>x.name),settings.bindings.map(x=>x.name));
  assert.ok(result.body.bindings.filter(x=>x.name!=='ASSETS').every(x=>x.type==='inherit'&&x.version_id===old));
  assert.deepEqual(result.body.assets.config.run_worker_first,['/api/*','/internal/*','/glow-save-sync.mjs']);
  const helper=result.manifest['/glow-save-sync.mjs'].hash;
  assert.throws(()=>validateAssetBuckets(result.manifest,[[helper,'f'.repeat(32)]]),/BUCKET_UNRECOGNIZED_HASH/);
  assert.throws(()=>validateAssetBuckets(result.manifest,[[helper],[helper]]),/BUCKET_UNRECOGNIZED_HASH/);
  assert.deepEqual([...validateAssetBuckets(result.manifest,[[helper]])],[helper]);
  assert.deepEqual([...validateAssetBuckets(result.manifest,[])],[]);
  assert.throws(()=>buildExactVersion({...args,installedPaths:installedPaths.slice(1),assetJwt:'COMPLETED_FAKE_TEST_JWT'}),/INVENTORY_LENGTH/);
});

test('source map preflight gates the exact Cloudflare JSON module payload before upload',()=>{
  const map=Buffer.from(JSON.stringify({version:3,file:'index.js',sources:['index.ts'],names:[],mappings:'AAAA'}));
  const entry=Buffer.from('//# sourceMappingURL=index.js.map\n');
  const modulesWithMap=[{name:'index.js',bytes:entry},{name:'index.js.map',bytes:map}];
  const digests=new Map(modulesWithMap.map(module=>[module.name,sha256(module.bytes)]));
  const result=buildExactVersion({...args,modules:modulesWithMap,moduleDigests:digests,assetJwt:'COMPLETED_FAKE_TEST_JWT'});
  assert.equal(result.body.modules.find(module=>module.name==='index.js.map').content_type,'application/source-map');
  assert.equal(Buffer.from(result.body.modules.find(module=>module.name==='index.js.map').content_base64,'base64').toString(),map.toString());

  const malformed=Buffer.from(JSON.stringify({version:3,sources:['index.ts'],names:[],mappings:'A?'}));
  const invalidModules=[modulesWithMap[0],{name:'index.js.map',bytes:malformed}];
  assert.throws(()=>buildExactVersion({...args,modules:invalidModules,
    moduleDigests:new Map(invalidModules.map(module=>[module.name,sha256(module.bytes)])),
    assetJwt:'COMPLETED_FAKE_TEST_JWT'}),/non-base64 VLQ/);
  const missingReference=[{name:'index.js',bytes:entry}];
  assert.throws(()=>buildExactVersion({...args,modules:missingReference,
    moduleDigests:new Map(missingReference.map(module=>[module.name,sha256(module.bytes)])),
    assetJwt:'COMPLETED_FAKE_TEST_JWT'}),/references missing source map/);
});

test('rejects missing/altered assets, stale or partial inventory proof and absent admission before provider access',async()=>{
  const changed=new Map(assets);changed.set('/cart-4.html',Buffer.from('missing asset bucket cannot be masked'));
  assert.throws(()=>buildExactVersion({...args,assets:changed,assetJwt:'COMPLETED_FAKE_TEST_JWT'}),/UNEXPECTED_CHANGE/);
  await assert.rejects(stageExecutableVersion({...args,token:'test_token_long_enough',accountId,
    requireParentAdmission:async()=>true,requireProviderCompleteInventory:async()=>true,
    requireFreshFiveTargetPreimage:async()=>true,fetchImpl:()=>{throw Error('provider must not be called')} }),/COMPLETE_ASSETS_NOT_PROVEN/);
  await assert.rejects(stageExecutableVersion({...args,token:'test_token_long_enough',accountId,
    requireParentAdmission:async()=>true,requireProviderCompleteInventory:async()=>({...witness,paths:witness.paths.slice(1)}),
    requireFreshFiveTargetPreimage:async()=>true,fetchImpl:()=>{throw Error('provider must not be called')} }),/INVENTORY_WITNESS_PATHS/);
  await assert.rejects(stageExecutableVersion({...args,token:'test_token_long_enough',accountId,
    requireParentAdmission:async()=>{throw Error('NOT_ADMITTED')},requireProviderCompleteInventory:async()=>witness,
    requireFreshFiveTargetPreimage:async()=>true,fetchImpl:()=>{throw Error('provider must not be called')} }),/NOT_ADMITTED/);
});

test('Beta route pins inheritance to v348, routes helper Worker-first and creates without deployment',async()=>{
  const helperHash=assetHash('/glow-save-sync.mjs',assets.get('/glow-save-sync.mjs'));
  const calls=[];let current=old;
  const fetchImpl=async(url,init={})=>{
    const u=new URL(url),p=u.pathname,m=init.method||'GET';calls.push({method:m,path:p,search:u.search});
    if(p.endsWith('/workers/workers/hbnf'))return response({name:'hbnf',id:workerId});
    if(p.endsWith('/scripts/hbnf/deployments'))return response({deployments:[{versions:[{version_id:current,percentage:100}]}]});
    if(p.endsWith('/scripts/hbnf/versions/'+old))return response({id:old,resources:{script:{etag:'etag'}}});
    if(p.endsWith('/scripts/hbnf/assets-upload-session')){
      assert.equal(Object.keys(JSON.parse(init.body).manifest).length,9);
      return response({jwt:'FIRST_SESSION_JWT_LONG',buckets:[[helperHash]]});
    }
    if(p.endsWith('/workers/assets/upload')){
      assert.equal(init.headers.Authorization,'Bearer FIRST_SESSION_JWT_LONG');
      assert.equal(init.body.has(helperHash),true);
      for(let i=1;i<=8;i++)assert.equal(init.body.has(assetHash(`/cart-${i}.html`,assets.get(`/cart-${i}.html`))),false);
      return response({jwt:'FINAL_COMPLETED_JWT_LONG'},201);
    }
    if(p.endsWith('/workers/workers/'+workerId+'/versions')&&m==='POST'){
      assert.equal(u.search,'?deploy=false');
      assert.equal(init.headers['Content-Type'],'application/json');
      const envelope=JSON.parse(init.body);
      assert.deepEqual(Object.keys(envelope),['version']);
      const body=envelope.version;
      assert.deepEqual(Object.keys(body).sort(),['annotations','assets','bindings','compatibility_date','compatibility_flags','main_module','modules','usage_model'].sort());
      assert.equal(Object.hasOwn(body,'routes'),false);
      assert.equal(Object.hasOwn(body,'crons'),false);
      assert.deepEqual(body.assets.config.run_worker_first,['/api/*','/internal/*','/glow-save-sync.mjs']);
      assert.equal(body.bindings.length,8);
      assert.deepEqual(body.bindings.map(x=>x.name),settings.bindings.map(x=>x.name));
      assert.ok(body.bindings.filter(x=>x.name!=='ASSETS').every(x=>x.type==='inherit'&&x.version_id===old));
      assert.equal(body.modules[0].content_type,'application/javascript+module');
      assert.equal(Buffer.from(body.modules[0].content_base64,'base64').toString(),modules[0].bytes.toString());
      return response({id:next});
    }
    if(p.endsWith('/workers/workers/'+workerId+'/versions/'+next))return response({id:next,
      annotations:{'workers/tag':'hbnf-p0-'+sha256(assets.get('/glow-save-sync.mjs')).slice(0,32)},
      compatibility_date:'2026-07-28',bindings:settings.bindings.map(b=>b.name==='ASSETS'?b:
        {name:b.name,type:'inherit',version_id:old}),
      assets:{config:{base_path:'/',run_worker_first:['/api/*','/internal/*','/glow-save-sync.mjs']}}});
    if(p.endsWith('/scripts/hbnf/versions/'+old))return response({id:old});
    throw Error('unexpected '+m+' '+p);
  };
  let preimages=0;
  const result=await stageExecutableVersion({...args,token:'test_token_long_enough',accountId,scriptEtag:'etag',fetchImpl,
    requireParentAdmission:async()=>true,requireProviderCompleteInventory:async()=>witness,
    requireFreshFiveTargetPreimage:async()=>{preimages++;return true}});
  assert.equal(result.status,'EXECUTABLE_VERSION_CREATED_NOT_DEPLOYED');
  assert.equal(result.versionId,next);assert.equal(result.receipt.assetCount,9);assert.equal(preimages,2);
  assert.equal(calls.some(x=>x.method==='POST'&&x.path.endsWith('/deployments')),false);
  assert.equal(calls.some(x=>/\/(routes|schedules)(?:\?|$)/.test(x.path)&&x.method!=='GET'),false);
  assert.equal(current,old);
});

test('ambiguous Beta create is reconciled by version-list readback without retry',async()=>{
  const calls=[];
  const fetchImpl=async(url,init={})=>{
    const u=new URL(url),p=u.pathname,m=init.method||'GET';calls.push(m+' '+p);
    if(p.endsWith('/workers/workers/hbnf'))return response({name:'hbnf',id:workerId});
    if(p.endsWith('/scripts/hbnf/deployments'))return response({deployments:[{versions:[{version_id:old,percentage:100}]}]});
    if(p.endsWith('/scripts/hbnf/versions/'+old))return response({id:old,resources:{script:{etag:'etag'}}});
    if(p.endsWith('/scripts/hbnf/assets-upload-session'))return response({jwt:'SESSION_JWT_LONG',buckets:[[assetHash('/glow-save-sync.mjs',assets.get('/glow-save-sync.mjs'))]]});
    if(p.endsWith('/workers/assets/upload'))return response({jwt:'COMPLETION_JWT_LONG'},201);
    if(p.endsWith('/workers/workers/'+workerId+'/versions')&&m==='POST')throw Error('connection reset after provider may have committed');
    if(p.endsWith('/workers/workers/'+workerId+'/versions')&&m==='GET')return response({result:[{id:next,annotations:{'workers/tag':'hbnf-p0-'+sha256(assets.get('/glow-save-sync.mjs')).slice(0,32)}}]});
    if(p.endsWith('/workers/workers/'+workerId+'/versions/'+next))return response({id:next,compatibility_date:'2026-07-28',
      annotations:{'workers/tag':'hbnf-p0-'+sha256(assets.get('/glow-save-sync.mjs')).slice(0,32)},
      bindings:settings.bindings.map(b=>b.name==='ASSETS'?b:{name:b.name,type:'inherit',version_id:old}),
      assets:{config:{base_path:'/',run_worker_first:['/api/*','/internal/*','/glow-save-sync.mjs']}}});
    if(p.endsWith('/scripts/hbnf/versions/'+old))return response({id:old});
    throw Error('unexpected '+m+' '+p);
  };
  const out=await stageExecutableVersion({...args,token:'test_token_long_enough',accountId,scriptEtag:'etag',fetchImpl,
    requireParentAdmission:async()=>true,requireProviderCompleteInventory:async()=>witness,
    requireFreshFiveTargetPreimage:async()=>true});
  assert.equal(out.versionId,next);
  assert.equal(calls.filter(x=>x==='POST /client/v4/accounts/'+accountId+'/workers/workers/'+workerId+'/versions').length,1);
  assert.equal(calls.includes('GET /client/v4/accounts/'+accountId+'/workers/workers/'+workerId+'/versions'),true);
});

test('ambiguous asset-session response triggers version readback and no repeated mutation',async()=>{
  const calls=[];
  const fetchImpl=async(url,init={})=>{
    const u=new URL(url),p=u.pathname,m=init.method||'GET';calls.push(m+' '+p);
    if(p.endsWith('/workers/workers/hbnf'))return response({name:'hbnf',id:workerId});
    if(p.endsWith('/scripts/hbnf/deployments'))return response({deployments:[{versions:[{version_id:old,percentage:100}]}]});
    if(p.endsWith('/scripts/hbnf/versions/'+old))return response({id:old,resources:{script:{etag:'etag'}}});
    if(p.endsWith('/scripts/hbnf/assets-upload-session'))throw Error('connection reset after request');
    if(p.endsWith('/workers/workers/'+workerId+'/versions')&&m==='GET')return response({result:[]});
    throw Error('unexpected '+m+' '+p);
  };
  await assert.rejects(stageExecutableVersion({...args,token:'test_token_long_enough',accountId,scriptEtag:'etag',fetchImpl,
    requireParentAdmission:async()=>true,requireProviderCompleteInventory:async()=>witness,
    requireFreshFiveTargetPreimage:async()=>true}),/AMBIGUOUS_ASSET_SESSION_NO_RETRY/);
  assert.equal(calls.filter(x=>x==='POST /client/v4/accounts/'+accountId+'/workers/scripts/hbnf/assets-upload-session').length,1);
  assert.equal(calls.filter(x=>x==='GET /client/v4/accounts/'+accountId+'/workers/workers/'+workerId+'/versions').length,1);
  assert.equal(calls.some(x=>x.startsWith('POST ')&&x.includes('/workers/assets/upload')),false);
  assert.equal(calls.some(x=>x.startsWith('POST ')&&x.endsWith('/versions')),false);
});

test('retained v348 restore is read back; ambiguous deployment is read back and never retried',async()=>{
  let current=next,postCount=0;
  const fetchImpl=async(url,init={})=>{
    const p=new URL(url).pathname;
    if(p.endsWith('/versions/'+old))return response({id:old});
    if(p.endsWith('/deployments')){
      if(init.method==='POST'){postCount++;current=old;throw Error('response lost after commit');}
      return response({deployments:[{versions:[{version_id:current,percentage:100}]}]});
    }
    throw Error('unexpected');
  };
  const inputs={accountId,token:'test_token_long_enough',targetVersionId:old,currentVersionId:next,
    manifestSha256:'b'.repeat(64),verifyExclusiveParentClaim:async()=>true};
  const out=await deployRetainedVersion({...inputs,fetchImpl});
  assert.equal(out.status,'VERSION_DEPLOY_READBACK_RECONCILED');assert.equal(out.versionId,old);assert.equal(postCount,1);
});

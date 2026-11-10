import test from 'node:test';
import assert from 'node:assert/strict';
import {captureCurrentCloudflareReadOnly,publicReceipt,parseWranglerTokenJson,readWranglerToken} from '../scripts/hbnf-parent-release/capture-cloudflare-current-readonly.mjs';
import {createHash} from 'node:crypto';

const current='48ffa87e-3c83-46d0-a6ca-db7bf0b064e6';
const newer='11111111-2222-3333-4444-555555555555';
const token='TEST_ONLY_CLOUDFLARE_TOKEN_NEVER_EXPOSE';
const workerBytes=Buffer.from('mock-secret-source-not-for-public-receipt');
const sha=x=>createHash('sha256').update(x).digest('hex');

function mock({version=current,drift=false,routeStatus=200,sourceStatus=200,versionFormatValid=true}={}){
  const calls=[];
  let deploymentReads=0;
  const json=(o,status=200)=>new Response(JSON.stringify(o),{status,headers:{'content-type':'application/json'}});
  const fetchImpl=async(url,opt)=>{
    const p=new URL(url).pathname;
    calls.push({path:p,method:opt.method,auth:opt.headers.authorization,redirect:opt.redirect});
    if(p.endsWith('/deployments')){
      deploymentReads++;
      const v=drift&&deploymentReads===2?newer:version;
      return json({success:true,result:{deployments:[{id:drift&&deploymentReads===2?'dep2':'dep1',
        versions:[{percentage:100,version_id:v}]}]}});
    }
    if(p.endsWith('/workers/routes'))return json({success:true,result:[{
      pattern:'hbnightflyers.com/*',script:'hbnf'}]},routeStatus);
    if(p.includes('/versions/'))return versionFormatValid?
      json({success:true,result:{id:version,number:351,resources:{script:{etag:'e'.repeat(64)}}}}):
      new Response('not-json',{status:200});
    if(p.endsWith('/schedules'))return json({success:true,result:{schedules:[{cron:'*/15 * * * *'}]}});
    if(p.endsWith('/settings'))return json({success:true,result:{bindings:[{
      name:'PRIVATE_NAME',type:'secret_text',text:'SECRET_VALUE_MUST_NOT_BE_SAVED'}]}});
    if(p.endsWith('/workers/scripts/hbnf'))return new Response(workerBytes,{status:sourceStatus});
    throw Error('UNEXPECTED_TEST_REQUEST');
  };
  return {fetchImpl,calls};
}

test('current GET-only capture uses actual version and source bytes but never claims rollback/admission',async()=>{
  const m=mock({version:newer});
  const r=await captureCurrentCloudflareReadOnly({token,fetchImpl:m.fetchImpl});
  const receipt=publicReceipt(r);
  assert.equal(r.before.versionId,newer);
  assert.equal(r.after.versionId,newer);
  assert.equal(r.historicalVersionStillActive,false);
  assert.equal(r.source.bytes,workerBytes.length);
  assert.equal(r.source.sha256,sha(workerBytes));
  assert.equal(Buffer.from(r.source.multipartBase64,'base64').toString(),workerBytes.toString());
  assert.equal(r.route.data.matched,true);
  assert.equal(r.schedules.data.cronCount,1);
  assert.deepEqual(r.settings.data.bindings,[{type:'secret_text',name:'PRIVATE_NAME'}]);
  assert.equal(r.forbiddenConclusions.productionDeployment,false);
  assert.equal(r.forbiddenConclusions.independentlyDurableDownloadBack,false);
  assert.equal(receipt.releaseAdmission,'NOT_ADMITTED');
  assert.equal(JSON.stringify(r).includes('SECRET_VALUE_MUST_NOT_BE_SAVED'),false);
  assert.equal(JSON.stringify(receipt).includes('mock-secret-source'),false);
  assert.equal(JSON.stringify(receipt).includes(token),false);
  assert(m.calls.every(c=>c.method==='GET'&&c.redirect==='manual'&&c.auth==='Bearer '+token));
});

test('unavailable route permission retains independent worker source observation',async()=>{
  const m=mock({routeStatus:403});
  const r=await captureCurrentCloudflareReadOnly({token,fetchImpl:m.fetchImpl});
  assert.equal(r.route.state,'UNVERIFIED');
  assert.equal(r.route.code,'CF_ROUTES_HTTP_403');
  assert.equal(r.source.sha256,sha(workerBytes));
  assert.equal(publicReceipt(r).releaseAdmission,'NOT_ADMITTED');
});

test('source HTTP denial produces stage/status only without leaking a body',async()=>{
  const m=mock({sourceStatus:403});
  await assert.rejects(()=>captureCurrentCloudflareReadOnly({token,fetchImpl:m.fetchImpl}),
    e=>e.message==='CF_SOURCE_HTTP_403');
  assert(m.calls.every(c=>c.method==='GET'));
});

test('concurrent deployment change refuses to trust and save a source capture',async()=>{
  const m=mock({drift:true});
  await assert.rejects(()=>captureCurrentCloudflareReadOnly({token,fetchImpl:m.fetchImpl}),
    /CF_DEPLOYMENTS_CHANGED_DURING_CAPTURE/);
});

test('malformed optional version metadata has sanitized error and no secret text',async()=>{
  const m=mock({versionFormatValid:false});
  const r=await captureCurrentCloudflareReadOnly({token,fetchImpl:m.fetchImpl});
  assert.equal(r.version.state,'UNVERIFIED');
  assert.equal(r.version.code,'CF_VERSION_JSON_FORMAT');
  assert.equal(r.source.sha256,sha(workerBytes));
});

test('no plain single-line Cloudflare credential refuses before any GET',async()=>{
  const m=mock();
  await assert.rejects(()=>captureCurrentCloudflareReadOnly({token:'bad\ncredential',fetchImpl:m.fetchImpl}),
    /CF_AUTH_TOKEN_NOT_PLAIN_SINGLE_LINE/);
  assert.equal(m.calls.length,0);
});

test('Wrangler auth --json OAuth and API token formats parse without shell output or logging',()=>{
  for(const type of ['oauth','api_token']){
    assert.equal(parseWranglerTokenJson(JSON.stringify({type,token})),token);
  }
});

test('Wrangler auth --json rejects malformed output and unsupported API key credentials without leaking them',()=>{
  assert.throws(()=>parseWranglerTokenJson('☁ Wrangler terminal banner'),/CF_AUTH_WRANGLER_JSON_INVALID/);
  assert.throws(()=>parseWranglerTokenJson(JSON.stringify({type:'api_key',key:'PRIVATE',email:'hidden@example.com'})),
    /CF_AUTH_API_KEY_EMAIL_NOT_SUPPORTED/);
  assert.throws(()=>parseWranglerTokenJson(JSON.stringify({type:'oauth',token:'no'})),
    /CF_AUTH_TOKEN_NOT_PLAIN_SINGLE_LINE/);
  assert.throws(()=>parseWranglerTokenJson(JSON.stringify({type:'api_token',token:'a'.repeat(30)+String.fromCharCode(10)})),
    /CF_AUTH_TOKEN_NOT_PLAIN_SINGLE_LINE/);
});

test('Wrangler CLI exchange invokes machine-readable credentials in memory and never exposes source token in options',()=>{
  const fake=(file,args,opts)=>{
    assert.equal(file,'/safe/install/wrangler');
    assert.deepEqual(args,['auth','token','--json']);
    assert.equal(opts.encoding,'utf8');
    assert.deepEqual(opts.stdio,['ignore','pipe','pipe']);
    assert.equal(opts.timeout,20000);
    assert(!JSON.stringify(opts).includes(token));
    return JSON.stringify({type:'oauth',token});
  };
  assert.equal(readWranglerToken('/safe/install/wrangler',fake),token);
});

test('Wrangler command or unsafe path failure is sanitized before any network',()=>{
  assert.throws(()=>readWranglerToken('wrangler',()=>{throw Error('must not run')}),
    /CF_AUTH_WRANGLER_BINARY_PATH_INVALID/);
  assert.throws(()=>readWranglerToken('/safe/dir'+String.fromCharCode(10)+'wrangler',()=>{throw Error('must not run')}),
    /CF_AUTH_WRANGLER_BINARY_PATH_INVALID/);
  assert.throws(()=>readWranglerToken('/safe/install/wrangler',()=>{throw Error('PRIVATE ERROR')}),
    e=>e.message==='CF_AUTH_WRANGLER_COMMAND_FAILED');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {qualify,validateCurrentCapture,publicReceipt} from
  '../scripts/hbnf-parent-release/qualify-cloudflare-restore-readonly.mjs';

const v='48ffa87e-3c83-46d0-a6ca-db7bf0b064e6';
const d='c4f4ce98-4635-4010-a5e6-55e791b77c51';
const token='TEST_CLOUDFLARE_CREDENTIAL_NOT_REAL';
const sha=b=>createHash('sha256').update(b).digest('hex');
const binary=Buffer.alloc(30002,65);
const resources={script:{etag:'some-version-etag'},assets:{config:{base_path:'/'}}};
const settingsBindings=[
 {name:'ASSETS',type:'assets',jwt:'SECRET_ASSETS_JWT'},
 {name:'SUPABASE_SERVICE_ROLE_KEY',type:'secret_text',text:'SECRET_SERVICE_ROLE_VALUE'},
 {name:'SUPABASE_URL',type:'plain_text',text:'https://example.invalid'},
 {name:'UDISC_GLOW_ACCESS_APPROVED',type:'plain_text',text:'false'},
 {name:'UDISC_GLOW_EVENT_DATE',type:'plain_text',text:'2026-11-10'},
 {name:'UDISC_GLOW_EVENT_ID',type:'plain_text',text:'abc-123'},
 {name:'UDISC_GLOW_WINDOW_START',type:'plain_text',text:''},
 {name:'UDISC_GLOW_WINDOW_END',type:'plain_text',text:''},
];
function captured(){
  const c={
    schema:'hbnf.cloudflare.current.observation.v1',worker:'hbnf',
    before:{deploymentId:d,versionId:v},after:{deploymentId:d,versionId:v},
    version:{state:'OBSERVED',data:{matchesActive:true,number:348,
      scriptEtag:resources.script.etag,resourceMetadataSha256:sha(Buffer.from(JSON.stringify(resources))) }},
    route:{state:'OBSERVED',data:{matched:true}},
    schedules:{state:'OBSERVED',data:{cronCount:1}},
    settings:{state:'OBSERVED',data:{bindings:settingsBindings.map(b=>({name:b.name,type:b.type}))}},
    source:{bytes:binary.length,sha256:sha(binary),multipartBase64:binary.toString('base64')},
    historicalSourceHashStillMatches:false,
  };
  const bytes=Buffer.from(JSON.stringify(c));
  return {bytes,hash:sha(bytes)};
}
function fixture({deployable=true,mutate=false,versionDrift=false,asset404=false,scopesMissing=false,canonicalRedirect=false,crossOriginRedirect=false,malformedVersions=false}={}){
  let deploymentReads=0;
  const calls=[];
  const result=v=>new Response(JSON.stringify({success:true,result:v}),{
    status:200,headers:{'content-type':'application/json'}});
  const fetchImpl=async(url,options)=>{
    const parsed=new URL(url),p=parsed.pathname;
    calls.push({url,method:options.method,headers:options.headers,redirect:options.redirect});
    if(parsed.hostname==='hbnightflyers.com'){
      if(asset404)return new Response(null,{status:404});
      // Current live evidence redirects eight legacy HTML routes; /hbnf-cart.html
      // is a ninth HTML asset and returned a normal 200.
      const canonicalPaths=new Set(['/admin.html','/cart.html','/glow.html',
        '/index.html','/matrix.html','/random.html','/skills.html','/skins.html']);
      if((canonicalRedirect||crossOriginRedirect)&&canonicalPaths.has(p)){
        const to=crossOriginRedirect?'https://evil.example.invalid/steal':
          p==='/index.html'?'/':p.slice(0,-5);
        return new Response(null,{status:307,headers:{location:to}});
      }
      return new Response('<html>test original safe asset</html>',{
        status:200,headers:{'content-type':'text/html'}});
    }
    if(p.endsWith('/deployments')){
      deploymentReads++;
      const active=mutate&&deploymentReads===2?'11111111-2222-3333-4444-555555555555':v;
      return result({deployments:[{id:d,versions:[{version_id:active,percentage:100}]}]});
    }
    if(p.endsWith('/deployments/'+d))
      return result({id:d,versions:[{percentage:100,version_id:v}]});
    if(p.endsWith('/versions/'+v))
      return result({id:v,number:348,resources:versionDrift?{script:{etag:'different'}}:resources});
    if(p.endsWith('/versions'))
      return result(malformedVersions?[]:{items:deployable?
        [{id:v,number:348}]:[{id:'00000000-1111-2222-3333-444444444444',number:349}]});
    if(p.endsWith('/settings'))
      return result({bindings:settingsBindings,compatibility_date:'2026-10-30',
        assets:{jwt:'DO_NOT_COPY_ASSET_JWT'},usage_model:'bundled'});
    if(p.endsWith('/schedules'))
      return result({schedules:[{cron:'*/5 * * * *'}]});
    if(p.endsWith('/workers/routes'))
      return result([{id:'route-id',pattern:'hbnightflyers.com/*',script:'hbnf'}]);
    throw Error('UNEXPECTED_HTTP_FIXTURE');
  };
  const auth=async(url,options)=>{
    if(scopesMissing&&url.includes('/settings'))return new Response('forbidden body',{status:403});
    return fetchImpl(url,options);
  };
  return {fetchImpl:auth,calls};
}
test('original authenticated private capture must match exact SHA before any external GET',async()=>{
  const {bytes,hash}=captured(),mock=fixture();
  assert.equal(validateCurrentCapture(bytes,hash).before.versionId,v);
  await assert.rejects(()=>qualify({backupBytes:bytes,token,fetchImpl:mock.fetchImpl,assets:false}),
    /CF_RESTORE_BACKUP_SHA_MISMATCH/);
  assert.equal(mock.calls.length,0);
  await assert.rejects(()=>qualify({backupBytes:Buffer.from('tampered'),token,
    fetchImpl:mock.fetchImpl,assets:false,expectedCaptureSha:hash}),
    /CF_RESTORE_BACKUP_SHA_MISMATCH/);
  assert.equal(mock.calls.length,0);
});
test('authenticated read-only version retention, routes, cron, config and served assets bind to exact historical version',async()=>{
  const {bytes,hash}=captured(),mock=fixture();
  const r=await qualify({backupBytes:bytes,token,fetchImpl:mock.fetchImpl,
    expectedCaptureSha:hash});
  assert.equal(r.currentVersionId,v);
  assert.equal(r.version.retainedInDeployableList,true);
  assert.equal(r.version.resourcesSha256,sha(Buffer.from(JSON.stringify(resources))));
  assert.equal(r.sourceMultipart.historicalRawDifferenceUnresolved,true);
  assert.equal(r.cron.length,1);
  assert.equal(r.routes.length,1);
  assert.equal(r.settings.bindings.length,8);
  assert.equal(r.servedStaticAssets.length,46);
  assert.equal(publicReceipt(r).knownAssetInventorySize,46);
  assert.equal(publicReceipt(r).sampledAssetsObserved,46);
  assert.equal(publicReceipt(r).sampledAssetsMissing.length,0);
  assert(r.servedStaticAssets.every(x=>x.state==='OBSERVED'&&x.bytes>1));
  assert.equal(r.rollbackProcedure.force,false);
  assert.equal(r.rollbackProcedure.request.strategy,'percentage');
  assert.deepEqual(r.rollbackProcedure.request.versions,[{version_id:v,percentage:100}]);
  assert.equal(r.rollbackProcedure.status,'RETAINED_VERSION_REQUEST_SOURCE_QUALIFIED_NOT_EXECUTED');
  assert.equal(r.failClosed.sameManifestAdmitted,false);
  assert.equal(r.failClosed.versionSpecificRestoreActuallyExecuted,false);
  assert.equal(publicReceipt(r).versionRetainedInDeployableList,true);
  assert.equal(JSON.stringify(publicReceipt(r)).includes('SECRET_'),false);
  assert.equal(JSON.stringify(r).includes('SECRET_SERVICE_ROLE_VALUE'),false);
  assert.equal(JSON.stringify(r).includes('SECRET_ASSETS_JWT'),false);
  assert.equal(JSON.stringify(r).includes('DO_NOT_COPY_ASSET_JWT'),false);
  assert(mock.calls.every(x=>x.method==='GET'&&x.redirect==='manual'));
  assert(mock.calls.filter(x=>x.url.startsWith('https://api.cloudflare.com')).every(x=>
    x.headers.Authorization==='Bearer '+token));
  assert(mock.calls.filter(x=>x.url.startsWith('https://hbnightflyers.com')).every(x=>
    !('Authorization' in x.headers)));
});
test('current deployment changing during readback fails without qualification',async()=>{
  const {bytes,hash}=captured(),mock=fixture({mutate:true});
  await assert.rejects(()=>qualify({backupBytes:bytes,token,
    fetchImpl:mock.fetchImpl,assets:false,expectedCaptureSha:hash}),
    /CF_RESTORE_DEPLOYMENT_CHANGED_DURING_QUALIFICATION/);
  assert(mock.calls.every(x=>x.method==='GET'));
});
test('missing retained-version deployable list never claims rollback readiness',async()=>{
  const {bytes,hash}=captured(),mock=fixture({deployable:false});
  const r=await qualify({backupBytes:bytes,token,fetchImpl:mock.fetchImpl,
    assets:false,expectedCaptureSha:hash});
  assert.equal(r.version.retainedInDeployableList,false);
  assert.equal(r.rollbackProcedure.status,'RETAINED_VERSION_UNVERIFIED_NOT_EXECUTED');
  assert.equal(r.failClosed.sameManifestAdmitted,false);
});
test('asset retrieval failure stays explicit and does not conflate v348 version retention',async()=>{
  const {bytes,hash}=captured(),mock=fixture({asset404:true});
  const r=await qualify({backupBytes:bytes,token,fetchImpl:mock.fetchImpl,
    expectedCaptureSha:hash});
  assert(r.servedStaticAssets.every(x=>x.state==='UNVERIFIED'&&x.errorCode==='CF_RESTORE_ASSET_HTTP_404'));
  assert.equal(r.version.retainedInDeployableList,true);
  assert.equal(r.failClosed.fullAssetsInventoryCaptured,false);
});
test('provider version/metadata drift fails without loosening the old multipart checksum',async()=>{
  const {bytes,hash}=captured(),mock=fixture({versionDrift:true});
  await assert.rejects(()=>qualify({backupBytes:bytes,token,fetchImpl:mock.fetchImpl,
    assets:false,expectedCaptureSha:hash}),
    /CF_RESTORE_VERSION_RESOURCES_CHANGED/);
});
test('missing settings read permission fails independently without disclosing provider response',async()=>{
  const {bytes,hash}=captured(),mock=fixture({scopesMissing:true});
  await assert.rejects(()=>qualify({backupBytes:bytes,token,fetchImpl:mock.fetchImpl,
    assets:false,expectedCaptureSha:hash}),
    e=>e.message==='CF_RESTORE_SETTINGS_HTTP_403');
});

test('Cloudflare documented deployable result shape rejects ambiguous legacy array',async()=>{
  const {bytes,hash}=captured(),mock=fixture({malformedVersions:true});
  await assert.rejects(()=>qualify({backupBytes:bytes,token,fetchImpl:mock.fetchImpl,
    assets:false,expectedCaptureSha:hash}),/CF_RESTORE_DEPLOYABLE_VERSIONS_SHAPE_INVALID/);
  assert(mock.calls.every(x=>x.method==='GET'));
});
test('canonical HTML 307 redirects stay in one expected same-origin hop',async()=>{
  const {bytes,hash}=captured(),mock=fixture({canonicalRedirect:true});
  const r=await qualify({backupBytes:bytes,token,fetchImpl:mock.fetchImpl,expectedCaptureSha:hash});
  const html=r.servedStaticAssets.filter(x=>x.path.endsWith('.html')&&
    (x.redirectTo!==null||x.state==='UNVERIFIED'));
  assert.equal(html.length,8);
  assert(html.every(x=>x.state==='OBSERVED'&&x.redirectTo!==null));
  assert.equal(html.find(x=>x.path==='/index.html').redirectTo,'/');
  assert.equal(html.find(x=>x.path==='/glow.html').redirectTo,'/glow');
  assert.equal(publicReceipt(r).sampledAssetsObserved,46);
  assert(mock.calls.every(x=>x.method==='GET'&&x.redirect==='manual'));
});
test('cross-origin HTML redirect is never followed and is reported unsafe',async()=>{
  const {bytes,hash}=captured(),mock=fixture({crossOriginRedirect:true});
  const r=await qualify({backupBytes:bytes,token,fetchImpl:mock.fetchImpl,expectedCaptureSha:hash});
  const html=r.servedStaticAssets.filter(x=>x.path.endsWith('.html')&&
    (x.redirectTo!==null||x.state==='UNVERIFIED'));
  assert.equal(html.length,8);
  assert(html.every(x=>x.state==='UNVERIFIED'&&x.errorCode==='CF_RESTORE_ASSET_REDIRECT_NOT_CANONICAL'));
  assert(mock.calls.every(x=>!x.url.includes('evil.example.invalid')));
  assert.equal(publicReceipt(r).sampledAssetsObserved,38);
  assert.equal(publicReceipt(r).sampledAssetsMissing.length,8);
});

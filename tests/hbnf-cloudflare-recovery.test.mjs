import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { captureCurrentWorkerSource, captureFromControllingDriveManifest } from '../scripts/hbnf-parent-release/cloudflare-recovery.mjs';

const VERSION='48ffa87e-3c83-46d0-a6ca-db7bf0b064e6';
const ACCOUNT='e3bc6b78f1104fa0c2a01245084594cf';
const SCRIPT=Buffer.from('mock-exact-cloudflare-script-multipart');
const sha=b=>createHash('sha256').update(b).digest('hex');
const manifest={status:'PENDING_NOT_ADMITTED',productionMutationAuthorized:false,
  targets:[{id:'cloudflare-worker',accountId:ACCOUNT,worker:'hbnf',
    lastAuthenticatedVersionId:VERSION,lastAuthenticatedScriptEtag:'e'.repeat(64),sourceMultipart:{sha256:sha(SCRIPT),bytes:SCRIPT.length}}]};
const auth={CLOUDFLARE_API_TOKEN:'fake-cloudflare',GOOGLE_DRIVE_ACCESS_TOKEN:'fake-drive'};

function fixture({wrongBytes=false,drift=false,corruptDrive=false,manifestMismatch=false}={}) {
  const requests=[], saved=new Map();
  let identityReads=0, uploaded=0;
  const fetchImpl=async(url,init={})=>{
    const path=new URL(url).pathname, method=init.method||'GET';
    requests.push({url,method,auth:init.headers?.authorization});
    const reply=(data,status=200)=>new Response(typeof data==='string'?data:JSON.stringify(data),{status});
    if(path.endsWith('/deployments')){
      identityReads++;
      const version=drift&&identityReads>=2?'00000000-0000-0000-0000-000000000000':VERSION;
      return reply({result:{deployments:[{id:'dep1',versions:[{percentage:100,version_id:version}]}]}});
    }
    if(path.endsWith('/workers/routes')) return reply({result:[{id:'route1',pattern:'hbnightflyers.com',script:'hbnf'}]});
    if(path.endsWith('/versions/'+VERSION)) return reply({result:{id:VERSION,number:348,resources:{script:{etag:'e'.repeat(64)}}}});
    if(path.endsWith('/workers/scripts/hbnf')) return new Response(wrongBytes?'wrong bytes':SCRIPT,{status:200});
    if(path==='/upload/drive/v3/files'){
      uploaded++;
      const id='fake-upload-'+uploaded;
      const data=Buffer.from(await init.body.arrayBuffer());
      // The multipart envelope contains payload; isolate bytes using a unique candidate
      const candidate=uploaded===1?SCRIPT:null;
      if(candidate) saved.set(id,candidate);
      else {
        const text=data.toString();
        const start=text.indexOf('{"schemaVersion":1,"recordType":"HBNF_CLOUDFLARE_SOURCE_CAPTURE"');
        const end=text.lastIndexOf('}\r\n--');
        assert(start>=0&&end>start,'receipt present in multipart body');
        saved.set(id,Buffer.from(text.slice(start,end+1)));
      }
      return reply({id});
    }
    if(path.includes('/drive/v3/files/fake-upload-')){
      const id=path.split('/').at(-1), b=saved.get(id);
      if(!b) return reply('missing',404);
      return new Response(corruptDrive&&id==='fake-upload-1'?'corrupted':b,{status:200});
    }
    if(path==='/drive/v3/files/manifest-source'){
      if(new URL(url).searchParams.has('fields')) return reply({id:'manifest-source',parents:['private-evidence-folder'],trashed:false});
      const source=Buffer.from('\uFEFF'+JSON.stringify(manifest));
      return new Response(manifestMismatch?'bad manifest':source,{status:200});
    }
    throw Error('UNEXPECTED_REQUEST_'+method+'_'+path);
  };
  return {requests,fetchImpl,uploaded:()=>uploaded};
}

test('authenticated exact pinned script capture stores both raw bytes and receipt with independent download-back, never admits rollback',async()=>{
  const f=fixture();
  const out=await captureCurrentWorkerSource({manifest,manifestSha256:'a'.repeat(64),folderId:'private-evidence-folder',env:auth,fetchImpl:f.fetchImpl});
  assert.equal(out.status,'SOURCE_BACKUP_DURABLE_ROLLBACK_UNQUALIFIED');
  assert.equal(out.source.sha256,sha(SCRIPT));
  assert.equal(out.source.bytes,SCRIPT.length);
  assert(out.source.downloadBackVerified&&out.receipt.downloadBackVerified);
  assert.equal(out.providerIdentity.activeVersionId,VERSION);
  assert.equal(out.versionSpecificExecutableBytesVerified,false);
  assert.equal(out.releaseAdmission,'NOT_ADMITTED');
  assert(f.requests.filter(r=>r.url.startsWith('https://api.cloudflare.com')).every(r=>r.method==='GET'));
  assert.equal(f.requests.filter(r=>r.method==='POST').length,2);
});

test('different content at same reported version fails before backup mutation',async()=>{
  const f=fixture({wrongBytes:true});
  await assert.rejects(()=>captureCurrentWorkerSource({manifest,manifestSha256:'a'.repeat(64),folderId:'private-evidence-folder',env:auth,fetchImpl:f.fetchImpl}),/WORKER_SCRIPT_BYTES_NOT_PINNED_BASELINE/);
  assert.equal(f.uploaded(),0);
});

test('active version drift aborts without writing to Drive',async()=>{
  const f=fixture({drift:true});
  await assert.rejects(()=>captureCurrentWorkerSource({manifest,manifestSha256:'a'.repeat(64),folderId:'private-evidence-folder',env:auth,fetchImpl:f.fetchImpl}),/WORKER_ACTIVE_VERSION_CHANGED/);
  assert.equal(f.uploaded(),0);
});

test('Drive corrupt download rejects independent backup receipt',async()=>{
  const f=fixture({corruptDrive:true});
  await assert.rejects(()=>captureCurrentWorkerSource({manifest,manifestSha256:'a'.repeat(64),folderId:'private-evidence-folder',env:auth,fetchImpl:f.fetchImpl}),/DRIVE_BACKUP_DOWNLOADBACK_MISMATCH/);
});

test('missing provider auth cannot trigger a network call',async()=>{
  const f=fixture();
  await assert.rejects(()=>captureCurrentWorkerSource({manifest,manifestSha256:'a'.repeat(64),folderId:'private',env:{},fetchImpl:f.fetchImpl}),/CLOUDFLARE_AND_DRIVE_AUTH_REQUIRED/);
  assert.equal(f.requests.length,0);
});

test('controlling manifest fetch is byte hash pinned; wrong revision stops before Cloudflare',async()=>{
  const f=fixture();
  await assert.rejects(()=>captureFromControllingDriveManifest({manifestFileId:'manifest-source',expectedManifestSha256:'0'.repeat(64),env:auth,fetchImpl:f.fetchImpl}),/CONTROLLING_MANIFEST_CHANGED/);
  assert(f.requests.every(r=>r.url.startsWith('https://www.googleapis.com')));
});

test('review-only manifest forbids silent elevation into release admission',async()=>{
  const f=fixture(), altered=structuredClone(manifest); altered.productionMutationAuthorized=true;
  await assert.rejects(()=>captureCurrentWorkerSource({manifest:altered,manifestSha256:'a'.repeat(64),folderId:'private',env:auth,fetchImpl:f.fetchImpl}),/CONTROLLING_MANIFEST_NOT_REVIEW_ONLY/);
  assert.equal(f.requests.length,0);
});

test('version-specific provider ETag mismatch blocks captured rollback evidence before Drive writes',async()=>{
 const f=fixture(),changed=structuredClone(manifest);
 changed.targets[0].lastAuthenticatedScriptEtag='f'.repeat(64);
 await assert.rejects(()=>captureCurrentWorkerSource({manifest:changed,manifestSha256:'a'.repeat(64),
 folderId:'private',env:auth,fetchImpl:f.fetchImpl}),/WORKER_VERSION_SCRIPT_ETAG_MISMATCH/);
 assert.equal(f.uploaded(),0);
});

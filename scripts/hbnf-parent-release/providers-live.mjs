// Executable provider command adapters for a separately ADMITTED five-target
// same-manifest transaction. This module is inert until the driver independently
// validates owner approval, authenticated five-target rollback and a durable,
// atomic one-time claim. Never import it from a browser or normal Worker route.
import {createHash} from 'node:crypto';
import {providerTargets} from './providers.mjs';
import {readZipMember} from './zip-member.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DB_STAGES=new Set(['db-revision','db-rpc-expand','db-tag-revision','db-revoke-old-writes']);
const EDGE_STAGES=new Map([['edge-tag-editor','hbnf-tag-editor'],['edge-tags-live','hbnf-tags-live']]);
const BASE_CF='https://api.cloudflare.com/client/v4/accounts/'+providerTargets.accountId+'/workers/scripts/hbnf';
const BASE_SB='https://api.supabase.com/v1/projects/'+providerTargets.projectId;
function requireHashArtifact(spec,bytes) {
 if (!spec?.driveFileId || !/^[0-9a-f]{64}$/.test(spec.sha256||'') ||
     !Number.isSafeInteger(spec.bytes) || spec.bytes<1 || !Buffer.isBuffer(bytes) ||
     bytes.length!==spec.bytes || sha(bytes)!==spec.sha256) throw Error('RELEASE_ARTIFACT_BYTES_NOT_PINNED');
 return bytes;
}
function requireReleaseStage(op) {
 if (DB_STAGES.has(op?.id) && op?.targetId==='supabase-schema') return 'db';
 if (EDGE_STAGES.has(op?.id) && op?.targetId===op?.id) return 'edge';
 if (op?.id==='worker-vnext' && op?.targetId==='cloudflare-worker') return 'worker';
 throw Error('RELEASE_STAGE_ROUTE_NOT_ALLOWLISTED');
}
function exactEdgeSource(op,spec,archiveBytes,restore) {
  const slug=EDGE_STAGES.get(op.id),runtime=spec?.runtime;
  if (!slug || runtime?.entrypoint_path!=='index.ts' ||
      runtime.verify_jwt!==false || runtime.import_map!==false ||
      !/^[a-f0-9]{64}$/.test(spec?.memberSha256||''))
    throw Error('EDGE_SOURCE_AND_RUNTIME_ATTESTATION_REQUIRED');
  let file;
  if (restore) {
    // The installed three-function backup is a BOM-prefixed JSON snapshot.
    // Selecting the original source is essential; it is not a deployable ZIP.
    let snapshot;
    try { snapshot=JSON.parse(archiveBytes.toString('utf8').replace(/^\uFEFF/,'')); }
    catch { throw Error('EDGE_RESTORE_SOURCE_JSON_INVALID'); }
    const record=(snapshot?.sources||[]).find(row=>row.slug===slug);
    if (snapshot?.projectId!==providerTargets.projectId || !record ||
        record.verifyJwt!==runtime.verify_jwt ||
        record.providerCodeSha256!==spec.providerCodeSha256 ||
        record.files?.length!==1 || record.files[0]?.name!=='index.ts')
      throw Error('EDGE_RESTORE_SOURCE_OR_CONFIGURATION_DRIFT');
    file=Buffer.from(record.files[0].content||'','utf8');
  } else {
    // The verified Edge candidate is a ZIP with two distinct per-slug sources.
    // Never send the entire ZIP as the function's index.ts source.
    let metadata;
    try { metadata=JSON.parse(readZipMember(archiveBytes,'manifest.json').toString('utf8')); }
    catch { throw Error('EDGE_CANDIDATE_MANIFEST_INVALID'); }
    if (metadata?.schemaVersion!==1 ||
        metadata.candidateDigests?.[slug]!==spec.memberSha256 ||
        !['v5','v4'].includes(metadata.sourceFunctionVersions?.[slug]))
      throw Error('EDGE_CANDIDATE_FUNCTION_IDENTITY_MISSING');
    file=readZipMember(archiveBytes,'functions/'+slug+'/index.ts');
  }
  if (file.length<1 || sha(file)!==spec.memberSha256)
    throw Error('EDGE_EXACT_SOURCE_MEMBER_SHA_MISMATCH');
  return {kind:'edge',slug,bytes:file,runtime};
}

function bodyFor(op,spec,bytes,restore,tx) {
  const kind=requireReleaseStage(op);
  if (kind==='db') {
    const sql=bytes.toString('utf8');
    if (!sql.trim() || !/^\s*(?:--[^\n]*\n|\s)*[\s\S]*$/i.test(sql) ||
        /\b(?:copy|pg_read_file|pg_ls_dir|lo_import)\s*\(/i.test(sql))
      throw Error('UNSAFE_DB_ARTIFACT');
    return {kind,sql};
  }
  if (kind==='edge') return exactEdgeSource(op,spec,bytes,restore);
  const worker=tx?.targets?.find(t=>t.id==='cloudflare-worker');
  if (!worker || !uuid.test(spec?.providerVersionId||''))
    throw Error('WORKER_VERSION_AND_FIVE_TARGET_BASELINE_REQUIRED');
  if (restore) {
    if (spec.providerVersionId!==worker.rollback?.providerVersionId ||
        spec.providerVersionId!==worker.baselineProviderVersionId ||
        spec.retainedVersionAndBindingsVerified!==true)
      throw Error('WORKER_RETAINED_ROLLBACK_VERSION_AND_BINDINGS_NOT_VERIFIED');
  } else if (spec.providerVersionId===worker.baselineProviderVersionId ||
             spec.uploadedVersionAndBindingsVerified!==true)
    throw Error('WORKER_VERSION_UPLOAD_AND_BINDINGS_NOT_VERIFIED');
  return {kind,versionId:spec.providerVersionId};
}

export function createAuthenticatedStageAdapter({tx,readAdapter,readArtifact,verifyImmediateProviderGate,
  env=process.env,fetchImpl=fetch}={}) {
 if(!tx?.transactionId || readAdapter?.readOnly!==true ||
    typeof readAdapter.readAllTargets!=='function' ||
    typeof readArtifact!=='function' || typeof verifyImmediateProviderGate!=='function' ||
    !env?.SUPABASE_ACCESS_TOKEN || !env?.CLOUDFLARE_API_TOKEN)
   throw Error('AUTHENTICATED_PROVIDER_STAGE_PREREQUISITES_MISSING');
 const request=async (url,token,init)=>{
   const res=await fetchImpl(url,{...init,headers:{authorization:'Bearer '+token,...(init.headers||{})}});
   if (!res.ok) return {acknowledged:false,status:res.status};
   let body=null;try{body=await res.json();}catch{}
   return {acknowledged:body?.success!==false,status:res.status,providerAck:body?.result?.id||body?.id||body?.version||null,response:body};
 };
 async function dispatch(op,spec,restore){
   const kind=requireReleaseStage(op);
   if ((await verifyImmediateProviderGate({tx,op,restore}))!==true)
     throw Error('IMMEDIATE_PRECHANGE_PROVIDER_IDENTITY_OR_RELEASE_GATE_FAILED');
   const raw=await readArtifact(spec.driveFileId);
   const data=bodyFor(op,spec,requireHashArtifact(spec,Buffer.from(raw)),restore,tx);
   if (kind==='db') {
     return request(BASE_SB+'/database/query',env.SUPABASE_ACCESS_TOKEN,{
       method:'POST',headers:{'content-type':'application/json'},
       body:JSON.stringify({query:data.sql,read_only:false})});
   }
   if (kind==='edge') {
     const slug=EDGE_STAGES.get(op.id);
     const body=new FormData();
     body.append('metadata',JSON.stringify({name:slug,entrypoint_path:'index.ts',
       verify_jwt:data.runtime.verify_jwt,
       ...(data.runtime.import_map_path?{import_map_path:data.runtime.import_map_path}:{})}));
     body.append('file',new Blob([data.bytes],{type:'text/plain'}),'index.ts');
     const ack=await request(BASE_SB+'/functions/deploy?slug='+encodeURIComponent(slug),
       env.SUPABASE_ACCESS_TOKEN,{method:'POST',body});
     return {acknowledged:ack.acknowledged && ack.status===201 &&
       ack.response?.slug===slug && ack.response?.status==='ACTIVE' &&
       Number.isInteger(ack.response?.version),
       status:ack.status,providerAck:ack.response?.version||null};
   }
   const ack=await request(BASE_CF+'/deployments',env.CLOUDFLARE_API_TOKEN,{
     method:'POST',headers:{'content-type':'application/json'},
     body:JSON.stringify({strategy:'percentage',
       versions:[{version_id:data.versionId,percentage:100}],
       annotations:{'workers/message':'HBNF Scoring P0 same-manifest '+tx.transactionId+
         (restore?' rollback':' deployment')}})});
   const versions=ack.response?.result?.versions;
   return {acknowledged:ack.acknowledged && ack.response?.success===true &&
     ack.status===200 && Array.isArray(versions) && versions.length===1 &&
     versions[0].version_id===data.versionId && versions[0].percentage===100 &&
     Boolean(ack.response?.result?.id),
     status:ack.status,providerAck:ack.response?.result?.id||null};
 }
 return Object.freeze({
   authenticated:true,readOnly:false,
   async readTarget(id){const targets=await readAdapter.readAllTargets(tx);if(!targets[id])throw Error('PROVIDER_TARGET_READBACK_UNAVAILABLE');return targets[id];},
   async apply(op){return dispatch(op,op.candidate,false);},
   async restore(op){return dispatch(op,op.restore,true);}
 });
}

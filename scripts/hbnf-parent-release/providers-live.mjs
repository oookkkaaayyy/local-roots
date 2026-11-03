// Executable provider command adapters for a separately ADMITTED five-target
// same-manifest transaction. This module is inert until the driver independently
// validates owner approval, authenticated five-target rollback and a durable,
// atomic one-time claim. Never import it from a browser or normal Worker route.
import {createHash} from 'node:crypto';
import {providerTargets} from './providers.mjs';

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
function bodyFor(op,spec,bytes) {
 const kind=requireReleaseStage(op);
 if (kind==='db') {
   const sql=bytes.toString('utf8');
   if (!sql.trim() || !/^\s*(?:--[^\n]*\n|\s)*[\s\S]*$/i.test(sql) ||
       /\b(?:copy|pg_read_file|pg_ls_dir|lo_import)\s*\(/i.test(sql)) throw Error('UNSAFE_DB_ARTIFACT');
   return {kind,sql};
 }
 if (kind==='edge') {
   if (spec?.runtime?.entrypoint_path !== 'index.ts' ||
       typeof spec?.runtime?.verify_jwt !== 'boolean' ||
       !['application/zip','application/octet-stream'].includes(spec?.mimeType))
     throw Error('EDGE_DEPLOY_CONFIG_NOT_SOURCE_PINNED');
   return {kind,bytes,runtime:spec.runtime};
 }
 if (!uuid.test(spec?.providerVersionId||'') ||
     spec?.providerVersionId === op?.baselineProviderVersionId ||
     spec?.uploadedVersionAndBindingsVerified !== true)
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
   return {acknowledged:body?.success!==false,status:res.status,providerAck:body?.id||body?.version||null};
 };
 async function dispatch(op,spec,restore){
   const kind=requireReleaseStage(op);
   if ((await verifyImmediateProviderGate({tx,op,restore}))!==true)
     throw Error('IMMEDIATE_PRECHANGE_PROVIDER_IDENTITY_OR_RELEASE_GATE_FAILED');
   const raw=await readArtifact(spec.driveFileId);
   const data=bodyFor(op,spec,requireHashArtifact(spec,Buffer.from(raw)));
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
     body.append('file',new Blob([data.bytes],{type:spec.mimeType}),slug+'.zip');
     return request(BASE_SB+'/functions/deploy?slug='+encodeURIComponent(slug),
       env.SUPABASE_ACCESS_TOKEN,{method:'POST',body});
   }
   return request(BASE_CF+'/deployments',env.CLOUDFLARE_API_TOKEN,{
     method:'POST',headers:{'content-type':'application/json'},
     body:JSON.stringify({versions:[{version_id:data.versionId,percentage:100}],
       message:'HBNF Scoring P0 same-manifest '+tx.transactionId+(restore?' rollback':' deployment')})});
 }
 return Object.freeze({
   authenticated:true,readOnly:false,
   async readTarget(id){const targets=await readAdapter.readAllTargets(tx);if(!targets[id])throw Error('PROVIDER_TARGET_READBACK_UNAVAILABLE');return targets[id];},
   async apply(op){return dispatch(op,op.candidate,false);},
   async restore(op){return dispatch(op,op.restore,true);}
 });
}

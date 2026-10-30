// HBNF P0 review-only multi-target *contract* and simulated journal gate.
// NEVER performs provider mutations, authenticates to a provider, or admits a live release.
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

const DIGEST=/^[a-f0-9]{64}$/i;
export const REQUIRED_STAGES=Object.freeze([
  ['db-revision','supabase-schema'],
  ['db-rpc-expand','supabase-schema'],
  ['db-tag-revision','supabase-schema'],
  ['edge-tag-editor','edge-tag-editor'],
  ['edge-tags-live','edge-tags-live'],
  ['worker-vnext','cloudflare-worker'],
  ['db-revoke-old-writes','supabase-schema'],
]);
export const REQUIRED_TARGETS=Object.freeze(['supabase-schema','edge-tag-editor','edge-tags-live','edge-watch-score','cloudflare-worker']);
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const present=v=>typeof v==='string'&&v.length>0;
const digest=v=>typeof v==='string'&&DIGEST.test(v);

export function validateCutoverSql({expandSql,contractSql,revisionSql,tagSql}){
 const errors=[];
 if(!/create\s+or\s+replace\s+function\s+public\.hbnf_save_league_state_v1\s*\(/i.test(expandSql||'')) errors.push('RPC must be installed in additive DB-expand stage');
 if(/revoke\s+(?:insert\s*,\s*update|update\s*,\s*insert|insert|update)\s+on\s+(?:table\s+)?public\.league_state/i.test(expandSql||'')) errors.push('DB-expand stage revokes legacy write privileges before new pages are active');
 if(!/revoke\s+(?:insert\s*,\s*update|update\s*,\s*insert)\s+on\s+(?:table\s+)?public\.league_state/i.test(contractSql||'')) errors.push('Separate final DB-contract stage must revoke legacy table writes');
 if(/create\s+or\s+replace\s+function\s+public\.hbnf_save_league_state_v1/i.test(contractSql||'')) errors.push('Do not introduce RPC only at final permission revocation');
 if(!/create\s+trigger\s+zzz_hbnf_enforce_league_state_revision/i.test(revisionSql||'')) errors.push('DB revision trigger must precede RPC');
 if(!/hbnf_verify_round_tag_v1/i.test(tagSql||'')) errors.push('Tag verification migration missing');
 return errors;
}

export function validatePlan(plan,{requireApproval=false}={}){
 const errors=[];
 if(plan?.schemaVersion!==1)errors.push('schemaVersion must be 1');
 if(!present(plan?.releaseId))errors.push('releaseId missing');
 if(!/^[0-9a-f]{40}$/i.test(plan?.sourceCommit||''))errors.push('exact sourceCommit required');
 if(!Array.isArray(plan?.targets))errors.push('targets array missing');
 const targets=new Map((plan?.targets||[]).map(t=>[t.id,t]));
 if(targets.size!==(plan?.targets||[]).length)errors.push('duplicate target id');
 for(const id of REQUIRED_TARGETS){
   const t=targets.get(id);
   if(!t){errors.push(`missing target ${id}`);continue;}
   if(!present(t.provider)||!present(t.target)||!present(t.baselineIdentity)||!present(t.baselineReadbackSha256)||!digest(t.baselineReadbackSha256))errors.push(`${id}: target/baseline readback identity incomplete`);
   if(!present(t.restoreRoute)||!present(t.postRestoreReadback))errors.push(`${id}: restore/readback route not specified`);
   if(!t.rollback||!present(t.rollback.driveFileId)||!digest(t.rollback.sha256)||!Number.isSafeInteger(t.rollback.bytes)||t.rollback.bytes<1||t.rollback.downloadBackVerified!==true)errors.push(`${id}: complete durable rollback artifact missing`);
 }
 const operations=plan?.operations||[];
 if(operations.length!==REQUIRED_STAGES.length)errors.push('required seven-stage ordered cutover is incomplete');
 for(let i=0;i<REQUIRED_STAGES.length;i++){
   const [id,targetId]=REQUIRED_STAGES[i],s=operations[i];
   if(s?.id!==id||s?.targetId!==targetId)errors.push(`stage ${i}: expected ${id} on ${targetId}`);
   if(!present(s?.applyRoute)||!present(s?.restoreRoute)||!present(s?.readbackRoute))errors.push(`${id}: apply/restore/readback routes required`);
   if(!digest(s?.artifact?.sha256)||!Number.isSafeInteger(s?.artifact?.bytes)||s.artifact.bytes<1||!present(s.artifact.path))errors.push(`${id}: exact candidate artifact required`);
   if(!digest(s?.restoreArtifact?.sha256)||!Number.isSafeInteger(s.restoreArtifact?.bytes)||s.restoreArtifact.bytes<1||!present(s.restoreArtifact.path))errors.push(`${id}: exact reverse artifact required`);
   if(!present(s?.expectedBefore)||!present(s?.expectedAfter))errors.push(`${id}: immediate before/after identities required`);
 }
 if(plan?.quiesce?.required!==true||!present(plan?.quiesce?.oldClientDisposition))errors.push('explicit old-client cutover/score-entry interruption policy required');
 if(plan?.edgeWatchScoreReadback?.baselineVersion!==14||plan?.edgeWatchScoreReadback?.staleWriteCompatible!==true||!digest(plan?.edgeWatchScoreReadback?.evidenceSha256))errors.push('unchanged watch-score v14 compatibility evidence missing');
 if(!present(plan?.sameManifestCloseoutRoute))errors.push('durable same-parent-manifest closeout route missing');
 if(requireApproval&&!present(plan?.authorization?.ownerApprovalReceipt))errors.push('scoped owner authorization missing');
 return errors;
}

export async function verifyLocalFiles(root,plan){
 const failures=[];
 for(const op of plan.operations||[]){for(const field of ['artifact','restoreArtifact']){
  const record=op[field], label=`${op.id}.${field}`;
  if(!record?.path){failures.push(`${label}: path missing`);continue;}
  const full=path.resolve(root,record.path), base=path.resolve(root);
  if(!full.startsWith(base+path.sep)){failures.push(`${label}: path escapes root`);continue;}
  try{const bytes=await readFile(full);if(bytes.length!==record.bytes||sha256(bytes)!==record.sha256)failures.push(`${label}: byte size/hash mismatch`)}
  catch{failures.push(`${label}: file unavailable`)}
 }}return failures;
}

export const manifestDigest=plan=>sha256(Buffer.from(json(plan)));

// Provider-agnostic simulator: NEVER has a network/provider adapter.
// The real wrapper MUST implement these invariants with authenticated provider readback,
// durable downloaded receipts and a one-time run token; simulator passing is NOT admission.
export async function simulate(plan,{faultAt=null,postApplyFaultAt=null,staleAt=null,restoreFaultAt=null}={}){
 const errors=validatePlan(plan);
 if(errors.length)return {status:'PENDING',errors,trace:[]};
 const states=new Map(plan.targets.map(t=>[t.id,t.baselineIdentity]));
 const trace=[],completed=[],fingerprint=manifestDigest(plan);
 if(plan.simulationOnly!==true)return {status:'PENDING',errors:['simulator requires simulationOnly=true'],trace};
 for(const step of plan.operations){
  if(staleAt===step.id)states.set(step.targetId,'EXTERNALLY_CHANGED');
  if(states.get(step.targetId)!==step.expectedBefore){
   trace.push(`ABORT before ${step.id}: stale baseline`);
   return rollback('stale target');
  }
  if(faultAt===step.id){trace.push(`FAILED before applying ${step.id}`);return rollback('apply rejected')}
  states.set(step.targetId,step.expectedAfter);
  completed.push(step);
  trace.push(`applied+readback ${step.id}`);
  if(postApplyFaultAt===step.id){trace.push(`FAILED after applying ${step.id}: uncertain ack`);return rollback('lost acknowledgement')}
 }
 return {status:'SIMULATED_COMPLETE_NOT_ADMITTED',fingerprint,trace,states:Object.fromEntries(states)};
 function rollback(reason){
  for(const step of completed.slice().reverse()){
   if(restoreFaultAt===step.id){trace.push(`RESTORE FAILED ${step.id}`);return {status:'MANUAL_RECOVERY_REQUIRED',reason,fingerprint,trace,states:Object.fromEntries(states)}}
   if(states.get(step.targetId)!==step.expectedAfter){trace.push(`RESTORE BLOCKED ${step.id}: target drift`);return {status:'MANUAL_RECOVERY_REQUIRED',reason,fingerprint,trace,states:Object.fromEntries(states)}}
   states.set(step.targetId,step.expectedBefore);
   trace.push(`restored+readback ${step.id}`);
  }
  const drifted=plan.targets.filter(t=>states.get(t.id)!==t.baselineIdentity).map(t=>t.id);
  if(drifted.length){trace.push(`RECOVERY INCOMPLETE: ${drifted.join(',')}`);return {status:'MANUAL_RECOVERY_REQUIRED',reason,fingerprint,trace,states:Object.fromEntries(states)}}
  return {status:'SIMULATED_ABORT_RESTORED_NOT_ADMITTED',reason,fingerprint,trace,states:Object.fromEntries(states)};
 }
}

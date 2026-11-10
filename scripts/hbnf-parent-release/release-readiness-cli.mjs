// Inert, fail-closed CLI for the EXISTING Scoring P0 parent workflow.
// Inputs are exact already-private manifest and independently validated
// release-stage/provider/adapter receipts. Never prints their contents.
import {readFile} from 'node:fs/promises';
import {checkReleaseReadiness,ORIGINAL_MANIFEST_ID,bindSourceHeadToCheckout} from './release-readiness.mjs';
import {execFileSync} from 'node:child_process';
const [manifestPath,stagePath,providerPath,adapterPath]=process.argv.slice(2);
if(!manifestPath||!stagePath||!providerPath||!adapterPath){
 console.error('RELEASE_ROUTE_BLOCKED: PRIVATE_MANIFEST_OR_COMPLETE_EXECUTABLE_ROUTE_MISSING');
 process.exitCode=2;
}else{
 try{
  const raw=await readFile(manifestPath);
  const [stage,provider,adapter]=await Promise.all(
   [stagePath,providerPath,adapterPath].map(async p=>JSON.parse(await readFile(p,'utf8'))));
  const checkoutHead=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const boundHead=JSON.parse(raw.toString('utf8')).currentScoringReviewHead;
  let ancestryVerified=checkoutHead===boundHead;
  if(!ancestryVerified){
   execFileSync('git',['merge-base','--is-ancestor',boundHead,checkoutHead],{stdio:'ignore'});
   ancestryVerified=true;
  }
  const changedPaths=checkoutHead===boundHead?[]:execFileSync('git',['diff','--name-only',`${boundHead}..${checkoutHead}`],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
  const trackedChanges=execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim();
  if(trackedChanges)throw Error('TRACKED_WORKTREE_NOT_CLEAN');
  const sourceHead=bindSourceHeadToCheckout({boundHead,checkoutHead,ancestryVerified,changedPaths});
  const result=checkReleaseReadiness({
   manifest:JSON.parse(raw),manifestBytes:raw,
   manifestFileId:ORIGINAL_MANIFEST_ID,sourceHead,stage,provider,adapter
  });
  console.log('RELEASE_ROUTE_'+result.status+':'+result.errors.join(','));
  // A static checker NEVER authorizes mutation; the signed same-manifest
  // external two-phase verifier must still independently admit/recheck.
  process.exitCode=result.status==='READY_FOR_EXTERNAL_ADMISSION_VERIFICATION'?0:2;
 }catch{
  console.error('RELEASE_ROUTE_BLOCKED: MANIFEST_OR_VERIFIED_RECEIPT_UNAVAILABLE');
  process.exitCode=2;
 }
}

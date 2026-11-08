import test from 'node:test';
import assert from 'node:assert/strict';
import {
 checkReleaseReadiness,exerciseCloudflareStageTestOnly,sha256,ORIGINAL_MANIFEST_ID,
 MANIFEST_SHA256,MANIFEST_REVISION,BOUND_SOURCE_HEAD,bindSourceHeadToCheckout
} from '../scripts/hbnf-parent-release/release-readiness.mjs';
const hex='a'.repeat(64),workerVersion='48ffa87e-3c83-46d0-a6ca-db7bf0b064e6';
const betaCandidate='1gmbZo09hxkOjkVC_5-fOqFtiWfSssVt8';
const betaCandidateSha='1b391b7db096a81cf75ed61b3ff074d034987f512c296fc8c6f4bdb7ce5f845e';
const betaRequestSha='36017fbb2191ae9c6e46b4b08f5cdf72442222a1f59beaa6194d22851c3d6f11';
const manifest={
 manifestRevision:MANIFEST_REVISION,recordId:'hbnf-p0-pr151-udisc-20261103-52e120-review-only',
 status:'PENDING_NOT_ADMITTED',productionMutationAuthorized:false,
 scopedReleaseAuthority:{cloudflareOnlySaveAck:{admittedUnderParent:true,
  parentManifestId:ORIGINAL_MANIFEST_ID,parentRevision:MANIFEST_REVISION,
  stageA:{candidateFileId:betaCandidate,candidateSha256:betaCandidateSha,
   candidateBytes:274519,requestSha256:betaRequestSha,requestBytes:269030,
   noAssetUpload:true,assetStrategy:'exact-v348-inherited-binding',
   binding:{name:'ASSETS',type:'inherit',version_id:workerVersion},
   workerFirstPaths:['/api/*','/internal/*','/glow-save-sync.mjs'],
   productionTrafficAuthorized:false}}},
 source:{currentScoringReviewHead:BOUND_SOURCE_HEAD},
 targets:[
  {id:'supabase-schema'},{id:'edge-tag-editor'},
  {id:'edge-tags-live'},{id:'edge-watch-score'},
  {id:'cloudflare-worker',lastAuthenticatedVersionId:workerVersion,
   lastAuthenticatedScriptEtag:'c3ea6bde761a6a5735a6a8b50334821b809baf57096c64cbb71b50a17ceb5b25',
   candidate:{driveId:'1ZD0it8FgFpgvmlHKUa2byIqeK81bq1_q'}}
 ]
};
const stage={
 scope:'cloudflare-only',parentManifestId:ORIGINAL_MANIFEST_ID,parentRevision:MANIFEST_REVISION,
 nonWorkerTargetsUnmodified:true,parentContractAllowsIndependentStage:true,
 targets:['cloudflare-worker'],operations:[{id:'worker-vnext'}],
 otherTargetReadbacks:['supabase-schema','edge-tag-editor','edge-tags-live','edge-watch-score']
  .map(id=>({id,sha256:hex,fresh:true})),
 executable:{
  format:'cloudflare-beta-worker-version-json',sha256:betaRequestSha,bytes:269030,
  candidateArtifactSha256:betaCandidateSha,candidateArtifactBytes:274519,
  privateDriveFileId:betaCandidate,
  downloadBackVerified:true,moduleClosureVerified:true,sourceParityVerified:true,
  glowHelperSha256:'674f8712d7313fa73cf8bd761d458b7d6e5613b1eb147a24a0a0682e88f1d54a',
  glowHelperGitBlob:'a355ad13d5026551629f085060c636b60ccb8560',
  assetStrategy:'exact-v348-inherited-binding',
  assetBinding:{name:'ASSETS',type:'inherit',version_id:workerVersion},
  exactVersionBindingSchemaVerified:true,noAssetUpload:true,
  knownAssetPathCount:46,assetInventoryDisclosure:'KNOWN_46_NONEXHAUSTIVE',
  workerFirstPaths:['/api/*','/internal/*','/glow-save-sync.mjs'],correctedHelperServedByWorker:true
 }
};
const provider={
 version:workerVersion,
 etag:'c3ea6bde761a6a5735a6a8b50334821b809baf57096c64cbb71b50a17ceb5b25',
 retainedRollbackVersion:true,routesCronBindingsMatch:true,
 freshAuthenticatedFiveTargetReadback:true
};
const adapter={
 upload:'cloudflare-version-multipart',deploy:'percentage-100',
 restore:'retained-v348-percentage-100',nonproductionApplyRestoreReadbackPassed:true,
 authenticationVerified:true,recoveryDownloadBackVerified:true,
 oneTimeClaimVerified:true,twoPhaseAdmissionVerified:true,
 immediatePrechangeReadbackVerified:true,
 oldClientAndReopenAcceptanceReady:true,sameManifestCloseoutReady:true
};
const clone=x=>structuredClone(x);
const checked=(overrides={})=>checkReleaseReadiness({
 manifest:clone(manifest),manifestFileId:ORIGINAL_MANIFEST_ID,
 sourceHead:BOUND_SOURCE_HEAD,stage:clone(stage),
 provider:clone(provider),adapter:clone(adapter),synthetic:true,
 ...overrides
});
test('revision 14 source digest is pinned and remains non-admitting',()=>{
 assert.equal(MANIFEST_SHA256,'83502d34150ed88939b6a99d0519a0563acd2452cdbbd188d93ad741b96cbea8');
 assert.equal(MANIFEST_REVISION,14);
 const result=checked();
 assert.equal(result.status,'SYNTHETIC_ROUTE_TEST_ONLY');
 assert.equal(result.canMutate,false);
});
test('historical five-target driver refuses review ZIP as one worker stage',()=>{
 const before=clone(stage);
 before.scope='five-target';before.targets=['cloudflare-worker'];
 before.executable={...before.executable,privateDriveFileId:'1ZD0it8FgFpgvmlHKUa2byIqeK81bq1_q'};
 const result=checked({stage:before});
 assert.equal(result.status,'BLOCKED');
 assert.ok(result.errors.includes('FIVE_TARGET_DRIVER_REQUIRES_SEVEN_STAGES'));
 assert.ok(result.errors.includes('BETA_JSON_CANDIDATE_NOT_BYTE_BOUND'));
});
test('cloud-only is subordinate and requires exact Beta JSON and v348 asset lineage',()=>{
 for(const mutation of [
  s=>{s.parentContractAllowsIndependentStage=false;},
  s=>{s.otherTargetReadbacks.pop();},
  s=>{s.executable.assetStrategy='keep_assets';},
  s=>{s.executable.assetBinding.version_id='049a35e1-64b5-4e76-9378-ca4ffa0a7d47';},
  s=>{s.executable.noAssetUpload=false;},
  s=>{s.executable.assetInventoryDisclosure='EXHAUSTIVE';},
  s=>{s.executable.sha256=hex;},
  s=>{s.executable.privateDriveFileId='wrong-candidate';},
  s=>{s.executable.workerFirstPaths=['/api/*','/internal/*'];},
  s=>{s.executable.moduleClosureVerified=false;},
  s=>{s.executable.glowHelperSha256=hex;}
 ]) {
  const candidate=clone(stage);mutation(candidate);
  assert.equal(checked({stage:candidate}).status,'BLOCKED');
 }
});
test('a declared stage cannot override absence of Cloudflare-only authority in the amended parent',()=>{
 const oldManifest=clone(manifest);delete oldManifest.scopedReleaseAuthority;
 const result=checked({manifest:oldManifest});
 assert.equal(result.status,'BLOCKED');
 assert.ok(result.errors.includes('CLOUDFLARE_ONLY_SCOPE_NOT_SUBORDINATE'));
 const wrongLineage=clone(manifest);wrongLineage.scopedReleaseAuthority.cloudflareOnlySaveAck.stageA.binding.version_id='049a35e1-64b5-4e76-9378-ca4ffa0a7d47';
 const mismatch=checked({manifest:wrongLineage});
 assert.equal(mismatch.status,'BLOCKED');
 assert.ok(mismatch.errors.includes('CLOUDFLARE_ONLY_SCOPE_NOT_SUBORDINATE'));
});
test('stale source HEAD, missing private manifest, missing rollback and missing closeout all fail',()=>{
 assert.equal(checked({sourceHead:'b'.repeat(40)}).status,'BLOCKED');
 const live=checked({synthetic:false});
 assert.ok(live.errors.includes('PRIVATE_MANIFEST_BYTES_NOT_VERIFIED'));
 const noRollback=clone(provider);noRollback.retainedRollbackVersion=false;
 assert.equal(checked({provider:noRollback}).status,'BLOCKED');
 const noCloseout=clone(adapter);noCloseout.sameManifestCloseoutReady=false;
 assert.equal(checked({adapter:noCloseout}).status,'BLOCKED');
});

test('only exact source head or release-control-only descendant can satisfy the bound source',()=>{
 assert.equal(bindSourceHeadToCheckout({boundHead:BOUND_SOURCE_HEAD,checkoutHead:BOUND_SOURCE_HEAD}),BOUND_SOURCE_HEAD);
 assert.equal(bindSourceHeadToCheckout({boundHead:BOUND_SOURCE_HEAD,checkoutHead:'ad139e2f3ccaff938a17f0b59a6e667bc3851d32',ancestryVerified:true,
  changedPaths:['scripts/hbnf-parent-release/release-readiness.mjs','scripts/hbnf-parent-release/release-readiness-cli.mjs','tests/hbnf-release-readiness.test.mjs']}),BOUND_SOURCE_HEAD);
 assert.throws(()=>bindSourceHeadToCheckout({boundHead:BOUND_SOURCE_HEAD,checkoutHead:'a'.repeat(40),ancestryVerified:true,
  changedPaths:['public/glow.html']}),/NON_GOVERNANCE_SOURCE_CHANGED_AFTER_BOUND_HEAD/);
 assert.throws(()=>bindSourceHeadToCheckout({boundHead:BOUND_SOURCE_HEAD,checkoutHead:'a'.repeat(40),ancestryVerified:false,changedPaths:[]}),/NON_GOVERNANCE_SOURCE_CHANGED_AFTER_BOUND_HEAD/);
});

test('isolated executable-stage upload, deploy, fresh readback and exact v348 rollback',async()=>{
 const bytes=Buffer.from('synthetic executable Worker module: no network');
 const executable=clone(stage);executable.executable.sha256=sha256(bytes);
 const actions=[];
 let active=workerVersion,activeHash=null;
 const mock={
  testOnly:true,noNetwork:true,
  async read(){actions.push('read');return {version:active,scriptSha256:activeHash};},
  async upload(data){actions.push('upload');assert.equal(sha256(data),sha256(bytes));
   return {version:'11111111-1111-4111-8111-111111111111'};},
  async deploy(version){actions.push('deploy');active=version;activeHash=sha256(bytes);},
  async restore(version){actions.push('restore');assert.equal(version,workerVersion);active=version;activeHash=null;}
 };
 const result=await exerciseCloudflareStageTestOnly(executable,mock,bytes);
 assert.equal(result.status,'TEST_ONLY_APPLY_VERIFIED');
 assert.equal(result.productionMutation,false);
 assert.equal(active,workerVersion);
 assert.deepEqual(actions,['read','upload','deploy','read','restore','read']);
});
test('ambiguous isolated deployment still restores original baseline',async()=>{
 const bytes=Buffer.from('another synthetic module');
 const executable=clone(stage);executable.executable.sha256=sha256(bytes);
 let active=workerVersion,restores=0;
 const mock={
  testOnly:true,noNetwork:true,
  async read(){return {version:active};},
  async upload(){return {version:'11111111-1111-4111-8111-111111111111'};},
  async deploy(version){active=version;throw Error('ambiguous response');},
  async restore(version){active=version;restores++;}
 };
 const result=await exerciseCloudflareStageTestOnly(executable,mock,bytes);
 assert.equal(result.status,'TEST_ONLY_APPLY_FAILED');
 assert.equal(restores,1);
 assert.equal(active,workerVersion);
});

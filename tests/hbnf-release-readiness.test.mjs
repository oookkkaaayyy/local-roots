import test from 'node:test';
import assert from 'node:assert/strict';
import {
 checkReleaseReadiness,exerciseCloudflareStageTestOnly,sha256,ORIGINAL_MANIFEST_ID,
 MANIFEST_SHA256,MANIFEST_REVISION,BOUND_SOURCE_HEAD,bindSourceHeadToCheckout
} from '../scripts/hbnf-parent-release/release-readiness.mjs';
const hex='a'.repeat(64),workerVersion='48ffa87e-3c83-46d0-a6ca-db7bf0b064e6';
const betaCandidate='1KeHOM7HKhRAcMznpQCoSFKN5RD599w1R';
const betaCandidateSha='4f5f8c0bd7f7e3fb1541a7bf3e229cf726e86331f4c28a71ddb860d16b8f7019';
const betaRequestSha='1d693d88a1b79ffa94cecaa4d896baa104fb0c9e676ddacdd0d4e61917247884';
const manifest={
 manifestRevision:MANIFEST_REVISION,recordId:'hbnf-p0-pr151-udisc-20261103-52e120-review-only',
 status:'PENDING_NOT_ADMITTED',productionMutationAuthorized:false,
 cloudflareAssetRetentionAmendment:{costAndQuotaEvidence:{
  accountSpecificPlanReadback:{accountId:'e3bc6b78f1104fa0c2a01245084594cf',plan:'FREE',observedAt:'2026-11-08T04:34:00Z'},
  billingAssessment:'NO_INCREMENTAL_CHARGE_EXPECTED_FOR_THIS_EXACT_STAGE_A_OPERATION; inference based on Free plan readback, documented usage billing, no Worker invocation, no asset upload, and deploy=false.',
  retentionAssessment:{status:'PASS_ONE_ADDITIONAL_UNDEPLOYED_VERSION_RETAINS_V348_WITHIN_DOCUMENTED_ROLLBACK_WINDOW',activeBefore:workerVersion,latestBefore:'049a35e1-64b5-4e76-9378-ca4ffa0a7d47',rollbackLimitMostRecentlyPublishedVersions:100,worstCasePositionAfterSingleVersionCreate:3},
  stageAStatus:'DOCUMENTED_NO_RUNTIME_REQUEST_CHARGE_EXPECTED; Free plan observation recorded; version quota field not exposed; v348 rollback window verified; immediate prechange readback and one-use claim remain required.'
 },
  liveGlowHtmlIntegrationReadback:{httpStatus:200,url:'https://hbnightflyers.com/glow.html',bytes:208937,sha256:'dd1a6451d0a1cc020dfd26f24fa0b491fd258baa4918f070f9c82557d71681c9',imports:'./glow-save-sync.mjs',instantiates:'createGlowSaveCoordinator({storage:localStorage,onStatus:setGlowSaveStatus})',casRpc:'hbnf_save_league_state_v1'},
  v348ExecutableLineage:{versionId:workerVersion,mainModule:'index.js',providerReadbackEndpoint:'GET /accounts/{account_id}/workers/workers/{worker_id}/versions/{version_id}?include=modules,sourcemaps',baselineModuleSha256:'b6474c02325c73fe269170a4060e7fd4636bd0f38cb7b631e3c7ab2ac31ad77e',baselineModuleBytes:72690,candidateModuleSha256:'e9f0611d5ba7ca72db4a0792be1178fab80a1b399734e403664105ce17a0ef69',candidateModuleBytes:79392,sourceMapSha256:'1af1fb53e2821d8f0dd6a586fd3e3a7c483be465eb3393d0e07b349165a484aa',deltaDisposition:'EXACT_BASELINE_BYTES_AFTER_STRIPPING_ONLY_GLOW_SAVE_HELPER_AND_GET_HEAD_ROUTE',independentByteComparison:true},
  stageAExecutionAttempts:[
   {status:'POST_SENT_AMBIGUOUS_NO_VERSION_FOUND',providerVersionCreatePostSent:true,candidateSha256:'1b391b7db096a81cf75ed61b3ff074d034987f512c296fc8c6f4bdb7ce5f845e',requestSha256:'36017fbb2191ae9c6e46b4b08f5cdf72442222a1f59beaa6194d22851c3d6f11',providerOutcome:{independentReadback:{versionListHttp:200,totalCount:349,latestVersionId:'049a35e1-64b5-4e76-9378-ca4ffa0a7d47',candidateTagMatches:0,activeVersionId:workerVersion,activePercentage:100}}},
   {status:'PREFLIGHT_READY_FOR_STAGE_A',providerVersionCreatePostSent:false,oneTimeClaimCreated:false,sourceHead:BOUND_SOURCE_HEAD,candidateFileId:betaCandidate,candidateBytes:374547,candidateSha256:betaCandidateSha,requestSha256:betaRequestSha,latestVersionId:'049a35e1-64b5-4e76-9378-ca4ffa0a7d47',versionCount:349}
  ]},
 scopedReleaseAuthority:{ownerScopeDecision:{
  source:'Explicit standing Stage A authorization in existing Scoring P0 execution thread',
  decision:'Continue exact-scope undeployed hbnf version creation and readback for corrected candidates after per-candidate identity, compatibility, cost, recovery and preservation gates; no traffic promotion.',
  productionMutationAuthorized:false
 },cloudflareOnlySaveAck:{admittedUnderParent:true,
  parentManifestId:ORIGINAL_MANIFEST_ID,parentRevision:14,
  ownerDecisionDoesNotSatisfyPreflightOrProductionAdmission:true,
  stageA:{candidateFileId:betaCandidate,candidateSha256:betaCandidateSha,
   candidateBytes:374547,requestSha256:betaRequestSha,requestBytes:269018,
   sourceHead:BOUND_SOURCE_HEAD,
   requestEnvelope:'VersionCreateRequest (top-level JSON object)',
   sourceIdentityReadbackRequired:true,
   sourceReadbackEndpoint:'GET /accounts/{account_id}/workers/workers/{worker_id}/versions/{version_id}?include=modules,sourcemaps',
   noAssetUpload:true,assetStrategy:'exact-v348-inherited-binding',
   binding:{name:'ASSETS',type:'inherit',version_id:workerVersion},
   workerFirstPaths:['/api/*','/internal/*','/glow-save-sync.mjs'],
   productionTrafficAuthorized:false}}},
 currentScoringReviewHead:BOUND_SOURCE_HEAD,
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
  format:'cloudflare-beta-worker-version-json',sha256:betaRequestSha,bytes:269018,
  requestEnvelope:'VersionCreateRequest (top-level JSON object)',
  sourceReadbackEndpoint:'GET /accounts/{account_id}/workers/workers/{worker_id}/versions/{version_id}?include=modules,sourcemaps',
  candidateArtifactSha256:betaCandidateSha,candidateArtifactBytes:374547,
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
 upload:'cloudflare-beta-version-json',stageADeploy:'deploy=false',deploy:'percentage-100',
 restore:'retained-v348-percentage-100',nonproductionApplyRestoreReadbackPassed:true,
 authenticationVerified:true,recoveryDownloadBackVerified:true,
 oneTimeClaimVerified:true,twoPhaseAdmissionVerified:true,moduleReadbackQualified:true,
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
test('revision 27 source digest is pinned and remains non-admitting',()=>{
 assert.equal(MANIFEST_SHA256,'eb2c9949553190285d5f90b8ad0c2fa26073b184a1a1711a9d82688a92a3e843');
 assert.equal(MANIFEST_REVISION,27);
 const result=checked();
 assert.equal(result.status,'SYNTHETIC_ROUTE_TEST_ONLY');
 assert.equal(result.canMutate,false);
});
test('Stage A requires account plan and rollback-window evidence while retaining production denial',()=>{
 const x=clone(manifest);
 delete x.cloudflareAssetRetentionAmendment.costAndQuotaEvidence.accountSpecificPlanReadback;
 assert.ok(checked({manifest:x}).errors.includes('STAGE_A_COST_RETENTION_EVIDENCE_UNQUALIFIED'));
 assert.equal(manifest.status,'PENDING_NOT_ADMITTED');
 assert.equal(manifest.productionMutationAuthorized,false);
});
test('Stage A requires the live Glow import and CAS dispatch evidence',()=>{
 const x=clone(manifest);
 x.cloudflareAssetRetentionAmendment.liveGlowHtmlIntegrationReadback.imports='./old-save-helper.mjs';
 const result=checked({manifest:x});
 assert.ok(result.errors.includes('SERVED_GLOW_IMPORT_AND_CAS_NOT_VERIFIED'));
 assert.equal(manifest.status,'PENDING_NOT_ADMITTED');
 assert.equal(manifest.productionMutationAuthorized,false);
});
test('Stage A rejects candidate modules without exact v348 byte lineage',()=>{
 const x=clone(manifest);
 x.cloudflareAssetRetentionAmendment.v348ExecutableLineage.baselineModuleSha256='f'.repeat(64);
 const result=checked({manifest:x});
 assert.ok(result.errors.includes('V348_EXECUTABLE_MODULE_LINEAGE_UNVERIFIED'));
 assert.equal(manifest.status,'PENDING_NOT_ADMITTED');
 assert.equal(manifest.productionMutationAuthorized,false);
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
  s=>{s.executable.sourceReadbackEndpoint='wrong-endpoint';},
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
test('owner scope decision must be present and cannot authorize production traffic',()=>{
 const missing=clone(manifest);delete missing.scopedReleaseAuthority.ownerScopeDecision;
 const noDecision=checked({manifest:missing});
 assert.ok(noDecision.errors.includes('CLOUDFLARE_STAGE_A_OWNER_SCOPE_NOT_AUTHORIZED'));
 const traffic=clone(manifest);traffic.scopedReleaseAuthority.ownerScopeDecision.productionMutationAuthorized=true;
 const attemptedTraffic=checked({manifest:traffic});
 assert.ok(attemptedTraffic.errors.includes('CLOUDFLARE_STAGE_A_OWNER_SCOPE_NOT_AUTHORIZED'));
});
test('stale source HEAD, missing private manifest, missing rollback and missing closeout all fail',()=>{
 assert.equal(checked({sourceHead:'b'.repeat(40)}).status,'BLOCKED');
 const live=checked({synthetic:false});
 assert.ok(live.errors.includes('PRIVATE_MANIFEST_BYTES_NOT_VERIFIED'));
 const noRollback=clone(provider);noRollback.retainedRollbackVersion=false;
 assert.equal(checked({provider:noRollback}).status,'BLOCKED');
 const oldUploadPath=clone(adapter);oldUploadPath.upload='cloudflare-version-multipart';
 assert.equal(checked({adapter:oldUploadPath}).status,'BLOCKED');
 const noCloseout=clone(adapter);noCloseout.sameManifestCloseoutReady=false;
 assert.equal(checked({adapter:noCloseout}).status,'BLOCKED');
});

test('only exact source head or release-control-only descendant can satisfy the bound source',()=>{
 assert.equal(bindSourceHeadToCheckout({boundHead:BOUND_SOURCE_HEAD,checkoutHead:BOUND_SOURCE_HEAD}),BOUND_SOURCE_HEAD);
 assert.equal(bindSourceHeadToCheckout({boundHead:BOUND_SOURCE_HEAD,checkoutHead:'ad139e2f3ccaff938a17f0b59a6e667bc3851d32',ancestryVerified:true,
  changedPaths:['scripts/hbnf-parent-release/release-readiness.mjs','scripts/hbnf-parent-release/release-readiness-cli.mjs','tests/hbnf-release-readiness.test.mjs']}),BOUND_SOURCE_HEAD);
 assert.equal(bindSourceHeadToCheckout({boundHead:BOUND_SOURCE_HEAD,checkoutHead:'b'.repeat(40),ancestryVerified:true,
  changedPaths:['scripts/hbnf-parent-release/cloudflare-executable-version.mjs','tests/hbnf-cloudflare-executable-version.test.mjs']}),BOUND_SOURCE_HEAD);
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

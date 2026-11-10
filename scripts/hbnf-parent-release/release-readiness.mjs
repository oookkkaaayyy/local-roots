// Scoring release preflight. Read-only; never performs provider actions.
import {createHash} from 'node:crypto';
export const ORIGINAL_MANIFEST_ID='12X06fFmdc5oPGlcq9kprf1hhglbVV7mW';
export const MANIFEST_SHA256='eb2c9949553190285d5f90b8ad0c2fa26073b184a1a1711a9d82688a92a3e843';
export const MANIFEST_REVISION=27;
export const BOUND_SOURCE_HEAD='743db719eeb5c7a1cc175cc6431ed7f5a1c5ce74';
// Exact current rev10 snapshot for the v355 routing-only Stage A result.
// This does not grant Stage B admission; it lets the same fail-closed checker
// evaluate current evidence instead of silently applying its obsolete rev27/v349 pins.
export const CURRENT_MANIFEST_REVISION=67;
export const CURRENT_MANIFEST_SHA256='f71386a765e4194a93817cc41b5c80616affbf960b573f7d977ac145a940e97c';
export const CURRENT_BOUND_SOURCE_HEAD='88c136e05bc8d28cb04c4fa431885a958df87812';
export const CURRENT_CANDIDATE_VERSION='1553524d-c71f-4ad0-9bbf-4c8713df8173';
export const CURRENT_ROLLBACK_VERSION='48ffa87e-3c83-46d0-a6ca-db7bf0b064e6';
export const sha256 = x=>createHash('sha256').update(x).digest('hex');

const RELEASE_CONTROL_TAIL_PATHS=new Set([
 'scripts/hbnf-parent-release/release-readiness.mjs',
 'scripts/hbnf-parent-release/release-readiness-cli.mjs',
 'scripts/hbnf-parent-release/cloudflare-executable-version.mjs',
 'tests/hbnf-release-readiness.test.mjs',
 'tests/hbnf-cloudflare-executable-version.test.mjs',
 'tests/hbnf-cloudflare-latest-worker-first-patch.test.mjs'
]);

/** A governance-only commit may follow the bound product-source head. Any
 * other path means the candidate source binding must be amended again. */
export function bindSourceHeadToCheckout({boundHead,checkoutHead,ancestryVerified,changedPaths=[]}={}){
 if(![BOUND_SOURCE_HEAD,CURRENT_BOUND_SOURCE_HEAD].includes(boundHead)||!/^[a-f0-9]{40}$/.test(checkoutHead||''))
   throw Error('SOURCE_HEAD_IDENTITY_INVALID');
 if(checkoutHead===boundHead)return boundHead;
 if(ancestryVerified!==true||!Array.isArray(changedPaths)||
    changedPaths.some(path=>!RELEASE_CONTROL_TAIL_PATHS.has(path)))
   throw Error('NON_GOVERNANCE_SOURCE_CHANGED_AFTER_BOUND_HEAD');
 return boundHead;
}

const PARENT_TARGETS=['supabase-schema','edge-tag-editor','edge-tags-live','edge-watch-score','cloudflare-worker'];
const V348='48ffa87e-3c83-46d0-a6ca-db7bf0b064e6';
const ETAG='c3ea6bde761a6a5735a6a8b50334821b809baf57096c64cbb71b50a17ceb5b25';
const REVIEW_ZIP='1ZD0it8FgFpgvmlHKUa2byIqeK81bq1_q';
const BETA_CANDIDATE='1KeHOM7HKhRAcMznpQCoSFKN5RD599w1R';
const BETA_CANDIDATE_SHA256='4f5f8c0bd7f7e3fb1541a7bf3e229cf726e86331f4c28a71ddb860d16b8f7019';
const BETA_CANDIDATE_BYTES=374547;
const BETA_REQUEST_SHA256='1d693d88a1b79ffa94cecaa4d896baa104fb0c9e676ddacdd0d4e61917247884';
const BETA_REQUEST_BYTES=269018;
const HEX=/^[a-f0-9]{64}$/;
const validHex=x=>typeof x==='string'&&HEX.test(x);
const trueValue=x=>x===true;

/** Side-effect-free route validator. Synthetic evidence is ALWAYS nonadmitting.
 * Raw controlling manifest bytes and independently checked provider preimages
 * must be supplied by live admission, never inferred from a CI fixture. */
export function checkReleaseReadiness({
  manifest,manifestBytes,manifestFileId,sourceHead,stage,
  provider,adapter,synthetic=false
}={}){
 const errors=[],fail=x=>{if(!errors.includes(x))errors.push(x);};
 if(manifest?.manifestRevision===CURRENT_MANIFEST_REVISION){
   const expectedStageA=manifest?.latestStageAProviderOutcome;
   if(manifestFileId!==ORIGINAL_MANIFEST_ID)fail('ORIGINAL_MANIFEST_ID_MISSING');
   if(!synthetic&&(!manifestBytes||sha256(manifestBytes)!==CURRENT_MANIFEST_SHA256))
     fail('CURRENT_PRIVATE_MANIFEST_BYTES_NOT_VERIFIED');
   if(!synthetic&&manifestBytes){
     try{if(JSON.stringify(JSON.parse(Buffer.from(manifestBytes).toString('utf8')))!==JSON.stringify(manifest))
       fail('MANIFEST_CONTENT_DIFFERS_FROM_DOWNLOADED_BYTES');}
     catch{fail('INVALID_MANIFEST_BYTES');}
   }
   if(manifest?.recordId!=='hbnf-p0-pr151-udisc-20261103-52e120-review-only'||
      manifest?.status!=='PENDING_NOT_ADMITTED'||manifest?.productionMutationAuthorized!==false)
     fail('SCORING_RELEASE_AUTHORITY_DRIFT');
   if(manifest?.currentScoringReviewHead!==CURRENT_BOUND_SOURCE_HEAD||sourceHead!==CURRENT_BOUND_SOURCE_HEAD)
     fail('CURRENT_SOURCE_HEAD_BINDING_MISMATCH');
   if(expectedStageA?.status!=='STAGE_A_VERSION_CREATED_AND_PROVIDER_READBACK_VERIFIED'||
      expectedStageA?.createdVersionId!==CURRENT_CANDIDATE_VERSION||expectedStageA?.createdVersionNumber!==354||
      expectedStageA?.activeVersionId!==CURRENT_ROLLBACK_VERSION||expectedStageA?.activePercentage!==100||
      expectedStageA?.runWorkerFirst!==true||expectedStageA?.productionTrafficMutation!==false)
     fail('V354_STAGE_A_PROVIDER_RECEIPT_MISMATCH');
   const stagePatch=manifest?.stageAPatchLatestCandidate;
   if(stagePatch?.providerOutcome?.versionId!==CURRENT_CANDIDATE_VERSION||
      stagePatch?.candidateSha256!=='e3635c0cb70284521434ee736f289807f0660d844db8aabc6ec2e04ec4b79b6e'||
      stagePatch?.productionMutationAuthorized!==false)
     fail('V354_STAGE_A_CANDIDATE_BINDING_MISMATCH');
   if(provider?.activeVersionId!==CURRENT_ROLLBACK_VERSION||provider?.activePercentage!==100||
      provider?.candidateVersionId!==CURRENT_CANDIDATE_VERSION||provider?.candidateRunWorkerFirst!==true||
      provider?.routesMatch!==true||provider?.cronMatch!==true||provider?.bindingsMatch!==true||
      provider?.rollbackRetained!==true)
     fail('V354_PROVIDER_OR_V348_ROLLBACK_READBACK_UNQUALIFIED');
   // Version metadata returns asset routing configuration, not a path/hash/size
   // inventory. Keep this a hard gate until provider evidence exposes exact bytes.
   if(expectedStageA?.candidateAssetFilesVerified!==true||
      provider?.candidateAssetInventory?.complete!==true||
      provider?.candidateAssetInventory?.independentlyVerified!==true||
      provider?.candidateAssetInventory?.assetCount<1)
     fail('V354_ASSET_BYTES_AND_CART_PRESERVATION_UNVERIFIED');
   const four=['supabase-schema','edge-tag-editor','edge-tags-live','edge-watch-score'];
   if(!Array.isArray(stage?.otherTargetReadbacks)||stage.otherTargetReadbacks.length!==4||
      four.some(id=>!stage.otherTargetReadbacks.some(x=>x.id===id&&x.fresh===true&&validHex(x.sha256))))
     fail('FOUR_UNCHANGED_TARGETS_NOT_FENCED');
   if(stage?.recovery?.rollbackVersionId!==CURRENT_ROLLBACK_VERSION||
      stage?.recovery?.independentDownloadBackVerified!==true||stage?.recovery?.restoreMechanismQualified!==true)
     fail('V348_ROLLBACK_OR_DURABLE_RECOVERY_UNQUALIFIED');
   if(adapter?.oneTimeClaimVerified!==true||adapter?.twoPhaseAdmissionVerified!==true||
      adapter?.immediatePrechangeReadbackVerified!==true||adapter?.oldClientAndReopenAcceptanceReady!==true||
      adapter?.sameManifestCloseoutReady!==true)
     fail('V354_STAGE_B_EXECUTION_AND_ACCEPTANCE_GATES_INCOMPLETE');
   const stageB=manifest?.productionStageB;
   const ownerAdmissionMissing=stageB?.status!=='ADMITTED'||stageB?.productionTrafficAuthorized!==true;
   return {status:errors.length?'BLOCKED':ownerAdmissionMissing?'READY_FOR_EXACT_OWNER_STAGE_B_ADMISSION':'READY_FOR_EXTERNAL_ADMISSION_VERIFICATION',
     canMutate:false,errors,ownerAdmissionRequired:ownerAdmissionMissing};
 }
 if(manifest?.manifestRevision!==MANIFEST_REVISION||
    manifest?.recordId!=='hbnf-p0-pr151-udisc-20261103-52e120-review-only'||
    manifest?.status!=='PENDING_NOT_ADMITTED'||manifest?.productionMutationAuthorized!==false)
   fail('SCORING_RELEASE_AUTHORITY_DRIFT');
 if(manifestFileId!==ORIGINAL_MANIFEST_ID)fail('ORIGINAL_MANIFEST_ID_MISSING');
 if(!synthetic && (!manifestBytes||sha256(manifestBytes)!==MANIFEST_SHA256))
   fail('PRIVATE_MANIFEST_BYTES_NOT_VERIFIED');
 if(!synthetic && manifestBytes){
   try{
     if(JSON.stringify(JSON.parse(Buffer.from(manifestBytes).toString('utf8')))!==JSON.stringify(manifest))
       fail('MANIFEST_CONTENT_DIFFERS_FROM_DOWNLOADED_BYTES');
   }catch{fail('INVALID_MANIFEST_BYTES');}
 }
 if(manifest?.currentScoringReviewHead!==BOUND_SOURCE_HEAD||
    sourceHead!==BOUND_SOURCE_HEAD)fail('SOURCE_HEAD_BINDING_MISMATCH');
 const targets=manifest?.targets||[];
 if(!Array.isArray(targets)||targets.length!==5||
    PARENT_TARGETS.some(x=>!targets.some(y=>y.id===x)))
   fail('PARENT_FIVE_TARGET_BASELINE_INCOMPLETE');
 const worker=targets.find(x=>x.id==='cloudflare-worker')||{};
 if(worker.lastAuthenticatedVersionId!==V348||worker.lastAuthenticatedScriptEtag!==ETAG||
    worker.candidate?.driveId!==REVIEW_ZIP)
   fail('EXACT_V348_PREIMAGE_OR_ONEFILE_ID_CHANGED');
 if(stage?.scope==='five-target'){
   if(stage.targets?.length!==5||stage.operations?.length!==7)
     fail('FIVE_TARGET_DRIVER_REQUIRES_SEVEN_STAGES');
 }else if(stage?.scope==='cloudflare-only'){
   const child=manifest?.scopedReleaseAuthority?.cloudflareOnlySaveAck;
   const ownerScope=manifest?.scopedReleaseAuthority?.ownerScopeDecision;
    const cost=manifest?.cloudflareAssetRetentionAmendment?.costAndQuotaEvidence;
    const plan=cost?.accountSpecificPlanReadback;
    const retention=cost?.retentionAssessment;
    if(plan?.accountId!=='e3bc6b78f1104fa0c2a01245084594cf'||
       plan?.plan!=='FREE'||!/^20\d\d-\d\d-\d\dT/.test(plan?.observedAt||'')||
       cost?.billingAssessment!=='NO_INCREMENTAL_CHARGE_EXPECTED_FOR_THIS_EXACT_STAGE_A_OPERATION; inference based on Free plan readback, documented usage billing, no Worker invocation, no asset upload, and deploy=false.'||
       retention?.status!=='PASS_ONE_ADDITIONAL_UNDEPLOYED_VERSION_RETAINS_V348_WITHIN_DOCUMENTED_ROLLBACK_WINDOW'||
       retention?.activeBefore!==V348||
       retention?.latestBefore!=='049a35e1-64b5-4e76-9378-ca4ffa0a7d47'||
       retention?.rollbackLimitMostRecentlyPublishedVersions!==100||
       retention?.worstCasePositionAfterSingleVersionCreate>100||
       cost?.stageAStatus!=='DOCUMENTED_NO_RUNTIME_REQUEST_CHARGE_EXPECTED; Free plan observation recorded; version quota field not exposed; v348 rollback window verified; immediate prechange readback and one-use claim remain required.')
      fail('STAGE_A_COST_RETENTION_EVIDENCE_UNQUALIFIED');
    const attempts=manifest?.cloudflareAssetRetentionAmendment?.stageAExecutionAttempts;
    const prepared=Array.isArray(attempts)?attempts.at(-1):null;
    const priorAmbiguous=Array.isArray(attempts)?[...attempts].reverse().find(x=>
      x?.status==='POST_SENT_AMBIGUOUS_NO_VERSION_FOUND'):null;
    const priorReadback=priorAmbiguous?.providerOutcome?.independentReadback;
    if(!prepared||prepared.status!=='PREFLIGHT_READY_FOR_STAGE_A'||
       prepared.providerVersionCreatePostSent!==false||prepared.oneTimeClaimCreated!==false||
       prepared.sourceHead!==BOUND_SOURCE_HEAD||prepared.candidateFileId!==BETA_CANDIDATE||
       prepared.candidateBytes!==BETA_CANDIDATE_BYTES||prepared.candidateSha256!==BETA_CANDIDATE_SHA256||
       prepared.requestSha256!==BETA_REQUEST_SHA256||prepared.latestVersionId!=='049a35e1-64b5-4e76-9378-ca4ffa0a7d47'||
       prepared.versionCount!==349||!priorAmbiguous||priorAmbiguous.providerVersionCreatePostSent!==true||
       priorReadback?.versionListHttp!==200||priorReadback?.candidateTagMatches!==0||
       priorReadback?.activeVersionId!==V348||priorReadback?.activePercentage!==100||
       priorReadback?.latestVersionId!=='049a35e1-64b5-4e76-9378-ca4ffa0a7d47'||
       priorReadback?.totalCount!==349||BETA_CANDIDATE_SHA256===priorAmbiguous.candidateSha256||
       BETA_REQUEST_SHA256===priorAmbiguous.requestSha256)
      fail('STAGE_A_PRIOR_ATTEMPT_NOT_RECONCILED');
   if(ownerScope?.source!=='Explicit standing Stage A authorization in existing Scoring P0 execution thread'||
      ownerScope?.decision!=='Continue exact-scope undeployed hbnf version creation and readback for corrected candidates after per-candidate identity, compatibility, cost, recovery and preservation gates; no traffic promotion.'||
      ownerScope?.productionMutationAuthorized!==false)
     fail('CLOUDFLARE_STAGE_A_OWNER_SCOPE_NOT_AUTHORIZED');
   if(manifest?.scopedReleaseAuthority?.cloudflareOnlySaveAck?.admittedUnderParent!==true||
      child?.parentManifestId!==ORIGINAL_MANIFEST_ID||child?.parentRevision!==14||
      child?.stageA?.candidateFileId!==BETA_CANDIDATE||
      child?.stageA?.candidateSha256!==BETA_CANDIDATE_SHA256||
      child?.stageA?.candidateBytes!==BETA_CANDIDATE_BYTES||
      child?.stageA?.sourceHead!==BOUND_SOURCE_HEAD||
      child?.stageA?.requestSha256!==BETA_REQUEST_SHA256||
      child?.stageA?.requestBytes!==BETA_REQUEST_BYTES||
      child?.stageA?.requestEnvelope!=='VersionCreateRequest (top-level JSON object)'||
      child?.stageA?.sourceIdentityReadbackRequired!==true||
      child?.stageA?.sourceReadbackEndpoint!=='GET /accounts/{account_id}/workers/workers/{worker_id}/versions/{version_id}?include=modules,sourcemaps'||
      child?.stageA?.noAssetUpload!==true||
      child?.stageA?.assetStrategy!=='exact-v348-inherited-binding'||
      child?.stageA?.binding?.name!=='ASSETS'||child?.stageA?.binding?.type!=='inherit'||
      child?.stageA?.binding?.version_id!==V348||
      !['/api/*','/internal/*','/glow-save-sync.mjs'].every(x=>child?.stageA?.workerFirstPaths?.includes(x))||
      child?.stageA?.productionTrafficAuthorized!==false||
      child?.ownerDecisionDoesNotSatisfyPreflightOrProductionAdmission!==true||
      stage.parentManifestId!==ORIGINAL_MANIFEST_ID||stage.parentRevision!==MANIFEST_REVISION||
      stage.nonWorkerTargetsUnmodified!==true||
      stage.parentContractAllowsIndependentStage!==true||
      stage.targets?.length!==1||stage.targets[0]!=='cloudflare-worker'||
      stage.operations?.length!==1||stage.operations[0]?.id!=='worker-vnext')
     fail('CLOUDFLARE_ONLY_SCOPE_NOT_SUBORDINATE');
   const servedGlow=manifest?.cloudflareAssetRetentionAmendment?.liveGlowHtmlIntegrationReadback;
   if(servedGlow?.httpStatus!==200||servedGlow?.url!=='https://hbnightflyers.com/glow.html'||
      !validHex(servedGlow?.sha256)||servedGlow?.bytes!==208937||
      servedGlow?.imports!=='./glow-save-sync.mjs'||
      servedGlow?.instantiates!=='createGlowSaveCoordinator({storage:localStorage,onStatus:setGlowSaveStatus})'||
      servedGlow?.casRpc!=='hbnf_save_league_state_v1')
     fail('SERVED_GLOW_IMPORT_AND_CAS_NOT_VERIFIED');
   const lineage=manifest?.cloudflareAssetRetentionAmendment?.v348ExecutableLineage;
   if(lineage?.versionId!==V348||lineage?.mainModule!=='index.js'||
      lineage?.providerReadbackEndpoint!=='GET /accounts/{account_id}/workers/workers/{worker_id}/versions/{version_id}?include=modules,sourcemaps'||
      lineage?.baselineModuleSha256!=='b6474c02325c73fe269170a4060e7fd4636bd0f38cb7b631e3c7ab2ac31ad77e'||
      lineage?.baselineModuleBytes!==72690||
      lineage?.candidateModuleSha256!=='e9f0611d5ba7ca72db4a0792be1178fab80a1b399734e403664105ce17a0ef69'||
      lineage?.candidateModuleBytes!==79392||
      lineage?.sourceMapSha256!=='1af1fb53e2821d8f0dd6a586fd3e3a7c483be465eb3393d0e07b349165a484aa'||
      lineage?.deltaDisposition!=='EXACT_BASELINE_BYTES_AFTER_STRIPPING_ONLY_GLOW_SAVE_HELPER_AND_GET_HEAD_ROUTE'||
      lineage?.independentByteComparison!==true)
     fail('V348_EXECUTABLE_MODULE_LINEAGE_UNVERIFIED');
   if(stage.otherTargetReadbacks?.length!==4||
      stage.otherTargetReadbacks.some(x=>!validHex(x.sha256)||x.fresh!==true)||
      !['supabase-schema','edge-tag-editor','edge-tags-live','edge-watch-score'].every(id=>
        stage.otherTargetReadbacks.some(x=>x.id===id&&x.fresh===true&&validHex(x.sha256))))
     fail('FOUR_UNCHANGED_TARGETS_NOT_FENCED');
 }else fail('SCOPE_UNSUPPORTED');
 const e=stage?.executable||{};
 if(e.format!=='cloudflare-beta-worker-version-json'||
    e.sha256!==BETA_REQUEST_SHA256||e.bytes!==BETA_REQUEST_BYTES||
    e.candidateArtifactSha256!==BETA_CANDIDATE_SHA256||
    e.candidateArtifactBytes!==BETA_CANDIDATE_BYTES||
    e.privateDriveFileId!==BETA_CANDIDATE||!trueValue(e.downloadBackVerified)||
    e.requestEnvelope!=='VersionCreateRequest (top-level JSON object)'||
    e.sourceReadbackEndpoint!=='GET /accounts/{account_id}/workers/workers/{worker_id}/versions/{version_id}?include=modules,sourcemaps'||
    !trueValue(e.moduleClosureVerified)||!trueValue(e.sourceParityVerified)||
    e.privateDriveFileId===REVIEW_ZIP)
   fail('BETA_JSON_CANDIDATE_NOT_BYTE_BOUND');
 if(e.glowHelperSha256!=='674f8712d7313fa73cf8bd761d458b7d6e5613b1eb147a24a0a0682e88f1d54a'||
    e.glowHelperGitBlob!=='a355ad13d5026551629f085060c636b60ccb8560')
   fail('GLOW_HELPER_NOT_BOUND_TO_VERIFIED_PR_SOURCE');
 const workerFirst=Array.isArray(e.workerFirstPaths)?e.workerFirstPaths:[];
 if(e.assetStrategy!=='exact-v348-inherited-binding'||
    e.assetBinding?.name!=='ASSETS'||e.assetBinding?.type!=='inherit'||
    e.assetBinding?.version_id!==V348||
    !trueValue(e.exactVersionBindingSchemaVerified)||
    !trueValue(e.noAssetUpload)||
    e.knownAssetPathCount!==46||
    e.assetInventoryDisclosure!=='KNOWN_46_NONEXHAUSTIVE'||
    !workerFirst.includes('/api/*')||!workerFirst.includes('/internal/*')||
    !workerFirst.includes('/glow-save-sync.mjs')||
    !trueValue(e.correctedHelperServedByWorker))
   fail('EXACT_V348_INHERITANCE_OR_HELPER_WORKER_FIRST_UNQUALIFIED');
 if(provider?.version!==V348||provider?.etag!==ETAG||
    !trueValue(provider?.retainedRollbackVersion)||
    !trueValue(provider?.routesCronBindingsMatch)||
    !trueValue(provider?.freshAuthenticatedFiveTargetReadback))
   fail('PROVIDER_READBACK_AND_ROLLBACK_UNQUALIFIED');
 if(adapter?.upload!=='cloudflare-beta-version-json'||
    adapter?.stageADeploy!=='deploy=false'||
    adapter?.deploy!=='percentage-100'||
    adapter?.restore!=='retained-v348-percentage-100'||
    !trueValue(adapter?.nonproductionApplyRestoreReadbackPassed)||
    !trueValue(adapter?.authenticationVerified)||
    !trueValue(adapter?.recoveryDownloadBackVerified)||
    !trueValue(adapter?.oneTimeClaimVerified)||
    !trueValue(adapter?.moduleReadbackQualified)||
    !trueValue(adapter?.twoPhaseAdmissionVerified)||
    !trueValue(adapter?.immediatePrechangeReadbackVerified)||
    !trueValue(adapter?.oldClientAndReopenAcceptanceReady)||
    !trueValue(adapter?.sameManifestCloseoutReady))
   fail('INSTALL_ADAPTER_OR_TWO_PHASE_CLOSEOUT_UNQUALIFIED');
 return {status:errors.length?'BLOCKED':synthetic?'SYNTHETIC_ROUTE_TEST_ONLY':'READY_FOR_EXTERNAL_ADMISSION_VERIFICATION',
   canMutate:false,errors};
}

/** Nonproduction-only executable route drill. Never accepts real provider
 * adapters or authorizes a live release. Ambiguous deploys restore v348.
 * A passing result proves control flow only, NOT installed acceptance. */
export async function exerciseCloudflareStageTestOnly(stage,mock,bytes){
 if(mock?.testOnly!==true||mock?.noNetwork!==true||
    ['read','upload','deploy','restore'].some(k=>typeof mock[k]!=='function'))
   throw Error('NONPRODUCTION_ADAPTER_ONLY');
 if(sha256(bytes)!==stage?.executable?.sha256)
   throw Error('EXECUTABLE_PAYLOAD_HASH_MISMATCH');
 const initial=await mock.read();
 if(initial?.version!==V348)throw Error('BASELINE_NOT_V348');
 let deployed=false,disposition='REJECTED';
 try{
   const uploaded=await mock.upload(bytes,stage);
   if(!uploaded?.version||uploaded.version===V348)throw Error('VERSION_UPLOAD_NOT_VERIFIED');
   deployed=true; // An ambiguous deploy must be treated as potentially applied.
   await mock.deploy(uploaded.version);
   const observed=await mock.read();
   if(observed?.version!==uploaded.version||
      observed?.scriptSha256!==stage.executable.sha256)
     throw Error('NEW_VERSION_READBACK_FAILED');
   disposition='TEST_ONLY_APPLY_VERIFIED';
 }catch{
   disposition='TEST_ONLY_APPLY_FAILED';
 }finally{
   if(deployed){
     try{await mock.restore(V348);}
     catch{throw Error('TEST_ONLY_ROLLBACK_UNCERTAIN');}
     const restored=await mock.read();
     if(restored?.version!==V348)throw Error('TEST_ONLY_ROLLBACK_READBACK_FAILED');
   }
 }
 return {status:disposition,restoredTo:V348,productionMutation:false};
}

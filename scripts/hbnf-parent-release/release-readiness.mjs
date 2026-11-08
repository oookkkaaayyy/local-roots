// Scoring release preflight. Read-only; never performs provider actions.
import {createHash} from 'node:crypto';
export const ORIGINAL_MANIFEST_ID='12X06fFmdc5oPGlcq9kprf1hhglbVV7mW';
export const MANIFEST_SHA256='a4c342fe334d9aec6a0cf13277d0f5af62939bef497af40a9a2cdadbae547b69';
export const MANIFEST_REVISION=16;
export const BOUND_SOURCE_HEAD='abf611e9e451464bc9b85ec4fb1d227645a7abdd';
export const sha256 = x=>createHash('sha256').update(x).digest('hex');

const RELEASE_CONTROL_TAIL_PATHS=new Set([
 'scripts/hbnf-parent-release/release-readiness.mjs',
 'scripts/hbnf-parent-release/release-readiness-cli.mjs',
 'scripts/hbnf-parent-release/cloudflare-executable-version.mjs',
 'tests/hbnf-release-readiness.test.mjs',
 'tests/hbnf-cloudflare-executable-version.test.mjs'
]);

/** A governance-only commit may follow the bound product-source head. Any
 * other path means the candidate source binding must be amended again. */
export function bindSourceHeadToCheckout({boundHead,checkoutHead,ancestryVerified,changedPaths=[]}={}){
 if(boundHead!==BOUND_SOURCE_HEAD||!/^[a-f0-9]{40}$/.test(checkoutHead||''))
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
const BETA_CANDIDATE='1gmbZo09hxkOjkVC_5-fOqFtiWfSssVt8';
const BETA_CANDIDATE_SHA256='1b391b7db096a81cf75ed61b3ff074d034987f512c296fc8c6f4bdb7ce5f845e';
const BETA_CANDIDATE_BYTES=274519;
const BETA_REQUEST_SHA256='36017fbb2191ae9c6e46b4b08f5cdf72442222a1f59beaa6194d22851c3d6f11';
const BETA_REQUEST_BYTES=269030;
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
       cost?.stageAStatus!=='COST_QUALIFIED_AND_V348_ROLLBACK_WINDOW_PRESERVED; PRIOR CLAIM CONSUMED BEFORE A PRECREATE ADAPTER STOP; NO PROVIDER WRITE; NEW CLAIM AND IMMEDIATE READBACK REQUIRED; ACCOUNT VERSION QUOTA FIELD NOT EXPOSED')
      fail('STAGE_A_COST_RETENTION_EVIDENCE_UNQUALIFIED');
    const attempts=manifest?.cloudflareAssetRetentionAmendment?.stageAExecutionAttempts;
    if(!Array.isArray(attempts)||attempts.length!==1||
       attempts[0]?.status!=='STOPPED_BEFORE_VERSION_CREATE'||
       attempts[0]?.providerVersionCreatePostSent!==false||
       attempts[0]?.postAttemptReadback?.activeVersionId!==V348||
       attempts[0]?.postAttemptReadback?.activePercentage!==100||
       attempts[0]?.postAttemptReadback?.latestVersionId!=='049a35e1-64b5-4e76-9378-ca4ffa0a7d47')
      fail('STAGE_A_PRIOR_ATTEMPT_NOT_RECONCILED');
   if(ownerScope?.source!=='Explicit owner instruction in existing Scoring P0 execution thread'||
      ownerScope?.decision!=='Approve in-place rev13 amendment for this exact candidate and exact-v348 ASSETS binding inheritance.'||
      ownerScope?.productionMutationAuthorized!==false)
     fail('CLOUDFLARE_STAGE_A_OWNER_SCOPE_NOT_AUTHORIZED');
   if(manifest?.scopedReleaseAuthority?.cloudflareOnlySaveAck?.admittedUnderParent!==true||
      child?.parentManifestId!==ORIGINAL_MANIFEST_ID||child?.parentRevision!==14||
      child?.stageA?.candidateFileId!==BETA_CANDIDATE||
      child?.stageA?.candidateSha256!==BETA_CANDIDATE_SHA256||
      child?.stageA?.candidateBytes!==BETA_CANDIDATE_BYTES||
      child?.stageA?.requestSha256!==BETA_REQUEST_SHA256||
      child?.stageA?.requestBytes!==BETA_REQUEST_BYTES||
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
   if(stage.otherTargetReadbacks?.length!==4||
      stage.otherTargetReadbacks.some(x=>!validHex(x.sha256)||x.fresh!==true))
     fail('FOUR_UNCHANGED_TARGETS_NOT_FENCED');
 }else fail('SCOPE_UNSUPPORTED');
 const e=stage?.executable||{};
 if(e.format!=='cloudflare-beta-worker-version-json'||
    e.sha256!==BETA_REQUEST_SHA256||e.bytes!==BETA_REQUEST_BYTES||
    e.candidateArtifactSha256!==BETA_CANDIDATE_SHA256||
    e.candidateArtifactBytes!==BETA_CANDIDATE_BYTES||
    e.privateDriveFileId!==BETA_CANDIDATE||!trueValue(e.downloadBackVerified)||
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

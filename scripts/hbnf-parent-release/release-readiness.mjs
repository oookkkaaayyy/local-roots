// Scoring release preflight. Read-only; never performs provider actions.
import {createHash} from 'node:crypto';
export const ORIGINAL_MANIFEST_ID='12X06fFmdc5oPGlcq9kprf1hhglbVV7mW';
export const REV10_SHA256='3e47e036c7d901b20815032995533a20d11628c39de8acd646fcf936a3ec6a73';
export const REV10_HEAD='886456b01067631bad3b7a6d930433adc8b7fb1d';
export const sha256 = x=>createHash('sha256').update(x).digest('hex');

const PARENT_TARGETS=['supabase-schema','edge-tag-editor','edge-tags-live','edge-watch-score','cloudflare-worker'];
const V348='48ffa87e-3c83-46d0-a6ca-db7bf0b064e6';
const ETAG='c3ea6bde761a6a5735a6a8b50334821b809baf57096c64cbb71b50a17ceb5b25';
const REVIEW_ZIP='1ZD0it8FgFpgvmlHKUa2byIqeK81bq1_q';
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
 if(manifest?.manifestRevision!==10||
    manifest?.recordId!=='hbnf-p0-pr151-udisc-20261103-52e120-review-only'||
    manifest?.status!=='PENDING_NOT_ADMITTED'||manifest?.productionMutationAuthorized!==false)
   fail('REV10_RELEASE_AUTHORITY_DRIFT');
 if(manifestFileId!==ORIGINAL_MANIFEST_ID)fail('ORIGINAL_MANIFEST_ID_MISSING');
 if(!synthetic && (!manifestBytes||sha256(manifestBytes)!==REV10_SHA256))
   fail('PRIVATE_REV10_MANIFEST_BYTES_NOT_VERIFIED');
 if(!synthetic && manifestBytes){
   try{
     if(JSON.stringify(JSON.parse(Buffer.from(manifestBytes).toString('utf8')))!==JSON.stringify(manifest))
       fail('MANIFEST_CONTENT_DIFFERS_FROM_DOWNLOADED_BYTES');
   }catch{fail('INVALID_MANIFEST_BYTES');}
 }
 if(manifest?.source?.currentScoringReviewHead!==REV10_HEAD||
    sourceHead!==REV10_HEAD)fail('HEAD_CHANGED_SINCE_REV10');
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
   if(manifest?.scopedReleaseAuthority?.cloudflareOnlySaveAck?.admittedUnderParent!==true||
      stage.parentManifestId!==ORIGINAL_MANIFEST_ID||stage.parentRevision!==10||
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
 if(e.format!=='cloudflare-worker-version-multipart'||!validHex(e.sha256)||
    !Number.isSafeInteger(e.bytes)||e.bytes<1||
    !e.privateDriveFileId||!trueValue(e.downloadBackVerified)||
    !trueValue(e.moduleClosureVerified)||!trueValue(e.sourceParityVerified)||
    e.privateDriveFileId===REVIEW_ZIP)
   fail('ONEFILE_REVIEW_ZIP_NOT_EXECUTABLE_WORKER');
 if(e.glowHelperSha256!=='674f8712d7313fa73cf8bd761d458b7d6e5613b1eb147a24a0a0682e88f1d54a'||
    e.glowHelperGitBlob!=='a355ad13d5026551629f085060c636b60ccb8560')
   fail('GLOW_HELPER_NOT_BOUND_TO_VERIFIED_PR_SOURCE');
 if(e.assetStrategy!=='complete-manifest-upload'||
    !trueValue(e.providerAssetInventoryExhaustive)||
    !trueValue(e.changedGlowHelperUploaded)||
    !trueValue(e.eightNewerCartAssetsPreserved)||
    !validHex(e.completeAssetManifestSha256)||
    !trueValue(e.assetUploadCompletionVerified))
   fail('ASSET_SET_OR_NEW_HELPER_UPLOAD_UNQUALIFIED');
 if(provider?.version!==V348||provider?.etag!==ETAG||
    !trueValue(provider?.retainedRollbackVersion)||
    !trueValue(provider?.routesCronBindingsMatch)||
    !trueValue(provider?.freshAuthenticatedFiveTargetReadback))
   fail('PROVIDER_READBACK_AND_ROLLBACK_UNQUALIFIED');
 if(adapter?.upload!=='cloudflare-version-multipart'||
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

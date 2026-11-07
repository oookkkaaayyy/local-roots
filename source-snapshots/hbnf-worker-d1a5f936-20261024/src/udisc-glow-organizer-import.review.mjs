/**
 * REVIEW_ONLY / server-only. Operator-provided official XLSX -> exact, independently
 * read-back-verified week CAS. The sole Scoring P0 adapter owns the actual RPC.
 * No UDisc HTTP, scheduler, public endpoint, Cart call, credentials, or rollout.
 */
import {validateGlowEventBinding} from './udisc-glow-event-bindings.mjs';
import {parseUdiscWorkbook, validateIdentityEvidence, buildGlowProposal, prepareGlowWeekSync} from './udisc-glow-sync-runner.mjs';
import {qualifiedGlowScorePars, sameLeagueRevision, offerSavedGlowIntent} from './udisc-glow-auto-sync.review.mjs';
import {attachLocalSnapshotEvidence} from './udisc-glow-snapshot-mode.review.mjs';
import {NOV10_MAIN_LAYOUT,qualifyNov10MainWeek} from './udisc-nov10-main-layout.review.mjs';

const MAX_XLSX_BYTES=12*1024*1024;
const S1_IMMUTABLE_DATE='2026-11-03'; // Existing protected historical recovery; NOT a new-event routing default.
const plain=value=>JSON.parse(JSON.stringify(value));
const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?
  Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;
const same=(a,b)=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b));
const isHex64=value=>/^[0-9a-f]{64}$/.test(String(value||''));
const stop=(code,stage='PREWRITE')=>Object.freeze({disposition:code,stage,cartIntent:'NOT_REQUESTED',
  wrote:stage==='COMMIT_AMBIGUOUS'?null:stage==='COMMIT_ACKNOWLEDGED'?true:false,
  readbackVerified:false,
  writeOutcome:stage==='COMMIT_AMBIGUOUS'?'UNKNOWN_MAY_HAVE_COMMITTED':
    stage==='COMMIT_ACKNOWLEDGED'?'COMMIT_ACKNOWLEDGED_READBACK_UNVERIFIED':'NO_COMMIT_ACKNOWLEDGED'});

/**
 * Input is supplied only by an authenticated, Scoring-owned server caller.
 * receivedAt is an actual, trusted upload-receipt clock, never a UDisc score timestamp.
 * readBinding/readState/applyWeek use the one existing authenticated provider;
 * they are injected to prevent another writer or a public service-role surface.
 */
export async function importOrganizerGlowXlsx({upload,adapters}={}) {
  if(!adapters || typeof adapters.authorize!=='function' ||
     typeof adapters.readBinding!=='function' || typeof adapters.readState!=='function' ||
     typeof adapters.applyWeek!=='function'||typeof adapters.receiptTime!=='function')return stop('SERVER_ADAPTER_NOT_QUALIFIED');
  if(await adapters.authorize(upload)!==true)return stop('OPERATOR_NOT_AUTHORIZED');
  const eventId=String(upload?.eventId||'');
  const weekDate=String(upload?.weekDate||'');
  // Source of the receipt clock is the authenticated server, never client XLSX/UI data.
  let receivedAt;
  try {receivedAt=String(await adapters.receiptTime());}
  catch{return stop('TRUSTED_RECEIPT_TIME_UNAVAILABLE');}
  const bytes=upload?.xlsx instanceof Uint8Array?upload.xlsx:upload?.xlsx instanceof ArrayBuffer?new Uint8Array(upload.xlsx):null;
  if(!bytes||bytes.byteLength<22||bytes.byteLength>MAX_XLSX_BYTES||bytes[0]!==0x50||bytes[1]!==0x4b||
     !isHex64(upload?.sha256)||!Number.isFinite(Date.parse(receivedAt))||
     !/^(?:19|20)\d{2}-\d{2}-\d{2}T/.test(receivedAt))return stop('OFFICIAL_FILE_RECEIPT_INVALID');
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const sha256=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  if(sha256!==upload.sha256)return stop('OFFICIAL_FILE_HASH_MISMATCH');
  if(weekDate===S1_IMMUTABLE_DATE)return stop('S1_HISTORICAL_WEEK_PROTECTED');

  // The XLSX itself is not cryptographic event-ID attestation. Require the
  // operator's explicit event selection AND one exact, persisted provider row.
  let binding;
  try {
    const rows=await adapters.readBinding({eventId,weekDate});
    if(!Array.isArray(rows)||rows.length!==1)return stop('BINDING_NOT_EXACTLY_ONE');
    binding=validateGlowEventBinding(rows[0]);
  } catch { return stop('BINDING_INVALID_OR_UNAVAILABLE'); }
  if(binding.eventId!==eventId||binding.weekDate!==weekDate)return stop('BINDING_IDENTITY_MISMATCH');
  const freshAttested=upload?.freshSnapshotConfirmed===true;
  if(freshAttested&&(Date.parse(receivedAt)<Date.parse(binding.windowStart)||
      Date.parse(receivedAt)>Date.parse(binding.windowEnd)))return stop('FRESH_EXPORT_OUTSIDE_BOUND_EVENT_WINDOW');
  // Manual post-round exports are legitimate. Do not extend the event window,
  // claim a live score feed, or require receivedAt to fall inside that window.

  let before;
  try{before=await adapters.readState();}catch{return stop('AUTHORITATIVE_STATE_UNAVAILABLE');}
  const glow=before?.state_json?.glow;
  if(!before?.updated_at||!glow||glow.activeWeek!==weekDate)return stop('ACTIVE_GLOW_WEEK_MISMATCH');
  const existingWeek=glow.weeks?.[weekDate];
  if(!existingWeek)return stop('WEEK_NOT_INITIALIZED');
  if(eventId===NOV10_MAIN_LAYOUT.eventId&&weekDate===NOV10_MAIN_LAYOUT.date&&
     !qualifyNov10MainWeek({eventId,weekDate,week:existingWeek}))
    return stop('NOV10_MAIN_LAYOUT_NOT_QUALIFIED');
  if(existingWeek.scoresLocked||existingWeek.cards?.some(c=>c?.finalized))return stop('WEEK_LOCKED');
  if(existingWeek.udiscSync?.eventId && existingWeek.udiscSync.eventId!==eventId)return stop('EXISTING_SOURCE_EVENT_MISMATCH');

  let prepared;
  try {
    const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
    const snapshot=await parseUdiscWorkbook(buffer,{eventId,weekDate,observedAt:receivedAt});
    const history=Object.values(glow.weeks||{}).flatMap(w=>(w.players||[]).flatMap(p=>[p.partner1,p.partner2])).filter(Boolean);
    const evidence=validateIdentityEvidence({aliases:glow.playerAliases||{},historicalNames:history,tagEvidence:[]});
    const proposal=buildGlowProposal({eventId,snapshots:[snapshot]},evidence,upload.reviewedDecisions||{},{weekDate});
    if(proposal.issues?.unresolvedIdentityCount || proposal.issues?.duplicateCanonicalTeamRows ||
       proposal.issues?.rowsWithUnresolvedIdentity || proposal.identityReview?.reviewedCrosswalk?.some(x=>x.status!=='reviewed'))
      return stop('IDENTITY_REVIEW_REQUIRED');
    if(!proposal.sourceProvenance?.rowEvidence?.some(row=>row.holeScores?.some(s=>s!==null&&s!==''&&s!==undefined)))
      return stop('OFFICIAL_EXPORT_HAS_NO_SCORES');
    prepared=await prepareGlowWeekSync(existingWeek,proposal,{aliases:evidence.aliases});
  } catch(error) {
    return stop(error?.code==='EMPTY_EXPORT_NO_SCORES'?'OFFICIAL_EXPORT_HAS_NO_SCORES':'SOURCE_VALIDATION_FAILED');
  }
  if(!prepared.changed){
    let rechecked;
    try {rechecked=await adapters.readState();}catch{return stop('DUPLICATE_READBACK_UNAVAILABLE');}
    if(!same(rechecked?.state_json?.glow?.weeks?.[weekDate],existingWeek)||
       rechecked?.state_json?.glow?.activeWeek!==weekDate)return stop('DUPLICATE_SOURCE_DRIFT');
    return Object.freeze({disposition:'DUPLICATE_VERIFIED',stage:'READBACK',wrote:false,
      source:'organizer_provided_official_xlsx',cartIntent:'NOT_REQUESTED',eventId,weekDate,sha256});
  }
  if(prepared.week.udiscSync?.latest?.manualOverrides?.length||
     prepared.week.udiscSync?.latest?.reviewedPartnershipTransitions?.length)return stop('CONTRADICTORY_OR_PARTNERSHIP_REVIEW_REQUIRED');
  // Existing nonblank scores are protected from unreviewed upstream corrections.
  // Authorization must come from the sole Scoring server, not the uploaded file.
  const existingById=new Map((existingWeek.players||[]).map(p=>[p.id,p]));
  for(const next of prepared.week.players||[]){
    const old=existingById.get(next.id);
    if(!old)continue;
    for(let hole=0;hole<18;hole++){
      const from=String(old.scores?.[hole]??'').trim(),to=String(next.scores?.[hole]??'').trim();
      if(from && from!==to){
        if(typeof adapters.authorizeCorrection!=='function' ||
           await adapters.authorizeCorrection({eventId,weekDate,teamId:next.id,hole:hole+1,from,to,sha256})!==true)
          return stop('SCORE_CORRECTION_REQUIRES_P0_REVIEW');
      }
    }
  }
  const pars=qualifiedGlowScorePars(prepared.week);
  if(!pars.ready)return stop('HOLE_PARS_NOT_VERIFIED');
  let replacement=plain(prepared.week);
  if(freshAttested){
    const evidence=attachLocalSnapshotEvidence({before:existingWeek,prepared:{...prepared,week:replacement},
      sha256,observedAt:receivedAt,eventId,weekDate});
    replacement=evidence.week;
    replacement.udiscSync.status.freshnessBasis='OPERATOR_ATTESTED_EXPORT_RECEIPT_TIME';
    replacement.udiscSync.status.captureAuthority='authenticated_organizer_immediate_export_attestation';
    replacement.udiscSync.status.sourceFreshness='OPERATOR_ATTESTED_CAPTURE_TIME';
    replacement.udiscSync.latest.hbnfLocalSnapshot.provenance='OPERATOR_ATTESTED_EXPORT_RECEIPT_NOT_UDISC_METADATA';
  }else{
    // Post-round or unattested exports are persisted for standings only and
    // cannot become current Cart score intents.
    replacement.udiscSync.status={state:'organizer_upload_persisted',sourceFreshness:'NOT_ASSERTED'};
  }
  replacement.udiscSync.organizerUpload={sha256,source:'operator_provided',receivedAt,
    freshnessAttested:freshAttested};
  const expectedRoot=plain(before.state_json);
  expectedRoot.glow.weeks[weekDate]=replacement;

  let response;
  try {
    response=await adapters.applyWeek({p_week_date:weekDate,p_expected_week:existingWeek,
      p_replacement_week:replacement,p_expected_active_week:glow.activeWeek});
  }catch{
    // A transport failure could follow a committed provider transaction.
    return stop('COMMIT_OUTCOME_UNKNOWN_NO_RETRY','COMMIT_AMBIGUOUS');
  }
  if(response?.applied!==true)return stop('CONFLICT_OR_GUARD_REJECTION','RPC_REJECTED');
  let after;
  try{after=await adapters.readState();}catch{return stop('COMMITTED_READBACK_UNAVAILABLE_NO_RETRY','COMMIT_ACKNOWLEDGED');}
  if(!after?.updated_at||sameLeagueRevision(before.updated_at,after.updated_at)||
     !same(after.state_json,expectedRoot))return stop('COMMITTED_READBACK_MISMATCH_NO_RETRY','COMMIT_ACKNOWLEDGED');
  const cartIntent=freshAttested&&typeof adapters.onVerifiedSaved==='function'
    ? await offerSavedGlowIntent({week:after.state_json.glow.weeks[weekDate],revision:after.updated_at,
      signature:prepared.signature,binding,now:new Date(receivedAt),onVerifiedSaved:adapters.onVerifiedSaved})
    : 'NOT_REQUESTED';
  return Object.freeze({disposition:'SAVED_AND_READBACK_VERIFIED',stage:'INDEPENDENT_SERVER_READ',wrote:true,readbackVerified:true,
    source:'organizer_provided_official_xlsx',
    sourceFreshness:freshAttested?'OPERATOR_ATTESTED_CAPTURE_TIME':'NOT_ASSERTED',cartIntent,
    eventId,weekDate,sha256,signature:prepared.signature,revision:after.updated_at,scoredHoles:pars.scoredHoles});
}

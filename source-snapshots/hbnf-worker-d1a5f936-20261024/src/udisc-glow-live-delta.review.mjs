/**
 * Source-independent, permission-gated in-round UDisc -> Glow delta adapter.
 * REVIEW ONLY. No UDisc network access, no endpoint, no credentials, no Cart/device writer.
 * A future Scoring-owned provider adapter must verify the actual UDisc permission,
 * authenticated source identity, source timestamp and provider ordering BEFORE
 * invoking this module. No caller-provided "live" flag is trusted.
 */
import {validateGlowEventBinding,isHbnfGlowDoublesEventId} from './udisc-glow-event-bindings.mjs';

const MAX_SOURCE_AGE_MS = 10 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 30 * 1000;
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const safeId = v => ID.test(str(v)) && !['__proto__','constructor','prototype'].includes(str(v).toLowerCase());
const DATE = /^20\d\d-\d\d-\d\d$/;
const HEX64 = /^[0-9a-f]{64}$/;
const own = (v,k) => Object.prototype.hasOwnProperty.call(v||{},k);
const clone = v => JSON.parse(JSON.stringify(v));
const norm = v => String(v??'').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const str = v => String(v??'').trim();
const err = code => Object.assign(new Error(code),{code});
function canonical(value) {
  if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  if (value && typeof value==='object') return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
async function sha256(value) {
  const bytes=new TextEncoder().encode(value);
  const out=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(out)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
const atMs = v => typeof v==='string' && /^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(v) ? Date.parse(v) : NaN;
const isNatural = n => Number.isSafeInteger(n) && n > 0;
const score = v => (Number.isInteger(v) && v>=1 && v<=99) ? String(v) : null;
const scoreText = v => str(v);
const same = (a,b) => canonical(a)===canonical(b);
function fail(code) {return {status:'REJECTED',reason:code,wrote:false,readbackVerified:false,cartIntent:'NOT_REQUESTED'};}

// Build the existing Controls-owned Cart backend proof only from a successful
// guarded save with independent provider readback and actual UDisc hole scores.
// This function has no network/device side effects; Scoring never actuates Cart.
export function buildVerifiedGlowCartProof(result) {
  const digest=result?.downstream?.signedEnvelopeDigest;
  if(result?.status!=='SAVED_AND_INDEPENDENTLY_VERIFIED' || result?.wrote!==true ||
     result?.readbackVerified!==true || result?.hasVerifiedScoredHoles!==true ||
     result?.downstream?.owner!=='CONTROLS_ONLY' ||
     result?.downstream?.eligibleForSeparateSourceReview!==true || !HEX64.test(digest||'') ||
     result?.eventId!==result?.downstream?.eventId ||
     result?.weekDate!==result?.downstream?.weekDate ||
     result?.sourceRevision!==result?.downstream?.readbackRevision ||
     !Number.isFinite(atMs(result?.sourceRevision)) || !isHbnfGlowDoublesEventId(result?.eventId) ||
     !DATE.test(result?.weekDate) ||
     new Date(result.weekDate+'T12:00:00Z').getUTCDay()!==2)
    return {eligible:false,reason:'INDEPENDENT_SCORED_READBACK_REQUIRED'};
  return {eligible:true,owner:'CONTROLS_ONLY',saved:{eventId:result.eventId,
    weekDate:result.weekDate,signature:digest,sourceRevision:result.sourceRevision}};
}
function checkEnvelope(envelope) {
  if(envelope?.schema!=='hbnf.udisc.authorized-live-delta.v1' || !safeId(envelope.eventId) ||
     !DATE.test(envelope.weekDate) || !safeId(envelope.roundId) ||
     !isNatural(envelope.cursor) || !Number.isFinite(atMs(envelope.sourceUpdatedAt)) ||
     !Array.isArray(envelope.teams) || !envelope.teams.length || envelope.teams.length>96 ||
     !Array.isArray(envelope.changes) || !envelope.changes.length || envelope.changes.length>1800)
     throw err('INVALID_LIVE_ENVELOPE');
  if(envelope.teams.some(t=>!safeId(t.sourceTeamId) || !Array.isArray(t.participantIds) ||
      t.participantIds.length<1 || t.participantIds.length>2 || t.participantIds.some(id=>!safeId(id)) ||
      new Set(t.participantIds).size!==t.participantIds.length))throw err('INVALID_SOURCE_ROSTER');
  const unique=new Set(envelope.teams.map(t=>t.sourceTeamId));
  if(unique.size!==envelope.teams.length)throw err('DUPLICATE_SOURCE_TEAM');
  const participants=envelope.teams.flatMap(t=>t.participantIds);
  if(new Set(participants).size!==participants.length)throw err('PARTICIPANT_IN_MULTIPLE_TEAMS');
  if(envelope.details!==undefined){
    if(!envelope.details||typeof envelope.details!=='object'||Array.isArray(envelope.details)||
       Object.entries(envelope.details).some(([key,value])=>
         !['layoutId','courseId','courseName','roundLabel'].includes(key)||
         typeof value!=='string'||!str(value)||str(value).length>120))throw err('UNSUPPORTED_EVENT_DETAILS');
  }
  const seen=new Set();
  for(const c of envelope.changes) {
    if(!unique.has(c?.sourceTeamId))throw err('UNBOUND_DELTA_TEAM');
    if(c.kind==='hole') {
      if(!Number.isInteger(c.hole) || c.hole<1 || c.hole>18 || score(c.strokes)===null ||
         typeof c.corrected!=='boolean')throw err('INVALID_HOLE_DELTA');
      if(own(c,'previousStrokes') && score(c.previousStrokes)===null)throw err('INVALID_PREVIOUS_HOLE_SCORE');
      const k=c.sourceTeamId+':'+c.hole;
      if(seen.has(k))throw err('DUPLICATE_HOLE_DELTA');
      seen.add(k);
    }else if(c.kind==='result') {
      if(own(c,'division') && (typeof c.division!=='string'||!str(c.division)||str(c.division).length>80))throw err('INVALID_RESULT_DIVISION');
      if(c.position!==null && c.position!==undefined && (!Number.isInteger(c.position)||c.position<1) ||
        c.total!==null && c.total!==undefined && (!Number.isInteger(c.total)||c.total<0) ||
        c.thru!==null && c.thru!==undefined && (!Number.isInteger(c.thru)||c.thru<0||c.thru>18))throw err('INVALID_RESULT_DELTA');
      const k=c.sourceTeamId+':result';if(seen.has(k))throw err('DUPLICATE_RESULT_DELTA');seen.add(k);
    }else throw err('UNSUPPORTED_SOURCE_CHANGE');
  }
  return unique;
}
function validateCrosswalk(envelope,reviewed) {
  if(reviewed?.eventId!==envelope.eventId || reviewed.weekDate!==envelope.weekDate ||
     !Array.isArray(reviewed.teams))throw err('EVENT_SCOPED_IDENTITY_REVIEW_REQUIRED');
  const mapping=new Map(),glowIds=new Set();
  for(const r of reviewed.teams){
    if(!safeId(r.sourceTeamId)||!safeId(r.glowTeamId)||!safeId(r.cardId)||
       !Array.isArray(r.participantIds)||r.participantIds.length<1||r.participantIds.length>2||
       !str(r.partner1)||r.participantIds.length===2&&!str(r.partner2)||
       mapping.has(r.sourceTeamId)||glowIds.has(r.glowTeamId))throw err('IDENTITY_CROSSWALK_INVALID');
    mapping.set(r.sourceTeamId,r);glowIds.add(r.glowTeamId);
  }
  for(const team of envelope.teams){
    const mapped=mapping.get(team.sourceTeamId);
    if(!mapped || !same(mapped.participantIds,team.participantIds))throw err('UNREVIEWED_PARTICIPANT_OR_TEAM');
    if(team.names!==undefined){
      if(!Array.isArray(team.names)||team.names.length!==team.participantIds.length ||
         team.names.some((name,i)=> !norm(name)|| !([mapped.partner1,mapped.partner2][i] && (
           norm(name)===norm([mapped.partner1,mapped.partner2][i])||
           (mapped.allowedAliases?.[String(i)]||[]).some(alias=>norm(alias)===norm(name))))))
         throw err('UNREVIEWED_SOURCE_ALIAS');
    }
  }
  return mapping;
}
function parsQualified(week) {
  const p=week?.scorecardText?.holePars;
  return p&&typeof p==='object'&&Array.from({length:18},(_,i)=>Number(p[String(i+1)])).every(n=>Number.isInteger(n)&&n>1&&n<8);
}
function verifyBinding(binding,envelope,nowMs) {
  const v=validateGlowEventBinding(binding);
  if(v.eventId!==envelope.eventId||v.weekDate!==envelope.weekDate)throw err('EVENT_BINDING_MISMATCH');
  const start=Date.parse(v.windowStart),end=Date.parse(v.windowEnd),updated=atMs(envelope.sourceUpdatedAt);
  if(nowMs<start||nowMs>end)throw err('EVENT_OUTSIDE_ACTIVE_WINDOW');
  if(updated<start||updated>end||updated>nowMs+MAX_CLOCK_SKEW_MS||nowMs-updated>MAX_SOURCE_AGE_MS)
    throw err('SOURCE_NOT_FRESH');
  return v;
}
function normalizeRead(read) {
  if(!read||!read.updated_at||!Number.isFinite(Date.parse(read.updated_at))||!read.state_json?.glow)throw err('AUTHORITATIVE_ROOT_UNAVAILABLE');
  return read;
}
function planDelta(before,envelope,crosswalk,receipt,nowIso,digest) {
  const root=clone(before.state_json),glow=root.glow;
  if(glow.activeWeek!==envelope.weekDate || !glow.weeks?.[envelope.weekDate])throw err('TARGET_WEEK_NOT_INITIALIZED');
  const week=clone(glow.weeks[envelope.weekDate]);
  if(week.date&&week.date!==envelope.weekDate)throw err('INVALID_TARGET_WEEK');
  if(week.scoresLocked || !Array.isArray(week.cards)|| week.cards.some(c=>c.finalized))throw err('WEEK_LOCKED_OR_FINALIZED');
  if(!parsQualified(week))throw err('REAL_18_HOLE_PARS_REQUIRED');
  if(week.udiscSync?.source==='UDisc event XLSX export' || week.udiscSync?.status?.state==='organizer_upload_persisted')
    throw err('OPERATOR_IMPORT_SOURCE_TRANSITION_REQUIRES_P0_REVIEW');
  const previous=week.udiscLive;
  if(previous && (previous.eventId!==envelope.eventId||previous.weekDate!==envelope.weekDate))throw err('LIVE_SOURCE_IDENTITY_CHANGED');
  if(previous && envelope.cursor<previous.cursor)throw err('SOURCE_CURSOR_STALE');
  if(previous && Date.parse(envelope.sourceUpdatedAt)<Date.parse(previous.sourceUpdatedAt))
    throw err('SOURCE_UPDATED_AT_REGRESSED');
  if(previous && envelope.cursor===previous.cursor) {
    if(previous.envelopeDigest!==digest)throw err('SOURCE_CURSOR_REUSED_DIFFERENT_PAYLOAD');
    return {duplicate:true,week:before.state_json.glow.weeks[envelope.weekDate]};
  }
  const accepted={...(previous?.acceptedHoles||{})};
  const results={...(previous?.results||{})};
  const teamRefs={...(previous?.teams||{})};
  const audit=Array.isArray(previous?.audit)?[...previous.audit]:[];
  const sourceTeamToReviewed=new Map(crosswalk);
  if(!Array.isArray(week.players))week.players=[];
  const playerById=new Map(week.players.map(p=>[p.id,p]));
  const cardById=new Map(week.cards.map(c=>[c.id,c]));
  let scoredChanges=0,rosterChanges=0;
  for(const team of envelope.teams){
    const r=sourceTeamToReviewed.get(team.sourceTeamId),card=cardById.get(r.cardId);
    if(!card||card.finalized||!Array.isArray(card.players))throw err('REVIEWED_CARD_UNAVAILABLE');
    if(teamRefs[team.sourceTeamId]&&teamRefs[team.sourceTeamId]!==r.glowTeamId)throw err('SOURCE_TEAM_ID_REBOUND');
    if([...Object.entries(teamRefs)].some(([source,id])=>id===r.glowTeamId&&source!==team.sourceTeamId))throw err('GLOW_TEAM_ID_ALREADY_BOUND');
    let player=playerById.get(r.glowTeamId);
    if(player){
      if(norm(player.partner1)!==norm(r.partner1) || norm(player.partner2)!==norm(r.partner2) ||
         player.cardId!==r.cardId)throw err('EXISTING_CANONICAL_ROSTER_CONFLICT');
      if(!card.players.some(p=>p.id===r.glowTeamId))throw err('REVIEWED_CARD_ROSTER_CONFLICT');
    }else{
      if(r.allowCreate!==true || week.players.some(p=>norm(p.partner1)===norm(r.partner1)&&norm(p.partner2)===norm(r.partner2)))
        throw err('NEW_TEAM_REQUIRES_EXPLICIT_REVIEW');
      player={id:r.glowTeamId,name:[r.partner1,r.partner2].filter(Boolean).join(' / '),partner1:r.partner1,
        partner2:r.partner2,cardId:r.cardId,scores:Array(18).fill(''),removed:false};
      week.players.push(player);playerById.set(player.id,player);
      card.players.push({id:player.id,partner1:r.partner1,partner2:r.partner2});
      rosterChanges++;
    }
    teamRefs[team.sourceTeamId]=r.glowTeamId;
  }
  for(const c of envelope.changes){
    const r=sourceTeamToReviewed.get(c.sourceTeamId),p=playerById.get(r.glowTeamId);
    if(!p)throw err('MISSING_REVIEWED_TEAM');
    if(c.kind==='result'){
      results[r.glowTeamId]={position:c.position??null,total:c.total??null,thru:c.thru??null,
        division:str(c.division)||null,sourceCursor:envelope.cursor};
      continue;
    }
    if(!Array.isArray(p.scores)||p.scores.length!==18)throw err('INVALID_GLOW_SCORECARD');
    const index=c.hole-1,current=scoreText(p.scores[index]),incoming=score(c.strokes);
    const lineage=accepted[r.glowTeamId]?.[String(c.hole)];
    if(!current||current===incoming){
      if(current!==incoming){
        scoredChanges++;audit.push({glowTeamId:r.glowTeamId,hole:c.hole,from:current||null,to:incoming,
          correction:false,sourceCursor:envelope.cursor});
      }
      p.scores[index]=incoming;
    }else{
      if(!lineage || lineage.strokes!==current)throw err('MANUAL_SCORE_CONFLICT');
      if(c.corrected!==true || String(c.previousStrokes)!==current)throw err('UNATTESTED_SOURCE_CORRECTION');
      p.scores[index]=incoming;scoredChanges++;
      audit.push({glowTeamId:r.glowTeamId,hole:c.hole,from:current,to:incoming,
        correction:true,sourceCursor:envelope.cursor});
    }
    accepted[r.glowTeamId]={...(accepted[r.glowTeamId]||{}),[String(c.hole)]:{strokes:incoming,cursor:envelope.cursor}};
  }
  for(const [id,result] of Object.entries(results)){
    const p=playerById.get(id);
    if(!p)continue;
    if(p.scores.every(v=>scoreText(v)!=='')){
      const computed=p.scores.reduce((s,v)=>s+Number(v),0);
      if(result.total!==null && result.total!==computed)throw err('SOURCE_RESULTS_DISAGREE_WITH_VERIFIED_18_HOLES');
    }
  }
  // Do not label unrelated manual scores as fresh UDisc output. A trusted
  // provider cursor must have at least one accepted source-owned scored hole.
  const hasScored=Object.values(accepted).some(holes=>Object.values(holes).some(v=>/^\d{1,2}$/.test(str(v?.strokes)) && Number(v.strokes)>=1));
  week.udiscLive={schema:'hbnf.udisc.live-lineage.v1',eventId:envelope.eventId,weekDate:envelope.weekDate,
    roundId:envelope.roundId,cursor:envelope.cursor,sourceUpdatedAt:envelope.sourceUpdatedAt,
    receivedAt:nowIso,envelopeDigest:digest,permissionReference:receipt.permissionReference,
    sourceIdentity:receipt.sourceIdentity,sourceMode:'EXPLICITLY_AUTHORIZED_IN_ROUND',
    teams:teamRefs,acceptedHoles:accepted,results,details:{...(previous?.details||{}),...(envelope.details||{})},
    audit:audit.slice(-200),
    scoredChanges,rosterChanges,sourceFreshness:hasScored?'VERIFIED_PROVIDER_RECENT':'NO_SCORED_HOLES'};
  // Controls must independently re-read authoritative persisted state and requalify
  // source window/age. This marker can only be installed after trusted provider
  // attestation + same-transaction guarded CAS, never by manual XLSX input.
  week.udiscSync={source:'UDisc explicitly authorized live source',eventId:envelope.eventId,
    weekDate:envelope.weekDate,lastUpdatedAt:envelope.sourceUpdatedAt,
    latest:{signature:digest,observedAt:nowIso,sourceUpdatedAt:envelope.sourceUpdatedAt,
      liveSourceReceipt:true,sourceCursor:envelope.cursor},
    status:{state:hasScored?'fresh':'awaiting_scores',lastAttemptAt:nowIso,
      lastSuccessAt:hasScored?nowIso:null,errorCode:null}};
  root.glow.weeks[envelope.weekDate]=week;
  return {duplicate:false,root,week,hasScored,scoredChanges,rosterChanges};
}
/**
 * deps are controlled exclusively by the existing server-side Scoring writer.
 * verifyAuthorizedReceipt MUST be backed by independently documented provider
 * credentials/contract. An envelope's own flags/headers never qualify it.
 */
export async function ingestAuthorizedLiveDelta(envelope,deps={}) {
  let writeAttempted=false;
  try{
    if(typeof deps.verifyAuthorizedReceipt!=='function' || typeof deps.getBinding!=='function'||
       typeof deps.readLeague!=='function'||typeof deps.applyWeek!=='function'||typeof deps.reviewedCrosswalk!=='function'||
       typeof deps.receiptNow!=='function')return fail('AUTHENTICATED_PROVIDER_ADAPTER_NOT_CONFIGURED');
    checkEnvelope(envelope);
    const nowIso=deps.receiptNow(),nowMs=Date.parse(nowIso);
    if(!Number.isFinite(nowMs))return fail('SERVER_RECEIPT_TIME_UNAVAILABLE');
    const bindingRows=await deps.getBinding({eventId:envelope.eventId,weekDate:envelope.weekDate});
    if(!Array.isArray(bindingRows)||bindingRows.length!==1)return fail('SINGLE_AUTHENTICATED_BINDING_REQUIRED');
    const binding=verifyBinding(bindingRows[0],envelope,nowMs);
    const digest=await sha256(canonical(envelope));
    const receipt=await deps.verifyAuthorizedReceipt({envelope,digest,binding});
    if(receipt?.verified!==true||!(/^[A-Za-z0-9._:/-]{5,128}$/).test(receipt.permissionReference||'')||
       receipt.sourceIdentity!==envelope.eventId||receipt.eventDate!==envelope.weekDate||
       receipt.sourceRoundId!==envelope.roundId||receipt.sourceCursor!==envelope.cursor||
       receipt.sourceUpdatedAt!==envelope.sourceUpdatedAt||receipt.envelopeDigest!==digest||
       !Array.isArray(receipt.scope)||receipt.scope.includes('read-in-progress-hole-scores')!==true||
       receipt.scope.includes('store-league-score-snapshots')!==true)
      return fail('SOURCE_AUTHORIZATION_OR_PROVENANCE_MISSING');
    const crosswalk=validateCrosswalk(envelope,await deps.reviewedCrosswalk({eventId:envelope.eventId,weekDate:envelope.weekDate}));
    const before=normalizeRead(await deps.readLeague());
    const plan=planDelta(before,envelope,crosswalk,receipt,nowIso,digest);
    if(plan.duplicate)return {status:'DUPLICATE_READBACK_VERIFIED',wrote:false,readbackVerified:true,
       sourceCursor:envelope.cursor,cartIntent:'NOT_REQUESTED'};
    const expected=plan.root;
    writeAttempted=true;
    let applied;
    try{
      applied=await deps.applyWeek({p_week_date:envelope.weekDate,
        p_expected_week:before.state_json.glow.weeks[envelope.weekDate],
        p_replacement_week:plan.week,p_expected_active_week:envelope.weekDate});
    }catch{
      // Unknown whether the provider committed. Never replay this source cursor.
      return {status:'WRITE_OUTCOME_AMBIGUOUS',wrote:null,readbackVerified:false,cartIntent:'NOT_REQUESTED'};
    }
    if(applied!==true&&applied?.applied!==true)return {status:'GUARDED_CAS_CONFLICT',wrote:false,readbackVerified:false,cartIntent:'NOT_REQUESTED'};
    let after;
    try{after=normalizeRead(await deps.readLeague());}
    catch{return {status:'ACKNOWLEDGED_BUT_READBACK_MISSING',wrote:true,readbackVerified:false,cartIntent:'NOT_REQUESTED'};}
    if(after.updated_at===before.updated_at || !same(after.state_json,expected))
      return {status:'ACKNOWLEDGED_BUT_READBACK_MISMATCH',wrote:true,readbackVerified:false,cartIntent:'NOT_REQUESTED'};
    return {status:'SAVED_AND_INDEPENDENTLY_VERIFIED',wrote:true,readbackVerified:true,sourceCursor:envelope.cursor,
      sourceRevision:after.updated_at,eventId:envelope.eventId,weekDate:envelope.weekDate,
      sourceUpdatedAt:envelope.sourceUpdatedAt,permissionReference:receipt.permissionReference,
      hasVerifiedScoredHoles:plan.hasScored,scoredChanges:plan.scoredChanges,rosterChanges:plan.rosterChanges,
      cartIntent:'NOT_REQUESTED',downstream:{owner:'CONTROLS_ONLY',eligibleForSeparateSourceReview:plan.hasScored,
        eventId:envelope.eventId,weekDate:envelope.weekDate,signedEnvelopeDigest:digest,
        sourceCursor:envelope.cursor,readbackRevision:after.updated_at}};
  }catch(error){
    if(writeAttempted)return {status:'POST_WRITE_UNVERIFIED',wrote:null,readbackVerified:false,cartIntent:'NOT_REQUESTED'};
    return fail(String(error?.code||'LIVE_DELTA_REJECTED'));
  }
}

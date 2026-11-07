import {buildGlowProposal, validateIdentityEvidence} from '../worker-private/udisc-glow-reconcile.mjs';
import {prepareGlowWeekSync} from './udisc-glow-sync.mjs';
import {selectGlowEventBinding,isHbnfGlowDoublesEventId} from './udisc-glow-event-bindings.mjs';
import {claimUdiscEventFetch,completeUdiscEventFetch,providerRetryAfterAt} from './udisc-glow-fetch-gate.review.mjs';
import {xlsxSha256,attachLocalSnapshotEvidence} from './udisc-glow-snapshot-mode.review.mjs';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
// Release candidate review copy. The historical installed-source snapshot is unchanged.
// Structured evidence only; callers may forward these minimal, identity-free events to
// existing Worker logs. A missing/throwing observer never affects scoring.
function captureBoundary(deps,stage,detail={}) {
  if(typeof deps?.capture!=='function')return;
  try {deps.capture(Object.freeze({schema:'hbnf.udisc.glow.boundary.v1',stage,...detail}));}
  catch { /* diagnostics cannot become a scoring dependency */ }
}
function stableJson(value){
  if(Array.isArray(value))return value.map(stableJson);
  if(value&&typeof value==='object')return Object.fromEntries(
    Object.keys(value).sort().map(key=>[key,stableJson(value[key])]));
  return value;
}
function sameJson(a,b){return JSON.stringify(stableJson(a))===JSON.stringify(stableJson(b));}

// Only attempt a relative-to-par scoreboard for holes with an independently
// saved par. The installed Cart v35 selector defaults missing pars to 3, which
// is unsafe for a new safari layout. Never source those pars from June's round.
export function qualifiedGlowScorePars(week) {
  if(!week||!Array.isArray(week.players))return {ready:false,reason:'week_missing'};
  const scored=new Set();
  for(const player of week.players) {
    if(player?.removed===true||!Array.isArray(player?.scores))continue;
    for(let i=0;i<Math.min(player.scores.length,18);i++) {
      if(String(player.scores[i]??'').trim())scored.add(i+1);
    }
  }
  if(!scored.size)return {ready:false,reason:'no_scored_holes'};
  const pars=week.scorecardText?.holePars;
  const missing=[...scored].filter(h=>{
    const raw=String(pars?.[String(h)]??'').trim();
    return !/^[1-9]$/.test(raw);
  });
  if(missing.length)return {ready:false,reason:'hole_pars_not_verified',missingCount:missing.length,scoredHoles:scored.size};
  return {ready:true,scoredHoles:scored.size};
}

function configFor(env) {
  if (env.UDISC_GLOW_ACCESS_APPROVED !== 'true') return {blocked:'source_access_disabled'};
  const supabaseUrl = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
  try { if (new URL(supabaseUrl).protocol !== 'https:') return {blocked:'credentials_not_configured'}; }
  catch { return {blocked:'credentials_not_configured'}; }
  if (!serviceKey) return {blocked:'credentials_not_configured'};
  return {supabaseUrl,serviceKey};
}

function requestHeaders(serviceKey) {
  return {apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json',Accept:'application/json'};
}

// Server-only handoff to the EXISTING Controls Track A Cart backend.
// Only its canonical source-fenced RPC may issue a Cart desired-state update;
// the request below never targets WLED, MQTT, Opal, or a Guest route.
export function sameLeagueRevision(a,b) {
  function micros(v) {
    const m=/^(\d{4}-\d\d-\d\d)[ T](\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(Z|[+-]\d\d(?::?\d\d)?)$/.exec(String(v||''));
    if(!m)return null;
    const zone=m[4]==='Z'?'Z':m[4].length===3?m[4]+':00':m[4].replace(/^([+-]\d\d)(\d\d)$/,'$1:$2');
    const ms=Date.parse(m[1]+'T'+m[2]+(m[3]?'.'+m[3]:'' )+zone);
    if(!Number.isFinite(ms))return null;
    const fraction=Number((m[3]||'').padEnd(6,'0'));
    return BigInt(ms)*1000n+BigInt(fraction%1000);
  }
  const x=micros(a),y=micros(b);
  return x!==null&&y!==null&&x===y;
}
export async function submitVerifiedGlowCartIntent(fetchImpl,config,saved) {
  // Applicable to the verified active event, not hardcoded to the prior Nov3 fixture.
  // The Cart backend independently rechecks week, source revision and signature.
  if(!isHbnfGlowDoublesEventId(saved?.eventId)||
     !/^20\d\d-\d\d-\d\d$/.test(saved?.weekDate||'')||
     Number.isNaN(Date.parse(saved.weekDate+'T12:00:00Z'))||
     new Date(saved.weekDate+'T12:00:00Z').getUTCDay()!==2||
     !/^[a-f0-9]{64}$/.test(String(saved?.signature||''))||
     !sameLeagueRevision(saved?.sourceRevision,saved?.sourceRevision)||
     !config?.supabaseUrl?.startsWith('https://')||!config?.serviceKey)
    return {status:'NOT_ACCEPTED',reason:'invalid_saved_score_proof'};
  try {
    const response=await fetchImpl(config.supabaseUrl+'/functions/v1/hbnf-cart-control',{
      method:'POST',redirect:'manual',cache:'no-store',
      headers:requestHeaders(config.serviceKey),
      body:JSON.stringify({action:'glow_scoreboard_intent',weekDate:saved.weekDate}),
      signal:AbortSignal.timeout(8000)
    });
    if(response.status!==202)return {status:'NOT_ACCEPTED',reason:'backend_not_admitted'};
    const ack=await response.json();
    if(!['COMMITTED','DUPLICATE'].includes(ack?.status)||
       ack?.relayStatus!=='PENDING_OPAL_PULL'||
       !/^[a-f0-9]{32}$/.test(String(ack?.scoreFingerprint||''))||
       !sameLeagueRevision(ack?.sourceRevision,saved.sourceRevision))
      return {status:'NOT_ACCEPTED',reason:'source_changed_or_unacknowledged'};
    return {status:ack.status,relayStatus:'PENDING_OPAL_PULL'};
  }catch{
    return {status:'NOT_ACCEPTED',reason:'backend_unreachable'};
  }
}

async function readGlow(fetchImpl, config) {
  const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/league_state?id=eq.1&select=state_json,updated_at`, {
    headers:requestHeaders(config.serviceKey),cache:'no-store',
  });
  if (!response.ok) throw Error(`Glow state read failed (${response.status}).`);
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0]?.state_json?.glow || !rows[0]?.updated_at) {
    throw Error('Glow state is missing or ambiguous.');
  }
  return {row:rows[0],root:rows[0].state_json,glow:rows[0].state_json.glow};
}

async function readActiveEventBinding(fetchImpl, config, now) {
  const instant = now.toISOString();
  const url = new URL(`${config.supabaseUrl}/rest/v1/hbnf_udisc_glow_event_bindings`);
  url.searchParams.set('select', 'event_id,event_date,window_start,window_end');
  url.searchParams.set('window_start', `lte.${instant}`);
  url.searchParams.set('window_end', `gte.${instant}`);
  const response = await fetchImpl(url, {headers:requestHeaders(config.serviceKey),cache:'no-store'});
  if (!response.ok) throw Error(`Glow event binding read failed (${response.status}).`);
  return selectGlowEventBinding(await response.json(), now);
}

async function recordFailure(fetchImpl, config, weekDate, code, attemptedAt) {
  try {
    const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/rpc/hbnf_record_udisc_glow_sync_status`, {
      method:'POST',headers:requestHeaders(config.serviceKey),
      body:JSON.stringify({p_week_date:weekDate,p_expected_active_week:weekDate,p_attempted_at:attemptedAt,p_error_code:code}),
    });
    if (!response.ok) return false;
    const result = await response.json();
    if (result?.recorded !== true) return false;
    const verified = await readGlow(fetchImpl, config);
    const status = verified.glow.weeks?.[weekDate]?.udiscSync?.status;
    return status?.state === 'failed' && Date.parse(status?.lastAttemptAt || '') === Date.parse(attemptedAt) && status?.errorCode === code;
  } catch { return false; }
}

async function readBounded(response, maxBytes = 12 * 1024 * 1024) {
  if (!response.body) throw Error('The score export has no body.');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const {done,value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw Error('The score export exceeds the safe size limit.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

// Post-save delivery and reconnect retries share the same saved-source guard.
// Source freshness is NOT a write: unchanged XLSX must not churn league_state.
export async function offerSavedGlowIntent({week,revision,signature,binding,now,onVerifiedSaved,deps}) {
  if(!onVerifiedSaved)return 'NOT_REQUESTED';
  const sync=week?.udiscSync;
  const success=Date.parse(sync?.status?.lastSuccessAt||'');
  if(sync?.source!=='UDisc event XLSX export'||
     sync?.eventId!==binding.eventId||sync?.weekDate!==binding.weekDate||
     sync?.latest?.signature!==signature||sync?.status?.state!=='fresh'||
     !Number.isFinite(success)||success>now.getTime()||
     now.getTime()-success>10*60_000) {
    captureBoundary(deps,'cart_intent_deferred',{reason:'saved_source_not_fresh'});
    return 'DEFERRED_SOURCE';
  }
  const parGate=qualifiedGlowScorePars(week);
  if(!parGate.ready) {
    captureBoundary(deps,'cart_intent_deferred',{reason:parGate.reason,missingCount:parGate.missingCount??0});
    return 'DEFERRED_METADATA';
  }
  try {
    const receipt=await onVerifiedSaved(Object.freeze({
      eventId:binding.eventId,weekDate:binding.weekDate,
      sourceRevision:revision,signature,scoredHoles:parGate.scoredHoles
    }));
    if((receipt?.status==='COMMITTED'||receipt?.status==='DUPLICATE')&&
       receipt?.relayStatus==='PENDING_OPAL_PULL') {
      captureBoundary(deps,'cart_intent',{accepted:true,result:receipt.status,relayStatus:'PENDING_OPAL_PULL'});
      return 'PENDING_OPAL_PULL';
    }
    captureBoundary(deps,'cart_intent',{accepted:false,result:'NOT_ACCEPTED'});
    return 'NOT_ACCEPTED';
  }catch{
    captureBoundary(deps,'cart_intent',{accepted:false,result:'UNAVAILABLE'});
    return 'NOT_ACCEPTED';
  }
}

export async function runApprovedGlowSync(env, deps = {}) {
  const now = deps.now?.() || new Date();
  const fetchImpl = deps.fetch || fetch;
  const config = configFor(env || {});
  if (config.blocked) return {disposition:config.blocked};
  const onVerifiedSaved = typeof deps.onVerifiedSaved==='function' ? deps.onVerifiedSaved
    : deps.enableCartBackend === true ? saved=>submitVerifiedGlowCartIntent(fetchImpl,config,saved) : null;

  // A single narrow event-config read runs each cron minute. No score state or
  // UDisc request is read outside a configured HBNF event window.
  const binding = await readActiveEventBinding(fetchImpl, config, now);
  if (!binding) {
    captureBoundary(deps,'event_window',{eligible:false});
    return {disposition:'outside_event_window'};
  }
  captureBoundary(deps,'event_window',{eligible:true,eventId:binding.eventId,weekDate:binding.weekDate});

  // Target and week checks happen before any request to UDisc.
  const {row,root,glow} = await readGlow(fetchImpl, config);
  if (glow.activeWeek !== binding.weekDate) return {disposition:'active_week_mismatch',date:binding.weekDate};
  const existingWeek = glow.weeks?.[binding.weekDate] || null;
  if (!existingWeek) return {disposition:'week_not_initialized',date:binding.weekDate};
  if (existingWeek.scoresLocked || (existingWeek.cards || []).some(card => card.finalized)) {
    return {disposition:'week_locked',date:binding.weekDate};
  }
  // Atomic, independently readback-verified server-side claim. This uses the
  // EXISTING cron; the DB gate enforces a >=5m cadence and is held until
  // event-end by default. Missing schema, RPC, lease or readback = NO UDisc GET.
  const claim = await claimUdiscEventFetch(fetchImpl,config,binding);
  if(!claim.allowed) {
    captureBoundary(deps,'source_gate',{allowed:false,eventId:binding.eventId});
    return {disposition:'source_backoff',date:binding.weekDate,cartIntent:'NOT_REQUESTED'};
  }
  captureBoundary(deps,'source_gate',{allowed:true,eventId:binding.eventId});
  const completion={outcome:'SOURCE_FAILED',httpStatus:null,retryAfterAt:null};
  const attemptedAt = now.toISOString();
  let casAttempted=false;
  try {
    // Event-specific, no-cache XLSX snapshots. A transient 502/503/504 or
    // connection failure receives at most ONE bounded same-run retry; 429 gets
    // no retry and a persisted local backoff. No undocumented UDisc cadence
    // or provider revision/cursor is inferred from HTTP response headers.
    let response;
    for(let attempt=0; attempt<2; attempt++) {
      try {
        response=await fetchImpl(`https://udisc.com/events/${binding.eventId}/leaderboard/export`, {
          headers:{Accept:XLSX_TYPE},redirect:'manual',cache:'no-store',
          signal:AbortSignal.timeout(8000),
        });
      }catch(error){
        if(attempt===0){await (deps.sleep|| (ms=>new Promise(resolve=>setTimeout(resolve,ms))))(350);continue;}
        throw Object.assign(Error('UDisc score export request timed out or failed.'),{code:'SOURCE_UNAVAILABLE'});
      }
      completion.httpStatus=response.status;
      // Both 429 and 503 Retry-After are persisted in the server gate, not
      // inferred as a provider cursor or stored in a Worker global.
      if((response.status===429||response.status===503)&&response.headers?.has('retry-after')) {
        completion.outcome='RATE_LIMITED';
        completion.retryAfterAt=providerRetryAfterAt(
          response.headers.get('retry-after'),deps.now?.()||new Date(),binding.windowEnd);
        throw Object.assign(Error('UDisc source deferred this request; no same-run retry.'),
          {code:'SOURCE_RATE_LIMITED'});
      }
      if([502,503,504].includes(response.status) && attempt===0){
        await (deps.sleep|| (ms=>new Promise(resolve=>setTimeout(resolve,ms))))(350);continue;
      }
      break;
    }
    const mime=(response.headers.get('content-type')||'').split(';',1)[0].trim().toLowerCase();
    captureBoundary(deps,'source_http',{status:response.status,xlsxContentType:mime===XLSX_TYPE});
    if(response.status===429){
      completion.outcome='RATE_LIMITED';
      throw Object.assign(Error('UDisc export rate-limited; no same-run retry.'),{code:'SOURCE_RATE_LIMITED'});
    }
    if(!response.ok || response.status>=300&&response.status<400 || mime!==XLSX_TYPE) {
      throw Object.assign(Error('UDisc score export unavailable or incorrect content type.'),{code:'SOURCE_UNAVAILABLE'});
    }
    const reported=Number(response.headers.get('content-length')||0);
    if(!Number.isFinite(reported)||reported<0||reported>12*1024*1024)
      throw Object.assign(Error('UDisc score export size invalid.'),{code:'SOURCE_PARSE_FAILED'});
    let bytes;
    try { bytes = await readBounded(response); }
    catch { throw Object.assign(Error('UDisc score export exceeds the safe size limit.'),{code:'SOURCE_PARSE_FAILED'}); }
    if (bytes.byteLength < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      throw Object.assign(Error('UDisc score export is invalid.'),{code:'SOURCE_PARSE_FAILED'});
    }
    // HBNF's observation clock is sampled *after* receiving the complete
    // bounded response. It is NEVER a claimed UDisc score-change timestamp.
    const receivedAt=deps.now?.() || new Date();
    if(!(receivedAt instanceof Date)||!Number.isFinite(receivedAt.getTime())||
       receivedAt.getTime()<Date.parse(binding.windowStart)||receivedAt.getTime()>Date.parse(binding.windowEnd))
      throw Object.assign(Error('Snapshot response arrived outside its bound event window.'),{code:'SOURCE_WINDOW_EXPIRED'});
    const locallyObservedAt=receivedAt.toISOString();
    const rawXlsxSha256=await xlsxSha256(bytes);
    const source = deps.source || await import('./udisc-glow-sync-runner.mjs');
    captureBoundary(deps,'source_xlsx_received',{bytes:bytes.byteLength});
    const workbook = bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
    const snapshot = await source.parseUdiscWorkbook(workbook,{eventId:binding.eventId,weekDate:binding.weekDate,observedAt:locallyObservedAt});
    captureBoundary(deps,'parser_succeeded',{eventId:binding.eventId,weekDate:binding.weekDate});
    const history = Object.values(glow.weeks || {}).flatMap(week => (week.players || []).flatMap(player => [player.partner1,player.partner2])).filter(Boolean);
    const evidence = source.validateIdentityEvidence({aliases:glow.playerAliases || {},historicalNames:history,tagEvidence:[]});
    const model = {eventId:binding.eventId,snapshots:[snapshot]};
    const decisions = source.exactAliasDecisions(model,evidence);
    const proposal = source.buildGlowProposal(model,evidence,decisions,{weekDate:binding.weekDate});
    // A card/roster can exist before anyone finishes hole 1. Even if a
    // spreadsheet includes valid participant rows, do not create scores,
    // teams or tag-related state based only on zero scored holes.
    const anyScoredHole=proposal.sourceProvenance?.rowEvidence?.some(row=>
      Array.isArray(row?.holeScores) && row.holeScores.some(score=>score!==null&&score!==''&&score!==undefined));
    if(!anyScoredHole) {
      captureBoundary(deps,'source_no_scores',{date:binding.weekDate,scoreWrite:false,cartIntent:false});
      completion.outcome='SUCCESS';
      return {disposition:'no_scores_yet',date:binding.weekDate,rawXlsxSha256,cartIntent:'NOT_REQUESTED'};
    }
    if (proposal.issues?.unresolvedIdentityCount || proposal.issues?.duplicateCanonicalTeamRows) {
      throw Object.assign(Error('Player names need a one-time review before scores can be applied.'),{code:'IDENTITY_REVIEW_REQUIRED'});
    }
    const prepared = await prepareGlowWeekSync(existingWeek,proposal,{aliases:evidence.aliases});
    if (!prepared.changed) {
      captureBoundary(deps,'unchanged',{weekDate:binding.weekDate,signature:prepared.signature,casApplied:false});
      // The original planner dedupes each four-minute Cart window; retry a
      // backend denial/reconnect using the SAME signed, persisted snapshot.
      // No new score CAS or failure-status mutation is permitted here.
      if(!onVerifiedSaved) {
        completion.outcome='SUCCESS';
        return {disposition:'unchanged',date:binding.weekDate,signature:prepared.signature,rawXlsxSha256};
      }
      const rechecked=await readGlow(fetchImpl,config);
      const persistedWeek=rechecked.glow.weeks?.[binding.weekDate];
      if(rechecked.glow.activeWeek!==binding.weekDate||
         !sameJson(persistedWeek,existingWeek)||
         persistedWeek?.udiscSync?.latest?.signature!==prepared.signature) {
        captureBoundary(deps,'cart_intent_deferred',{reason:'source_revision_or_week_changed'});
        return {disposition:'source_changed_no_write',date:binding.weekDate,rawXlsxSha256,cartIntent:'DEFERRED_SOURCE'};
      }
      captureBoundary(deps,'persisted_readback',{verified:true,signature:prepared.signature,revision:rechecked.row.updated_at,casApplied:false});
      const cartIntent=await offerSavedGlowIntent({week:persistedWeek,revision:rechecked.row.updated_at,
        signature:prepared.signature,binding,now:deps.now?.() || new Date(),onVerifiedSaved,deps});
      completion.outcome='SUCCESS';
      return {disposition:'unchanged',date:binding.weekDate,signature:prepared.signature,
        updatedAt:rechecked.row.updated_at,cartIntent};
    }
    // HBNF-local ordered revision advances ONLY for materially different
    // semantic XLSX snapshots that survive the guarded CAS and readback.
    // Rankings-only snapshots persist results, but never extend scored-hole
    // freshness or become eligible Cart score intents.
    const local=attachLocalSnapshotEvidence({before:existingWeek,prepared,sha256:rawXlsxSha256,
      observedAt:locallyObservedAt,eventId:binding.eventId,weekDate:binding.weekDate});
    casAttempted=true;
    captureBoundary(deps,'cas_requested',{weekDate:binding.weekDate,expectedRevision:row.updated_at});
    const rpc = await fetchImpl(`${config.supabaseUrl}/rest/v1/rpc/hbnf_apply_udisc_glow_week`, {
      method:'POST',headers:requestHeaders(config.serviceKey),
      body:JSON.stringify({p_week_date:binding.weekDate,p_expected_week:existingWeek,p_replacement_week:prepared.week,p_expected_active_week:glow.activeWeek ?? null}),
    });
    if (!rpc.ok) throw Object.assign(Error(`Glow score save failed (${rpc.status}).`),{code:'SAVE_CONFLICT'});
    const applied = await rpc.json();
    if (applied !== true && applied?.applied !== true) throw Object.assign(Error('Glow score save conflicted.'),{code:'SAVE_CONFLICT'});
    captureBoundary(deps,'cas_acknowledged',{applied:true});

    // Verify the exact event signature with an independent server GET.
    const verified = await readGlow(fetchImpl,config);
    const savedWeek=verified.glow.weeks?.[binding.weekDate];
    const saved=savedWeek?.udiscSync?.latest?.signature;
    // Signature alone is insufficient: an unrelated writer can preserve that
    // signature while changing scores. The acknowledged CAS must survive a
    // NEW server read with the full expected week still present.
    if (saved!==prepared.signature ||
        !sameJson(savedWeek,prepared.week) ||
        !Number.isFinite(Date.parse(verified.row.updated_at)) ||
        Date.parse(verified.row.updated_at)<Date.parse(row.updated_at)) {
      throw Object.assign(Error('Glow score save could not be independently verified.'),{code:'READBACK_MISMATCH'});
    }
    captureBoundary(deps,'persisted_readback',{verified:true,signature:saved,revision:verified.row.updated_at});
    // Saved week was independently reread after CAS; the backend owns a
    // SECOND source/Cart fence check and cannot use this as device acceptance.
    const cartIntent=await offerSavedGlowIntent({week:savedWeek,revision:verified.row.updated_at,
      signature:prepared.signature,binding,now:deps.now?.() || new Date(),onVerifiedSaved,deps});
    completion.outcome='SUCCESS';
    return {disposition:'updated',date:binding.weekDate,eventId:binding.eventId,signature:prepared.signature,
      rawXlsxSha256,hbnfLocalSequence:local.sequence,acceptedHoleChanges:local.acceptedChanges.length,
      teamCount:prepared.week.players.length,updatedAt:verified.row.updated_at,cartIntent};
  } catch (error) {
    const code=String(error?.code||'SYNC_FAILED');
    // UDisc's official first Nov3 event export is an empty A1 sheet. Do not
    // log a scoring failure to league_state or offer Cart for an ordinary
    // no-score event. This is not evidence that organizer setup failed.
    if(code==='EMPTY_EXPORT_NO_SCORES') {
      captureBoundary(deps,'source_no_scores',{date:binding.weekDate,scoreWrite:false,cartIntent:false});
      completion.outcome='SUCCESS';
      return {disposition:'empty_export_no_scores',date:binding.weekDate,cartIntent:'NOT_REQUESTED'};
    }
    // The CAS may have rejected a concurrent writer, or succeeded but its
    // readback disagreed. A second status-write RPC would race that writer
    // and can mask a real successful score save; never issue it in either case.
    if(casAttempted){
      captureBoundary(deps,'sync_failed',{code,failedStatusMutation:'skipped_after_cas_attempt'});
      throw error;
    }
    // Repeated missing/partial exports should not rewrite the shared scoring
    // root every minute with the same failure, or churn browser CAS revisions.
    const previous=existingWeek.udiscSync?.status;
    if(previous?.state==='failed'&&previous?.errorCode===code){
      captureBoundary(deps,'sync_failed',{code,failedStatusMutation:'deduped'});
      throw error;
    }
    const recorded=await recordFailure(fetchImpl,config,binding.weekDate,code,attemptedAt);
    captureBoundary(deps,'sync_failed',{code,failedStatusMutation:recorded?'recorded':'unverified'});
    if(!recorded)console.error('UDisc Glow failure status was not independently verified.');
    throw error;
  } finally {
    // Every claimed attempt releases only through the server's matching
    // one-time token. A failed finish/readback throws, leaving the pre-request
    // beyond-window hold intact (never silently retry the next cron minute).
    const confirmed=await completeUdiscEventFetch(
      fetchImpl,config,binding,claim.token,completion.outcome,
      completion.httpStatus,completion.retryAfterAt);
    captureBoundary(deps,'source_gate_finished',{confirmed:confirmed.confirmed,outcome:completion.outcome});
  }
}

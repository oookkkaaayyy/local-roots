import {buildGlowProposal, validateIdentityEvidence} from '../worker-private/udisc-glow-reconcile.mjs';
import {prepareGlowWeekSync} from './udisc-glow-sync.mjs';
import {selectGlowEventBinding} from './udisc-glow-event-bindings.mjs';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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

export async function runApprovedGlowSync(env, deps = {}) {
  const now = deps.now?.() || new Date();
  const fetchImpl = deps.fetch || fetch;
  const config = configFor(env || {});
  if (config.blocked) return {disposition:config.blocked};

  // A single narrow event-config read runs each cron minute. No score state or
  // UDisc request is read outside a configured HBNF event window.
  const binding = await readActiveEventBinding(fetchImpl, config, now);
  if (!binding) return {disposition:'outside_event_window'};

  // Target and week checks happen before any request to UDisc.
  const {row,root,glow} = await readGlow(fetchImpl, config);
  if (glow.activeWeek !== binding.weekDate) return {disposition:'active_week_mismatch',date:binding.weekDate};
  const existingWeek = glow.weeks?.[binding.weekDate] || null;
  if (!existingWeek) return {disposition:'week_not_initialized',date:binding.weekDate};
  if (existingWeek.scoresLocked || (existingWeek.cards || []).some(card => card.finalized)) {
    return {disposition:'week_locked',date:binding.weekDate};
  }

  const attemptedAt = now.toISOString();
  try {
    const response = await fetchImpl(`https://udisc.com/events/${binding.eventId}/leaderboard/export`, {
      headers:{Accept:XLSX_TYPE},redirect:'manual',
    });
    if (!response.ok || response.status >= 300 && response.status < 400 ||
        !(response.headers.get('content-type') || '').toLowerCase().includes(XLSX_TYPE)) {
      throw Object.assign(Error('UDisc score export unavailable.'),{code:'SOURCE_UNAVAILABLE'});
    }
    let bytes;
    try { bytes = await readBounded(response); }
    catch { throw Object.assign(Error('UDisc score export exceeds the safe size limit.'),{code:'SOURCE_PARSE_FAILED'}); }
    if (bytes.byteLength < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      throw Object.assign(Error('UDisc score export is invalid.'),{code:'SOURCE_PARSE_FAILED'});
    }
    const source = deps.source || await import('./udisc-glow-sync-runner.mjs');
    const workbook = bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
    const snapshot = await source.parseUdiscWorkbook(workbook,{eventId:binding.eventId,weekDate:binding.weekDate,observedAt:attemptedAt});
    const history = Object.values(glow.weeks || {}).flatMap(week => (week.players || []).flatMap(player => [player.partner1,player.partner2])).filter(Boolean);
    const evidence = source.validateIdentityEvidence({aliases:glow.playerAliases || {},historicalNames:history,tagEvidence:[]});
    const model = {eventId:binding.eventId,snapshots:[snapshot]};
    const decisions = source.exactAliasDecisions(model,evidence);
    const proposal = source.buildGlowProposal(model,evidence,decisions,{weekDate:binding.weekDate});
    if (proposal.issues?.unresolvedIdentityCount || proposal.issues?.duplicateCanonicalTeamRows) {
      throw Object.assign(Error('Player names need a one-time review before scores can be applied.'),{code:'IDENTITY_REVIEW_REQUIRED'});
    }
    const prepared = await prepareGlowWeekSync(existingWeek,proposal,{aliases:evidence.aliases});
    if (!prepared.changed) return {disposition:'unchanged',date:binding.weekDate,signature:prepared.signature};
    prepared.week.udiscSync.status = {state:'fresh',lastAttemptAt:attemptedAt,lastSuccessAt:attemptedAt,errorCode:null};
    const rpc = await fetchImpl(`${config.supabaseUrl}/rest/v1/rpc/hbnf_apply_udisc_glow_week`, {
      method:'POST',headers:requestHeaders(config.serviceKey),
      body:JSON.stringify({p_week_date:binding.weekDate,p_expected_week:existingWeek,p_replacement_week:prepared.week,p_expected_active_week:glow.activeWeek ?? null}),
    });
    if (!rpc.ok) throw Object.assign(Error(`Glow score save failed (${rpc.status}).`),{code:'SAVE_CONFLICT'});
    const applied = await rpc.json();
    if (applied !== true && applied?.applied !== true) throw Object.assign(Error('Glow score save conflicted.'),{code:'SAVE_CONFLICT'});

    // Verify the exact event signature with an independent server GET.
    const verified = await readGlow(fetchImpl,config);
    const saved = verified.glow.weeks?.[binding.weekDate]?.udiscSync?.latest?.signature;
    if (saved !== prepared.signature) throw Object.assign(Error('Glow score save could not be independently verified.'),{code:'SAVE_CONFLICT'});
    return {disposition:'updated',date:binding.weekDate,eventId:binding.eventId,signature:prepared.signature,teamCount:prepared.week.players.length,updatedAt:verified.row.updated_at};
  } catch (error) {
    const recorded = await recordFailure(fetchImpl,config,binding.weekDate,error?.code || 'SYNC_FAILED',attemptedAt);
    if (!recorded) console.error('UDisc Glow failure status was not independently verified.');
    throw error;
  }
}

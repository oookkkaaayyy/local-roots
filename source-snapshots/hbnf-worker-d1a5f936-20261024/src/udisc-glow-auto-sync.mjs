import {buildGlowProposal, validateIdentityEvidence} from '../worker-private/udisc-glow-reconcile.mjs';
import {prepareGlowWeekSync} from './udisc-glow-sync.mjs';

const EVENT_ID = /^hb-night-flyers-[a-z0-9-]+-[A-Za-z0-9]{4,12}$/;
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function configFor(env, now) {
  if (env.UDISC_GLOW_ACCESS_APPROVED !== 'true') return {blocked:'source_access_disabled'};
  const eventId = String(env.UDISC_GLOW_EVENT_ID || '');
  const weekDate = String(env.UDISC_GLOW_EVENT_DATE || '');
  const startMs = Date.parse(env.UDISC_GLOW_WINDOW_START || '');
  const endMs = Date.parse(env.UDISC_GLOW_WINDOW_END || '');
  if (!EVENT_ID.test(eventId) || !/^20\d\d-\d\d-\d\d$/.test(weekDate) ||
      !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs || endMs-startMs > 12*60*60*1000) {
    return {blocked:'event_window_not_configured'};
  }
  if (now.getTime() < startMs || now.getTime() > endMs) return {blocked:'outside_event_window'};
  const supabaseUrl = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
  try { if (new URL(supabaseUrl).protocol !== 'https:') return {blocked:'credentials_not_configured'}; }
  catch { return {blocked:'credentials_not_configured'}; }
  if (!serviceKey) return {blocked:'credentials_not_configured'};
  return {eventId,weekDate,supabaseUrl,serviceKey};
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
  const config = configFor(env || {}, now);
  if (config.blocked) return {disposition:config.blocked};

  // Target and week checks happen before any request to UDisc.
  const {row,root,glow} = await readGlow(fetchImpl, config);
  if (glow.activeWeek !== config.weekDate) return {disposition:'active_week_mismatch',date:config.weekDate};
  const existingWeek = glow.weeks?.[config.weekDate] || null;
  if (!existingWeek) return {disposition:'week_not_initialized',date:config.weekDate};
  if (existingWeek.scoresLocked || (existingWeek.cards || []).some(card => card.finalized)) {
    return {disposition:'week_locked',date:config.weekDate};
  }

  const attemptedAt = now.toISOString();
  try {
    const response = await fetchImpl(`https://udisc.com/events/${config.eventId}/leaderboard/export`, {
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
    const snapshot = await source.parseUdiscWorkbook(workbook,{eventId:config.eventId,weekDate:config.weekDate,observedAt:attemptedAt});
    const history = Object.values(glow.weeks || {}).flatMap(week => (week.players || []).flatMap(player => [player.partner1,player.partner2])).filter(Boolean);
    const evidence = source.validateIdentityEvidence({aliases:glow.playerAliases || {},historicalNames:history,tagEvidence:[]});
    const model = {eventId:config.eventId,snapshots:[snapshot]};
    const decisions = source.exactAliasDecisions(model,evidence);
    const proposal = source.buildGlowProposal(model,evidence,decisions,{weekDate:config.weekDate});
    if (proposal.issues?.unresolvedIdentityCount || proposal.issues?.duplicateCanonicalTeamRows) {
      throw Object.assign(Error('Player names need a one-time review before scores can be applied.'),{code:'IDENTITY_REVIEW_REQUIRED'});
    }
    const prepared = await prepareGlowWeekSync(existingWeek,proposal,{aliases:evidence.aliases});
    if (!prepared.changed) return {disposition:'unchanged',date:config.weekDate,signature:prepared.signature};
    prepared.week.udiscSync.status = {state:'fresh',lastAttemptAt:attemptedAt,lastSuccessAt:attemptedAt,errorCode:null};
    const rpc = await fetchImpl(`${config.supabaseUrl}/rest/v1/rpc/hbnf_apply_udisc_glow_week`, {
      method:'POST',headers:requestHeaders(config.serviceKey),
      body:JSON.stringify({p_week_date:config.weekDate,p_expected_week:existingWeek,p_replacement_week:prepared.week,p_expected_active_week:glow.activeWeek ?? null}),
    });
    if (!rpc.ok) throw Object.assign(Error(`Glow score save failed (${rpc.status}).`),{code:'SAVE_CONFLICT'});
    const applied = await rpc.json();
    if (applied !== true && applied?.applied !== true) throw Object.assign(Error('Glow score save conflicted.'),{code:'SAVE_CONFLICT'});

    // Verify the exact event signature with an independent server GET.
    const verified = await readGlow(fetchImpl,config);
    const saved = verified.glow.weeks?.[config.weekDate]?.udiscSync?.latest?.signature;
    if (saved !== prepared.signature) throw Object.assign(Error('Glow score save could not be independently verified.'),{code:'SAVE_CONFLICT'});
    return {disposition:'updated',date:config.weekDate,signature:prepared.signature,teamCount:prepared.week.players.length,updatedAt:verified.row.updated_at};
  } catch (error) {
    const recorded = await recordFailure(fetchImpl,config,config.weekDate,error?.code || 'SYNC_FAILED',attemptedAt);
    if (!recorded) console.error('UDisc Glow failure status was not independently verified.');
    throw error;
  }
}

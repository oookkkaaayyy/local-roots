import {parseUdiscGlowEvents} from './udisc-glow-events.mjs';
export {parseUdiscGlowEvents};

const EVENT_ID = /^hb-night-flyers-[a-z0-9-]+-[A-Za-z0-9]{4,12}$/;
const EXPORT_PATH = '/api/udisc-glow/export';
const EVENTS_PATH = '/api/udisc-glow/events';
const SCHEDULE_URL = 'https://udisc.com/leagues/hb-night-flyers-he7y5I/schedule';
const MAX_EXPORT_BYTES = 12 * 1024 * 1024;
const MAX_SCHEDULE_BYTES = 2 * 1024 * 1024;
const GLOW_SYNC_PATH = '/internal/udisc-glow-sync';

const errorResponse = (status, message, extraHeaders = {}) => new Response(`${message}\n`, {
  status,
  headers: {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  },
});

async function readBounded(response, maxBytes = MAX_EXPORT_BYTES) {
  if (!response.body) throw new Error('The export response has no body.');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error('The export exceeds the response size limit.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function handleUdiscGlowEvents(request, fetchImpl = fetch) {
  const url = new URL(request.url);
  if (request.method !== 'GET') return errorResponse(405, 'Method not allowed.', {'Allow':'GET'});
  if (url.pathname !== EVENTS_PATH) return errorResponse(404, 'Not found.');
  if (url.search || [...url.searchParams.keys()].length) return errorResponse(400, 'Invalid schedule request.');
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return errorResponse(403, 'Request origin not allowed.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    let upstream;
    try {
      upstream = await fetchImpl(SCHEDULE_URL, {
        method:'GET', headers:{Accept:'text/html'}, redirect:'manual', signal:controller.signal,
        cf:{cacheTtl:120, cacheEverything:true},
      });
    } catch { return errorResponse(502, 'UDisc events are temporarily unavailable.'); }
    if (upstream.status >= 300 && upstream.status < 400) return errorResponse(502, 'UDisc redirected the schedule; request stopped.');
    if (!upstream.ok) return errorResponse(502, `UDisc schedule unavailable (${upstream.status}).`);
    if (!(upstream.headers.get('content-type') || '').toLowerCase().includes('text/html')) return errorResponse(502, 'UDisc did not return a schedule page.');
    let bytes;
    try { bytes = await readBounded(upstream, MAX_SCHEDULE_BYTES); } catch { return errorResponse(502, 'UDisc schedule exceeds the size limit.'); }
    let html;
    try { html = new TextDecoder('utf-8', {fatal:true}).decode(bytes); } catch { return errorResponse(502, 'UDisc schedule text could not be read.'); }
    let events;
    try { events = parseUdiscGlowEvents(html); } catch { return errorResponse(502, 'UDisc schedule format was not recognized.'); }
    return new Response(JSON.stringify({events, observedAt:new Date().toISOString()}), {
      status:200, headers:{'Cache-Control':'public, max-age=120','Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff'},
    });
  } finally { clearTimeout(timeout); }
}

function safeFilename(response, eventId) {
  const header = response.headers.get('content-disposition') || '';
  const raw = header.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i)?.[1] || `${eventId}.xlsx`;
  const decoded = raw.replace(/%[0-9a-f]{2}/gi, token => {
    try { return decodeURIComponent(token); } catch { return ''; }
  });
  return decoded.split(/[\\/]/).pop().replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 160) || `${eventId}.xlsx`;
}

export async function handleUdiscExport(request, fetchImpl = fetch) {
  const requestUrl = new URL(request.url);
  if (request.method !== 'GET') return errorResponse(405, 'Method not allowed.', {'Allow': 'GET'});
  if (requestUrl.pathname !== EXPORT_PATH) return errorResponse(404, 'Not found.');
  if ([...requestUrl.searchParams.keys()].some(key => key !== 'event') || requestUrl.searchParams.getAll('event').length !== 1) {
    return errorResponse(400, 'Invalid event request.');
  }
  const eventId = requestUrl.searchParams.get('event') || '';
  if (!EVENT_ID.test(eventId)) return errorResponse(400, 'Invalid HB Night Flyers event.');

  const origin = request.headers.get('origin');
  if (origin && origin !== requestUrl.origin) return errorResponse(403, 'Request origin not allowed.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let upstream;
  try {
    let networkError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        upstream = await fetchImpl(`https://udisc.com/events/${eventId}/leaderboard/export`, {
          method: 'GET',
          headers: {Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},
          redirect: 'manual',
          signal: controller.signal,
        });
        networkError = null;
        break;
      } catch (error) {
        networkError = error;
        if (attempt === 0 && !controller.signal.aborted) await new Promise(resolve => setTimeout(resolve, 350));
      }
    }
    if (networkError) return errorResponse(502, 'UDisc is temporarily unavailable. Please try again.');

    if (upstream.status >= 300 && upstream.status < 400) return errorResponse(502, 'UDisc redirected the export; request stopped.');
    if (!upstream.ok) return errorResponse(502, `UDisc export unavailable (${upstream.status}).`);
    if (!(upstream.headers.get('content-type') || '').toLowerCase().includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')) {
      return errorResponse(502, 'UDisc did not return an XLSX export.');
    }

    let bytes;
    try { bytes = await readBounded(upstream); }
    catch (error) { return errorResponse(502, error.message); }
    if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return errorResponse(502, 'UDisc export is not a valid XLSX archive.');

    const filename = safeFilename(upstream, eventId);
    return new Response(bytes, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(bytes.byteLength),
        'X-Content-Type-Options': 'nosniff',
        'X-UDisc-Filename': filename,
        'X-Source-Observed-At': new Date().toISOString(),
        'X-Source-Event': eventId,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

/** Authenticated, cron-only live sync. This endpoint is never exposed publicly. */
export async function runGlowSync(env, deps = {}) {
  const now = deps.now?.() || new Date();
  const localDate = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const fetchImpl = deps.fetch || fetch;
  const source = deps.source || await import('./udisc-glow-sync-runner.mjs');
  const scheduleResponse = await fetchImpl(SCHEDULE_URL, {headers:{Accept:'text/html'},redirect:'manual'});
  if (!scheduleResponse.ok || scheduleResponse.status >= 300 && scheduleResponse.status < 400) throw Error('UDisc schedule unavailable.');
  if (!(scheduleResponse.headers.get('content-type') || '').toLowerCase().includes('text/html')) throw Error('UDisc schedule response was not HTML.');
  const scheduleBytes = await readBounded(scheduleResponse, MAX_SCHEDULE_BYTES);
  const scheduleHtml = new TextDecoder('utf-8',{fatal:true}).decode(scheduleBytes);
  const todays = source.parseUdiscGlowEvents(scheduleHtml).filter(event => event.date === localDate);
  if (todays.length !== 1) return {disposition:todays.length ? 'multiple_events' : 'no_event',eventCount:todays.length};
  const event = todays[0];
  const exportResponse = await fetchImpl(`https://udisc.com/events/${event.eventId}/leaderboard/export`, {headers:{Accept:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},redirect:'manual'});
  if (!exportResponse.ok || exportResponse.status >= 300 && exportResponse.status < 400 || !(exportResponse.headers.get('content-type') || '').toLowerCase().includes('spreadsheetml.sheet')) throw Error('UDisc score export unavailable.');
  const boundedWorkbook = await readBounded(exportResponse, MAX_EXPORT_BYTES);
  if (boundedWorkbook.byteLength < 22) throw Error('UDisc score export size is invalid.');
  const workbookBytes = boundedWorkbook.buffer.slice(boundedWorkbook.byteOffset,boundedWorkbook.byteOffset+boundedWorkbook.byteLength);
  const snapshot = await source.parseUdiscWorkbook(workbookBytes, {eventId:event.eventId,weekDate:event.date,observedAt:new Date().toISOString()});
  const supabaseUrl = String(env.SUPABASE_URL || '').replace(/\/$/,'');
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw Error('Server sync credentials are not configured.');
  const headers = {apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json',Accept:'application/json'};
  const read = await fetchImpl(`${supabaseUrl}/rest/v1/league_state?id=eq.1&select=state_json`, {headers,cache:'no-store'});
  if (!read.ok) throw Error(`Glow state read failed (${read.status}).`);
  const rows = await read.json();
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0]?.state_json?.glow) throw Error('Glow state is missing or ambiguous.');
  const root = rows[0].state_json;
  const glow = root.glow;
  // Never let a late, missing, or misdated UDisc export change which Glow
  // week the site displays. Sync only the week already selected in Glow.
  if (glow.activeWeek !== event.date) return {disposition:'active_week_mismatch',date:event.date};
  const existingWeek = glow.weeks?.[event.date] || null;
  if (!existingWeek) return {disposition:'week_not_initialized',date:event.date};
  const history = Object.values(glow.weeks || {}).flatMap(week => (week.players || []).flatMap(player => [player.partner1,player.partner2])).filter(Boolean);
  const evidence = source.validateIdentityEvidence({aliases:glow.playerAliases || {},historicalNames:history,tagEvidence:[]});
  const model = {eventId:event.eventId,snapshots:[snapshot]};
  const decisions = source.exactAliasDecisions(model,evidence);
  const proposal = source.buildGlowProposal(model,evidence,decisions,{weekDate:event.date});
  if (proposal.issues?.unresolvedIdentityCount || proposal.issues?.duplicateCanonicalTeamRows) throw Error('Player names need a one-time review before scores can be applied.');
  const prepared = await source.prepareGlowWeekSync(existingWeek,proposal,{aliases:evidence.aliases});
  if (!prepared.changed) return {disposition:'unchanged',date:event.date,signature:prepared.signature};
  const rpc = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/hbnf_apply_udisc_glow_week`, {method:'POST',headers,body:JSON.stringify({p_week_date:event.date,p_expected_week:existingWeek,p_replacement_week:prepared.week,p_expected_active_week:glow.activeWeek ?? null})});
  if (!rpc.ok) throw Error(`Glow score save failed (${rpc.status}).`);
  const result = await rpc.json();
  if (result !== true && result?.applied !== true) throw Error('Glow score save conflicted; retry on the next scheduled refresh.');
  return {disposition:'updated',date:event.date,signature:prepared.signature,teamCount:prepared.week.players.length};
}

export default {
  fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === EXPORT_PATH || path === EVENTS_PATH || path === GLOW_SYNC_PATH) return errorResponse(404, 'Not found.');
    return env.ASSETS.fetch(request);
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runGlowSync(env).catch(error => console.error('UDisc Glow sync skipped:', error?.message || 'unexpected error')));
  },
};

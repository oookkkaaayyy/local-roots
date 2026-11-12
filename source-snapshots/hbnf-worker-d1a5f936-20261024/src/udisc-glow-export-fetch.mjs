import {isHbnfGlowEventId} from './udisc-glow-event-bindings.mjs';

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const HOST = 'udisc.com';

function exportUrl(eventId) {
  return `https://${HOST}/events/${eventId}/leaderboard/export`;
}

// UDisc may rename an event slug (for example hb-glow-doubles-X becomes
// hb-night-flyers-hb-glow-doubles-X) and answer the old id with a 302. Follow at
// most one redirect, and only to the same host, forced to https, for an HBNF
// Glow event leaderboard export path. Anything else is treated as unavailable.
export function resolveExportRedirect(location, eventId) {
  let target;
  try { target = new URL(location, exportUrl(eventId)); } catch { return null; }
  if (target.hostname !== HOST || target.username || target.password || (target.port && target.port !== '443')) return null;
  const match = /^\/events\/([^/]+)\/leaderboard\/export$/.exec(target.pathname);
  if (!match || !isHbnfGlowEventId(match[1]) || target.search) return null;
  return exportUrl(match[1]);
}

export async function fetchUdiscExport(fetchImpl, eventId) {
  let url = exportUrl(eventId);
  for (let hop = 0; hop < 2; hop++) {
    const response = await fetchImpl(url, {headers: {Accept: XLSX_TYPE}, redirect: 'manual'});
    if (response.status >= 300 && response.status < 400 && hop === 0) {
      const next = resolveExportRedirect(response.headers.get('location') || '', eventId);
      if (!next) break;
      url = next;
      continue;
    }
    if (response.ok && (response.headers.get('content-type') || '').toLowerCase().includes(XLSX_TYPE)) return response;
    break;
  }
  throw Object.assign(Error('UDisc score export unavailable.'), {code: 'SOURCE_UNAVAILABLE'});
}

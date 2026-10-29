/** Read-only client for the local rehearsal proxy around UDisc's event-bound XLSX export. */
export function udiscEventSlug(value) {
  const raw = String(value ?? '').trim();
  let slug = raw;
  if (/^https:\/\//i.test(raw)) {
    const url = new URL(raw);
    if (url.hostname !== 'udisc.com' && url.hostname !== 'www.udisc.com') throw Error('Use an UDisc event link.');
    const match = url.pathname.match(/^\/events\/([^/]+)(?:\/|$)/);
    if (!match) throw Error('The link must point to a UDisc event.');
    slug = match[1];
  }
  if (!/^hb-night-flyers-[a-z0-9-]+-[A-Za-z0-9]{4,12}$/.test(slug)) throw Error('This rehearsal only accepts HB Night Flyers event links.');
  return slug;
}

/** Read only the bounded HBNF Glow event choices from the same-origin schedule endpoint. */
export async function fetchUdiscGlowEvents(fetchImpl = fetch, origin = globalThis.location?.origin || 'http://127.0.0.1:8767') {
  const endpoint = new URL('/api/udisc-glow/events', origin);
  const response = await fetchImpl(endpoint, {headers:{Accept:'application/json'},cache:'no-store'});
  if (!response.ok) throw Error(`UDisc events request failed (${response.status}).`);
  const payload = await response.json();
  if (!Array.isArray(payload?.events)) throw Error('UDisc returned an invalid event list.');
  return payload.events.map(event => {
    const eventId = udiscEventSlug(event?.eventId);
    if (!/glow/i.test(eventId) || !/^\d{4}-\d{2}-\d{2}$/.test(String(event?.date||''))) throw Error('UDisc returned an invalid Glow event.');
    return Object.freeze({eventId,date:String(event.date),title:String(event.title||''),url:`https://udisc.com/events/${eventId}/leaderboard`});
  });
}

export async function fetchUdiscExport(eventLink, fetchImpl = fetch, origin = globalThis.location?.origin || 'http://127.0.0.1:8767') {
  const eventId = udiscEventSlug(eventLink);
  const endpoint = new URL('/api/udisc-glow/export', origin);
  endpoint.searchParams.set('event', eventId);
  const response = await fetchImpl(endpoint, { headers: { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, cache: 'no-store' });
  if (!response.ok) throw Error(`UDisc export request failed (${response.status}).`);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('spreadsheetml.sheet')) throw Error('UDisc did not return an XLSX event export.');
  return Object.freeze({ eventId, filename: response.headers.get('x-udisc-filename') || '', observedAt: response.headers.get('x-source-observed-at') || '', bytes: await response.arrayBuffer() });
}

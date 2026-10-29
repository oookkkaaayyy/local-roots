const EVENT_ID = /^hb-night-flyers-[a-z0-9-]+-[A-Za-z0-9]{4,12}$/;
const EXPORT_PATH = '/api/udisc-glow/export';
const MAX_EXPORT_BYTES = 12 * 1024 * 1024;

const errorResponse = (status, message, extraHeaders = {}) => new Response(`${message}\n`, {
  status,
  headers: {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  },
});

async function readBounded(response) {
  if (!response.body) throw new Error('The export response has no body.');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_EXPORT_BYTES) {
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

export default {
  fetch(request, env) {
    if (new URL(request.url).pathname === EXPORT_PATH) return handleUdiscExport(request);
    return env.ASSETS.fetch(request);
  },
};

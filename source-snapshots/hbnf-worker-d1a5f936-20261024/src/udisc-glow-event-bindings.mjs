const NEW_HBNF_GLOW_EVENT_ID = /^hb-glow-doubles-[A-Za-z0-9]{6}$/;
const DATE = /^20\d{2}-\d{2}-\d{2}$/;
const ISO_INSTANT = /^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_WINDOW_MS = 12 * 60 * 60 * 1000;

export function isHbnfGlowDoublesEventId(value) {
  return typeof value === 'string' && (NEW_HBNF_GLOW_EVENT_ID.test(value) || /^hb-night-flyers-hb-glow-doubles(?:-[a-z0-9]+)*-[A-Za-z0-9]{6}$/.test(value));
}

export function isHbnfGlowEventId(value) {
  return isHbnfGlowDoublesEventId(value) || (typeof value === 'string' && /^hb-night-flyers-hb-glow-monthly-[A-Za-z0-9]{6}$/.test(value));
}

function isDate(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function localDate(instant) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(instant));
}

export function validateGlowEventBinding(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Glow event binding is invalid.');
  const eventId = String(row.event_id ?? row.eventId ?? '');
  const weekDate = String(row.event_date ?? row.weekDate ?? '');
  const windowStart = String(row.window_start ?? row.windowStart ?? '');
  const windowEnd = String(row.window_end ?? row.windowEnd ?? '');
  const startMs = Date.parse(windowStart);
  const endMs = Date.parse(windowEnd);
  if (!isHbnfGlowDoublesEventId(eventId) || !isDate(weekDate) || new Date(`${weekDate}T12:00:00.000Z`).getUTCDay() !== 2 ||
      !ISO_INSTANT.test(windowStart) || !ISO_INSTANT.test(windowEnd) || !Number.isFinite(startMs) || !Number.isFinite(endMs) ||
      endMs <= startMs || endMs - startMs > MAX_WINDOW_MS || localDate(startMs) !== weekDate || localDate(endMs) !== weekDate) {
    throw new Error('Glow event binding identity, Tuesday date, or local event window is invalid.');
  }
  return {eventId, weekDate, windowStart: new Date(startMs).toISOString(), windowEnd: new Date(endMs).toISOString()};
}

export function selectGlowEventBinding(rows, now = new Date()) {
  if (!Array.isArray(rows)) throw new Error('Glow event binding read is invalid.');
  if (rows.length === 0) return null;
  if (rows.length !== 1) throw new Error('More than one HBNF Glow event is bound to the active window.');
  const binding = validateGlowEventBinding(rows[0]);
  const instant = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(instant) || instant < Date.parse(binding.windowStart) || instant > Date.parse(binding.windowEnd)) return null;
  return binding;
}

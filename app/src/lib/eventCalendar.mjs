const encoder = new TextEncoder();

function calendarDate(value) {
  return value.replaceAll('-', '');
}

function calendarTimestamp(value = new Date()) {
  return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function addDays(value, days) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function localDateTimeToIso(date, time, timeZone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}(?::\d{2})?$/.test(time)) {
    throw new RangeError('Event date or local time is invalid');
  }
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute, second = 0] = time.split(':').map(Number);
  const wallClock = Date.UTC(year, month - 1, day, hour, minute, second);
  let instant = wallClock;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(({ type, value }) => [type, value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const correction = wallClock - represented;
    instant += correction;
    if (correction === 0) break;
  }

  const check = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(({ type, value }) => [type, value]));
  if (Number(check.year) !== year || Number(check.month) !== month || Number(check.day) !== day
      || Number(check.hour) !== hour || Number(check.minute) !== minute || Number(check.second) !== second) {
    throw new RangeError('Local event time does not exist in the specified time zone');
  }
  return new Date(instant).toISOString();
}

function calendarDateTime(date, time, timeZone) {
  return localDateTimeToIso(date, time, timeZone).replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeCalendarText(value) {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function foldCalendarLine(line) {
  const segments = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const charBytes = encoder.encode(char).length;
    const limit = segments.length ? 74 : 75;
    if (current && bytes + charBytes > limit) {
      segments.push(current);
      current = char;
      bytes = charBytes;
    } else {
      current += char;
      bytes += charBytes;
    }
  }
  if (current || !segments.length) segments.push(current);
  return segments.map((segment, index) => index ? ` ${segment}` : segment).join('\r\n');
}

export function buildCalendarFile(event, now = new Date()) {
  const detailUrl = `https://localrootsdg.com/events/${encodeURIComponent(event.slug)}`;
  const location = [event.course_name || event.venue_name, event.city, event.county ? `${event.county} County` : null].filter(Boolean).join(', ');
  const description = [event.club_host ? `Hosted by ${event.club_host}` : null, event.td_names?.length ? `TD: ${event.td_names.join(', ')}` : null, `Event details: ${detailUrl}`].filter(Boolean).join('\n');
  const timed = Boolean(event.start_time_local);
  const start = timed ? calendarDateTime(event.start_date, event.start_time_local, event.timezone) : null;
  const end = timed && event.end_time_local ? calendarDateTime(event.end_date, event.end_time_local, event.timezone) : null;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Local Roots//Disc Golf Events//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${event.id}@localrootsdg.com`, `DTSTAMP:${calendarTimestamp(now)}`,
    timed ? `DTSTART:${start}` : `DTSTART;VALUE=DATE:${calendarDate(event.start_date)}`,
    end ? `DTEND:${end}` : (!timed ? `DTEND;VALUE=DATE:${calendarDate(addDays(event.end_date, 1))}` : null),
    `SUMMARY:${escapeCalendarText(event.name)}`,
    location ? `LOCATION:${escapeCalendarText(location)}` : null,
    `DESCRIPTION:${escapeCalendarText(description)}`,
    `URL:${detailUrl}`, 'END:VEVENT', 'END:VCALENDAR', '',
  ];
  return lines.filter((line) => line != null).map(foldCalendarLine).join('\r\n');
}

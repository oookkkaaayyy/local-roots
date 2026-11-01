import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../app/src/lib/eventCalendar.mjs', import.meta.url), 'utf8');
const calendar = await import('../app/src/lib/eventCalendar.mjs');
const base = {
  id: 'event-1', slug: 'hbnf-glow-2026-11-03', name: 'HB Night Flyers Glow Doubles',
  start_date: '2026-11-03', end_date: '2026-11-03', timezone: 'America/Los_Angeles',
  start_time_local: '17:30', end_time_local: '21:00', city: 'Huntington Beach',
  course_name: 'Huntington Beach Central Park Disc Golf Course', county: 'Orange',
  club_host: 'HB Night Flyers', td_names: [],
};

test('timed Glow calendar entries convert both local times through Pacific DST rules', () => {
  const output = calendar.buildCalendarFile(base, new Date('2026-11-01T12:00:00Z'));
  assert.match(output, /DTSTART:20261104T013000Z/);
  assert.match(output, /DTEND:20261104T050000Z/);
  assert.doesNotMatch(output, /VALUE=DATE/);
});

test('timed event with missing end time stays timed without inventing a duration', () => {
  const output = calendar.buildCalendarFile({ ...base, end_time_local: null }, new Date('2026-11-01T12:00:00Z'));
  assert.match(output, /DTSTART:20261104T013000Z/);
  assert.doesNotMatch(output, /DTEND/);
});

test('untimed event remains an all-day entry with exclusive next-day end date', () => {
  const output = calendar.buildCalendarFile({ ...base, start_time_local: null, end_time_local: null }, new Date('2026-11-01T12:00:00Z'));
  assert.match(output, /DTSTART;VALUE=DATE:20261103/);
  assert.match(output, /DTEND;VALUE=DATE:20261104/);
});

test('nonexistent daylight-saving local clock times fail instead of generating a false instant', () => {
  assert.throws(() => calendar.buildCalendarFile({ ...base, start_date: '2026-03-08', end_date: '2026-03-08', start_time_local: '02:30', end_time_local: null }), /does not exist/);
});

test('calendar encoder continues to fold UTF-8 lines at the octet boundary', () => {
  assert.ok(source.includes('encoder.encode(char).length'));
  assert.ok(source.includes('const limit = segments.length ? 74 : 75'));
});

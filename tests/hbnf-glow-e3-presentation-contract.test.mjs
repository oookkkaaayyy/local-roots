import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildCalendarFile, localDateTimeToIso } from '../app/src/lib/eventCalendar.mjs';
import { knownVerifiedGlowDates, verifiedGlowFacts } from '../supabase/functions/lr-sync-hbnf/verified-glow-facts.mjs';

function stamp(value) {
  return value.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

test('E3 all eight dated source facts produce real Pacific calendar times and venue, without guessed registration', () => {
  const dates = knownVerifiedGlowDates();
  assert.equal(dates.length, 8);
  for (const date of dates) {
    const facts = verifiedGlowFacts(date);
    const event = {
      id: 'dbe6ff08-ea2c-445c-9895-f0bca2a69192',
      slug: `hbnf-glow-${date}`,
      name: facts.name,
      start_date: date,
      end_date: date,
      timezone: facts.timezone,
      course_name: facts.course_name,
      venue_name: null,
      city: facts.city,
      county: facts.county,
      club_host: 'HB Night Flyers',
      td_names: [],
    };
    const ics = buildCalendarFile(event, new Date('2026-11-05T07:21:29Z')).replace(/\r\n /g, '');
    assert.ok(ics.includes(`DTSTART:${stamp(localDateTimeToIso(date, '17:30', facts.timezone))}`), date);
    assert.ok(ics.includes(`DTEND:${stamp(localDateTimeToIso(date, '21:00', facts.timezone))}`), date);
    assert.ok(ics.includes('SUMMARY:HB Night Flyers Glow Doubles'), date);
    assert.ok(ics.includes('Huntington Beach Central Park Disc Golf Course'), date);
    assert.ok(ics.includes(`URL:https://localrootsdg.com/events/hbnf-glow-${date}`), date);
    assert.equal(Object.hasOwn(facts, 'registration_url'), false, date);
    assert.equal(Object.hasOwn(facts, 'results_url'), false, date);
  }
});

test('E3 source is used by both observed and confirmed HBNF schedule paths; current cards and detail render structured fields', async () => {
  const index = await readFile(new URL('../supabase/functions/lr-sync-hbnf/index.ts', import.meta.url), 'utf8');
  const cards = await readFile(new URL('../app/src/pages/EventsPage.tsx', import.meta.url), 'utf8');
  const detail = await readFile(new URL('../app/src/pages/EventDetailPage.tsx', import.meta.url), 'utf8');
  const rpc = await readFile(new URL('../supabase/migrations/20261101070000_event_detail_fields_and_provenance.sql', import.meta.url), 'utf8');
  assert.ok(index.includes('const verifiedFacts = tuesdayGlow ? verifiedGlowFacts(date) : null'), 'observed league week');
  assert.ok(index.includes(': verifiedGlowFacts(date)'), 'organizer-confirmed scheduled week');
  assert.ok(index.includes('lr_apply_authoritative_candidate'), 'candidate-to-database authority');
  assert.ok(rpc.includes('start_time_local') && rpc.includes('entry_fee_amount') && rpc.includes('official_url'));
  for (const page of [cards, detail]) {
    assert.ok(page.includes('eventTimeLabel(event)'));
    assert.ok(page.includes('eventFeeLabel(event)'));
    assert.ok(page.includes('event.format'));
    assert.ok(page.includes('event.official_url'));
    assert.ok(page.includes('downloadEventCalendar'));
  }
});

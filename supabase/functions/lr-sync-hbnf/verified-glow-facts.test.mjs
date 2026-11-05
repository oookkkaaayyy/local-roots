import test from "node:test";
import assert from "node:assert/strict";
import { knownNovemberGlowDates, knownVerifiedGlowDates, verifiedGlowFacts } from "./verified-glow-facts.mjs";

test("the three individually verified November Glow listings retain their exact evidence URLs", () => {
  assert.deepEqual(knownNovemberGlowDates(), ["2026-11-03", "2026-11-10", "2026-11-17"]);
  assert.equal(verifiedGlowFacts("2026-11-03").official_url, "https://udisc.com/events/hb-night-flyers-hb-glow-doubles-tAP8Y5/about");
  assert.equal(verifiedGlowFacts("2026-11-10").official_url, "https://udisc.com/events/hb-glow-doubles-af85rU/about");
  assert.equal(verifiedGlowFacts("2026-11-17").official_url, "https://udisc.com/events/hb-glow-doubles-C1mFl8/about");
});

test("verified listings expose only confirmed doubles, course, time, and fee facts", () => {
  const event = verifiedGlowFacts("2026-11-10");
  assert.equal(event.name, "HB Night Flyers Glow Doubles");
  assert.equal(event.event_type, "doubles");
  assert.equal(event.format, "Doubles");
  assert.deepEqual(event.format_details, { registration_mode: "Individual" });
  assert.equal(event.course_name, "Huntington Beach Central Park Disc Golf Course");
  assert.equal(event.course_url, "https://udisc.com/courses/huntington-beach-central-park-A9Fe");
  assert.equal(event.start_time_local, "17:30");
  assert.equal(event.end_time_local, "21:00");
  assert.equal(event.timezone, "America/Los_Angeles");
  assert.equal(event.entry_fee_amount, 10);
  assert.equal(event.entry_fee_currency, "USD");
  assert.equal(event.entry_fee_unit, "person");
  assert.deepEqual(event.fee_breakdown.map(({ label, amount }) => [label, amount]), [["Play", 7], ["Ace contribution", 3]]);
  assert.match(event.additional_fees_note, /Standard course fee payable separately/);
  assert.equal(event.registration_url, undefined);
  assert.equal(Object.hasOwn(event, "rounds_text"), false);
});

test("each individually verified occurrence retains its own UDisc evidence URL and verified facts", () => {
  assert.deepEqual(knownVerifiedGlowDates(), [
    "2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24", "2026-12-01", "2026-12-08", "2026-12-15", "2026-12-22",
  ]);
  for (const date of knownVerifiedGlowDates().slice(3)) {
    const event = verifiedGlowFacts(date);
    assert.equal(event.event_type, "doubles");
    assert.equal(event.name, "HB Night Flyers Glow Doubles");
    assert.equal(event.city, "Huntington Beach");
    assert.equal(event.course_name, "Huntington Beach Central Park Disc Golf Course");
    assert.equal(event.start_time_local, "17:30");
    assert.equal(event.end_time_local, "21:00");
    assert.equal(event.entry_fee_amount, 10);
    assert.deepEqual(event.fee_breakdown.map(({ label, amount }) => [label, amount]), [["Play", 7], ["Ace contribution", 3]]);
    assert.match(event.official_url, /^https:\/\/udisc\.com\/events\/hb-glow-doubles-[A-Za-z0-9]+\/about$/);
    assert.equal(event.field_evidence.official_url.status, "verified");
    assert.equal(event.field_evidence.official_url.source_url, event.official_url);
    assert.equal(event.field_evidence.start_time_local.verified_at, "2026-11-05T07:21:29Z");
    assert.equal(event.registration_url, undefined);
  }
  const later = verifiedGlowFacts("2026-12-29");
  assert.equal(later.event_type, "league");
  assert.equal(later.name, "HB Night Flyers Glow");
  for (const field of ["city", "course_name", "course_url", "start_time_local", "end_time_local", "entry_fee_amount", "fee_breakdown", "additional_fees_note", "official_url"]) {
    assert.equal(Object.hasOwn(later, field), false, `2026-12-29 must not infer ${field}`);
  }
});

test("individual registration is asserted only for the three verified listings", () => {
  for (const date of knownVerifiedGlowDates()) {
    assert.equal(verifiedGlowFacts(date).format_details.registration_mode, "Individual");
  }
  assert.equal(Object.hasOwn(verifiedGlowFacts("2026-12-29"), "format_details"), false);
});

test("manual listing evidence is anchored to its verification record and is not refreshed by sync", () => {
  const evidence = verifiedGlowFacts("2026-11-10").field_evidence;
  assert.equal(evidence.format.verified_at, "2026-11-01T03:25:36Z");
  assert.equal(evidence.format.refresh_on_sync, false);
  assert.match(evidence.format.notes, /issue #161/);
  assert.equal(evidence.registration_url, undefined);
});

test("each verified occurrence is anchored to its own official page, with no invented registration URL or scores", () => {
  const dates = knownVerifiedGlowDates();
  assert.equal(dates.length, 8);
  const urls = new Set();
  for (const date of dates) {
    const fields = verifiedGlowFacts(date);
    assert.equal(fields.official_url.endsWith("/about"), true);
    assert.equal(fields.field_evidence.official_url.source_url, fields.official_url);
    assert.equal(fields.field_evidence.entry_fee_amount.source_url, fields.official_url);
    assert.equal(fields.field_evidence.format.source_key, "hbnf_udisc_manual");
    assert.equal(fields.field_evidence.official_url.refresh_on_sync, false);
    assert.equal(Object.hasOwn(fields, "registration_url"), false);
    assert.equal(Object.hasOwn(fields, "results_url"), false);
    urls.add(fields.official_url);
  }
  assert.equal(urls.size, 8);
  assert.deepEqual(knownVerifiedGlowDates().filter(date => ["2026-12-01", "2026-12-08"].includes(date)), ["2026-12-01", "2026-12-08"]);
  assert.equal(verifiedGlowFacts("2026-12-01").official_url, "https://udisc.com/events/hb-glow-doubles-1ff5RM/about");
  assert.equal(verifiedGlowFacts("2026-12-08").official_url, "https://udisc.com/events/hb-glow-doubles-Jxxe98/about");
});


test("Nov 3 organizer event start and UDisc scoring window are not conflated", () => {
  const event = verifiedGlowFacts("2026-11-03");
  assert.equal(event.start_time_local, "17:30");
  assert.equal(event.official_url, "https://udisc.com/events/hb-night-flyers-hb-glow-doubles-tAP8Y5/about");
  assert.equal(event.field_evidence.start_time_local.source_key, "hbnf_internal_schedule");
  assert.equal(event.field_evidence.start_time_local.source_url, "https://github.com/oookkkaaayyy/local-roots/issues/161");
  assert.match(event.field_evidence.start_time_local.notes, /12:30 PM/);
  assert.equal(event.field_evidence.official_url.source_key, "hbnf_udisc_manual");
  assert.equal(event.field_evidence.official_url.source_url, event.official_url);
  assert.equal(verifiedGlowFacts("2026-11-10").field_evidence.start_time_local.source_key, "hbnf_udisc_manual");
});

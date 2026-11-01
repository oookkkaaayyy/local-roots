import test from "node:test";
import assert from "node:assert/strict";
import { knownNovemberGlowDates, verifiedGlowFacts } from "./verified-glow-facts.mjs";

test("the three individually verified November Glow listings retain their exact evidence URLs", () => {
  assert.deepEqual(knownNovemberGlowDates(), ["2026-11-03", "2026-11-10", "2026-11-17"]);
  assert.equal(verifiedGlowFacts("2026-11-03").official_url, "https://udisc.com/events/hb-glow-doubles-tAP8Y5/about");
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

test("verified November facts do not leak onto later schedule-only Tuesdays", () => {
  for (const date of ["2026-11-24", "2026-12-01", "2026-12-08", "2026-12-15", "2026-12-22"]) {
    const event = verifiedGlowFacts(date);
    assert.equal(event.event_type, "league");
    assert.equal(event.name, "HB Night Flyers Glow");
    for (const field of ["city", "course_name", "course_url", "start_time_local", "end_time_local", "entry_fee_amount", "fee_breakdown", "additional_fees_note", "official_url"]) {
      assert.equal(Object.hasOwn(event, field), false, `${date} must not infer ${field}`);
    }
  }
});

test("individual registration is asserted only for the three verified listings", () => {
  for (const date of knownNovemberGlowDates()) {
    assert.equal(verifiedGlowFacts(date).format_details.registration_mode, "Individual");
  }
  assert.equal(Object.hasOwn(verifiedGlowFacts("2026-11-24"), "format_details"), false);
});

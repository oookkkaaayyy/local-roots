// @ts-nocheck
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const watch = readFileSync(new URL("../../supabase/functions/lr-integrity-watch/index.ts", import.meta.url), "utf8");
const presentation = readFileSync(new URL("../../app/src/lib/eventPresentation.ts", import.meta.url), "utf8");

test("integrity watch follows the upgraded event discovery and results contract", () => {
  assert.equal(watch.includes('"Show past events"'), false);
  assert.equal(watch.includes('"Results available"'), false);
  assert.equal(watch.includes('"View official results"'), false);
  for (const marker of [
    '"Past events & results"',
    '"Add to Calendar"',
    '"PDGA Results"',
    '"On Local Roots"',
    '"Official link"',
    '"Full Results"',
    '"Submit organizer results"',
    '"Upcoming events"',
    '"Submit an event"',
    '"HB Night Flyers"',
    '"https://hbnightflyers.com/"',
    '"lr_public_event_detail"',
    '"Clear filters"',
    '"/events/"',
  ]) {
    assert.ok(watch.includes(marker), `missing current event marker: ${marker}`);
  }
});

test("integrity watch verifies upgraded event-page styles", () => {
  for (const marker of [
    '".event-title-link{"',
    '".event-detail-card{"',
    '".event-view-switch{"',
    '".results-submit-disclosure{"',
    '".result-division{"',
  ]) {
    assert.ok(watch.includes(marker), `missing current CSS marker: ${marker}`);
  }
});

test("integrity watch version advances with its deployed contract", () => {
  assert.ok(watch.includes('LocalRootsIntegrityWatch/11.0'));
  assert.equal(watch.includes('LocalRootsIntegrityWatch/10.0'), false);
});

test("scheduled integrity watch enqueues deduplicated field reviews and fails visibly if the gate errors", () => {
  assert.ok(watch.includes('service.rpc("lr_enqueue_event_field_reviews", { p_horizon_days: 60 })'));
  assert.ok(watch.includes('return json({ error: "event_field_review_failed" }, 500)'));
  assert.ok(watch.includes('event_field_reviews_created: Number(fieldReviews.data ?? 0)'));
  assert.ok(watch.indexOf('service.rpc("lr_enqueue_event_field_reviews"') < watch.indexOf('service.rpc("lr_launch_readiness")'));
});


test("integrity watch PDGA marker tracks the actual result-link label, not a decorative arrow", () => {
  assert.ok(presentation.includes("return 'PDGA Results'"));
  assert.equal(presentation.includes("return 'PDGA Results ↗'"), false);
  assert.ok(watch.includes('"PDGA Results"'));
  assert.equal(watch.includes('"PDGA Results ↗"'), false);
});

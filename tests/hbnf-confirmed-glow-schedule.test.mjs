import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildConfirmedGlowSchedule,
  FIRST_CONFIRMED_TUESDAY_GLOW,
  HBNF_SCHEDULE_CONFIRMATION_REF,
  findMissingSourceRecords,
  hasGlowActivity,
  isCanceledGlowWeek,
  isConfirmedGlowScheduleProvenance,
  isSyntheticGlowFixtureWeek,
  isUnobservedGlowPlaceholderWeek,
  shouldEmitConfirmedScheduleRecord,
  shouldSkipCanceledEvent,
  shouldUseConfirmedSchedule,
} from "../supabase/functions/lr-sync-hbnf/confirmed-schedule.mjs";

const adapter = readFileSync(new URL("../supabase/functions/lr-sync-hbnf/index.ts", import.meta.url), "utf8");
const publicationMigration = readFileSync(
  new URL("../supabase/migrations/20261019165400_hbnf_owner_confirmed_glow_schedule.sql", import.meta.url),
  "utf8",
);
const currentPublicPage = readFileSync(new URL("../app/src/pages/HbnfPage.tsx", import.meta.url), "utf8");

const schedulePayload = (date, rule = date === "2026-10-24"
  ? "final-monthly-glow-2026-10-24"
  : "weekly-tuesday-glow-after-2026-10-27") => ({
  origin: "organizer_confirmed_schedule",
  confirmation_reference: HBNF_SCHEDULE_CONFIRMATION_REF,
  schedule_rule: rule,
  date,
  observed_in_league_state: false,
  participant_entries: 0,
  finalized_cards: 0,
});

test("only exact organizer-confirmed schedule evidence may publish an unobserved record", () => {
  assert.match(publicationMigration, /origin' = 'club_schedule_rule'/);
  assert.match(publicationMigration, /origin' = 'organizer_confirmed_schedule'/);
  assert.ok(publicationMigration.includes(HBNF_SCHEDULE_CONFIRMATION_REF));
  assert.match(publicationMigration, /observed_in_league_state', false/);
  assert.match(publicationMigration, /final-monthly-glow-2026-10-24/);
  assert.match(publicationMigration, /weekly-tuesday-glow-after-2026-10-27/);
  assert.match(publicationMigration, /new\.published := false/);
  assert.ok(publicationMigration.includes("and not coalesce("));
  assert.match(adapter, /origin: "organizer_confirmed_schedule"/);
  assert.equal(isConfirmedGlowScheduleProvenance(schedulePayload("2026-10-24")), true);
  assert.equal(isConfirmedGlowScheduleProvenance({ ...schedulePayload("2026-10-24"), confirmation_reference: "other" }), false);
  assert.equal(isConfirmedGlowScheduleProvenance({ ...schedulePayload("2026-10-24"), schedule_rule: "club_schedule_rule" }), false);
});

test("Oct 24 to Oct 25 rollover retains organizer schedule history without a false disappearance", () => {
  const oct24 = buildConfirmedGlowSchedule("2026-10-24");
  const oct25 = buildConfirmedGlowSchedule("2026-10-25");
  assert.ok(oct24.some((entry) => entry.date === "2026-10-24"));
  assert.ok(!oct25.some((entry) => entry.date === "2026-10-24"));

  const existingScheduleRow = { event_id: "glow-oct24", external_id: "hbnf:glow:2026-10-24", source_payload: schedulePayload("2026-10-24") };
  assert.deepEqual(findMissingSourceRecords([existingScheduleRow], [], true), []);
  assert.deepEqual(findMissingSourceRecords([existingScheduleRow], [], false), []);
});

test("Tuesday schedule rollover retains expired confirmed dates without false source-disappearance reports", () => {
  const nov10 = buildConfirmedGlowSchedule("2026-11-10");
  const nov11 = buildConfirmedGlowSchedule("2026-11-11");
  assert.ok(nov10.some((entry) => entry.date === "2026-11-10"));
  assert.ok(!nov11.some((entry) => entry.date === "2026-11-10"));
  const expiredTuesday = {
    event_id: "glow-nov10",
    external_id: "hbnf:glow:2026-11-10",
    source_payload: schedulePayload("2026-11-10"),
  };
  assert.deepEqual(findMissingSourceRecords([expiredTuesday], [], true), []);
});

test("successful HBNF read with no matching scored week still retains confirmed event and does not flag it missing", () => {
  const today = "2026-10-25";
  const schedule = buildConfirmedGlowSchedule(today);
  const confirmedDates = new Set(schedule.map((entry) => entry.date));
  const noMatchingScoredWeek = undefined;
  assert.equal(confirmedDates.has("2026-10-24"), false);
  assert.equal(shouldUseConfirmedSchedule("2026-10-24", noMatchingScoredWeek, confirmedDates), false);
  const nextDate = "2026-11-03";
  const currentConfirmedDates = new Set(buildConfirmedGlowSchedule("2026-10-25").map((entry) => entry.date));
  assert.equal(shouldUseConfirmedSchedule(nextDate, noMatchingScoredWeek, currentConfirmedDates), true);
  assert.equal(shouldEmitConfirmedScheduleRecord(noMatchingScoredWeek), true);
  const pastConfirmedRow = { event_id: "glow-oct24", external_id: "hbnf:glow:2026-10-24", source_payload: schedulePayload("2026-10-24") };
  const genuinelyObservedRow = {
    event_id: "skins-oct20",
    external_id: "hbnf:skins:2026-10-20",
    source_payload: { origin: "league_state", observed_in_league_state: true },
  };
  assert.deepEqual(findMissingSourceRecords([pastConfirmedRow, genuinelyObservedRow], [], true), [genuinelyObservedRow]);
});

test("failed HBNF read reports no disappearances while the sync continues to expose failed fetch health", () => {
  const rows = [
    { external_id: "hbnf:glow:2026-10-24", source_payload: schedulePayload("2026-10-24") },
    { external_id: "hbnf:skins:2026-10-20", source_payload: { origin: "league_state" } },
  ];
  assert.deepEqual(findMissingSourceRecords(rows, [], false), []);
  assert.match(adapter, /fetch_status: "failed"[\s\S]{0,140}hbnf_state_unavailable_schedule_fallback/);
  assert.match(adapter, /source_state_read: stateFetchError \? "failed" : "ok"/);
  assert.ok(adapter.includes('error_code: "hbnf_state_unavailable_schedule_fallback"'));
  assert.ok(adapter.includes('fetch_status: "failed"'));
});

test("genuinely observed source events still create disappearance candidates after a successful read", () => {
  const observed = { event_id: "event-1", external_id: "hbnf:skins:2026-10-20", source_payload: { origin: "league_state", observed_in_league_state: true } };
  const stillPresent = { event_id: "event-2", external_id: "hbnf:skins:2026-10-27", source_payload: { origin: "league_state", observed_in_league_state: true } };
  assert.deepEqual(findMissingSourceRecords([observed, stillPresent], ["hbnf:skins:2026-10-27"], true), [observed]);
});

test("canceled weeks remain authoritative and existing canceled events cannot be reopened", () => {
  const canceled = { status: "canceled", players: [], cards: {} };
  assert.equal(isCanceledGlowWeek(canceled), true);
  assert.equal(shouldUseConfirmedSchedule("2026-11-03", canceled, new Set(["2026-11-03"])), false);
  assert.equal(shouldEmitConfirmedScheduleRecord(canceled), false);
  assert.equal(shouldSkipCanceledEvent("canceled", "upcoming"), true);
  assert.equal(shouldSkipCanceledEvent("canceled", "canceled"), false);
  assert.equal(shouldSkipCanceledEvent("upcoming", "canceled"), false);
  assert.match(adapter, /isCanceledGlowWeek\(week\)[\s\S]{0,100}"canceled"/);
  assert.match(currentPublicPage, /event\.end_date >= today && event\.status !== 'canceled'/);
});

test("scored and canceled weeks suppress duplicate schedule rows while empty weeks use one confirmed identity", () => {
  const date = FIRST_CONFIRMED_TUESDAY_GLOW;
  const confirmedDates = new Set([date]);
  const scoredWeek = { players: [{ name: "Player" }], cards: {} };
  const emptyWeek = { players: [], cards: {} };
  const canceledWeek = { status: "cancelled", players: [], cards: {} };

  assert.equal(shouldUseConfirmedSchedule(date, scoredWeek, confirmedDates), false);
  assert.equal(shouldEmitConfirmedScheduleRecord(scoredWeek), false);
  assert.equal(shouldUseConfirmedSchedule(date, emptyWeek, confirmedDates), true);
  assert.equal(shouldEmitConfirmedScheduleRecord(emptyWeek), true);
  assert.equal(shouldUseConfirmedSchedule(date, canceledWeek, confirmedDates), false);
  assert.equal(shouldEmitConfirmedScheduleRecord(canceledWeek), false);

  const emitted = [];
  if (!shouldUseConfirmedSchedule(date, scoredWeek, confirmedDates)) emitted.push(`hbnf:glow:${date}:league_state`);
  if (shouldEmitConfirmedScheduleRecord(scoredWeek)) emitted.push(`hbnf:glow:${date}:organizer_confirmed_schedule`);
  assert.deepEqual(emitted, [`hbnf:glow:${date}:league_state`]);
  assert.match(adapter, /if \(shouldUseConfirmedSchedule\(date, week, confirmedGlowDates\)\) continue/);
  assert.match(adapter, /if \(!shouldEmitConfirmedScheduleRecord\(stateWeek\)\) continue/);
  assert.ok(adapter.includes("hbnf:glow:${date}"));
});

test("confirmed Tuesday Glow remains bounded to eight future dates and assumes no time", () => {
  const dates = buildConfirmedGlowSchedule("2026-10-19").filter((entry) => !entry.monthlyFinal);
  assert.equal(dates.length, 8);
  assert.equal(dates[0].date, FIRST_CONFIRMED_TUESDAY_GLOW);
  assert.equal(dates.at(-1).date, "2026-12-22");
  assert.ok(dates.every((entry) => entry.rule === "weekly-tuesday-glow-after-2026-10-27"));
  assert.ok(dates.every((entry) => !("startLocal" in entry)));
  assert.equal(buildConfirmedGlowSchedule("2026-11-04")[0].date, "2026-11-10");
  assert.throws(() => buildConfirmedGlowSchedule("2026-02-31"), RangeError);
});

test("public HBNF events remain upcoming-only, canceled-free, and date ordered", () => {
  assert.match(currentPublicPage, /event\.end_date >= today && event\.status !== 'canceled'/);
  assert.match(currentPublicPage, /\.sort\(\(a, b\) => a\.start_date\.localeCompare\(b\.start_date\) \|\| a\.name\.localeCompare\(b\.name\)\)/);
  const fixture = [
    { name: "Glow", start_date: "2026-11-10", end_date: "2026-11-10", status: "upcoming" },
    { name: "Skins", start_date: "2026-10-20", end_date: "2026-10-20", status: "upcoming" },
    { name: "Canceled Glow", start_date: "2026-11-03", end_date: "2026-11-03", status: "canceled" },
  ];
  const today = "2026-10-19";
  const visible = fixture.filter((event) => event.end_date >= today && event.status !== "canceled")
    .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.name.localeCompare(b.name));
  assert.deepEqual(visible.map((event) => event.name), ["Skins", "Glow"]);
});


test("synthetic HBNF Glow fixture is quarantined without hiding genuine incomplete rounds", () => {
  const synthetic = {
    players: [
      { name: "Fixture Andrew", scores: Array(18).fill(3) },
      { name: "Fixture Jason", scores: Array(18).fill(4) },
    ],
    cards: { card1: { finalized: false } },
  };
  assert.equal(isSyntheticGlowFixtureWeek(synthetic), true);
  assert.equal(isSyntheticGlowFixtureWeek({ ...synthetic, finalized: true }), false);
  assert.equal(isSyntheticGlowFixtureWeek({ ...synthetic, cards: { card1: { finalized: true } } }), false);
  assert.equal(isSyntheticGlowFixtureWeek({ ...synthetic, players: [{ name: "Fixture Andrew" }, { name: "Real Player" }] }), false);
  assert.equal(isSyntheticGlowFixtureWeek({ players: [], cards: {} }), false);
  assert.match(adapter, /if \(isSyntheticGlowFixtureWeek\(week\)\)/);
  assert.match(adapter, /quarantinedFixtureExternalIds\.add/);
  assert.match(adapter, /published: false/);
  assert.match(adapter, /quarantinedFixtureExternalIds\]\)/);
});

test("empty nonconfirmed Glow week is quarantined while real play, cancellations, and accepted results remain protected", () => {
  const emptyWeek = { players: [], cards: [{ finalized: false }], finalized: false };
  assert.equal(isUnobservedGlowPlaceholderWeek(emptyWeek), true);
  assert.equal(isUnobservedGlowPlaceholderWeek({ ...emptyWeek, cards: [{ finalized: true }] }), false);
  assert.equal(isUnobservedGlowPlaceholderWeek({ ...emptyWeek, players: [{ name: "Actual Player" }] }), false);
  assert.equal(isUnobservedGlowPlaceholderWeek({ ...emptyWeek, canceled: true }), false);
  assert.equal(isUnobservedGlowPlaceholderWeek({ ...emptyWeek, status: "cancelled" }), false);
  assert.match(adapter, /!confirmedGlowDates\\.has\\(date\\) && isUnobservedGlowPlaceholderWeek\\(week\\)/);
  assert.match(adapter, /quarantinedEmptyGlowExternalIds\\.add/);
  assert.match(adapter, /quarantinedEmptyGlowExternalIds\\]\\)/);
  assert.match(adapter, /from\\("lr_results"\\)/);
  assert.match(adapter, /resultCount\\.count > 0/);
  assert.match(adapter, /empty Glow quarantine failed/);
});

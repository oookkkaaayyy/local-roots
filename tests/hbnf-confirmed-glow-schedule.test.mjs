import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildConfirmedGlowSchedule,
  FIRST_CONFIRMED_TUESDAY_GLOW,
  HBNF_SCHEDULE_CONFIRMATION_REF,
  hasGlowActivity,
  isCanceledGlowWeek,
} from "../supabase/functions/lr-sync-hbnf/confirmed-schedule.mjs";

const adapter = readFileSync(new URL("../supabase/functions/lr-sync-hbnf/index.ts", import.meta.url), "utf8");
const publicationMigration = readFileSync(
  new URL("../supabase/migrations/20261019170000_hbnf_owner_confirmed_glow_schedule.sql", import.meta.url),
  "utf8",
);
const currentPublicPage = readFileSync(new URL("../app/src/pages/HbnfPage.tsx", import.meta.url), "utf8");
const loadAdapter = () => adapter;

test("only the exact organizer-confirmed schedule evidence may publish an unobserved schedule record", () => {
  assert.match(publicationMigration, /origin' = 'club_schedule_rule'/);
  assert.match(publicationMigration, /origin' = 'organizer_confirmed_schedule'/);
  assert.ok(publicationMigration.includes(HBNF_SCHEDULE_CONFIRMATION_REF));
  assert.match(publicationMigration, /observed_in_league_state', false/);
  assert.match(publicationMigration, /final-monthly-glow-2026-10-24/);
  assert.match(publicationMigration, /weekly-tuesday-glow-after-2026-10-27/);
  assert.match(publicationMigration, /new\.published := false/);
  assert.ok(publicationMigration.includes("and not coalesce("));
  assert.match(adapter, /origin: "organizer_confirmed_schedule"/);
});

test("confirmed Oct 24 Glow remains available with no league_state participants or scores", () => {
  const dates = buildConfirmedGlowSchedule("2026-10-19");
  assert.equal(dates[0].date, "2026-10-24");
  assert.equal(dates[0].rule, "final-monthly-glow-2026-10-24");
  assert.equal(hasGlowActivity({ players: [], cards: {} }), false);
  assert.ok(dates.some((entry) => entry.date === "2026-10-24"));
});

test("confirmed Tuesday Glow is bounded to eight upcoming dates and assumes no time", () => {
  const dates = buildConfirmedGlowSchedule("2026-10-19").filter((entry) => !entry.monthlyFinal);
  assert.equal(dates.length, 8);
  assert.equal(dates[0].date, FIRST_CONFIRMED_TUESDAY_GLOW);
  assert.equal(dates.at(-1).date, "2026-12-22");
  assert.match(adapter, /const tuesdayGlow = !scheduled\.monthlyFinal/);
  assert.ok(dates.every((entry) => entry.rule === "weekly-tuesday-glow-after-2026-10-27"));
  assert.ok(dates.every((entry) => !("startLocal" in entry)));
  assert.equal(buildConfirmedGlowSchedule("2026-11-04")[0].date, "2026-11-10");
  assert.throws(() => buildConfirmedGlowSchedule("2026-02-31"), RangeError);
});

test("substantive observed league_state supersedes schedule with the same stable event identity", () => {
  assert.match(adapter, /confirmedGlowDates\.has\(date\) && !hasGlowActivity\(week\)/);
  assert.match(adapter, /if \(isCanceledGlowWeek\(stateWeek\) \|\| hasGlowActivity\(stateWeek\)\) continue/);
  assert.equal(hasGlowActivity({ players: [{ name: "Player" }], cards: {} }), true);
  assert.equal(hasGlowActivity({ players: [], cards: { a: { finalized: true } } }), true);
  assert.ok(adapter.includes("hbnf:glow:"));
});

test("empty scoring shells do not replace confirmed schedule authority", () => {
  assert.equal(hasGlowActivity({ players: [], cards: { a: { finalized: false } } }), false);
  assert.match(adapter, /confirmedGlowDates\.has\(date\) && !hasGlowActivity\(week\) && !isCanceledGlowWeek\(week\)/);
});

test("cancellation is preserved and the HBNF tab excludes canceled or past events", () => {
  assert.equal(isCanceledGlowWeek({ status: "canceled" }), true);
  assert.equal(isCanceledGlowWeek({ canceled: true }), true);
  assert.equal(isCanceledGlowWeek({ status: "upcoming" }), false);
  assert.match(adapter, /isCanceledGlowWeek\(week\)[\s\S]{0,100}"canceled"/);
  assert.match(adapter, /event\.status === "canceled"/);
  assert.match(currentPublicPage, /event\.end_date >= today && event\.status !== 'canceled'/);
});

test("public HBNF events remain upcoming-only and date ordered", () => {
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

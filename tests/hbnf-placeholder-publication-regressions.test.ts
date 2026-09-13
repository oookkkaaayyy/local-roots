// @ts-nocheck
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260913010200_guard_hbnf_schedule_placeholders.sql", import.meta.url), "utf8");

test("schedule-derived HBNF placeholders cannot be republished before league-state observation", () => {
  assert.ok(migration.includes("s.key = 'hbnf_internal_schedule'"));
  assert.ok(migration.includes("es.source_payload->>'origin' = 'club_schedule_rule'"));
  assert.ok(migration.includes("observed_in_league_state"));
  assert.ok(migration.includes("new.published := false"));
  assert.ok(migration.includes("before insert or update of published"));
});

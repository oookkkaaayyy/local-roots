// @ts-nocheck
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260914110616_enforce_completed_events_for_result_submissions.sql", import.meta.url),
  "utf8",
);

test("organizer result submissions are limited to completed published events", () => {
  assert.ok(migration.includes("v_published is distinct from true"));
  assert.ok(migration.includes("v_end_date >= (current_timestamp at time zone 'America/Los_Angeles')::date"));
  assert.ok(migration.includes("raise exception 'event_not_completed'"));
});

test("completion boundary is enforced at insert and approval", () => {
  assert.ok(migration.includes("lr_result_submissions_completed_event_insert"));
  assert.ok(migration.includes("before insert on public.lr_result_submissions"));
  assert.ok(migration.includes("lr_result_submissions_completed_event_approval"));
  assert.ok(migration.includes("before update of status on public.lr_result_submissions"));
  assert.ok(migration.includes("when (new.status = 'approved')"));
});

test("completion guard is not browser executable", () => {
  assert.ok(migration.includes("revoke all on function public.lr_require_completed_event_for_result_submission() from public, anon, authenticated"));
  assert.ok(migration.includes("grant execute on function public.lr_require_completed_event_for_result_submission() to service_role"));
});

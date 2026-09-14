// @ts-nocheck
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260914142218_reject_duplicate_organizer_result_rows.sql", import.meta.url),
  "utf8",
);

test("organizer result submissions reject duplicate logical standings rows", () => {
  assert.ok(migration.includes("group by upper(btrim(row_data->>'division_code'))"));
  assert.ok(migration.includes("lower(btrim(row_data->>'player_name'))"));
  assert.ok(migration.includes("having count(*) > 1"));
  assert.ok(migration.includes("raise exception 'duplicate_result_row'"));
});

test("duplicate logical-row guard applies at both intake and approval", () => {
  const matches = migration.match(/raise exception 'duplicate_result_row'/g) ?? [];
  assert.equal(matches.length, 2);
  assert.ok(migration.includes("create or replace function public.lr_ingest_result_submission"));
  assert.ok(migration.includes("create or replace function public.lr_decide_result_submission"));
});

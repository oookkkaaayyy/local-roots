// @ts-nocheck
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Tests execute from dist/tests after tsc (rootDir ".", outDir "dist").
const migration = readFileSync(
  new URL("../../supabase/migrations/20261009000100_preserve_public_event_status.sql", import.meta.url),
  "utf8",
);

test("public event RPC migration preserves stored source status", () => {
  assert.match(migration, /create or replace function public\.lr_public_events\(\)/i);
  assert.match(migration, /e\.rounds_text,e\.event_type,e\.format,e\.sanctioned,e\.tier,\s*e\.status,\s*e\.registration_status/i);
  assert.doesNotMatch(migration, /then\s+'completed'/i);
  assert.doesNotMatch(migration, /end_date\s*<\s*\(current_timestamp/i);
});

test("status migration retains public-only scope and RPC security boundaries", () => {
  assert.match(migration, /where e\.published\b/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path to 'pg_catalog', 'public'/i);
  assert.match(migration, /where r\.event_id=e\.id\s+and r\.is_public_selected_division\s+and r\.place <= 3/i);
  assert.match(migration, /revoke all on function public\.lr_public_events\(\) from public/i);
  assert.match(migration, /grant execute on function public\.lr_public_events\(\) to anon, authenticated, service_role/i);
});

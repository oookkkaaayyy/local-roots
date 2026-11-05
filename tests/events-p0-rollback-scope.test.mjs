import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261101070000_event_detail_fields_and_provenance.sql", import.meta.url), "utf8");
const reconciliation = readFileSync(new URL("../supabase/migrations/20261101080000_reconcile_verified_schedule_fields.sql", import.meta.url), "utf8");
const added = [...migration.matchAll(/alter\s+table\s+public\.(lr_\w+)\s+([\s\S]*?);/gi)]
  .filter(([, , body]) => /add\s+column/i.test(body))
  .map(([, table, body]) => [table, [...body.matchAll(/add\s+column\s+if\s+not\s+exists\s+(\w+)/gi)].map(x => x[1])]);
const newIndexes = [...migration.matchAll(/create\s+(?:unique\s+)?index\s+if\s+not\s+exists\s+(\w+)/gi)].map(x=>x[1]);
const newTables = [...migration.matchAll(/create\s+table\s+if\s+not\s+exists\s+public\.(\w+)/gi)].map(x=>x[1]);

test("Events 700 adds only the recorded rollback-column families", () => {
  assert.deepEqual(added.map(x=>x[0]), ["lr_sources", "lr_events", "lr_event_submissions"]);
  assert.equal(added[0][1].length, 1);
  assert.equal(added[1][1].length, 18);
  assert.equal(added[2][1].length, 19);
  assert.deepEqual(newTables, ["lr_event_field_evidence"]);
  assert.deepEqual(newIndexes, [
    "lr_event_field_evidence_source_key",
    "lr_event_field_evidence_manual_key",
    "lr_event_field_evidence_expiry_idx",
    "lr_event_field_review_dedupe_idx",
  ]);
});

test("Events 800 still uses candidate promotion rather than hand-editing canonical rows", () => {
  assert.match(reconciliation, /lr_process_candidate\(v_candidate\)/);
  assert.match(reconciliation, /lr_apply_authoritative_candidate\(v_candidate\)/);
  assert.match(reconciliation, /parser_version\s*\)[\s\S]*?schedule-field-reconciliation-v1/);
  assert.doesNotMatch(reconciliation, /update\s+public\.lr_events\s+set/gi);
});

test("Events rollback remains fail-closed until a separate executable reverse and admission pass", () => {
  // This contract is a source audit, NEVER authorization to apply 700/800.
  assert.match(migration, /drop\s+function\s+if\s+exists\s+public\.lr_public_events\(\)/);
  assert.match(migration, /create\s+or\s+replace\s+view\s+public\.lr_event_field_status/);
});

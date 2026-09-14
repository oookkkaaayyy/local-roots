// @ts-nocheck
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const submitSource=readFileSync(new URL("../../supabase/functions/lr-submit-results/index.ts",import.meta.url),"utf8");
const migration=readFileSync(new URL("../../supabase/migrations/20260914100245_add_reviewed_organizer_results_pipeline.sql",import.meta.url),"utf8");
const eventDetail=readFileSync(new URL("../../app/src/pages/EventDetailPage.tsx",import.meta.url),"utf8");
const adminSource=readFileSync(new URL("../../supabase/functions/lr-admin/index.ts",import.meta.url),"utf8");

test("organizer results endpoint is bounded, attested, and review-first",()=>{
  assert.ok(submitSource.includes("const MAX_REQUEST_BYTES = 64 * 1024"));
  assert.ok(submitSource.includes("const MAX_RESULTS = 300"));
  assert.ok(submitSource.includes("input.attested !== true"));
  assert.ok(submitSource.includes('supabase.rpc("lr_ingest_result_submission"'));
  assert.equal(submitSource.includes("pdga_number"),false);
  assert.equal(submitSource.includes("rating:"),false);
});

test("result submissions remain private until explicit admin approval",()=>{
  assert.ok(migration.includes("alter table public.lr_result_submissions enable row level security"));
  assert.ok(migration.includes("revoke all on table public.lr_result_submissions from public, anon, authenticated"));
  assert.ok(migration.includes("grant all on table public.lr_result_submissions to service_role"));
  assert.ok(migration.includes("lr_decide_result_submission"));
  assert.ok(migration.includes("unauthorized_admin"));
  assert.ok(migration.includes("where r.event_id=e.id and r.is_public_selected_division and r.place <= 3"));
  assert.ok(migration.includes("lr_public_event_detail"));
});

test("public result submission requires authorized own-record attestation",()=>{
  assert.ok(eventDetail.includes("Submit organizer results"));
  assert.ok(eventDetail.includes("our own event records"));
  assert.ok(eventDetail.includes("not copied from PDGA, UDisc, Disc Golf Scene"));
  assert.ok(eventDetail.includes("lr-submit-results"));
});

test("admin uses the dedicated result-decision path",()=>{
  assert.ok(adminSource.includes('action === "decide_result_submission"'));
  assert.ok(adminSource.includes('service.rpc("lr_decide_result_submission"'));
  assert.ok(adminSource.includes('review.issue_type === "organizer_results_submission"'));
});

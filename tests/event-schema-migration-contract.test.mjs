import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20261101070000_event_detail_fields_and_provenance.sql", import.meta.url), "utf8");
const adminFunction = await readFile(new URL("../supabase/functions/lr-admin/index.ts", import.meta.url), "utf8");
const submitFunction = await readFile(new URL("../supabase/functions/lr-submit-event/index.ts", import.meta.url), "utf8");
const appTypes = await readFile(new URL("../app/src/types.ts", import.meta.url), "utf8");
const eventsPage = await readFile(new URL("../app/src/pages/EventsPage.tsx", import.meta.url), "utf8");

test("event details migration is one additive transaction and does not reset event history", () => {
  assert.match(migration, /^--[\s\S]*?begin;[\s\S]*commit;\s*$/i);
  assert.match(migration, /alter table public\.lr_events[\s\S]*add column if not exists venue_address/);
  assert.doesNotMatch(migration, /\b(drop\s+table|truncate\s+table|delete\s+from\s+public\.lr_events|delete\s+from\s+public\.lr_results)\b/i);
  assert.doesNotMatch(migration, /\bdrop\s+function\b[^;]*\bcascade\b/i);
});

test("candidate promotion retains authority, override precedence and null-safe merge behavior", () => {
  assert.match(migration, /if exists\(select 1 from public\.lr_manual_overrides[\s\S]*?and mo\.active\)/);
  assert.match(migration, /if public\.lr_source_authoritative_for\(evidence_source_id,f\) then/);
  assert.doesNotMatch(migration, /if public\.lr_source_authoritative_for\(c\.source_id,f\) then/);
  assert.match(migration, /values\(e\.id,evidence_source_id,c\.id,f,oldv,newv,case when f in \('start_date','end_date'\) then 'organizer_confirmed' else 'source_update' end\)/);
  assert.match(migration, /if jsonb_typeof\(newv\)='null' then[\s\S]*?A missing\/null source field is not an instruction to erase a known fact/);
  assert.match(migration, /lr_event_field_evidence/);
  assert.match(migration, /source_field_conflict/);
  assert.match(migration, /authoritative source conflicts with an active manual event override/);
  assert.match(migration, /coalesce\(\(ev->>'clear_value'\)::boolean,false\)/);
  assert.match(migration, /evidence_status in \('not_announced','not_applicable'\)/);
  assert.ok(migration.includes("evidence_verified_at:=(ev->>'verified_at')::timestamptz"));
  assert.match(migration, /evidence_verified_at\+evidence_ttl<now\(\) then evidence_status:='stale'/);
  assert.match(migration, /identity\/control field %/);
  assert.match(migration, /verification_ttl interval not null default interval '14 days'/);
  assert.match(migration, /evidence_verified_at\+evidence_ttl/);
  assert.match(migration, /s\.field_name=any\(authorized_source\.authoritative_fields\)/);
  assert.match(migration, /'authorized_sources'/);
  assert.match(migration, /where key='oak_grove_disc_golf_club_direct'/);
  assert.match(migration, /where key='crpd_rabbit_flats_direct'/);
  assert.match(migration, /with original as materialized[\s\S]*?jsonb_populate_record\(o::public\.lr_events,v_patch\)[\s\S]*?from patched p where e\.id=p\.id returning e\.\* into v_event/i);
});

test("database-bound time, fee, and structured-field contracts reject invalid combinations", () => {
  assert.match(migration, /pg_timezone_names/);
  assert.match(migration, /timezone_required_for_timed_event/);
  assert.match(migration, /entry_fee_unit_and_currency_required/);
  assert.match(migration, /fee_breakdown_currency_mismatch/);
  assert.match(migration, /fee_breakdown_total_mismatch/);
  assert.match(migration, /lr_events_same_day_time_order_check/);
  assert.match(migration, /invalid_format_details/);
  assert.match(migration, /checkin_after_start_time/);
  assert.match(migration, /start_time_note_conflicts_with_exact_start/);
  assert.match(migration, /timezone_required_for_timed_event/);
});

test("check-in and approximate start facts flow through public, intake, admin, and sync contracts", () => {
  for (const field of ["checkin_time_local", "start_time_note"]) {
    assert.match(migration, new RegExp(`add column if not exists ${field}`));
    assert.match(migration, new RegExp(`e\\.${field}`));
    assert.match(migration, new RegExp(`s\\.${field}`));
    assert.match(appTypes, new RegExp(`${field}\\?: string \\| null`));
    assert.ok(eventsPage.includes(`${field}`));
    assert.ok(submitFunction.includes(`${field}: text(input.${field}`));
    assert.ok(adminFunction.includes(field));
  }
  assert.match(adminFunction, /lr_event_submissions\"\)\.select\([\s\S]*?checkin_time_local[\s\S]*?start_time_note/);
  assert.match(adminFunction, /lr_events\"\)\.select\([\s\S]*?checkin_time_local[\s\S]*?start_time_note/);
});

test("event field reads have no setter-only dependencies and setters validate timezone values", () => {
  const getter = migration.match(/create or replace function public\.lr_event_field_value\([\s\S]*?\$\$;/)?.[0] ?? "";
  const setter = migration.match(/create or replace function public\.lr_set_event_field_value\([\s\S]*?\$\$;/)?.[0] ?? "";
  assert.ok(getter);
  assert.doesNotMatch(getter, /p_value/);
  assert.match(setter, /if p_value is null then raise exception/);
  assert.match(setter, /p_field_name='timezone'[\s\S]*?pg_catalog\.pg_timezone_names/);
});

test("resolved evidence conflicts stop appearing once the observed value matches canonical data", () => {
  assert.match(migration, /bool_or\(ev\.status='conflicting' and ev\.observed_value is distinct from public\.lr_event_field_value\(e\.id,f\.field_name\)\)/);
});

test("new privileged field and publication operations remain service-role only", () => {
  for (const signature of [
    "lr_event_field_value(uuid,text)",
    "lr_set_event_field_value(uuid,text,jsonb)",
    "lr_apply_event_patch(uuid,jsonb)",
    "lr_apply_authoritative_candidate(uuid)",
    "lr_set_manual_override(uuid,text,jsonb,text,uuid)",
    "lr_set_manual_event_field_status(uuid,text,text,text,jsonb,text)",
    "lr_enqueue_event_field_reviews(integer)",
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${signature.replace(/[()]/g, "\\$&")} from public,anon,authenticated;`, "i"), signature);
    assert.match(migration, new RegExp(`grant execute on function public\\.${signature.replace(/[()]/g, "\\$&")} to service_role;`, "i"), signature);
  }
});

test("public event RPCs preserve the existing published-event boundary and legacy links", () => {
  assert.match(migration, /from public\.lr_events e where e\.published order by e\.start_date,e\.name/);
  assert.match(migration, /where p\.slug=p_slug limit 1/);
  assert.match(migration, /grant execute on function public\.lr_public_events\(\) to anon,authenticated,service_role/);
  assert.match(migration, /grant execute on function public\.lr_public_event_detail\(text\) to anon,authenticated,service_role/);
});

test("freshness monitor is bounded, upcoming-only, deduplicated and does not claim unknown facts", () => {
  assert.match(migration, /least\(greatest\(coalesce\(p_horizon_days,60\),1\),90\)/);
  assert.match(migration, /s\.start_date between v_today and v_today\+v_horizon/);
  assert.match(migration, /q\.issue_type='event_field_verification'[\s\S]*?q\.details->>'field'=r\.field_name/);
  assert.match(migration, /'unverified'/);
  assert.match(migration, /Clearing a value is not evidence that the organizer has not announced it/);
  assert.match(migration, /with resolved_fields as materialized[\s\S]*?verification_status in \('verified','not_applicable','not_announced'\)[\s\S]*?e\.status in \('canceled','completed'\) or not e\.published or s\.start_date<v_today[\s\S]*?from resolved_fields rf/);
});

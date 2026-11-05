import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migrationDir = new URL("../supabase/migrations/", import.meta.url);
const candidateMigration = "20261101070000_event_detail_fields_and_provenance.sql";
const scheduleReconciliationMigration = "20261101080000_reconcile_verified_schedule_fields.sql";
const excludedBaselineMigration = /(?:_du_|du_|fix_du|harden_du|gallery_legacy|migrate_du|fill_socal_championship_course|harden_remaining_public_helper_execute|hbnf_owner_confirmed_glow_schedule|20261105002000|20261101080000)/i;

test("event detail migration runs in PostgreSQL and keeps patch, validation, and override behavior", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create role supabase_admin nologin bypassrls;
      create schema auth; create schema vault; create schema net; create schema cron; create schema extensions;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create function auth.role() returns text language sql stable as $$ select current_user::text $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
      create function extensions.similarity(text,text) returns real language sql immutable as $$ select case when $1=$2 then 1::real else 0::real end $$;
      create table vault.decrypted_secrets(name text,decrypted_secret text);
      create function vault.create_secret(text,text,text default null) returns uuid language sql as $$ select gen_random_uuid() $$;
      create function net.http_post(url text,headers jsonb default null,body jsonb default null) returns bigint language sql as $$ select 1::bigint $$;
      create table cron.job(jobid bigserial primary key,jobname text);
      create function cron.schedule(text,text,text) returns bigint language sql as $$ insert into cron.job(jobname) values($1) returning jobid $$;
      create function cron.unschedule(text) returns boolean language sql as $$ delete from cron.job where jobname=$1 returning true $$;
      create function cron.unschedule(bigint) returns boolean language sql as $$ delete from cron.job where jobid=$1 returning true $$;
    `);

    const migrationNames = (await readdir(migrationDir))
      .filter((name) => name.endsWith(".sql") && !excludedBaselineMigration.test(name) && name !== candidateMigration)
      .sort();
    for (const name of migrationNames) {
      const sql = (await readFile(new URL(name, migrationDir), "utf8"))
        .replace(/^\s*create extension if not exists [^;]+;\s*$/gim, "-- Local PGlite harness: managed extension stub");
      await db.exec(sql);
    }

    // Reproduce the already-published organizer-calendar conflict that the
    // candidate migration must surface without rewriting its canonical date.
    const billyGoatId = "33333333-3333-4333-8333-333333333333";
    const socalSourceId = (await db.query("select id from public.lr_sources where key='socal_dgc_manual_calendar'")).rows[0].id;
    await db.query(`
      insert into public.lr_events(id,slug,name,start_date,end_date,county,city,venue_name,event_type,status,sanctioned,last_verified_at)
      values($1,'billy-goat-fallen-disc-golfers-memorial-2026','Billy Goat ~ Fallen Disc Golfers Memorial',date '2026-11-28',date '2026-11-28','San Bernardino','Yucaipa','Yucaipa Regional Park','tournament','upcoming',true,now())
    `, [billyGoatId]);
    await db.query(`
      insert into public.lr_event_sources(event_id,source_id,external_id,source_url,source_role,is_sanction_basis)
      values($1,$2,'socal:2026:billy-goat','https://socaldiscgolfclub.com/upcoming-events/','organizer_confirmed',true)
    `, [billyGoatId, socalSourceId]);
    await db.query("update public.lr_events set published=true where id=$1", [billyGoatId]);

    await db.exec(await readFile(new URL(candidateMigration, migrationDir), "utf8"));
    const sourceTtls = (await db.query("select key,verification_ttl::text from public.lr_sources where key=any($1::text[])", [["hbnf_internal_schedule","hbnf_udisc_manual","oak_grove_disc_golf_club_direct","crpd_rabbit_flats_direct"]])).rows;
    assert.deepEqual(Object.fromEntries(sourceTtls.map((row) => [row.key,row.verification_ttl])), {
      hbnf_internal_schedule: "7 days",
      hbnf_udisc_manual: "7 days",
      oak_grove_disc_golf_club_direct: "14 days",
      crpd_rabbit_flats_direct: "30 days",
    });
    const scheduleAuthorities = (await db.query("select key,authoritative_fields from public.lr_sources where key=any($1::text[])", [["oak_grove_disc_golf_club_direct","crpd_rabbit_flats_direct"]])).rows;
    for (const row of scheduleAuthorities) {
      assert.ok(row.authoritative_fields.includes("start_time_local"), row.key);
      assert.ok(row.authoritative_fields.includes("timezone"), row.key);
    }
    assert.ok(scheduleAuthorities.find((row) => row.key === "oak_grove_disc_golf_club_direct").authoritative_fields.includes("start_time_note"));
    assert.ok(scheduleAuthorities.find((row) => row.key === "crpd_rabbit_flats_direct").authoritative_fields.includes("format"));

    // The schedule-field repair must use the source candidate pipeline, retain
    // operator overrides, and keep time guidance out of the format field.
    const oakOverrideTarget=(await db.query(`
      select e.id from public.lr_events e where e.slug='oak-grove-friday-doubles-2026-11-06'
    `)).rows[0].id;
    await db.query("select public.lr_set_manual_override($1,'format','\"operator format\"'::jsonb,'PGlite schedule correction protection',null)",[oakOverrideTarget]);
    await db.exec(await readFile(new URL(scheduleReconciliationMigration, migrationDir), "utf8"));
    const correctedOakWednesday=(await db.query(`
      select format,start_time_note,timezone from public.lr_events where slug='oak-grove-wednesday-doubles-2026-11-04'
    `)).rows[0];
    assert.deepEqual(correctedOakWednesday,{format:"Doubles",start_time_note:"Show up around 5 PM",timezone:"America/Los_Angeles"});
    const correctedOakTuesday=(await db.query(`
      select format,start_time_note,timezone from public.lr_events where slug='oak-grove-howards-weekly-2026-11-03'
    `)).rows[0];
    assert.deepEqual(correctedOakTuesday,{format:null,start_time_note:"3 hours before sunset",timezone:"America/Los_Angeles"});
    assert.equal((await db.query(`select verification_status from public.lr_event_field_status where slug='oak-grove-howards-weekly-2026-11-03' and field_name='format'`)).rows[0].verification_status,"not_announced");
    const tuesdayEventId=(await db.query("select id from public.lr_events where slug='oak-grove-howards-weekly-2026-11-03'")).rows[0].id;
    assert.equal((await db.query("select expires_at>now() as current from public.lr_event_field_evidence where event_id=$1 and field_name='format' and source_id=(select id from public.lr_sources where key='oak_grove_disc_golf_club_direct')",[tuesdayEventId])).rows[0].current,true);
    await db.query("update public.lr_event_field_evidence set expires_at=now()-interval '1 minute' where event_id=$1 and field_name='format' and source_id=(select id from public.lr_sources where key='oak_grove_disc_golf_club_direct')",[tuesdayEventId]);
    assert.equal((await db.query(`select verification_status from public.lr_event_field_status where event_id=$1 and field_name='format'`,[tuesdayEventId])).rows[0].verification_status,"stale");
    const tuesdayStillUpcoming = (await db.query("select start_date >= (now() at time zone 'America/Los_Angeles')::date as upcoming from public.lr_events where id=$1",[tuesdayEventId])).rows[0].upcoming;
    await db.query("select public.lr_enqueue_event_field_reviews(60)");
    assert.equal((await db.query(`select count(*)::int as n from public.lr_review_queue where issue_type='event_field_verification' and event_id=$1 and details->>'field'='format' and status in ('open','in_review')`,[tuesdayEventId])).rows[0].n,tuesdayStillUpcoming ? 1 : 0);
    const correctedOakSaturday=(await db.query(`
      select checkin_time_local::text,start_time_local::text,start_time_note from public.lr_events where slug='oak-grove-ogdgc-weekly-2026-11-07'
    `)).rows[0];
    assert.deepEqual(correctedOakSaturday,{checkin_time_local:"13:00:00",start_time_local:"14:00:00",start_time_note:null});
    const correctedOakMonthly=(await db.query(`
      select format_details from public.lr_events where slug='oak-grove-og-monthly-disc-swap-2026-11-28'
    `)).rows[0];
    assert.deepEqual(correctedOakMonthly.format_details,{disc_swap_hours:"8 AM–2 PM"});
    const monthlySource=(await db.query(`
      select es.source_payload->>'published_time' as current_time,es.source_payload->>'prior_published_time' as prior_time
      from public.lr_event_sources es join public.lr_events e on e.id=es.event_id
      where e.slug='oak-grove-og-monthly-disc-swap-2026-11-28'
        and es.source_id=(select id from public.lr_sources where key='oak_grove_disc_golf_club_direct')
    `)).rows[0];
    assert.equal(monthlySource.current_time,"1 PM Check-in, 2 PM start; Disc Swap 8 AM-2 PM");
    assert.equal(monthlySource.prior_time,"1 PM Check-in, 2 PM start; Disc Swap 11:30 AM to 5:30 PM");
    const correctedRabbit=(await db.query(`
      select format,start_time_local::text,timezone from public.lr_events where slug='rabbit-flats-disc-golf-drop-in-2026-11-07'
    `)).rows[0];
    assert.deepEqual(correctedRabbit,{format:"Drop-In Program",start_time_local:"10:00:00",timezone:"America/Los_Angeles"});
    assert.equal((await db.query("select format from public.lr_events where id=$1",[oakOverrideTarget])).rows[0].format,"operator format");
    assert.equal((await db.query(`select status from public.lr_event_field_evidence where event_id=$1 and field_name='format' and source_id=(select id from public.lr_sources where key='oak_grove_disc_golf_club_direct')`,[oakOverrideTarget])).rows[0].status,"conflicting");
    assert.equal((await db.query("select count(*)::int as n from public.lr_source_runs where parser_version='schedule-field-reconciliation-v1' and records_valid>0")).rows[0].n,2);
    const reconciledScheduleRows=(await db.query(`
      select s.key,r.records_valid from public.lr_source_runs r join public.lr_sources s on s.id=r.source_id
      where r.parser_version='schedule-field-reconciliation-v1' order by s.key
    `)).rows.map((row)=>[row.key,row.records_valid]);
    assert.deepEqual(reconciledScheduleRows,[
      ["crpd_rabbit_flats_direct",3],
      ["oak_grove_disc_golf_club_direct",34],
    ]);

    let dateEvidence = (await db.query(`
      select verification_status,public.lr_event_field_value(event_id,'start_date') as canonical_value
      from public.lr_event_field_status where event_id=$1 and field_name='start_date'
    `, [billyGoatId])).rows[0];
    assert.equal(dateEvidence.verification_status, "conflicting");
    assert.equal(dateEvidence.canonical_value, "2026-11-28");
    const observedConflict = (await db.query("select observed_value,notes from public.lr_event_field_evidence where event_id=$1 and field_name='start_date' and status='conflicting'", [billyGoatId])).rows[0];
    assert.equal(observedConflict.observed_value, "2026-11-23");
    assert.ok(observedConflict.notes.includes("November 23, 2026 is Monday"));
    await db.query("select public.lr_enqueue_event_field_reviews(90)");
    assert.equal((await db.query(`select count(*)::int as n from public.lr_review_queue where issue_type='event_field_verification' and event_id=$1 and details->>'field'='start_date' and status in ('open','in_review')`, [billyGoatId])).rows[0].n, 1);
    assert.equal((await db.query("select start_date::text from public.lr_events where id=$1", [billyGoatId])).rows[0].start_date, "2026-11-28");
    await db.query("select public.lr_enqueue_event_field_reviews(90)");
    assert.equal((await db.query(`select count(*)::int as n from public.lr_review_queue where issue_type='event_field_verification' and event_id=$1 and details->>'field'='start_date' and status in ('open','in_review')`, [billyGoatId])).rows[0].n, 1);

    const eventId = "11111111-1111-4111-8111-111111111111";
    const sourceId = (await db.query("select id from public.lr_sources where key='hbnf_internal_schedule'")).rows[0].id;
    await db.query(`
      insert into public.lr_events(id,slug,name,start_date,end_date,county,city,event_type,status,last_verified_at)
      values($1,'pglite-test','PGlite test',date '2026-11-03',date '2026-11-03','Orange','Huntington Beach','other','upcoming',now())
    `, [eventId]);
    await db.query(`
      insert into public.lr_event_sources(event_id,source_id,external_id,source_url,source_role,source_payload)
      values($1,$2,'fixture','https://hbnightflyers.com/','organizer_confirmed',$3::jsonb)
    `, [eventId, sourceId, JSON.stringify({ origin: "organizer_confirmed_schedule" })]);
    await db.query("update public.lr_events set published=true where id=$1",[eventId]);
    await db.query("select public.lr_enqueue_event_field_reviews(90)");
    const feeReview = (await db.query(`
      select details from public.lr_review_queue where issue_type='event_field_verification' and event_id=$1 and details->>'field'='entry_fee_amount' and status in ('open','in_review')
    `,[eventId])).rows[0];
    if (tuesdayStillUpcoming) {
      assert.ok(feeReview);
      assert.equal(feeReview.details.verification_status,"unverified");
      assert.ok(feeReview.details.authorized_sources.includes("hbnf_internal_schedule"));
    } else {
      assert.equal(feeReview,undefined); // The 2026-11-03 fixture is past; reviews are intentionally not enqueued.
    }
    await db.query("select public.lr_enqueue_event_field_reviews(90)");
    assert.equal((await db.query(`select count(*)::int as n from public.lr_review_queue where issue_type='event_field_verification' and event_id=$1 and details->>'field'='entry_fee_amount' and status in ('open','in_review')`,[eventId])).rows[0].n,tuesdayStillUpcoming ? 1 : 0);

    const patch = {
      start_time_local: "17:30",
      checkin_time_local: "17:00",
      end_time_local: "21:00",
      format: "Doubles",
      format_details: { registration_mode: "Individual" },
      entry_fee_amount: 10,
      entry_fee_currency: "USD",
      entry_fee_unit: "person",
      fee_breakdown: [
        { label: "Play", amount: 7, currency: "USD" },
        { label: "Ace contribution", amount: 3, currency: "USD" },
      ],
      additional_fees_note: "Standard course fee payable separately; amount not specified.",
    };
    await db.query("select public.lr_apply_event_patch($1,$2::jsonb)", [eventId, JSON.stringify(patch)]);
    let event = (await db.query(`
      select name,start_date::text,start_time_local::text,checkin_time_local::text,end_time_local::text,format,format_details,entry_fee_amount,fee_breakdown
      from public.lr_events where id=$1
    `, [eventId])).rows[0];
    assert.equal(event.name, "PGlite test");
    assert.equal(event.start_date, "2026-11-03");
    assert.equal(event.start_time_local, "17:30:00");
    assert.equal(event.checkin_time_local, "17:00:00");
    assert.equal(event.end_time_local, "21:00:00");
    assert.equal(event.format, "Doubles");
    assert.deepEqual(event.format_details, { registration_mode: "Individual" });
    assert.equal(Number(event.entry_fee_amount), 10);
    assert.equal(event.fee_breakdown.length, 2);

    const validTimeFields = {
      name: "Time contract fixture", start_date: "2026-11-03", end_date: "2026-11-03",
      timezone: "America/Los_Angeles", checkin_time_local: "17:00", start_time_local: "17:30",
    };
    assert.deepEqual((await db.query("select public.lr_candidate_validation_errors($1::jsonb) as errors", [JSON.stringify(validTimeFields)])).rows[0].errors, []);
    const missingTimezoneErrors = (await db.query("select public.lr_candidate_validation_errors($1::jsonb) as errors", [JSON.stringify({ ...validTimeFields, timezone: null })])).rows[0].errors;
    assert.ok(missingTimezoneErrors.includes("timezone_required_for_timed_event"));
    const lateCheckinErrors = (await db.query("select public.lr_candidate_validation_errors($1::jsonb) as errors", [JSON.stringify({ ...validTimeFields, checkin_time_local: "18:00" })])).rows[0].errors;
    assert.ok(lateCheckinErrors.includes("checkin_after_start_time"));
    const conflictingStartErrors = (await db.query("select public.lr_candidate_validation_errors($1::jsonb) as errors", [JSON.stringify({ ...validTimeFields, start_time_note: "around 5 PM" })])).rows[0].errors;
    assert.ok(conflictingStartErrors.includes("start_time_note_conflicts_with_exact_start"));

    await db.query("select public.lr_apply_event_patch($1,$2::jsonb)", [billyGoatId, JSON.stringify({ checkin_time_local: "13:00", start_time_local: "14:00" })]);
    const publicRow = (await db.query("select checkin_time_local::text,start_time_note from public.lr_public_events() where id=$1", [billyGoatId])).rows[0];
    assert.equal(publicRow.checkin_time_local, "13:00:00");
    assert.equal(publicRow.start_time_note, null);
    await db.query("select public.lr_apply_event_patch($1,$2::jsonb)", [billyGoatId, JSON.stringify({ start_time_local: null, start_time_note: "Around 5 PM" })]);
    const publicNoteRow = (await db.query("select checkin_time_local::text,start_time_local::text,start_time_note from public.lr_public_event_detail('billy-goat-fallen-disc-golfers-memorial-2026')")).rows[0];
    assert.equal(publicNoteRow.checkin_time_local, "13:00:00");
    assert.equal(publicNoteRow.start_time_local, null);
    assert.equal(publicNoteRow.start_time_note, "Around 5 PM");

    await assert.rejects(
      db.query("select public.lr_apply_event_patch($1,$2::jsonb)", [eventId, JSON.stringify({ entry_fee_amount: -1 })]),
    );
    event = (await db.query("select entry_fee_amount,format from public.lr_events where id=$1", [eventId])).rows[0];
    assert.equal(Number(event.entry_fee_amount), 10);
    assert.equal(event.format, "Doubles");

    await db.query("select public.lr_set_manual_override($1,'entry_fee_amount','10'::jsonb,'PGlite fixture override',null)", [eventId]);
    await db.query("select public.lr_apply_event_patch($1,$2::jsonb)", [eventId, JSON.stringify({ entry_fee_amount: 12 })]);
    event = (await db.query("select entry_fee_amount from public.lr_events where id=$1", [eventId])).rows[0];
    assert.equal(Number(event.entry_fee_amount), 10);
    assert.equal((await db.query("select verification_status from public.lr_event_field_status where event_id=$1 and field_name='format'", [eventId])).rows.length, 1);
    await db.query("select public.lr_enqueue_event_field_reviews(90)");
    const feeReviewAfterPatch = (await db.query(`select status from public.lr_review_queue where issue_type='event_field_verification' and event_id=$1 and details->>'field'='entry_fee_amount'`,[eventId])).rows[0];
    assert.equal(feeReviewAfterPatch?.status,tuesdayStillUpcoming ? "resolved" : undefined);

    const placeholderId = "22222222-2222-4222-8222-222222222222";
    await db.query(`
      insert into public.lr_events(id,slug,name,start_date,end_date,county,city,event_type,status,sanctioned,last_verified_at)
      values($1,'pglite-schedule-placeholder','Unobserved schedule placeholder',date '2026-11-10',date '2026-11-10','Orange','Huntington Beach','other','upcoming',false,now())
    `, [placeholderId]);
    await db.query(`
      insert into public.lr_event_sources(event_id,source_id,external_id,source_url,source_role,source_payload)
      values($1,$2,'placeholder','https://hbnightflyers.com/','organizer_confirmed',$3::jsonb)
    `, [placeholderId, sourceId, JSON.stringify({ origin: "club_schedule_rule", observed_in_league_state: false, schedule_rule: "tuesday" })]);
    await db.query("update public.lr_events set published=true where id=$1", [placeholderId]);
    assert.equal((await db.query("select published from public.lr_events where id=$1", [placeholderId])).rows[0].published, false);

    // Open issues must not vanish merely because an event moves outside the
    // current monitor horizon; cancellation is an explicit terminal reason.
    await db.query("update public.lr_events set start_date='2027-01-31',end_date='2027-01-31' where id=$1",[billyGoatId]);
    await db.query("select public.lr_enqueue_event_field_reviews(30)");
    assert.equal((await db.query(`select status from public.lr_review_queue where issue_type='event_field_verification' and event_id=$1 and details->>'field'='start_date'`,[billyGoatId])).rows[0].status,"open");
    await db.query("update public.lr_events set status='canceled' where id=$1",[billyGoatId]);
    await db.query("select public.lr_enqueue_event_field_reviews(30)");
    const closedCancelReview=(await db.query(`select status,resolution from public.lr_review_queue where issue_type='event_field_verification' and event_id=$1 and details->>'field'='start_date'`,[billyGoatId])).rows[0];
    assert.equal(closedCancelReview.status,"resolved");
    assert.equal(closedCancelReview.resolution,"Event is no longer published as an upcoming item");

    const oakSourceId = (await db.query("select id from public.lr_sources where key='oak_grove_disc_golf_club_direct'")).rows[0].id;
    const oakRunId = (await db.query(`
      insert into public.lr_source_runs(source_id,started_at,finished_at,fetch_status,parse_status,validation_status,health_status,records_seen,records_valid,parser_version,metrics)
      values($1,now(),now(),'ok','ok','ok','healthy',3,3,'manual-page-facts-test',jsonb_build_object('verification_method','first_party_page_manual_review')) returning id
    `,[oakSourceId])).rows[0].id;
    const oakEvent = (await db.query(`
      select e.id,e.name,e.start_date::text,e.end_date::text,e.county,e.city,e.course_name,e.timezone,es.external_id,es.source_url
      from public.lr_events e join public.lr_event_sources es on es.event_id=e.id
      where e.slug='oak-grove-wednesday-doubles-2026-11-04' and es.source_id=$1
    `,[oakSourceId])).rows[0];
    const oakPayload = {
      name: oakEvent.name, start_date: oakEvent.start_date, end_date: oakEvent.end_date,
      timezone: oakEvent.timezone, county: oakEvent.county, city: oakEvent.city,
      course_name: oakEvent.course_name, event_type: "doubles", format: "Doubles",
      start_time_note: "Show up around 5 PM",
      field_evidence: {
        format: { source_key: "oak_grove_disc_golf_club_direct", status: "verified", source_url: oakEvent.source_url },
        start_time_note: { source_key: "oak_grove_disc_golf_club_direct", status: "verified", source_url: oakEvent.source_url },
      },
    };
    const oakCandidateId = (await db.query(`
      insert into public.lr_source_candidates(source_run_id,source_id,external_id,source_url,normalized_payload)
      values($1,$2,$3,$4,$5::jsonb) returning id
    `,[oakRunId,oakSourceId,oakEvent.external_id,oakEvent.source_url,JSON.stringify(oakPayload)])).rows[0].id;
    assert.equal((await db.query("select public.lr_apply_authoritative_candidate($1) as event_id",[oakCandidateId])).rows[0].event_id,oakEvent.id);
    const normalizedOak = (await db.query("select format,start_time_note from public.lr_events where id=$1",[oakEvent.id])).rows[0];
    assert.equal(normalizedOak.format,"Doubles");
    assert.equal(normalizedOak.start_time_note,"Show up around 5 PM");
    const oakExpiry = (await db.query("select expires_at-verified_at as ttl from public.lr_event_field_evidence where event_id=$1 and field_name='start_time_note' and source_id=$2",[oakEvent.id,oakSourceId])).rows[0].ttl;
    assert.equal(oakExpiry,"14 days");

    const tuesday = (await db.query(`
      select e.id,e.name,e.start_date::text,e.end_date::text,e.county,e.city,e.course_name,e.timezone,es.external_id,es.source_url
      from public.lr_events e join public.lr_event_sources es on es.event_id=e.id
      where e.slug='oak-grove-howards-weekly-2026-11-03' and es.source_id=$1
    `,[oakSourceId])).rows[0];
    const clearFormatPayload = {
      name: tuesday.name, start_date: tuesday.start_date, end_date: tuesday.end_date,
      timezone: tuesday.timezone, county: tuesday.county, city: tuesday.city,
      course_name: tuesday.course_name, event_type: "league", format: null,
      start_time_note: "3 Hours Before Sunset",
      field_evidence: {
        format: { source_key: "oak_grove_disc_golf_club_direct", status: "not_announced", clear_value: true, source_url: tuesday.source_url, notes: "The time rule was previously misfiled as format; the first-party schedule does not announce a play format." },
        start_time_note: { source_key: "oak_grove_disc_golf_club_direct", status: "verified", source_url: tuesday.source_url },
      },
    };
    const clearCandidateId = (await db.query(`
      insert into public.lr_source_candidates(source_run_id,source_id,external_id,source_url,normalized_payload)
      values($1,$2,$3,$4,$5::jsonb) returning id
    `,[oakRunId,oakSourceId,tuesday.external_id,tuesday.source_url,JSON.stringify(clearFormatPayload)])).rows[0].id;
    await db.query("select public.lr_apply_authoritative_candidate($1)",[clearCandidateId]);
    const cleared = (await db.query("select format,start_time_note from public.lr_events where id=$1",[tuesday.id])).rows[0];
    assert.equal(cleared.format,null);
    assert.equal(cleared.start_time_note,"3 Hours Before Sunset");
    assert.equal((await db.query("select verification_status from public.lr_event_field_status where event_id=$1 and field_name='format'",[tuesday.id])).rows[0].verification_status,"not_announced");

    const overriddenEvent = (await db.query(`
      select e.id,e.name,e.start_date::text,e.end_date::text,e.county,e.city,e.course_name,e.timezone,es.external_id,es.source_url
      from public.lr_events e join public.lr_event_sources es on es.event_id=e.id
      where e.slug='oak-grove-howards-weekly-2026-11-10' and es.source_id=$1
    `,[oakSourceId])).rows[0];
    await db.query("select public.lr_set_manual_override($1,'format','\"operator value\"'::jsonb,'Keep current operator-entered format',null)",[overriddenEvent.id]);
    const protectedPayload={...clearFormatPayload,name:overriddenEvent.name,start_date:overriddenEvent.start_date,end_date:overriddenEvent.end_date,county:overriddenEvent.county,city:overriddenEvent.city,course_name:overriddenEvent.course_name,timezone:overriddenEvent.timezone};
    const protectedCandidate=(await db.query(`insert into public.lr_source_candidates(source_run_id,source_id,external_id,source_url,normalized_payload) values($1,$2,$3,$4,$5::jsonb) returning id`,[oakRunId,oakSourceId,overriddenEvent.external_id,overriddenEvent.source_url,JSON.stringify(protectedPayload)])).rows[0].id;
    await db.query("select public.lr_apply_authoritative_candidate($1)",[protectedCandidate]);
    assert.equal((await db.query("select format from public.lr_events where id=$1",[overriddenEvent.id])).rows[0].format,"operator value");
    assert.equal((await db.query("select status from public.lr_event_field_evidence where event_id=$1 and field_name='format' and source_id=$2",[overriddenEvent.id,oakSourceId])).rows[0].status,"conflicting");

    const protectedIdentityCandidate = (await db.query(`
      insert into public.lr_source_candidates(source_run_id,source_id,external_id,source_url,normalized_payload)
      values($1,$2,$3,$4,$5::jsonb) returning id
    `,[oakRunId,oakSourceId,tuesday.external_id,tuesday.source_url,JSON.stringify({
      name:tuesday.name,start_date:tuesday.start_date,end_date:tuesday.end_date,county:tuesday.county,city:tuesday.city,
      course_name:tuesday.course_name,event_type:null,
      field_evidence:{event_type:{source_key:"oak_grove_disc_golf_club_direct",status:"not_announced",clear_value:true,source_url:tuesday.source_url}},
    })])).rows[0].id;
    await assert.rejects(db.query("select public.lr_apply_authoritative_candidate($1)",[protectedIdentityCandidate]),/identity\/control field event_type/);
    assert.equal((await db.query("select event_type from public.lr_events where id=$1",[tuesday.id])).rows[0].event_type,"league");

    const hbnfRunId=(await db.query(`
      insert into public.lr_source_runs(source_id,started_at,finished_at,fetch_status,parse_status,validation_status,health_status,records_seen,records_valid,parser_version)
      values($1,now(),now(),'ok','ok','ok','healthy',1,1,'field-evidence-test') returning id
    `,[sourceId])).rows[0].id;
    const staleManualCandidate = (await db.query(`
      insert into public.lr_source_candidates(source_run_id,source_id,external_id,source_url,normalized_payload)
      values($1,$2,'fixture','https://hbnightflyers.com/',$3::jsonb) returning id
    `,[hbnfRunId,sourceId,JSON.stringify({
      name:"PGlite test",start_date:"2026-11-03",end_date:"2026-11-03",county:"Orange",city:"Huntington Beach",
      course_name:"Huntington Beach Central Park Disc Golf Course",format:"Random doubles",
      field_evidence:{format:{source_key:"hbnf_udisc_manual",status:"verified",verified_at:"2000-01-01T00:00:00Z",source_url:"https://udisc.com/events/hb-glow-doubles-tAP8Y5/about"}},
    })])).rows[0].id;
    await db.query("select public.lr_apply_authoritative_candidate($1)",[staleManualCandidate]);
    assert.equal((await db.query("select format from public.lr_events where id=$1",[eventId])).rows[0].format,"Doubles");
    const staleEvidence=(await db.query("select status,verified_at from public.lr_event_field_evidence where event_id=$1 and field_name='format' and source_id=(select id from public.lr_sources where key='hbnf_udisc_manual')",[eventId])).rows[0];
    assert.equal(staleEvidence.status,"stale");
    assert.equal(staleEvidence.verified_at.toISOString(),"2000-01-01T00:00:00.000Z");

    const futureEvidenceCandidate=(await db.query(`
      insert into public.lr_source_candidates(source_run_id,source_id,external_id,source_url,normalized_payload)
      values($1,$2,'fixture','https://hbnightflyers.com/',$3::jsonb) returning id
    `,[hbnfRunId,sourceId,JSON.stringify({
      name:"PGlite test",start_date:"2026-11-03",end_date:"2026-11-03",county:"Orange",city:"Huntington Beach",
      format:"Unverified future value",
      field_evidence:{format:{source_key:"hbnf_udisc_manual",status:"verified",verified_at:"2999-01-01T00:00:00Z",source_url:"https://udisc.com/events/hb-glow-doubles-tAP8Y5/about"}},
    })])).rows[0].id;
    await assert.rejects(db.query("select public.lr_apply_authoritative_candidate($1)",[futureEvidenceCandidate]),/cannot be in the future/);
    assert.equal((await db.query("select format from public.lr_events where id=$1",[eventId])).rows[0].format,"Doubles");
  } finally {
    await db.close();
  }
});

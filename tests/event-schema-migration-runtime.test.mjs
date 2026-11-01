import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migrationDir = new URL("../supabase/migrations/", import.meta.url);
const candidateMigration = "20261101070000_event_detail_fields_and_provenance.sql";
const excludedBaselineMigration = /(?:_du_|du_generation|du_admin|du_web_push|du_device_pair|du_chatgpt|fix_du|harden_du|gallery_legacy|migrate_du|fill_socal_championship_course|harden_remaining_public_helper_execute|hbnf_owner_confirmed_glow_schedule)/i;

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

    await db.exec(await readFile(new URL(candidateMigration, migrationDir), "utf8"));
    const eventId = "11111111-1111-4111-8111-111111111111";
    const sourceId = (await db.query("select id from public.lr_sources where key='hbnf_internal_schedule'")).rows[0].id;
    await db.query(`
      insert into public.lr_events(id,slug,name,start_date,end_date,event_type,status)
      values($1,'pglite-test','PGlite test',date '2026-11-03',date '2026-11-03','other','upcoming')
    `, [eventId]);
    await db.query(`
      insert into public.lr_event_sources(event_id,source_id,external_id,source_url,source_role,source_payload)
      values($1,$2,'fixture','https://hbnightflyers.com/','organizer_confirmed',$3::jsonb)
    `, [eventId, sourceId, JSON.stringify({ origin: "organizer_confirmed_schedule" })]);

    const patch = {
      start_time_local: "17:30",
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
      select name,start_date::text,start_time_local::text,end_time_local::text,format,format_details,entry_fee_amount,fee_breakdown
      from public.lr_events where id=$1
    `, [eventId])).rows[0];
    assert.equal(event.name, "PGlite test");
    assert.equal(event.start_date, "2026-11-03");
    assert.equal(event.start_time_local, "17:30:00");
    assert.equal(event.end_time_local, "21:00:00");
    assert.equal(event.format, "Doubles");
    assert.deepEqual(event.format_details, { registration_mode: "Individual" });
    assert.equal(Number(event.entry_fee_amount), 10);
    assert.equal(event.fee_breakdown.length, 2);

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
  } finally {
    await db.close();
  }
});

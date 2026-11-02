import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const root = new URL("../", import.meta.url);
const migrationDir = new URL("../supabase/migrations/", import.meta.url);
const migration700 = "20261101070000_event_detail_fields_and_provenance.sql";
const migration800 = "20261101080000_reconcile_verified_schedule_fields.sql";
const excluded = /(?:_du_|du_|fix_du|harden_du|gallery_legacy|migrate_du|fill_socal_championship_course|harden_remaining_public_helper_execute|hbnf_owner_confirmed_glow_schedule|20261101080000|20261101070000)/i;

async function baseline() {
  const db = new PGlite();
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
  const names = (await readdir(migrationDir)).filter(n=>n.endsWith(".sql")&&!excluded.test(n)).sort();
  for (const name of names) {
    const sql = (await readFile(new URL(name,migrationDir),"utf8"))
      .replace(/^\s*create extension if not exists [^;]+;\s*$/gim,"-- PGlite managed extension stub");
    await db.exec(sql);
  }
  const eventId="33333333-3333-4333-8333-333333333333";
  const sourceId=(await db.query("select id from public.lr_sources where key='socal_dgc_manual_calendar'")).rows[0].id;
  await db.query(`insert into public.lr_events(id,slug,name,start_date,end_date,county,city,venue_name,event_type,status,sanctioned,last_verified_at) values($1,'billy-goat-fallen-disc-golfers-memorial-2026','Billy Goat ~ Fallen Disc Golfers Memorial',date '2026-11-28',date '2026-11-28','San Bernardino','Yucaipa','Yucaipa Regional Park','tournament','upcoming',true,now())`,[eventId]);
  await db.query(`insert into public.lr_event_sources(event_id,source_id,external_id,source_url,source_role,is_sanction_basis) values($1,$2,'socal:2026:billy-goat','https://socaldiscgolfclub.com/upcoming-events/','organizer_confirmed',true)`,[eventId,sourceId]);
  await db.query("update public.lr_events set published=true where id=$1",[eventId]);
  return db;
}

async function capture(db, temp) {
  const tableNames=["lr_events","lr_event_sources","lr_sources","lr_source_runs","lr_source_candidates","lr_event_change_log","lr_review_queue"];
  const tables={};
  for (const t of tableNames) tables[t]=(await db.query(`select * from public.${t}`)).rows;
  const columns=(await db.query("select table_name,column_name from information_schema.columns where table_schema='public' and table_name=any($1::text[])",[tableNames])).rows;
  const oldNames=["lr_apply_authoritative_candidate","lr_apply_event_patch","lr_candidate_validation_errors","lr_decide_event_submission","lr_event_field_value","lr_ingest_event_submission","lr_is_overridable_event_field","lr_public_event_detail","lr_public_events","lr_set_manual_override"];
  const functionRows=(await db.query(`select p.proname as name,p.proname||'('||pg_catalog.oidvectortypes(p.proargtypes)||')' as signature,pg_get_userbyid(p.proowner) as owner,coalesce(p.proacl,acldefault('f',p.proowner))::text as acl,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any($1::text[])`,[oldNames])).rows;
  assert.equal(functionRows.length,10,"preimage must contain all ten replaced functions");
  const snapshot={snapshot_at:new Date().toISOString(),tables,schema:{columns,functions:functionRows.map(f=>({name:f.name})),indexes:[],constraints:[]}};
  const snapshotPath=path.join(temp,"snapshot.json"), functionsPath=path.join(temp,"functions.json"), functionSqlPath=path.join(temp,"functions.sql");
  await writeFile(snapshotPath,JSON.stringify(snapshot));
  await writeFile(functionsPath,JSON.stringify({functions:functionRows}));
  await writeFile(functionSqlPath,functionRows.map(f=>f.definition).join("\n\n"));
  return {snapshot,snapshotPath,functionsPath,functionSqlPath};
}

test("generated Events P0 reverse restores exact scoped preimages and refuses post-migration event drift", async()=>{
  const db=await baseline(), temp=await mkdtemp(path.join(tmpdir(),"events-p0-rollback-"));
  try {
    const {snapshot,snapshotPath,functionsPath,functionSqlPath}=await capture(db,temp);
    await db.exec(await readFile(new URL(`../supabase/migrations/${migration700}`,import.meta.url),"utf8"));
    await db.exec(await readFile(new URL(`../supabase/migrations/${migration800}`,import.meta.url),"utf8"));
    const reversePath=path.join(temp,"reverse.sql"), reportPath=path.join(temp,"report.json");
    execFileSync("python3",[new URL("../scripts/build-events-p0-rollback.py",import.meta.url).pathname,
      "--snapshot",snapshotPath,"--prechange-functions",functionSqlPath,"--function-preimages",functionsPath,
      "--migrations",new URL("../supabase/migrations/",import.meta.url).pathname,"--out",reportPath,"--sql-out",reversePath]);
    const reverse=await readFile(reversePath,"utf8");
    assert.match(JSON.parse(await readFile(reportPath,"utf8")).rollback_sql.disposition,/GENERATED_FAIL_CLOSED/);

    // A concurrent edit to an unrelated field must be rejected even when
    // last_changed_at remains at the reconciliation timestamp. This previously
    // bypassed the reverse guard and would have been silently overwritten.
    const noteOnly=(await db.query("select id,internal_notes,updated_at,last_changed_at from public.lr_events where slug='oak-grove-howards-weekly-2026-11-03'")).rows[0];
    await db.query("update public.lr_events set internal_notes='concurrent note-only edit' where id=$1",[noteOnly.id]);
    await assert.rejects(db.exec(reverse),/affected event changed after reconciliation/);
    await db.exec("rollback").catch(()=>{});
    assert.equal((await db.query("select internal_notes from public.lr_events where id=$1",[noteOnly.id])).rows[0].internal_notes,"concurrent note-only edit");
    await db.exec("alter table public.lr_events disable trigger lr_events_touch_updated_at;");
    await db.query("update public.lr_events set internal_notes=$2,updated_at=$3,last_changed_at=$4 where id=$1",[noteOnly.id,noteOnly.internal_notes,noteOnly.updated_at,noteOnly.last_changed_at]);
    await db.exec("alter table public.lr_events enable trigger lr_events_touch_updated_at;");

    // Fields intentionally touched by the migration (format/timezone) also
    // require a timestamp drift veto; excluding them from baseline equality
    // must never permit a later source or operator edit to be clobbered.
    const changedFormat=(await db.query("select id,format,updated_at,last_changed_at from public.lr_events where slug='oak-grove-howards-weekly-2026-11-03'")).rows[0];
    await db.query("update public.lr_events set format='concurrent format edit' where id=$1",[changedFormat.id]);
    await assert.rejects(db.exec(reverse),/affected event changed after reconciliation/);
    await db.exec("rollback").catch(()=>{});
    await db.exec("alter table public.lr_events disable trigger lr_events_touch_updated_at;");
    await db.query("update public.lr_events set format=$2,updated_at=$3,last_changed_at=$4 where id=$1",[changedFormat.id,changedFormat.format,changedFormat.updated_at,changedFormat.last_changed_at]);
    await db.exec("alter table public.lr_events enable trigger lr_events_touch_updated_at;");

    const event=(await db.query("select id,internal_notes,updated_at from public.lr_events where slug='oak-grove-howards-weekly-2026-11-03'")).rows[0];
    await db.query("update public.lr_events set internal_notes='post-migration concurrent edit',updated_at=updated_at+interval '1 second',last_changed_at=last_changed_at+interval '1 second' where id=$1",[event.id]);
    await assert.rejects(db.exec(reverse),/affected event changed after reconciliation/);
    await db.exec("rollback").catch(()=>{});
    assert.equal((await db.query("select internal_notes from public.lr_events where id=$1",[event.id])).rows[0].internal_notes,"post-migration concurrent edit");
    await db.exec("alter table public.lr_events disable trigger lr_events_touch_updated_at;");
    await db.query("update public.lr_events set internal_notes=$2,updated_at=$3,last_changed_at=(select created_at from public.lr_source_runs where parser_version='schedule-field-reconciliation-v1' limit 1) where id=$1",[event.id,event.internal_notes,event.updated_at]);
    await db.exec("alter table public.lr_events enable trigger lr_events_touch_updated_at;");

    // Reconciliation only edits two OG Disc Swap source links, but the
    // generated reverse restores all 37 links. Refuse to clobber a later
    // CRPD source-only edit even when its canonical event is untouched.
    const crpdLink=(await db.query("select es.id,es.source_url,es.updated_at from public.lr_event_sources es join public.lr_sources s on s.id=es.source_id where s.key='crpd_rabbit_flats_direct' order by es.id limit 1")).rows[0];
    assert.ok(crpdLink,"CRPD source-link fixture must exist");
    await db.query("update public.lr_event_sources set source_url='https://example.org/concurrent-source-update' where id=$1",[crpdLink.id]);
    await assert.rejects(db.exec(reverse),/scoped source link changed after reconciliation/);
    await db.exec("rollback").catch(()=>{});
    assert.equal((await db.query("select source_url from public.lr_event_sources where id=$1",[crpdLink.id])).rows[0].source_url,"https://example.org/concurrent-source-update");
    await db.exec("alter table public.lr_event_sources disable trigger lr_event_sources_touch_updated_at;");
    await db.query("update public.lr_event_sources set source_url=$2,updated_at=$3 where id=$1",[crpdLink.id,crpdLink.source_url,crpdLink.updated_at]);
    await db.exec("alter table public.lr_event_sources enable trigger lr_event_sources_touch_updated_at;");

    const currentEvents=(await db.query("select * from public.lr_events")).rows;
    const oldById=new Map(snapshot.tables.lr_events.map(x=>[x.id,x]));
    const allowed=new Set(["timezone","format","updated_at","last_changed_at","last_verified_at","venue_address","course_id","course_url","start_time_local","checkin_time_local","end_time_local","start_time_note","format_details","entry_fee_amount","entry_fee_currency","entry_fee_unit","fee_breakdown","additional_fees_note","registration_opens_at","registration_closes_at","registration_capacity","registration_available","official_url"]);
    const unexpected=currentEvents.flatMap(x=>{const old=oldById.get(x.id);return old?[{slug:x.slug,fields:Object.keys(old).filter(k=>!allowed.has(k)&&JSON.stringify(old[k])!==JSON.stringify(x[k]))}]:[]}).filter(x=>x.fields.length).slice(0,10);
    if(unexpected.length) console.log("PREIMAGE_UNEXPECTED_FIELDS",JSON.stringify(unexpected));
    await db.exec(reverse);
    for (const table of ["lr_sources","lr_events","lr_event_sources","lr_source_runs","lr_source_candidates","lr_event_change_log","lr_review_queue"]) {
      const rows=(await db.query(`select * from public.${table}`)).rows;
      const sort=x=>JSON.stringify([...x].sort((a,b)=>String(a.id).localeCompare(String(b.id))));
      if(sort(rows)!==sort(snapshot.tables[table])) {
        const before=new Map(snapshot.tables[table].map(x=>[x.id,x]));
        const diff=rows.filter(x=>JSON.stringify(x)!==JSON.stringify(before.get(x.id))).slice(0,2).map(x=>({id:x.id,changed:Object.keys(x).filter(k=>JSON.stringify(x[k])!==JSON.stringify(before.get(x.id)?.[k]))}));
        assert.fail(`${table} must match exact preimage after reverse; differing fields ${JSON.stringify(diff)}`);
      }
    }
    const added=(await db.query("select column_name from information_schema.columns where table_schema='public' and table_name='lr_events' and column_name in ('venue_address','course_id','start_time_local','entry_fee_amount')")).rows;
    assert.equal(added.length,0,"added canonical fields must be removed by reverse");
    assert.equal((await db.query("select to_regclass('public.lr_event_field_evidence') as x")).rows[0].x,null);
    assert.equal((await db.query("select to_regclass('public.lr_event_field_status') as x")).rows[0].x,null);
    assert.equal((await db.query("select count(*)::int as n from public.lr_source_runs where parser_version='schedule-field-reconciliation-v1'")).rows[0].n,0);
    const restored=(await db.query("select pg_get_function_result(p.oid) as result from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='lr_public_events'")).rows[0]?.result;
    assert.ok(restored,"the previous public event RPC must be recreated");
    assert.doesNotMatch(restored,/venue_address|start_time_local|entry_fee_amount/);
  } finally {
    await db.close(); await rm(temp,{recursive:true,force:true});
  }
});

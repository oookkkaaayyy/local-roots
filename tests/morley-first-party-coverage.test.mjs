import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";

const forward=await readFile(new URL("../supabase/migrations/20261105002000_add_morley_first_party_course_championships.sql",import.meta.url),"utf8");
const reverse=await readFile(new URL("../scripts/restore-morley-first-party-course-championships-2026.sql",import.meta.url),"utf8");
const slugs=["morley-field-amateur-course-championships-2026","morley-field-pro-course-championship-2026"];

async function fixture(){
 const db=new PGlite();
 await db.exec([
  "create table public.lr_sources(id uuid primary key default gen_random_uuid(),key text unique not null,name text,source_type text,base_url text,access_method text,permission_basis text,enabled boolean,authoritative_fields text[],refresh_schedule text,verification_ttl interval,notes text);",
  "create table public.lr_events(id uuid primary key default gen_random_uuid(),slug text unique not null,name text,start_date date,end_date date,timezone text,county text,city text,course_name text,event_type text,status text,sanctioned boolean,tier text,club_host text,start_time_local time,end_time_local time,registration_url text,official_url text,published boolean not null default false,confidence numeric,last_verified_at timestamptz,internal_notes text);",
  "create table public.lr_event_sources(id uuid primary key default gen_random_uuid(),event_id uuid references public.lr_events(id),source_id uuid references public.lr_sources(id),external_id text,source_url text,source_role text,is_sanction_basis boolean,source_payload jsonb,confidence numeric,last_seen_at timestamptz,unique(source_id,external_id));",
  "create table public.lr_results(event_id uuid,source_id uuid,player_name text);",
  "create table public.lr_event_change_log(event_id uuid,source_id uuid);",
  "create table public.lr_event_field_evidence(event_id uuid,source_id uuid);",
  "create table public.lr_event_submissions(matched_event_id uuid);",
  "create table public.lr_manual_overrides(event_id uuid);",
  "create table public.lr_result_submissions(event_id uuid);",
  "create table public.lr_review_queue(event_id uuid);",
  "create table public.lr_source_candidates(match_event_id uuid,source_id uuid);",
  "create table public.lr_source_runs(source_id uuid);",
  "create table public.lr_source_cursors(source_id uuid);",
  "create table public.lr_source_discovery_items(source_id uuid);",
  "insert into public.lr_sources(id,key,name,source_type,base_url,access_method,permission_basis,enabled,authoritative_fields) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','hbnf_internal_schedule','HBNF','internal','https://hbnightflyers.com/','owner','first party',true,array['name']);",
  "insert into public.lr_events(id,slug,name,start_date,end_date,timezone,county,city,course_name,event_type,status,published) values('5e87e132-dfe9-41e5-8087-80d4b881caa0','hbnf-glow-2026-09-02','Synthetic history','2026-09-02','2026-09-02','America/Los_Angeles','Orange','Huntington Beach','Huntington Beach Disc Golf Course','doubles','completed',false),('11111111-1111-4111-8111-111111111111','real-upcoming-event','Other event','2026-12-05','2026-12-05','America/Los_Angeles','San Diego','San Diego','Other course','tournament','upcoming',true);",
  "insert into public.lr_event_sources(event_id,source_id,external_id,source_url,source_role) values('5e87e132-dfe9-41e5-8087-80d4b881caa0','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','hbnf:glow:2026-09-02','https://hbnightflyers.com/','organizer_confirmed');",
  "insert into public.lr_results(event_id,source_id,player_name) select '5e87e132-dfe9-41e5-8087-80d4b881caa0'::uuid,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'Fixture '||n from generate_series(1,6)n;",
 ].join("\n"));
 return db;
}
async function counts(db){
 return (await db.query("select (select count(*)::int from public.lr_events) events,(select count(*)::int from public.lr_sources) sources,(select count(*)::int from public.lr_event_sources) links,(select count(*)::int from public.lr_results where event_id='5e87e132-dfe9-41e5-8087-80d4b881caa0') fixture_rows,(select published from public.lr_events where slug='hbnf-glow-2026-09-02') fixture_public,(select published from public.lr_events where slug='real-upcoming-event') real_public")).rows[0];
}
test("Morley first-party calendar two rows: exact date, provenance-first, no unlicensed sanctioned inference, full rollback",async()=>{
 const db=await fixture();
 try{
  const baseline=await counts(db);
  await db.exec(forward);
  const rows=(await db.query("select e.slug,e.start_date::text start_date,e.end_date::text end_date,e.published,e.status,e.sanctioned,e.tier,e.registration_url,e.official_url,es.source_role,es.is_sanction_basis,es.source_url,s.refresh_schedule,s.authoritative_fields from public.lr_events e join public.lr_event_sources es on es.event_id=e.id join public.lr_sources s on s.id=es.source_id where s.key='morley_field_course_direct' order by e.start_date")).rows;
  assert.deepEqual(rows.map(r=>r.slug),slugs);
  assert.deepEqual(rows.map(r=>[r.start_date,r.end_date]),[["2026-12-05","2026-12-05"],["2026-12-12","2026-12-13"]]);
  for(const r of rows){
   assert.equal(r.published,true);
   assert.equal(r.status,"upcoming");
   assert.equal(r.sanctioned,null);
   assert.equal(r.tier,null);
   assert.equal(r.is_sanction_basis,false);
   assert.equal(r.source_role,"organizer_confirmed");
   assert.equal(r.official_url,"https://www.morleyfield.com/tournament-schedule-results");
   assert.equal(r.source_url,r.official_url);
   assert.ok(r.registration_url.startsWith("https://www.discgolfscene.com/"));
   assert.equal(r.refresh_schedule,null);
   assert.ok(!r.authoritative_fields.includes("sanctioned"));
   assert.ok(!r.authoritative_fields.includes("tier"));
  }
  assert.deepEqual(await counts(db),{events:baseline.events+2,sources:baseline.sources+1,links:baseline.links+2,fixture_rows:6,fixture_public:false,real_public:true});
  await db.exec(reverse);
  assert.deepEqual(await counts(db),baseline);
 }finally{await db.close();}
});
test("pre-existing Morley December championship refuses duplicate insertion atomically",async()=>{
 const db=await fixture();
 try{
  await db.query("insert into public.lr_events(slug,name,start_date,end_date,course_name,event_type,status) values('already-present','Another Course Championship','2026-12-05','2026-12-05','Morley Field Disc Golf Course','tournament','upcoming')");
  await assert.rejects(db.exec(forward),/identity already exists/);
  await db.exec("ROLLBACK;");
  assert.equal((await db.query("select count(*)::int n from public.lr_sources where key='morley_field_course_direct'")).rows[0].n,0);
 }finally{await db.close();}
});
test("rollback fails closed if a new result relies on either championship",async()=>{
 const db=await fixture();
 try{
  await db.exec(forward);
  const id=(await db.query("select id from public.lr_events where slug=$1",[slugs[0]])).rows[0].id;
  await db.query("insert into public.lr_results(event_id,player_name) values($1,'Real competitor')",[id]);
  await assert.rejects(db.exec(reverse),/dependent data/);
  await db.exec("ROLLBACK;");
  assert.equal((await db.query("select published from public.lr_events where id=$1",[id])).rows[0].published,true);
 }finally{await db.close();}
});

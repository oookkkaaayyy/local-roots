import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Native PostgreSQL transaction/path fixture. Exact installed authoritative
// RPC semantics are additionally checked against provider function definition.
// This fixture substitutes its exact-source match and field write path.
const forwardPolicy=await readFile(new URL('../supabase/migrations/20261105080000_e3_hbnf_glow_manual_eight_occurrence_authority.sql',import.meta.url),'utf8');
const forward=await readFile(new URL('../supabase/migrations/20261105090000_e3_promote_verified_glow_manual_candidates.sql',import.meta.url),'utf8');
const reverse=await readFile(new URL('../scripts/restore-e3-eight-glow-source-candidate-promotion.sql',import.meta.url),'utf8');
const reversePolicy=await readFile(new URL('../scripts/restore-e3-hbnf-glow-manual-evidence-authority.sql',import.meta.url),'utf8');
const dates=['2026-11-03','2026-11-10','2026-11-17','2026-11-24','2026-12-01','2026-12-08','2026-12-15','2026-12-22'];
const manual='a54e0b0e-0c4b-41a8-bf6b-7aca76c9baa3';
const internal='d77cfae0-8597-475a-8e05-ae96e2dbee6f';
const basis='The owner supplied the specific November 3, 10, and 17, 2026 organizer listing URLs and confirmed their facts. Retain only the listed event metadata and links; do not scrape or extrapolate to later dates.';
const notes='No automated retrieval. Exact event-specific facts from the owner-provided listings only; later Tuesdays remain unverified for time, venue, fee, and event URL.';

async function fixture(){
 const db=new PGlite();
 const ddl=[
 "CREATE TABLE lr_sources(id uuid primary key,key text unique,source_type text,enabled boolean,refresh_schedule text,permission_basis text,notes text);",
 "CREATE TABLE lr_events(id uuid primary key default gen_random_uuid(),slug text unique,name text,start_date date,end_date date,status text,published boolean,event_type text,city text,course_name text,course_id text,course_url text,start_time_local time,end_time_local time,entry_fee_amount numeric,entry_fee_currency text,entry_fee_unit text,fee_breakdown jsonb default '[]',format_details jsonb default '{}',format text,official_url text,registration_url text,timezone text,county text,additional_fees_note text,updated_at timestamptz default now());",
 "CREATE TABLE lr_event_sources(id uuid primary key default gen_random_uuid(),event_id uuid,source_id uuid,external_id text,source_url text,source_role text,is_sanction_basis boolean,source_payload jsonb,confidence numeric,last_seen_at timestamptz);",
 "CREATE TABLE lr_results(id uuid primary key default gen_random_uuid(),event_id uuid,player_name text);",
 "CREATE TABLE lr_source_runs(id uuid primary key default gen_random_uuid(),source_id uuid,fetch_status text,parse_status text,validation_status text,health_status text,scheduler_status text,records_seen integer,records_valid integer,records_changed integer,records_new integer,records_rejected integer,records_missing integer,parser_version text,metrics jsonb default '{}',finished_at timestamptz);",
 "CREATE TABLE lr_source_candidates(id uuid primary key default gen_random_uuid(),source_run_id uuid,source_id uuid,external_id text,source_url text,normalized_payload jsonb,match_event_id uuid,match_method text,validation_status text,promotion_status text);",
 "CREATE TABLE lr_manual_overrides(id uuid primary key default gen_random_uuid(),event_id uuid,field_name text,original_value jsonb,override_value jsonb,reason text,active boolean);",
 "CREATE TABLE lr_event_field_evidence(id uuid primary key default gen_random_uuid(),source_id uuid,source_candidate_id uuid,event_id uuid,field_name text);",
 "CREATE TABLE lr_event_change_log(id uuid primary key default gen_random_uuid(),source_id uuid,source_candidate_id uuid,event_id uuid);",
 "CREATE TABLE lr_review_queue(id uuid,source_candidate_id uuid);",
 "CREATE FUNCTION fixture_e1_barrier() RETURNS trigger LANGUAGE plpgsql AS $body$ BEGIN IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END; $body$;",
 "CREATE TRIGGER lr_events_01_dora_e1_write_barrier BEFORE UPDATE ON lr_events FOR EACH ROW EXECUTE FUNCTION fixture_e1_barrier();",
 "CREATE TRIGGER lr_event_sources_00_dora_e1_write_barrier BEFORE UPDATE ON lr_event_sources FOR EACH ROW EXECUTE FUNCTION fixture_e1_barrier();",
 "CREATE TRIGGER lr_results_00_dora_e1_write_barrier BEFORE UPDATE ON lr_results FOR EACH ROW EXECUTE FUNCTION fixture_e1_barrier();",
 "CREATE FUNCTION lr_apply_authoritative_candidate(p_id uuid) RETURNS uuid LANGUAGE plpgsql AS $apply$ DECLARE c lr_source_candidates%ROWTYPE; target uuid; p jsonb; BEGIN SELECT * INTO c FROM lr_source_candidates WHERE id=p_id; SELECT es.event_id INTO target FROM lr_event_sources es WHERE es.source_id=c.source_id AND es.external_id=c.external_id; IF target IS NULL THEN RAISE EXCEPTION 'exact source link not found'; END IF; p:=c.normalized_payload; UPDATE lr_events SET name=p->>'name',event_type=p->>'event_type',format=p->>'format',format_details=p->'format_details',city=p->>'city',course_name=p->>'course_name',course_id=p->>'course_id',course_url=p->>'course_url',start_time_local=(p->>'start_time_local')::time,end_time_local=(p->>'end_time_local')::time,entry_fee_amount=(p->>'entry_fee_amount')::numeric,entry_fee_currency=p->>'entry_fee_currency',entry_fee_unit=p->>'entry_fee_unit',fee_breakdown=p->'fee_breakdown',additional_fees_note=p->>'additional_fees_note',official_url=p->>'official_url' WHERE id=target; UPDATE lr_source_candidates SET match_event_id=target,match_method='source_external_id',validation_status='valid',promotion_status='promoted' WHERE id=p_id; INSERT INTO lr_event_field_evidence(source_id,source_candidate_id,event_id,field_name) VALUES(c.source_id,p_id,target,'name'); INSERT INTO lr_event_change_log(source_id,source_candidate_id,event_id) VALUES(c.source_id,p_id,target); RETURN target; END; $apply$;",
 "CREATE FUNCTION lr_apply_event_patch(target uuid,p jsonb) RETURNS void LANGUAGE plpgsql AS $patch$ BEGIN UPDATE lr_events SET name=p->>'name',event_type=p->>'event_type',format=p->>'format',format_details=p->'format_details',city=p->>'city',course_name=p->>'course_name',course_id=p->>'course_id',course_url=p->>'course_url',start_time_local=(p->>'start_time_local')::time,end_time_local=(p->>'end_time_local')::time,entry_fee_amount=(p->>'entry_fee_amount')::numeric,entry_fee_currency=p->>'entry_fee_currency',entry_fee_unit=p->>'entry_fee_unit',fee_breakdown=p->'fee_breakdown',additional_fees_note=p->>'additional_fees_note',official_url=p->>'official_url' WHERE id=target; END; $patch$;"
 ];
 await db.exec(ddl.join('\n'));
 await db.query("INSERT INTO lr_sources VALUES ($1,'hbnf_udisc_manual','manual',true,null,$2,$3)",[manual,basis,notes]);
 await db.query("INSERT INTO lr_sources VALUES ($1,'hbnf_internal_schedule','internal',true,null,'Owner permitted',null)",[internal]);
 for(const date of dates){
   const uuid='11111111-1111-4111-8111-'+String(dates.indexOf(date)+1).padStart(12,'0');
   await db.query("INSERT INTO lr_events(id,slug,name,start_date,end_date,status,published,event_type) VALUES($1,$2,'HB Night Flyers Glow',$3,$3,$4,true,'other')",[uuid,'hbnf-glow-'+date,date,date==='2026-11-03'?'completed':'upcoming']);
   await db.query("INSERT INTO lr_event_sources(event_id,source_id,external_id,source_url,source_role) VALUES($1,$2,$3,'https://hbnightflyers.com/','organizer_confirmed')",[uuid,internal,'hbnf:glow:'+date]);
 }
 const e1='5e87e132-dfe9-41e5-8087-80d4b881caa0';
 await db.query("INSERT INTO lr_events(id,slug,name,start_date,end_date,status,published,event_type) VALUES($1,'hbnf-glow-2026-09-02','Synthetic','2026-09-02','2026-09-02','completed',false,'doubles')",[e1]);
 for(let i=0;i<6;i++)await db.query("INSERT INTO lr_results(event_id,player_name) VALUES($1,$2)",[e1,'Fixture '+i]);
 return db;
}
async function counts(db){
 const r=await db.query("SELECT (SELECT count(*)::int FROM lr_event_sources WHERE source_id=$1) links,(SELECT count(*)::int FROM lr_source_candidates WHERE source_id=$1) candidates,(SELECT count(*)::int FROM lr_source_runs WHERE source_id=$1) runs,(SELECT count(*)::int FROM lr_manual_overrides) pins,(SELECT count(*)::int FROM lr_results WHERE event_id='5e87e132-dfe9-41e5-8087-80d4b881caa0') e1_results,(SELECT count(*)::int FROM lr_events WHERE slug='hbnf-glow-2026-09-02' AND published=false) e1_hidden,(SELECT count(*)::int FROM lr_event_sources WHERE source_id=$2) original_links,(SELECT count(*)::int FROM lr_events WHERE name='HB Night Flyers Glow Doubles' AND event_type='doubles' AND entry_fee_amount=10 AND published) enriched",[manual,internal]);
 return r.rows[0];
}

test('E3 native transaction promotes 8 exact-linked manual candidates and reverses only that release',async()=>{
 const db=await fixture();
 try{
  const old=await counts(db);
  try { await db.exec('BEGIN;\n'+forwardPolicy+'\n'+forward+'\nCOMMIT;'); } catch(e) { throw new Error('E3 forward phase: '+e.message); }
  assert.deepEqual(await counts(db),{links:8,candidates:8,runs:1,pins:16,e1_results:6,e1_hidden:1,original_links:8,enriched:8});
  const rows=(await db.query("SELECT official_url,registration_url,fee_breakdown FROM lr_events WHERE name='HB Night Flyers Glow Doubles' ORDER BY start_date")).rows;
  assert.equal(rows.length,8);
  assert.ok(rows.every(r=>r.official_url.endsWith('/about')&&r.registration_url===null&&r.fee_breakdown.reduce((a,b)=>a+b.amount,0)===10));
  try { await db.exec('BEGIN;\n'+reverse+'\n'+reversePolicy+'\nCOMMIT;'); } catch(e) { throw new Error('E3 rollback phase: '+e.message); }
  assert.deepEqual(await counts(db),old);
 }finally{await db.close();}
});
test('E3 changed target refuses same-manifest promotion before any source candidate writes',async()=>{
 const db=await fixture();
 try{
  await db.query("UPDATE lr_events SET name='Changed' WHERE slug='hbnf-glow-2026-12-08'");
  const before=await counts(db);
  await assert.rejects(db.exec('BEGIN;\n'+forwardPolicy+'\n'+forward+'\nCOMMIT;'),/exact target preimage drift/);
  await db.exec('ROLLBACK;');
  assert.deepEqual(await counts(db),before);
 }finally{await db.close();}
});
test('E3 rollback refuses subsequent new real results without removing the enrichment',async()=>{
 const db=await fixture();
 try{
  try { await db.exec('BEGIN;\n'+forwardPolicy+'\n'+forward+'\nCOMMIT;'); } catch(e) { throw new Error('E3 forward phase: '+e.message); }
  await db.query("INSERT INTO lr_results(event_id,player_name) SELECT id,'New real participant' FROM lr_events WHERE slug='hbnf-glow-2026-12-01'");
  await assert.rejects(db.exec('BEGIN;\n'+reverse+'\n'+reversePolicy+'\nCOMMIT;'),/event gained results/);
  await db.exec('ROLLBACK;');
  const x=await counts(db);
  assert.equal(x.enriched,8);
  assert.equal(x.links,8);
  assert.equal(x.e1_results,6);
 }finally{await db.close();}
});

test('E3 Nov 3 source attribution distinguishes owner event start from UDisc round window', () => {
  assert.match(forward, /hb-night-flyers-hb-glow-doubles-tAP8Y5\/about/);
  assert.match(forward, /hbnf_internal_schedule/);
  assert.match(forward, /Owner-confirmed 5:30 PM event start per issue #161/);
  assert.match(forward, /UDisc current November 3 Round 1 window begins 12:30 PM/);
  assert.match(forward, /ELSE 'hbnf_udisc_manual' END/);
});

test('E3 rollback never overwrites a later verified venue correction',async()=>{
 const db=await fixture();
 try {
  await db.exec('BEGIN;\n'+forwardPolicy+'\n'+forward+'\nCOMMIT;');
  await db.query("UPDATE lr_events SET course_name='Newly Verified Course' WHERE slug='hbnf-glow-2026-12-08'");
  const prior=await counts(db);
  await assert.rejects(db.exec('BEGIN;\n'+reverse+'\n'+reversePolicy+'\nCOMMIT;'),/restored targets\/provenance changed/);
  await db.exec('ROLLBACK;');
  assert.deepEqual(await counts(db),prior);
  const x=(await db.query("SELECT course_name FROM lr_events WHERE slug='hbnf-glow-2026-12-08'")).rows[0];
  assert.equal(x.course_name,'Newly Verified Course');
 }finally{await db.close();}
});
test('E3 rollback refuses orphaned manual-source evidence with NULL candidate ID',async()=>{
 const db=await fixture();
 try {
  await db.exec('BEGIN;\n'+forwardPolicy+'\n'+forward+'\nCOMMIT;');
  await db.query("INSERT INTO lr_event_field_evidence(source_id,source_candidate_id,event_id,field_name) SELECT $1::uuid,NULL,id,'start_time_local' FROM lr_events WHERE slug='hbnf-glow-2026-12-08'",[manual]);
  const prior=await counts(db);
  await assert.rejects(db.exec('BEGIN;\n'+reverse+'\n'+reversePolicy+'\nCOMMIT;'),/release sources acquired new dependent data/);
  await db.exec('ROLLBACK;');
  assert.deepEqual(await counts(db),prior);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM lr_event_field_evidence WHERE source_id=$1",[manual])).rows[0].n,9);
 }finally{await db.close();}
});

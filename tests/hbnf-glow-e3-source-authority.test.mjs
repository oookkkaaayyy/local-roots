import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../supabase/migrations/20261105080000_e3_hbnf_glow_manual_eight_occurrence_authority.sql', import.meta.url),'utf8');
const rollback = await readFile(new URL('../scripts/restore-e3-hbnf-glow-manual-evidence-authority.sql', import.meta.url),'utf8');
const initialBasis = 'The owner supplied the specific November 3, 10, and 17, 2026 organizer listing URLs and confirmed their facts. Retain only the listed event metadata and links; do not scrape or extrapolate to later dates.';
const initialNotes = 'No automated retrieval. Exact event-specific facts from the owner-provided listings only; later Tuesdays remain unverified for time, venue, fee, and event URL.';
const id = 'a54e0b0e-0c4b-41a8-bf6b-7aca76c9baa3';

async function fixture() {
  const db=new PGlite();
  await db.exec(
    "create table public.lr_sources(id uuid primary key,key text unique,source_type text,enabled boolean,refresh_schedule text,permission_basis text,notes text);"+
    "create table public.lr_events(id uuid primary key,slug text);"+
    "create table public.lr_event_field_evidence(event_id uuid,source_id uuid);"
  );
  await db.query("insert into public.lr_sources(id,key,source_type,enabled,refresh_schedule,permission_basis,notes) values($1,'hbnf_udisc_manual','manual',true,null,$2,$3)",[id,initialBasis,initialNotes]);
  return db;
}

test('E3 exact organizer source authority change has narrowly recoverable logical preimage',async()=>{
  const db=await fixture();
  try{
    const before=(await db.query('select * from public.lr_sources')).rows[0];
    await db.exec(migration);
    const after=(await db.query('select * from public.lr_sources')).rows[0];
    assert.equal(after.key,'hbnf_udisc_manual');
    assert.equal(after.enabled,true);
    assert.equal(after.refresh_schedule,null);
    assert.match(after.permission_basis,/exactly eight/);
    assert.match(after.notes,/Dec 1\/8 About details newly confirmed/);
    assert.equal(after.permission_basis.includes('participant/results ingestion'),true);
    await db.exec(rollback);
    assert.deepEqual((await db.query('select * from public.lr_sources')).rows[0],before);
  } finally {await db.close();}
});

test('E3 source release refuses a changed permission baseline without side effects',async()=>{
  const db=await fixture();
  try{
    await db.query("update public.lr_sources set notes='Another operator changed the source' where id=$1",[id]);
    await assert.rejects(db.exec(migration),/baseline drift/);
    const actual=(await db.query('select notes,permission_basis from public.lr_sources where id=$1',[id])).rows[0];
    assert.equal(actual.notes,'Another operator changed the source');
    assert.equal(actual.permission_basis,initialBasis);
  }finally{await db.close();}
});

test('E3 source rollback fails closed when expanded dated evidence is in use',async()=>{
  const db=await fixture();
  try{
    await db.exec(migration);
    const event='11111111-1111-4111-8111-111111111111';
    await db.query("insert into public.lr_events(id,slug) values($1,'hbnf-glow-2026-12-01')",[event]);
    await db.query("insert into public.lr_event_field_evidence(event_id,source_id) values($1,$2)",[event,id]);
    await assert.rejects(db.exec(rollback),/expanded fields still linked/);
    assert.match((await db.query('select permission_basis from public.lr_sources')).rows[0].permission_basis,/exactly eight/);
  }finally{await db.close();}
});

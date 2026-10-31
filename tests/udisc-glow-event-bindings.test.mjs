import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {isHbnfGlowEventId,selectGlowEventBinding,validateGlowEventBinding} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/udisc-glow-event-bindings.mjs';

const scheduled = [
  {event_id:'hb-glow-doubles-tAP8Y5',event_date:'2026-11-03',window_start:'2026-11-04T01:30:00+00:00',window_end:'2026-11-04T07:30:00+00:00'},
  {event_id:'hb-glow-doubles-af85rU',event_date:'2026-11-10',window_start:'2026-11-11T01:30:00+00:00',window_end:'2026-11-11T07:30:00+00:00'},
  {event_id:'hb-glow-doubles-C1mFl8',event_date:'2026-11-17',window_start:'2026-11-18T01:30:00+00:00',window_end:'2026-11-18T07:30:00+00:00'},
];

test('accepts only HBNF Glow Doubles slug families and maps the three scheduled IDs to their exact dates',()=>{
  for(const row of scheduled)assert.equal(isHbnfGlowEventId(row.event_id),true);
  assert.equal(isHbnfGlowEventId('hb-night-flyers-hb-glow-doubles-ZUDJEk'),true);
  assert.equal(isHbnfGlowEventId('hb-night-flyers-hb-glow-doubles-test-only-F7DOx3'),true);
  assert.equal(isHbnfGlowEventId('hb-night-flyers-hb-glow-monthly-RPCgGV'),true);
  for(const bad of [
    'hb-glow-doubles-generic','hb-glow-doubles-tAP8Y5-extra','hb-glow-monthly-tAP8Y5',
    'hb-night-flyers-hb-skins-doubles-tAP8Y5','hb-night-flyers-test-event-XpuRfW','outside-event-tAP8Y5',
  ])assert.equal(isHbnfGlowEventId(bad),false,bad);
  for(const row of scheduled){
    const at=new Date(Date.parse(row.window_start)+60_000);
    assert.equal(selectGlowEventBinding([row],at)?.eventId,row.event_id);
    assert.equal(selectGlowEventBinding([row],at)?.weekDate,row.event_date);
  }
});

test('rejects date drift, non-Tuesday weeks, mismatched local windows, malformed dates and overlapping active bindings',()=>{
  const base=scheduled[0];
  for(const row of [
    {...base,event_id:'hb-glow-doubles-too-long123'},
    {...base,event_id:'hb-night-flyers-hb-glow-monthly-RPCgGV'},
    {...base,event_date:'2026-11-04'},
    {...base,event_date:'2026-02-31'},
    {...base,window_start:'2026-11-04T08:00:00Z'},
    {...base,window_end:'2026-11-05T08:00:00Z'},
    {...base,window_end:'2026-11-04T14:30:00Z'},
  ])assert.throws(()=>validateGlowEventBinding(row));
  assert.throws(()=>selectGlowEventBinding([base,base],new Date('2026-11-04T02:00:00Z')),/More than one/);
  assert.equal(selectGlowEventBinding([base],new Date('2026-11-04T00:00:00Z')),null);
});

test('RLS migration seeds only the three scoped public HBNF events and permits future inserts without public access',async()=>{
  const migration=await readFile(new URL('../supabase/migrations/20261031054752_hbnf_udisc_glow_event_bindings.sql',import.meta.url),'utf8');
  const db=new PGlite();
  try{
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
    await db.exec(migration);
    const seeded=await db.query('SELECT event_date::text,event_id FROM public.hbnf_udisc_glow_event_bindings ORDER BY event_date');
    assert.deepEqual(seeded.rows.map(row=>[row.event_date,row.event_id]),scheduled.map(row=>[row.event_date,row.event_id]));
    await db.exec('SET ROLE anon');
    await assert.rejects(()=>db.query('SELECT * FROM public.hbnf_udisc_glow_event_bindings'),/permission denied/);
    await db.exec('RESET ROLE; SET ROLE authenticated');
    await assert.rejects(()=>db.query('SELECT * FROM public.hbnf_udisc_glow_event_bindings'),/permission denied/);
    await db.exec('RESET ROLE; SET ROLE service_role');
    const serviceRead=await db.query('SELECT count(*)::int AS count FROM public.hbnf_udisc_glow_event_bindings');
    assert.equal(serviceRead.rows[0].count,3);
    await db.query(`INSERT INTO public.hbnf_udisc_glow_event_bindings(event_date,event_id,window_start,window_end) VALUES('2026-11-24','hb-glow-doubles-n0v24A','2026-11-25 01:30:00+00','2026-11-25 07:30:00+00')`);
    await assert.rejects(()=>db.query(`INSERT INTO public.hbnf_udisc_glow_event_bindings(event_date,event_id,window_start,window_end) VALUES('2026-11-24','hb-glow-doubles-n0v24B','2026-11-25 01:30:00+00','2026-11-25 07:30:00+00')`),/duplicate key/);
    await assert.rejects(()=>db.query(`INSERT INTO public.hbnf_udisc_glow_event_bindings(event_date,event_id,window_start,window_end) VALUES('2026-11-25','hb-glow-doubles-n0v25A','2026-11-26 01:30:00+00','2026-11-26 07:30:00+00')`),/check constraint/);
    await db.exec('RESET ROLE; SET ROLE anon');
    await assert.rejects(()=>db.query(`INSERT INTO public.hbnf_udisc_glow_event_bindings(event_date,event_id,window_start,window_end) VALUES('2026-12-01','hb-glow-doubles-n0v01A','2026-12-02 01:30:00+00','2026-12-02 07:30:00+00')`),/permission denied/);
  }finally{await db.close();}
});

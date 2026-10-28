import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchUdiscExport,udiscEventSlug} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/public/udisc-glow-live-source.mjs';

test('accepts only HTTPS HB Night Flyers event links and event slugs',()=>{
  assert.equal(udiscEventSlug('https://udisc.com/events/hb-night-flyers-test-event-XpuRfW/about'),'hb-night-flyers-test-event-XpuRfW');
  assert.equal(udiscEventSlug('hb-night-flyers-glow-doubles-ZUDJEk'),'hb-night-flyers-glow-doubles-ZUDJEk');
  for(const bad of ['http://udisc.com/events/hb-night-flyers-test-event-XpuRfW','https://evil.example/events/hb-night-flyers-test-event-XpuRfW','https://udisc.com/leagues/hb-night-flyers-he7y5I/schedule','hb-night-flyers-test']) assert.throws(()=>udiscEventSlug(bad));
});

test('requests event XLSX through the same-origin rehearsal endpoint and returns provenance',async()=>{
  let requested;
  const bytes=new Uint8Array([0x50,0x4b,3,4]);
  const result=await fetchUdiscExport('https://udisc.com/events/hb-night-flyers-test-event-XpuRfW',async(input,init)=>{requested={url:String(input),init};return new Response(bytes,{headers:{'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','x-udisc-filename':'round.xlsx','x-source-observed-at':'2026-10-25T07:41:26Z'}})},'http://127.0.0.1:8767');
  assert.match(requested.url,/\/api\/udisc-glow\/export\?event=hb-night-flyers-test-event-XpuRfW$/);
  assert.equal(requested.init.cache,'no-store'); assert.equal(result.eventId,'hb-night-flyers-test-event-XpuRfW'); assert.equal(result.filename,'round.xlsx'); assert.equal(result.observedAt,'2026-10-25T07:41:26Z'); assert.deepEqual([...new Uint8Array(result.bytes)],[...bytes]);
});

test('fails closed on non-XLSX and failed source responses',async()=>{
  await assert.rejects(fetchUdiscExport('hb-night-flyers-test-event-XpuRfW',async()=>new Response('no',{status:503}),'http://127.0.0.1:8767'),/503/);
  await assert.rejects(fetchUdiscExport('hb-night-flyers-test-event-XpuRfW',async()=>new Response('no',{headers:{'content-type':'text/html'}}),'http://127.0.0.1:8767'),/XLSX/);
});

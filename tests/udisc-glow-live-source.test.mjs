import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchUdiscExport,fetchUdiscGlowEvents,udiscEventSlug} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/public/udisc-glow-live-source.mjs';

test('loads safe date/title event choices from the same-origin schedule endpoint',async()=>{
  let requested;
  const events=await fetchUdiscGlowEvents(async(input,init)=>{requested={url:String(input),init};return new Response(JSON.stringify({events:[{eventId:'hb-glow-doubles-tAP8Y5',date:'2026-11-03',title:'HBNF Glow Doubles',url:'https://evil.example/'}]}),{headers:{'content-type':'application/json'}})},'http://127.0.0.1:8767');
  assert.match(requested.url,/\/api\/udisc-glow\/events$/);assert.equal(requested.init.cache,'no-store');
  assert.deepEqual(events,[{eventId:'hb-glow-doubles-tAP8Y5',date:'2026-11-03',title:'HBNF Glow Doubles',url:'https://udisc.com/events/hb-glow-doubles-tAP8Y5/leaderboard'}]);
});

test('rejects malformed or non-Glow event choices',async()=>{
  await assert.rejects(fetchUdiscGlowEvents(async()=>new Response(JSON.stringify({events:[{eventId:'hb-night-flyers-test-event-XpuRfW',date:'2026-10-24'}]})), 'http://127.0.0.1:8767'),/only accepts HB Night Flyers Glow event links/);
  await assert.rejects(fetchUdiscGlowEvents(async()=>new Response(JSON.stringify({events:{}})), 'http://127.0.0.1:8767'),/invalid event list/);
});

test('accepts only HTTPS HB Night Flyers event links and event slugs',()=>{
  assert.equal(udiscEventSlug('https://udisc.com/events/hb-glow-doubles-tAP8Y5/about'),'hb-glow-doubles-tAP8Y5');
  assert.equal(udiscEventSlug('hb-night-flyers-hb-glow-doubles-ZUDJEk'),'hb-night-flyers-hb-glow-doubles-ZUDJEk');
  for(const bad of ['http://udisc.com/events/hb-glow-doubles-tAP8Y5','https://evil.example/events/hb-glow-doubles-tAP8Y5','https://udisc.com/leagues/hb-night-flyers-he7y5I/schedule','hb-glow-doubles-generic']) assert.throws(()=>udiscEventSlug(bad));
});

test('requests event XLSX through the same-origin rehearsal endpoint and returns provenance',async()=>{
  let requested;
  const bytes=new Uint8Array([0x50,0x4b,3,4]);
  const result=await fetchUdiscExport('https://udisc.com/events/hb-glow-doubles-tAP8Y5',async(input,init)=>{requested={url:String(input),init};return new Response(bytes,{headers:{'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','x-udisc-filename':'round.xlsx','x-source-observed-at':'2026-10-25T07:41:26Z'}})},'http://127.0.0.1:8767');
  assert.match(requested.url,/\/api\/udisc-glow\/export\?event=hb-glow-doubles-tAP8Y5$/);
  assert.equal(requested.init.cache,'no-store'); assert.equal(result.eventId,'hb-glow-doubles-tAP8Y5'); assert.equal(result.filename,'round.xlsx'); assert.equal(result.observedAt,'2026-10-25T07:41:26Z'); assert.deepEqual([...new Uint8Array(result.bytes)],[...bytes]);
});

test('fails closed on non-XLSX and failed source responses',async()=>{
  await assert.rejects(fetchUdiscExport('hb-glow-doubles-tAP8Y5',async()=>new Response('no',{status:503}),'http://127.0.0.1:8767'),/503/);
  await assert.rejects(fetchUdiscExport('hb-glow-doubles-tAP8Y5',async()=>new Response('no',{headers:{'content-type':'text/html'}}),'http://127.0.0.1:8767'),/XLSX/);
});

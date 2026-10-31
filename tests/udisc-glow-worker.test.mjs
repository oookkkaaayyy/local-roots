import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{handleUdiscExport,handleUdiscGlowEvents,parseUdiscGlowEvents,runGlowSync} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/index.js';
import {readFile} from 'node:fs/promises';

const event = 'hb-night-flyers-hb-glow-doubles-test-only-F7DOx3';
const xlsx = new Uint8Array([0x50, 0x4b, 3, 4, ...new Array(20).fill(0)]);
const headers = {'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': 'attachment; filename="round.xlsx"'};

const scheduleHtml = `<!doctype html><a href="/events/hb-glow-doubles-tAP8Y5/leaderboard">NOV 3 HB Glow Doubles 2026 Huntington Beach</a>
<a href="/events/hb-glow-doubles-af85rU/leaderboard">NOV 10 HB Glow Doubles 2026 Huntington Beach</a>
<a href="/events/hb-glow-doubles-C1mFl8/leaderboard">NOV 17 HB Glow Doubles 2026 Huntington Beach</a>
<a href="/events/hb-night-flyers-hb-glow-doubles-ZUDJEk/leaderboard">OCT 24 HB Night Flyers HB Glow Doubles 2026 Huntington Beach</a>
<a href="https://udisc.com/events/hb-night-flyers-hb-glow-monthly-RPCgGV/leaderboard">SEP 19 HB Night Flyers HB Glow Monthly 2026 Huntington Beach</a>
<a href="/events/hb-night-flyers-test-event-XpuRfW/leaderboard">OCT 25 HB Night Flyers Test Event 2026</a>
<a href="/events/back-9-skins-round-random-doubles-l619PB/leaderboard">OCT 27 HB Night Flyers Back 9 Skins Round 2026</a>
<a href="https://attacker.example/events/hb-night-flyers-fake-glow-XpuRfW/leaderboard">OCT 29 HB Night Flyers Glow 2026</a>`;

test('discovers only bounded HBNF Glow events from the league schedule',()=>{
  const events=parseUdiscGlowEvents(scheduleHtml);
  assert.deepEqual(events.map(x=>[x.eventId,x.date]),[
    ['hb-glow-doubles-C1mFl8','2026-11-17'],
    ['hb-glow-doubles-af85rU','2026-11-10'],
    ['hb-glow-doubles-tAP8Y5','2026-11-03'],
    ['hb-night-flyers-hb-glow-doubles-ZUDJEk','2026-10-24'],
    ['hb-night-flyers-hb-glow-monthly-RPCgGV','2026-09-19'],
  ]);
  assert.equal(events.find(x=>x.eventId==='hb-night-flyers-hb-glow-doubles-ZUDJEk').url,'https://udisc.com/events/hb-night-flyers-hb-glow-doubles-ZUDJEk/leaderboard');
  assert.equal(JSON.stringify(events).includes('players'),false);
});

test('schedule endpoint fetches one public page without cookies and returns titles/dates only',async()=>{
  let requested;
  const response=await handleUdiscGlowEvents(new Request('https://hbnf.example/api/udisc-glow/events',{headers:{origin:'https://hbnf.example',cookie:'must-not-forward'}}),async(input,init)=>{
    requested={url:String(input),init};
    return new Response(scheduleHtml,{headers:{'content-type':'text/html; charset=utf-8'}});
  });
  assert.equal(response.status,200);
  assert.match(requested.url,/^https:\/\/udisc\.com\/leagues\/hb-night-flyers-he7y5I\/schedule$/);
  assert.equal(requested.init.method,'GET');
  assert.equal(requested.init.redirect,'manual');
  assert.equal(requested.init.headers.cookie,undefined);
  assert.equal(requested.init.headers.Accept,'text/html');
  assert.equal(response.headers.get('cache-control'),'public, max-age=120');
  assert.deepEqual((await response.json()).events.map(e=>e.date),['2026-11-17','2026-11-10','2026-11-03','2026-10-24','2026-09-19']);
});

test('schedule endpoint rejects writes, foreign origins, queries, redirects and non-HTML',async()=>{
  for(const [request,status] of [
    [new Request('https://hbnf.example/api/udisc-glow/events',{method:'POST'}),405],
    [new Request('https://hbnf.example/api/udisc-glow/events?all=1'),400],
    [new Request('https://hbnf.example/api/udisc-glow/events',{headers:{origin:'https://attacker.example'}}),403],
  ]) assert.equal((await handleUdiscGlowEvents(request,()=>{throw Error('must reject before fetch')})).status,status);
  for(const upstream of [
    new Response('',{status:302,headers:{location:'https://attacker.example'}}),
    new Response('no',{headers:{'content-type':'application/json'}}),
  ]) assert.equal((await handleUdiscGlowEvents(new Request('https://hbnf.example/api/udisc-glow/events'),async()=>upstream)).status,502);
});

test('schedule parser rejects empty HTML and bounds oversized upstream responses',async()=>{
  assert.throws(()=>parseUdiscGlowEvents('   '),/empty/);
  const big=new Uint8Array(2*1024*1024+1);
  const response=await handleUdiscGlowEvents(new Request('https://hbnf.example/api/udisc-glow/events'),async()=>new Response(big,{headers:{'content-type':'text/html'}}));
  assert.equal(response.status,502);
  assert.match(await response.text(),/size limit/);
});

test('serves only bounded event XLSX bytes and source provenance', async () => {
  let upstreamRequest;
  const response = await handleUdiscExport(new Request(`https://hbnf.example/api/udisc-glow/export?event=${event}`, {
    headers: {origin: 'https://hbnf.example', cookie: 'must-not-forward'},
  }), async (input, init) => {
    upstreamRequest = {input, init};
    return new Response(xlsx, {headers});
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), headers['content-type']);
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="round.xlsx"');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-source-event'), event);
  assert.ok(Number.isFinite(Date.parse(response.headers.get('x-source-observed-at'))));
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [...xlsx]);
  assert.equal(upstreamRequest.input, `https://udisc.com/events/${event}/leaderboard/export`);
  assert.equal(upstreamRequest.init.redirect, 'manual');
  assert.equal(upstreamRequest.init.headers.Accept, headers['content-type']);
  assert.equal(upstreamRequest.init.headers.cookie, undefined);
});

test('rejects methods, origins, query smuggling, and non-HBNF event identities', async () => {
  for (const [request, status] of [
    [new Request(`https://hbnf.example/api/udisc-glow/export?event=${event}`, {method: 'POST'}), 405],
    [new Request(`https://hbnf.example/api/udisc-glow/export?event=${event}&other=x`), 400],
    [new Request(`https://hbnf.example/api/udisc-glow/export?event=${event}&event=${event}`), 400],
    [new Request('https://hbnf.example/api/udisc-glow/export?event=outside-event-XpuRfW'), 400],
    [new Request(`https://hbnf.example/api/udisc-glow/export?event=${event}`, {headers: {origin: 'https://attacker.example'}}), 403],
  ]) {
    const response = await handleUdiscExport(request, () => { throw new Error('Must reject before upstream fetch.'); });
    assert.equal(response.status, status);
  }
});

test('fails closed on source errors, redirects, invalid types, and corrupt XLSX', async () => {
  const goodRequest = () => new Request(`https://hbnf.example/api/udisc-glow/export?event=${event}`);
  for (const upstream of [
    new Response('no', {status: 503}),
    new Response('', {status: 302, headers: {location: 'https://attacker.example/'}}),
    new Response('html', {headers: {'content-type': 'text/html'}}),
    new Response(new Uint8Array(32), {headers}),
  ]) {
    const response = await handleUdiscExport(goodRequest(), async () => upstream);
    assert.equal(response.status, 502);
  }
  const networkFailure = await handleUdiscExport(goodRequest(), async () => { throw new Error('network'); });
  assert.equal(networkFailure.status, 502);
});

test('retries one transient network failure within the bounded request', async () => {
  let calls = 0;
  const response = await handleUdiscExport(new Request(`https://hbnf.example/api/udisc-glow/export?event=${event}`), async () => {
    calls += 1;
    if (calls === 1) throw new Error('transient');
    return new Response(xlsx, {headers});
  });
  assert.equal(response.status, 200);
  assert.equal(calls, 2);
});

test('rejects oversized upstream bodies before forwarding them', async () => {
  const tooLarge = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(8 * 1024 * 1024));
      controller.enqueue(new Uint8Array(5 * 1024 * 1024));
      controller.close();
    },
  });
  const response = await handleUdiscExport(new Request(`https://hbnf.example/api/udisc-glow/export?event=${event}`), async () => new Response(tooLarge, {headers}));
  assert.equal(response.status, 502);
});

test('production fetch keeps export, schedule, and sync endpoints private', async()=>{
  let assetCalls=0;
  const env={ASSETS:{fetch:async()=>{assetCalls++;return new Response('asset');}}};
  for(const path of ['/api/udisc-glow/events','/api/udisc-glow/export?event='+event,'/internal/udisc-glow-sync']){
    const response=await worker.fetch(new Request(`https://hbnf.example${path}`),env);
    assert.equal(response.status,404);
  }
  assert.equal(assetCalls,0);
});

test('scheduled runner remains date/window/approval guarded and disabled runner makes no request',async()=>{
  const config=JSON.parse(await readFile(new URL('../source-snapshots/hbnf-worker-d1a5f936-20261024/wrangler.jsonc',import.meta.url),'utf8'));
  assert.deepEqual(config.triggers?.crons,['* * * * *']);
  assert.equal(config.vars?.UDISC_GLOW_ACCESS_APPROVED,'true');
  let calls=0;
  const result=await runGlowSync({}, {fetch:async()=>{calls++;throw Error('must not fetch')}});
  assert.equal(result.disposition,'source_access_disabled');
  assert.equal(calls,0);
});

test('Worker fetch handler preserves all 46 installed public asset routes',async()=>{
  const text=await readFile(new URL('../source-snapshots/hbnf-worker-d1a5f936-20261024/package-validation/INSTALLED_086_ASSET_SHA256SUMS',import.meta.url),'utf8');
  const paths=text.trim().split(/\r?\n/).map(line=>{
    const match=line.match(/^[a-f0-9]{64}\s+public\/(.+)$/);
    assert.ok(match,'unexpected static asset manifest line: '+line);
    return match[1];
  });
  assert.equal(paths.length,46);
  assert.equal(new Set(paths).size,46);
  for(const file of paths){
    let calls=0;
    const url='https://hbnf.example/'+file;
    const status=file==='glow.html'?206:200;
    const env={ASSETS:{fetch(request){
      calls++;
      assert.equal(request.url,url);
      return new Response('asset:'+file,{status,headers:{'x-served-by':'ASSETS','content-type':'text/plain'}});
    }}};
    const result=await worker.fetch(new Request(url),env);
    assert.equal(calls,1,'ASSETS route not delegated for '+file);
    assert.equal(result.status,status,'asset status changed for '+file);
    assert.equal(result.headers.get('x-served-by'),'ASSETS','response headers changed for '+file);
    assert.equal(await result.text(),'asset:'+file,'asset body changed for '+file);
  }
});

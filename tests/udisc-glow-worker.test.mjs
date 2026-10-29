import test from 'node:test';
import assert from 'node:assert/strict';
import {handleUdiscExport} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/index.js';

const event = 'hb-night-flyers-test-event-XpuRfW';
const xlsx = new Uint8Array([0x50, 0x4b, 3, 4, ...new Array(20).fill(0)]);
const headers = {'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': 'attachment; filename="round.xlsx"'};

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

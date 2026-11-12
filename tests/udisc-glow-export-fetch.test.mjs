import assert from 'node:assert/strict';
import {fetchUdiscExport, resolveExportRedirect, XLSX_TYPE} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/udisc-glow-export-fetch.mjs';
const id = 'hb-glow-doubles-af85rU', slug = 'hb-night-flyers-hb-glow-doubles-af85rU';
const ok = () => new Response('PK', {status: 200, headers: {'content-type': XLSX_TYPE}});
const redir = loc => new Response(null, {status: 302, headers: {location: loc}});
const seq = (...rs) => { const calls = []; const f = async u => { calls.push(String(u)); return rs[calls.length - 1](); }; f.calls = calls; return f; };

// direct 200
let f = seq(ok); await fetchUdiscExport(f, id); assert.equal(f.calls.length, 1);
// observed UDisc behavior: 302 to http slug URL is followed, upgraded to https
f = seq(() => redir(`http://udisc.com/events/${slug}/leaderboard/export`), ok);
await fetchUdiscExport(f, id);
assert.deepEqual(f.calls, [`https://udisc.com/events/${id}/leaderboard/export`, `https://udisc.com/events/${slug}/leaderboard/export`]);
// relative redirect
assert.equal(resolveExportRedirect(`/events/${slug}/leaderboard/export`, id), `https://udisc.com/events/${slug}/leaderboard/export`);
// rejected redirects
for (const bad of ['https://evil.example/events/'+slug+'/leaderboard/export', 'https://udisc.com/events/other-event-abc123/leaderboard/export',
  `https://udisc.com/events/${slug}/leaderboard/export?x=1`, 'https://udisc.com/login', 'https://user@udisc.com/events/'+slug+'/leaderboard/export', 'https://udisc.com:8443/events/'+slug+'/leaderboard/export'])
  assert.equal(resolveExportRedirect(bad, id), null, bad);
// second redirect not followed; non-xlsx rejected; 404 rejected
for (const f2 of [seq(() => redir(`/events/${slug}/leaderboard/export`), () => redir(`/events/${slug}/leaderboard/export`)),
  seq(() => new Response('<html>', {status: 200, headers: {'content-type': 'text/html'}})), seq(() => new Response('', {status: 404}))])
  await assert.rejects(fetchUdiscExport(f2, id), e => e.code === 'SOURCE_UNAVAILABLE');
console.log('udisc export fetch tests passed');

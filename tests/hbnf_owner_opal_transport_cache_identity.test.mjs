import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('hbnf-final-controller/hbnf-cart-local.mjs', root), 'utf8');
const transport = readFileSync(new URL('staging/coordinated-backend/opal/mission-control-local/local-transport.js', root));
const transportDigest = createHash('sha256').update(transport).digest('hex');
const importerMatch = source.match(/this\.directTransportLoader\s*=\s*options\.directTransportLoader\s*\|\|\s*\(\(\)\s*=>\s*import\("([^"]+)"\)\)/);

// Only new, event-day cache-identity guards. Existing reconnect and B3 tests remain untouched.
test('actual direct transport blob is the accepted connection-epoch repair', () => {
  assert.equal(transportDigest, 'b48f5d7a4b3ea850307b13596857d753d2ff2ee4b9991b859e66b41d0338b37a');
  assert.match(transport.toString('utf8'), /this\.connectionEpoch\+\+/);
  assert.match(transport.toString('utf8'), /Matrix command superseded by connection change/);
});

test('Safari12 dynamically imports transport under exact versioned Opal-local URL', () => {
  assert.ok(importerMatch, 'expected one stable string-literal dynamic-import URL');
  const resolved = new URL(importerMatch[1]);
  assert.equal(resolved.origin, 'http://192.168.77.1');
  assert.equal(resolved.pathname, '/mission-control-local/local-transport.js');
  assert.equal(resolved.searchParams.get('v'), transportDigest.slice(0, 16));
  assert.notEqual(importerMatch[1], 'http://192.168.77.1/mission-control-local/local-transport.js');
  assert.equal(source.match(/directTransportLoader\s*=/g)?.length, 1);
});

test('changed import syntax is ES2018 compatible and only Opal direct transport is versioned', () => {
  assert.match(source, /this\.opalDirect\s*=\s*options\.opalDirect\s*===\s*true/); // existing direct-only-mode gate
  assert.doesNotMatch(importerMatch[0], /\?\.|\?\?|replaceAll|Object\.hasOwn|Promise\.allSettled/);
  assert.match(source, /owner-http-transport\.js/);
  assert.doesNotMatch(importerMatch[1], /token|credential|secret|authorization|password/i);
});

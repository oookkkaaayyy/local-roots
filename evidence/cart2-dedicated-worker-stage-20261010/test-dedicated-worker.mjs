import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import fs from 'node:fs';
const base = new URL('.', import.meta.url);
const spec = JSON.parse(fs.readFileSync(new URL('stage-spec.json', base), 'utf8'));
const manifestUrl = new URL('../cart2-r6-live-transaction-20261009/cloudflare-zero-traffic-candidate/candidate-source-manifest.json', base);
const manifest = JSON.parse(fs.readFileSync(manifestUrl, 'utf8'));
const workerPath = resolve(new URL('worker.mjs', base).pathname);
const { default: worker } = await import(pathToFileURL(workerPath).href);
assert.equal(spec.approved_asset_count, 16);
assert.equal(spec.url_mapping_count, 17);
assert.equal(spec.worker_module_sha256, createHash('sha256').update(fs.readFileSync(workerPath)).digest('hex'));
const mappings = new Map();
for (const item of manifest.url_paths) {
  mappings.set(item.url_path, item);
  for (const alias of item.alias_paths || []) mappings.set(alias, item);
}
assert.equal(mappings.size, 17);
assert.equal(mappings.has('/hbnf-cart.html'), true);
assert.equal(mappings.has('/hbnf-cart'), true);
assert.equal(mappings.get('/hbnf-cart').sha256, mappings.get('/hbnf-cart.html').sha256);
assert.equal(spec.route_patterns.length, 2, 'minimum namespace route set');
assert.deepEqual(spec.route_patterns.flatMap(x => x.url_mappings_served).sort(), [...mappings.keys()].sort());
assert.equal(new Set(spec.route_patterns.map(x => x.pattern)).size, 2);
function routeMatches(pattern, url) {
  const requestUrl = url.replace(/^https?:\/\//, '');
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
  return new RegExp('^' + escaped + '$').test(requestUrl);
}
function candidateRoute(url) {
  return spec.route_patterns.filter(x => routeMatches(x.pattern, url)).sort((a,b) => b.pattern.replaceAll('*','').length-a.pattern.replaceAll('*','').length)[0];
}
const siteResponse = new Response('baseline hbnf response', { status: 200, headers: { 'x-origin-worker': 'hbnf', 'cache-control': 'private, max-age=60' } });
for (const [path, item] of mappings) {
  const url = 'https://hbnightflyers.com' + path + '?cache-bust=approved';
  assert.ok(candidateRoute(url), `route selection: ${path}`);
  let fallbackCalled = false;
  const response = await worker.fetch(new Request(url), { ASSETS: { fetch: () => { fallbackCalled=true; throw new Error(`approved path fell through: ${url}`); } } });
  assert.equal(fallbackCalled, false);
  assert.equal(response.status, 200, path);
  assert.equal(response.headers.get('content-type'), item.mime, path);
  assert.equal(response.headers.get('cache-control'), item.cache_control, path);
  assert.equal(response.headers.get('x-hbnf-candidate'), 'cart2-owner-guest-r2-canonical-20261010', path);
  const body = new Uint8Array(await response.arrayBuffer());
  assert.equal(body.byteLength, item.size, path);
  assert.equal(createHash('sha256').update(body).digest('hex'), item.sha256, path);
}
for (const path of ['/', '/about', '/favicon.ico', '/manifest.webmanifest', '/firmware/opal-updater/1.2.3/file.ipk']) {
  assert.equal(candidateRoute('https://hbnightflyers.com' + path), undefined, `unrelated route: ${path}`);
}
for (const path of ['/hbnf-cart-not-a-file?x=1', '/hbnf-cart.html/child?x=1', '/guest/hbnf-cart/new-file?x=1']) {
  const url = 'https://hbnightflyers.com' + path;
  assert.ok(candidateRoute(url), `wildcard delegation route: ${path}`);
  let got;
  const response = await worker.fetch(new Request(url, { headers: { 'x-preserve-test': 'yes' } }), {
    ASSETS: { fetch: request => { got=request; return siteResponse.clone(); } }
  });
  assert.ok(got, `fallback binding called: ${path}`);
  assert.equal(got.url, url);
  assert.equal(got.headers.get('x-preserve-test'), 'yes');
  assert.equal(response.status, siteResponse.status);
  assert.equal(response.headers.get('x-origin-worker'), 'hbnf');
  assert.equal(await response.text(), 'baseline hbnf response');
}
console.log(JSON.stringify({result:'PASS',approved_package_sha256:spec.approved_package_sha256,assets:manifest.approved_url_path_count,mappings:mappings.size,canonical_owner_route:'/hbnf-cart.html',alias:'/hbnf-cart',route_count:spec.route_patterns.length,query_string_route_match:true,unrelated_paths_outside_route:true,wildcard_extras_delegate_unchanged_request_to_hbnf:true}));

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const dir = new URL('../public/hbnf-holes/', import.meta.url);
const html = readFileSync(new URL('index.html', dir), 'utf8');
const js = readFileSync(new URL('holes.js', dir), 'utf8');
const pub = JSON.parse(readFileSync(new URL('hole_log_public.json', dir), 'utf8'));
const enc = JSON.parse(readFileSync(new URL('hole_encyclopedia.json', dir), 'utf8'));
test('hole log data is consistent', () => {
  assert.equal(pub.holes.length, enc.holes.length);
  assert.ok(pub.holes.every((r) => r.length === pub.cols.length));
});
test('page has no network writes, no serif, no clamp or :is', () => {
  assert.doesNotMatch(js, /method:\s*['"](POST|PUT|PATCH|DELETE)|\.open\('(POST|PUT)/i);
  assert.doesNotMatch(html, /serif:|Georgia|Palatino|clamp\(|:is\(|aspect-ratio/);
});

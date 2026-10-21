import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const dist = resolve(import.meta.dirname, '..', 'dist');
const shell = (path) => readFile(resolve(dist, path), 'utf8');

test('D&U public route sends branded install metadata in its initial HTML', async () => {
  const html = await shell('dyed-and-unattached/index.html');
  assert.match(html, /<title>Dyed &amp; Unattached · Local Roots<\/title>/);
  assert.match(html, /apple-mobile-web-app-title" content="D&amp;U"/);
  assert.match(html, /rel="manifest" href="\/dyed-and-unattached\/manifest\.webmanifest\?v=ios-icons-20261020"/);
  assert.match(html, /rel="apple-touch-icon" sizes="180x180" href="\/brand\/dyed-unattached-icon-180\.png\?v=ios-icons-20261020"/);
  assert.doesNotMatch(html, /href="\/manifest\.webmanifest\?v=/);
  assert.doesNotMatch(html, /href="\/apple-touch-icon\.png\?v=/);
  assert.match(html, /src="\/assets\/[^"]+\.js"/);
  const redirects = await readFile(resolve(import.meta.dirname, '..', 'public/_redirects'), 'utf8');
  assert.match(redirects, /^\/dyed-and-unattached \/dyed-and-unattached\/ 301$/m);
  assert.match(redirects, /^\/du \/dyed-and-unattached\/ 301$/m);
});

test('D&U admin route sends its standalone queue identity before React loads', async () => {
  const html = await shell('admin/dyed-and-unattached/index.html');
  assert.match(html, /<title>D&amp;U Production Queue · Local Roots<\/title>/);
  assert.match(html, /apple-mobile-web-app-title" content="D&amp;U"/);
  assert.match(html, /rel="manifest" href="\/du-manifest\.webmanifest\?v=ios-icons-20261020"/);
  assert.match(html, /rel="apple-touch-icon" sizes="180x180" href="\/brand\/dyed-unattached-icon-180\.png\?v=ios-icons-20261020"/);
  assert.match(html, /name="robots" content="noindex,nofollow,noarchive"/);
});

test('Weather route sends Weather install identity with the Local Roots icon before React loads', async () => {
  const html = await shell('weather/index.html');
  assert.match(html, /<title>Disc Golf Weather · Local Roots<\/title>/);
  assert.match(html, /apple-mobile-web-app-title" content="LR Weather"/);
  assert.match(html, /rel="manifest" href="\/weather\/manifest\.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon" sizes="180x180" href="\/apple-touch-icon\.png\?v=af4a80127dd7f9cf"/);
  assert.doesNotMatch(html, /href="\/manifest\.webmanifest\?v=/);
});

test('isolated iOS icon experiment embeds the exact approved 180px PNG in initial HTML', async () => {
  const html = await shell('ios-icon-data-preview/index.html');
  const links = html.match(/<link rel="apple-touch-icon"[^>]*>/g) ?? [];
  assert.equal(links.length, 1);
  assert.match(html, /<title>Local Roots Icon Test<\/title>/);
  assert.match(html, /apple-mobile-web-app-title" content="LR Icon Test"/);
  const dataUrl = links[0].match(/href="data:image\/png;base64,([^"]+)"/)?.[1];
  assert.ok(dataUrl, 'initial HTML must contain a direct PNG data URL');
  const embedded = Buffer.from(dataUrl, 'base64');
  const approved = await readFile(resolve(import.meta.dirname, '..', 'public/apple-touch-icon.png'));
  assert.deepEqual(embedded, approved, 'embedded bytes must exactly match approved Local Roots artwork');
  assert.equal(embedded.toString('ascii', 1, 4), 'PNG');
  assert.deepEqual([embedded.readUInt32BE(16), embedded.readUInt32BE(20)], [180, 180]);
  assert.equal(createHash('sha256').update(embedded).digest('hex'), 'af4a80127dd7f9cf208a101dc342743b7d5c50e599b39ea0e7e3d98dd2a667d9');
  assert.ok(Buffer.byteLength(html) < 27_000, 'embedded 180px PNG should keep the initial document compact');
  assert.doesNotMatch(html, /<script\b/i, 'the test icon must not depend on a delayed script');
  const headers = await readFile(resolve(import.meta.dirname, '..', 'public/_headers'), 'utf8');
  assert.match(headers, /img-src[^\n]*\bdata:/);
  const manifest = JSON.parse(await readFile(resolve(dist, 'ios-icon-data-preview/manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.start_url, '/ios-icon-data-preview/');
  assert.equal(manifest.scope, '/ios-icon-data-preview/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.icons, undefined, 'manifest must not mask whether Safari accepts the embedded Apple icon');
});

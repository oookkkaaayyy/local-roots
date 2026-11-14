import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const dist = resolve(import.meta.dirname, '..', 'dist');
const shell = (path) => readFile(resolve(dist, path), 'utf8');

async function assertEmbeddedIcon(html, assetPath, expectedHash) {
  const links = html.match(/<link rel="apple-touch-icon"[^>]*>/g) ?? [];
  assert.equal(links.length, 1, 'the initial HTML must expose one unambiguous Apple touch icon');
  assert.match(links[0], /sizes="180x180" type="image\/png" href="data:image\/png;base64,/);
  const data = links[0].match(/href="data:image\/png;base64,([^"]+)"/)?.[1];
  assert.ok(data, 'the icon must be available directly in the initial HTML');
  const embedded = Buffer.from(data, 'base64');
  const approved = await readFile(resolve(import.meta.dirname, '..', 'public', assetPath));
  assert.deepEqual(embedded, approved, 'embedded PNG bytes must match the approved source asset exactly');
  assert.equal(embedded.toString('ascii', 1, 4), 'PNG');
  assert.deepEqual([embedded.readUInt32BE(16), embedded.readUInt32BE(20)], [180, 180]);
  assert.equal(createHash('sha256').update(embedded).digest('hex'), expectedHash);
  assert.ok(Buffer.byteLength(links[0]) < 25_000, 'the inline icon declaration should add less than 25 KB');
}

test('D&U public route sends branded install metadata in its initial HTML', async () => {
  const html = await shell('dyed-and-unattached/index.html');
  assert.match(html, /<title>Dyed &amp; Unattached · Local Roots<\/title>/);
  assert.match(html, /apple-mobile-web-app-title" content="D&amp;U"/);
  assert.match(html, /rel="manifest" href="\/dyed-and-unattached\/manifest\.webmanifest\?v=ios-icons-20261020"/);
  await assertEmbeddedIcon(html, 'brand/dyed-unattached-icon-180.png', 'a19995150d774de113f6c8e4d10f0fcf8648ae9fbb0c20df592f275455684ecf');
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
  await assertEmbeddedIcon(html, 'brand/dyed-unattached-icon-180.png', 'a19995150d774de113f6c8e4d10f0fcf8648ae9fbb0c20df592f275455684ecf');
  assert.match(html, /name="robots" content="noindex,nofollow,noarchive"/);
});

test('Weather route sends Weather install identity with the Local Roots icon before React loads', async () => {
  const html = await shell('weather/index.html');
  assert.match(html, /<title>Disc Golf Weather · Local Roots<\/title>/);
  assert.match(html, /apple-mobile-web-app-title" content="LR Weather"/);
  assert.match(html, /rel="manifest" href="\/weather\/manifest\.webmanifest"/);
  await assertEmbeddedIcon(html, 'apple-touch-icon.png', 'af4a80127dd7f9cf208a101dc342743b7d5c50e599b39ea0e7e3d98dd2a667d9');
  assert.doesNotMatch(html, /href="\/manifest\.webmanifest\?v=/);
});

test('Local Roots root and Dye Studio each embed their own approved artwork before scripts load', async () => {
  const root = await shell('index.html');
  await assertEmbeddedIcon(root, 'apple-touch-icon.png', 'af4a80127dd7f9cf208a101dc342743b7d5c50e599b39ea0e7e3d98dd2a667d9');
  assert.match(root, /apple-mobile-web-app-title" content="Local Roots"/);

  const studio = await shell('dyed-and-unattached/dye-studio/index.html');
  await assertEmbeddedIcon(studio, 'brand/dyed-unattached-icon-180.png', 'a19995150d774de113f6c8e4d10f0fcf8648ae9fbb0c20df592f275455684ecf');
  assert.match(studio, /apple-mobile-web-app-title" content="D&U Studio"/);
  assert.match(studio, /rel="manifest" href="\.\/manifest\.webmanifest/);
  assert.ok(studio.indexOf('rel="apple-touch-icon"') < studio.indexOf('<script'), 'the initial icon must precede app scripts');

  const headers = await readFile(resolve(import.meta.dirname, '..', 'public/_headers'), 'utf8');
  assert.match(headers, /img-src[^\n]*\bdata:/, 'the deployed CSP must allow the embedded icon');
});

test('isolated iOS icon experiment embeds the exact approved 180px PNG in initial HTML', async () => {
  const html = await shell('ios-icon-data-preview/index.html');
  const links = html.match(/<link rel="apple-touch-icon"[^>]*>/g) ?? [];
  assert.equal(links.length, 1);
  assert.match(html, /<title>Local Roots Icon Test<\/title>/);
  assert.match(html, /apple-mobile-web-app-title" content="LR Icon Test"/);
  await assertEmbeddedIcon(html, 'apple-touch-icon.png', 'af4a80127dd7f9cf208a101dc342743b7d5c50e599b39ea0e7e3d98dd2a667d9');
  assert.doesNotMatch(html, /<script\b/i, 'the test icon must not depend on a delayed script');
  const headers = await readFile(resolve(import.meta.dirname, '..', 'public/_headers'), 'utf8');
  assert.match(headers, /img-src[^\n]*\bdata:/);
  const manifest = JSON.parse(await readFile(resolve(dist, 'ios-icon-data-preview/manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.start_url, '/ios-icon-data-preview/');
  assert.equal(manifest.scope, '/ios-icon-data-preview/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.icons, undefined, 'manifest must not mask whether Safari accepts the embedded Apple icon');
});

test('isolated external-PNG route tests only the same-origin Apple touch icon path', async () => {
  const html = await shell('ios-icon-external-png-preview/index.html');
  const iconLinks = html.match(/<link[^>]+rel="(?:apple-touch-icon|icon)"[^>]*>/g) ?? [];
  assert.equal(iconLinks.length, 1, 'the Apple touch PNG must be the sole icon source in initial HTML');
  assert.match(html, /<title>Local Roots PNG Icon Test<\/title>/);
  assert.match(html, /apple-mobile-web-app-title" content="LR PNG Test"/);
  assert.match(html, /Isolated icon-path test: the only Home Screen artwork source is the approved 180×180 Local Roots PNG/);
  assert.match(html, /rel="manifest" href="\/ios-icon-external-png-preview\/manifest\.webmanifest"/);
  assert.match(iconLinks[0], /rel="apple-touch-icon" sizes="180x180" type="image\/png" href="\/apple-touch-icon\.png\?v=af4a80127dd7f9cf"/);
  assert.doesNotMatch(html, /data:image\/png;base64,/);
  assert.doesNotMatch(html, /<script\b/i, 'the static candidate must not depend on delayed JavaScript');

  const manifest = JSON.parse(await readFile(resolve(dist, 'ios-icon-external-png-preview/manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.name, 'Local Roots PNG Icon Test');
  assert.equal(manifest.short_name, 'LR PNG Test');
  assert.equal(manifest.id, '/ios-icon-external-png-preview/');
  assert.equal(manifest.start_url, '/ios-icon-external-png-preview/');
  assert.equal(manifest.scope, '/ios-icon-external-png-preview/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.icons, undefined, 'the manifest must not provide an alternate icon');

  const headers = await readFile(resolve(import.meta.dirname, '..', 'public/_headers'), 'utf8');
  assert.match(headers, /img-src[^\n]*'self'/, 'CSP must allow the same-origin image request');
  assert.match(headers, /\/apple-touch-icon\.png\n  Cache-Control: no-cache/);
  assert.match(headers, /\/manifest\.webmanifest\n  Cache-Control: no-cache/);

  const icon = await readFile(resolve(import.meta.dirname, '..', 'public/apple-touch-icon.png'));
  assert.equal(icon.toString('ascii', 1, 4), 'PNG');
  assert.deepEqual([icon.readUInt32BE(16), icon.readUInt32BE(20)], [180, 180]);
  assert.equal(createHash('sha256').update(icon).digest('hex'), 'af4a80127dd7f9cf208a101dc342743b7d5c50e599b39ea0e7e3d98dd2a667d9');
});

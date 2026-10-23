import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const dist = resolve(import.meta.dirname, '..', 'dist');
const shell = (path) => readFile(resolve(dist, path), 'utf8');

async function assertExternalIcon(html, assetPath, expectedHash, expectedHref) {
  const links = html.match(/<link rel="apple-touch-icon"[^>]*>/g) ?? [];
  assert.equal(links.length, 1, 'the initial HTML must expose one unambiguous Apple touch icon');
  assert.match(links[0], /sizes="180x180"/);
  if (/type=/.test(links[0])) assert.match(links[0], /type="image\/png"/);
  const href = links[0].match(/href="([^"]+)"/)?.[1];
  assert.equal(href, expectedHref);
  assert.ok(href.startsWith('/'), 'the icon must use a same-origin URL');
  assert.doesNotMatch(href, /^data:/);
  assert.doesNotMatch(links[0], /data:image\/png;base64,/);
  const bytes = await readFile(resolve(import.meta.dirname, '..', 'public', assetPath));
  assert.ok(bytes.length > 0, 'the referenced approved image asset must exist');
  assert.equal(bytes.toString('ascii', 1, 4), 'PNG');
  assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [180, 180]);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expectedHash);
}

test('D&U public route sends branded install metadata in its initial HTML', async () => {
  const html = await shell('dyed-and-unattached/index.html');
  assert.match(html, /<title>Dyed &amp; Unattached · Local Roots<\/title>/);
  assert.match(html, /apple-mobile-web-app-title" content="D&amp;U"/);
  assert.match(html, /rel="manifest" href="\/dyed-and-unattached\/manifest\.webmanifest\?v=ios-icons-20261020"/);
  await assertExternalIcon(html, 'brand/dyed-unattached-icon-180.png', 'a19995150d774de113f6c8e4d10f0fcf8648ae9fbb0c20df592f275455684ecf', '/brand/dyed-unattached-icon-180.png?v=ios-icons-20261020');
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
  await assertExternalIcon(html, 'brand/dyed-unattached-icon-180.png', 'a19995150d774de113f6c8e4d10f0fcf8648ae9fbb0c20df592f275455684ecf', '/brand/dyed-unattached-icon-180.png?v=ios-icons-20261020');
  assert.match(html, /name="robots" content="noindex,nofollow,noarchive"/);
});

test('Weather route sends Weather install identity with the Local Roots icon before React loads', async () => {
  const html = await shell('weather/index.html');
  assert.match(html, /<title>Disc Golf Weather · Local Roots<\/title>/);
  assert.match(html, /apple-mobile-web-app-title" content="LR Weather"/);
  assert.match(html, /rel="manifest" href="\/weather\/manifest\.webmanifest"/);
  await assertExternalIcon(html, 'apple-touch-icon.png', 'af4a80127dd7f9cf208a101dc342743b7d5c50e599b39ea0e7e3d98dd2a667d9', '/apple-touch-icon.png?v=af4a80127dd7f9cf');
  assert.doesNotMatch(html, /href="\/manifest\.webmanifest\?v=/);
});

test('Local Roots root and Dye Studio link their own approved artwork before scripts load', async () => {
  const root = await shell('index.html');
  await assertExternalIcon(root, 'apple-touch-icon.png', 'af4a80127dd7f9cf208a101dc342743b7d5c50e599b39ea0e7e3d98dd2a667d9', '/apple-touch-icon.png?v=af4a80127dd7f9cf');
  assert.match(root, /apple-mobile-web-app-title" content="Local Roots"/);

  const studio = await shell('dyed-and-unattached/dye-studio/index.html');
  await assertExternalIcon(studio, 'brand/dyed-unattached-icon-180.png', 'a19995150d774de113f6c8e4d10f0fcf8648ae9fbb0c20df592f275455684ecf', '/brand/dyed-unattached-icon-180.png?v=ios-icons-20261020');
  assert.match(studio, /apple-mobile-web-app-title" content="D&U Studio"/);
  assert.match(studio, /rel="manifest" href="\.\/manifest\.webmanifest/);
  assert.ok(studio.indexOf('rel="apple-touch-icon"') < studio.indexOf('<script'), 'the initial icon must precede app scripts');
});

test('isolated iOS candidate uses same-origin approved PNG URL in initial HTML and manifest', async () => {
  const html = await shell('ios-icon-external-png-preview/index.html');
  const links = html.match(/<link rel="apple-touch-icon"[^>]*>/g) ?? [];
  assert.equal(links.length, 1);
  assert.match(html, /<title>Local Roots PNG Icon Test<\/title>/);
  assert.match(html, /apple-mobile-web-app-title" content="LR PNG Test"/);
  assert.match(html, /rel="manifest" href="\/ios-icon-external-png-preview\/manifest\.webmanifest"/);
  await assertExternalIcon(html, 'apple-touch-icon.png', 'af4a80127dd7f9cf208a101dc342743b7d5c50e599b39ea0e7e3d98dd2a667d9', '/apple-touch-icon.png?v=af4a80127dd7f9cf');
  assert.doesNotMatch(html, /<script\b/i, 'the test icon must not depend on a delayed script');
  const headers = await readFile(resolve(import.meta.dirname, '..', 'public/_headers'), 'utf8');
  assert.match(headers, /img-src[^\n]*'self'/, 'the deployed CSP must permit the same-origin icon request');
  assert.match(headers, /\/apple-touch-icon\.png\n  Cache-Control: no-cache/);
  assert.match(headers, /\/manifest\.webmanifest\n  Cache-Control: no-cache/);
  const manifest = JSON.parse(await readFile(resolve(dist, 'ios-icon-external-png-preview/manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.id, '/ios-icon-external-png-preview/');
  assert.equal(manifest.start_url, '/ios-icon-external-png-preview/');
  assert.equal(manifest.scope, '/ios-icon-external-png-preview/');
  assert.equal(manifest.display, 'standalone');

  const expectedIcons = [
    ['/apple-touch-icon.png?v=af4a80127dd7f9cf', 'apple-touch-icon.png', 'af4a80127dd7f9cf208a101dc342743b7d5c50e599b39ea0e7e3d98dd2a667d9', 180],
    ['/brand/local-roots-icon-192.png?v=dc2fc313167b4efd', 'brand/local-roots-icon-192.png', 'dc2fc313167b4efd9016813b634d67ec819c60546b73d7050b2302f4d2161795', 192],
    ['/brand/local-roots-icon-512.png?v=b5107277c59c1238', 'brand/local-roots-icon-512.png', 'b5107277c59c123881459e843f4b7a7ca0c4448f5e8291f981f241e4c1f900fe', 512],
  ];
  assert.deepEqual(manifest.icons, expectedIcons.map(([src, , , size]) => ({ src, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' })));
  for (const [src, asset, hash, size] of expectedIcons) {
    assert.ok(src.startsWith('/'));
    const bytes = await readFile(resolve(import.meta.dirname, '..', 'public', asset));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash);
    assert.equal(bytes.toString('ascii', 1, 4), 'PNG');
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [size, size]);
  }
});

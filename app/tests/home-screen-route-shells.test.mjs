import assert from 'node:assert/strict';
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

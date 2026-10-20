import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const file = (path) => readFileSync(resolve(import.meta.dirname, '..', path));
const text = (path) => file(path).toString('utf8');
const lrMarkHash = '736e7c6250fbb619957b68156c8606d6fd50d9d2252bfe2dcd12033abd8fdad3';
const duTombstoneHash = '89ce5f6db5fa730182610575a2bc53aa07ac8a1bd3cf7c33b26af75d23ade879';

function pngSize(bytes) {
  assert.equal(bytes.toString('ascii', 1, 4), 'PNG');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

test('LR favicon metadata uses the production header mark and refreshed icon assets', () => {
  const mark = file('public/brand/local-roots-lr.svg');
  assert.equal(createHash('sha256').update(mark).digest('hex'), lrMarkHash);

  const html = text('index.html');
  assert.match(html, new RegExp(`/brand/local-roots-lr\\.svg\\?v=${lrMarkHash.slice(0, 16)}`));
  assert.match(html, /rel="icon" href="\/favicon\.ico\?v=[a-f0-9]+"/);
  assert.match(html, /rel="icon" href="\/favicon-32x32\.png\?v=[a-f0-9]+"/);
  assert.match(html, /rel="apple-touch-icon" sizes="180x180" href="\/apple-touch-icon\.png\?v=[a-f0-9]+"/);
  assert.deepEqual(pngSize(file('public/favicon-32x32.png')), [32, 32]);
  assert.deepEqual(pngSize(file('public/apple-touch-icon.png')), [180, 180]);
  assert.deepEqual(pngSize(file('public/brand/local-roots-icon-192.png')), [192, 192]);
  assert.deepEqual(pngSize(file('public/brand/local-roots-icon-512.png')), [512, 512]);

  const ico = file('public/favicon.ico');
  assert.deepEqual([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)], [0, 1, 2]);
  assert.deepEqual([ico[6], ico[7], ico[22], ico[23]], [16, 16, 32, 32]);
});

test('Local Roots Weather PWA and iPhone metadata use the LR mark without changing routes or controls', () => {
  const weatherManifest = JSON.parse(text('public/weather/manifest.webmanifest'));
  assert.equal(weatherManifest.start_url, '/weather/');
  assert.equal(weatherManifest.scope, '/weather/');
  assert.ok(weatherManifest.icons.length >= 2);
  assert.ok(weatherManifest.icons.every(({ src }) => src.startsWith('/brand/local-roots-')));
  assert.ok(weatherManifest.icons.every(({ purpose }) => purpose === 'any'));

  const app = text('src/App.tsx');
  assert.match(app, /const WEATHER_MANIFEST = '\/weather\/manifest\.webmanifest'/);
  assert.match(app, /isWeather\?WEATHER_MANIFEST/);
  assert.match(app, /isWeather\?'LR Weather'/);

  const rootManifest = JSON.parse(text('public/manifest.webmanifest'));
  assert.equal(rootManifest.start_url, '/');
  assert.equal(rootManifest.scope, '/');
  assert.ok(rootManifest.icons.some(({ src, sizes, type }) => src.startsWith('/brand/local-roots-icon-192.png') && sizes === '192x192' && type === 'image/png'));
  assert.ok(rootManifest.icons.some(({ src, sizes, type }) => src.startsWith('/brand/local-roots-icon-512.png') && sizes === '512x512' && type === 'image/png'));

  const duSource = file('public/brand/dyed-unattached-tombstone.png');
  assert.equal(createHash('sha256').update(duSource).digest('hex'), duTombstoneHash);
  const duManifest = JSON.parse(text('public/du-manifest.webmanifest'));
  assert.equal(duManifest.start_url, '/admin/dyed-and-unattached');
  assert.equal(duManifest.scope, '/admin/');
  assert.deepEqual(duManifest.icons.map(({ src, sizes, type, purpose }) => [src.split('?')[0], sizes, type, purpose]), [
    ['/brand/dyed-unattached-icon-192.png', '192x192', 'image/png', 'any'],
    ['/brand/dyed-unattached-icon-512.png', '512x512', 'image/png', 'any'],
  ]);
  assert.deepEqual(pngSize(file('public/brand/dyed-unattached-icon-180.png')), [180, 180]);
  assert.deepEqual(pngSize(file('public/brand/dyed-unattached-icon-192.png')), [192, 192]);
  assert.deepEqual(pngSize(file('public/brand/dyed-unattached-icon-512.png')), [512, 512]);

  const duPublicManifest = JSON.parse(text('public/dyed-and-unattached/manifest.webmanifest'));
  assert.equal(duPublicManifest.start_url, '/dyed-and-unattached/');
  assert.equal(duPublicManifest.scope, '/dyed-and-unattached/');
  assert.deepEqual(duPublicManifest.icons.map(({ src, sizes, type, purpose }) => [src.split('?')[0], sizes, type, purpose]), [
    ['/brand/dyed-unattached-icon-192.png', '192x192', 'image/png', 'any'],
    ['/brand/dyed-unattached-icon-512.png', '512x512', 'image/png', 'any'],
  ]);

  const studioManifest = JSON.parse(text('public/dyed-and-unattached/dye-studio/manifest.webmanifest'));
  assert.equal(studioManifest.start_url, '/dyed-and-unattached/dye-studio/');
  assert.equal(studioManifest.scope, '/dyed-and-unattached/dye-studio/');
  assert.ok(studioManifest.icons.some(({ src, sizes }) => src.startsWith('/brand/dyed-unattached-icon-192.png') && sizes === '192x192'));
  assert.ok(studioManifest.icons.some(({ src, sizes }) => src.startsWith('/brand/dyed-unattached-icon-512.png') && sizes === '512x512'));

  const index = text('index.html');
  assert.equal((index.match(/rel="manifest"/g) ?? []).length, 1);
  assert.equal((index.match(/rel="apple-touch-icon"/g) ?? []).length, 1);
  assert.match(app, /isDuAdmin\?DU_MANIFEST:isDuPublic\?DU_PUBLIC_MANIFEST:isWeather\?WEATHER_MANIFEST:ROOT_MANIFEST/);
  assert.match(app, /isDuAdmin\|\|isDyeStudio\|\|isDuPublic\?DU_TOUCH_ICON:LR_TOUCH_ICON/);
  assert.match(app, /isDuAdmin\|\|isDuPublic\?'D&U'/);
  assert.match(app, /isWeather\?'LR Weather':'Local Roots'/);
  assert.match(text('public/dyed-and-unattached/dye-studio/index.html'), /sizes="180x180" href="\/brand\/dyed-unattached-icon-180\.png/);
});

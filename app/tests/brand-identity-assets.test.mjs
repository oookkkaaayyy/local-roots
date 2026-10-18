import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const file = (path) => readFileSync(resolve(import.meta.dirname, '..', path));
const text = (path) => file(path).toString('utf8');
const lrMarkHash = '736e7c6250fbb619957b68156c8606d6fd50d9d2252bfe2dcd12033abd8fdad3';

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
  assert.match(app, /touchIcon\.href='\/apple-touch-icon\.png\?v=af4a80127dd7f9cf'/);
  assert.match(app, /manifest\.href='\/weather\/manifest\.webmanifest'/);
  assert.match(app, /if\(normalized==='\/weather'\)/);

  const duManifest = JSON.parse(text('public/du-manifest.webmanifest'));
  assert.ok(duManifest.icons.every(({ src }) => src === '/brand/local-roots-lr.svg'));
});

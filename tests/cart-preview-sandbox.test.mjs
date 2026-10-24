import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CART_PREVIEW_BRANCH, CART_PREVIEW_PATH, createCartPreviewPlugin } from '../app/cart-preview-plugin.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = path.join(repoRoot, CART_PREVIEW_PATH);
const visualAssets = ['hbnf-cart-ui-v6.css', 'hbnf-cart-icon-180.png'];
const temporaryRoots = [];

async function runPlugin(env) {
  const root = await mkdtemp(path.join(repoRoot, '.cart-preview-sandbox-'));
  temporaryRoots.push(root);
  const outDir = path.join(root, 'dist');
  await mkdir(outDir);
  await writeFile(path.join(outDir, '_headers'), '/*\n  X-Content-Type-Options: nosniff\n');
  const plugin = createCartPreviewPlugin(env);
  plugin.configResolved({ root, build: { outDir: 'dist' } });
  await plugin.closeBundle();
  return { root, outDir };
}

try {
  const preview = await runPlugin({ CF_PAGES: '1', CF_PAGES_BRANCH: CART_PREVIEW_BRANCH });
  const route = path.join(preview.outDir, CART_PREVIEW_PATH);
  const sourceHtml = await readFile(path.join(sourceDirectory, 'hbnf-cart.html'), 'utf8');
  const renderedHtml = await readFile(path.join(route, 'hbnf-cart.html'), 'utf8');

  assert.ok(!/<script\b|navigator\.serviceWorker|hbnf-cart-sw|rel=["']manifest["']/i.test(renderedHtml), 'preview must have no scripts, service worker, or PWA manifest');
  assert.ok(!/SUPABASE|functions\/v1|192\.168\.77\.|wled|hbnf-installer|pair_device/i.test(renderedHtml), 'preview HTML must not contain API or pairing code');
  assert.ok(!/\son[a-z]+\s*=|javascript:/i.test(renderedHtml), 'preview HTML must not contain executable event handlers or links');
  assert.ok(!/\bpair(?:ed|ing)?\b|\bqr\b|\btoken\b/i.test(renderedHtml.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')), 'preview must omit pairing, QR, and token content');
  assert.match(renderedHtml, /Visual preview only — controls are disabled\./);
  assert.ok(!/<(?:button|input|select|textarea)\b(?![^>]*\bdisabled\b)[^>]*>/i.test(renderedHtml), 'all preview controls must be disabled');
  assert.ok(!/<a\b[^>]*\bhref\s*=/i.test(renderedHtml), 'preview links must not navigate to devices or production sites');

  const expectedHtml = sourceHtml
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<section\b(?=[^>]*\bid=["'](?:pairAcceptPanel|authPanel|managePairPanel)["'])[^>]*>[\s\S]*?<\/section\s*>/gi, '')
    .replace(/<section\b(?=[^>]*\baria-label=["']Guest access["'])[^>]*>[\s\S]*?<\/section\s*>/gi, '')
    .replace(/<link\b(?=[^>]*\brel=["']manifest["'])[^>]*>/gi, '')
    .replace(/<meta\b(?=[^>]*\bname=["']hbnf-(?:access|build)["'])[^>]*>/gi, '')
    .replace(/<(button|input|select|textarea)\b([^>]*)>/gi, (_tag, name, attrs) => `<${name}${attrs}${/\sdisabled(?:[=\s]|$)/i.test(attrs) ? '' : ' disabled'}>`)
    .replace(/<a\b([^>]*)>/gi, (_tag, attrs) => `<a${attrs.replace(/\s(?:href|target|rel)=("[^"]*"|'[^']*'|[^\s>]+)/gi, '')} aria-disabled="true" tabindex="-1">`)
    .replace(/<body\b([^>]*)>/i, '<body$1><aside class="cart-preview-notice" role="note">Visual preview only — controls are disabled.</aside>');
  assert.equal(renderedHtml, expectedHtml, 'preview HTML must derive deterministically from the canonical controller using only declared safety transformations');

  const routeFiles = await readdir(route);
  assert.deepEqual(routeFiles.sort(), ['hbnf-cart.html', ...visualAssets].sort(), 'only static HTML, exact CSS, and the app icon may be copied');
  assert.ok(!routeFiles.some(name => /qr|pair|token|\.js$|\.mjs$/i.test(name)), 'preview must publish no QR/pairing/token or executable asset');
  for (const name of visualAssets) {
    assert.deepEqual(await readFile(path.join(route, name)), await readFile(path.join(sourceDirectory, name)), `${name} must match canonical candidate bytes`);
  }
  assert.ok(!/@import\b|url\s*\(/i.test(await readFile(path.join(route, 'hbnf-cart-ui-v6.css'), 'utf8')), 'preview CSS must not load remote or additional resources');

  const headers = await readFile(path.join(preview.outDir, '_headers'), 'utf8');
  assert.match(headers, new RegExp(`/${CART_PREVIEW_PATH}/\\*`));
  assert.match(headers, /Content-Security-Policy: .*connect-src 'none'/);
  assert.match(headers, /default-src 'none'/);
  assert.match(headers, /script-src 'none'/);
  assert.match(headers, /worker-src 'none'/);
  assert.match(headers, /manifest-src 'none'/);
  assert.match(headers, /form-action 'none'/);

  for (const env of [
    { CF_PAGES: '1', CF_PAGES_BRANCH: 'main' },
    { CF_PAGES: '1', CF_PAGES_BRANCH: 'unrelated-preview' },
    { CF_PAGES: '1' },
    {},
  ]) {
    const excluded = await runPlugin(env);
    assert.ok(!(await readdir(excluded.outDir)).includes(CART_PREVIEW_PATH), 'Cart preview must be absent on production, other branches, and local builds');
    assert.equal(await readFile(path.join(excluded.outDir, '_headers'), 'utf8'), '/*\n  X-Content-Type-Options: nosniff\n', 'production/local headers must remain unchanged');
  }

  console.log('Cart preview sandbox: PASS (canonical static HTML/CSS, no QR/pairing/token, no scripts/network/service worker, exact preview branch only)');
} finally {
  await Promise.all(temporaryRoots.map(root => rm(root, { recursive: true, force: true })));
}

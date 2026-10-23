// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';
const projectRoot = new URL(import.meta.url.includes("/dist/tests/") ? "../../" : "../", import.meta.url);
const { findJsAssetImports, readFrontendGraph } = await import(new URL("supabase/functions/lr-integrity-watch/frontend-assets.mjs", projectRoot).href);

const origin = 'https://local-roots.pages.dev';
function fetcher(assets) {
  return async (url) => ({
    ok: url in assets,
    status: url in assets ? 200 : 404,
    url,
    text: async () => assets[url] ?? '',
  });
}

test('discovers lazy and static Vite JS chunks and retains route markers', async () => {
  const assets = {
    [`${origin}/assets/index-a.js`]: 'const route=()=>import("./LegacyRoutes-b.js"); import "https://evil.example/assets/bad.js"; import("./LegacyRoutes-b.js")',
    [`${origin}/assets/LegacyRoutes-b.js`]: 'import "./helpers-c.js"; Past events & results; PDGA Results; Add to Calendar;',
    [`${origin}/assets/helpers-c.js`]: 'Full Results; Upcoming events',
  };
  const result = await readFrontendGraph(`${origin}/assets/index-a.js`, fetcher(assets), origin);
  assert.equal(result.urls.length, 3);
  for (const marker of ['Past events & results', 'PDGA Results', 'Add to Calendar', 'Full Results', 'Upcoming events']) {
    assert.ok(result.bundle.includes(marker), `missing lazy chunk marker: ${marker}`);
  }
  assert.equal(result.urls.some((url) => url.includes('evil')), false);
});

test('limits discovered imports to same-origin JS under /assets/', () => {
  const urls = findJsAssetImports('import("./ok.js");import("https://evil.example/assets/no.js");import("../admin.js");', `${origin}/assets/index.js`, origin);
  assert.deepEqual(urls, [`${origin}/assets/ok.js`]);
});

test('fails closed if an imported chunk is unavailable', async () => {
  await assert.rejects(
    () => readFrontendGraph(`${origin}/assets/index.js`, fetcher({[`${origin}/assets/index.js`]:'import("./missing.js")'}), origin),
    /frontend_asset_http_404/,
  );
});

test('fails closed when an asset exceeds the byte budget', async () => {
  await assert.rejects(
    () => readFrontendGraph(`${origin}/assets/index.js`, fetcher({[`${origin}/assets/index.js`]:'x'.repeat(4_000_001)}), origin),
    /frontend_asset_size_limit/,
  );
});

test('rejects non-asset entrypoints', async () => {
  await assert.rejects(() => readFrontendGraph(`${origin}/index.js`, fetcher({}), origin), /frontend_entry_not_asset/);
});

test('rejects external HTML-selected JS entrypoint before any fetch', async () => {
  let fetched = false;
  await assert.rejects(
    () => readFrontendGraph('https://untrusted.example/assets/index-test.js', async () => {
      fetched = true;
      return { ok: true, url: 'https://untrusted.example/assets/index-test.js', text: async () => '' };
    }, origin),
    /frontend_entry_origin_mismatch/,
  );
  assert.equal(fetched, false);
});

test('rejects absent trusted origin and cross-origin asset response', async () => {
  await assert.rejects(
    () => readFrontendGraph(`${origin}/assets/index.js`, fetcher({})),
    /frontend_entry_origin_mismatch/,
  );
  await assert.rejects(
    () => readFrontendGraph(`${origin}/assets/index.js`, async () => ({
      ok: true, url: 'https://untrusted.example/assets/index.js', text: async () => '',
    }), origin),
    /frontend_asset_origin_mismatch/,
  );
});

// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';
const projectRoot = new URL(import.meta.url.includes("/dist/tests/") ? "../../" : "../", import.meta.url);
const { assertTrustedResponseOrigin, findJsAssetImports, readCssAsset, readFrontendGraph, resolveTrustedAssetUrl } = await import(new URL("supabase/functions/lr-integrity-watch/frontend-assets.mjs", projectRoot).href);

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
    [`${origin}/assets/index-a.js`]: 'const route=()=>import("./LegacyRoutes-b.js"); import("./LegacyRoutes-b.js")',
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

test('accepts only same-origin JS imports under /assets/', () => {
  const urls = findJsAssetImports('import("./ok.js");import("./other.js");', `${origin}/assets/index.js`, origin);
  assert.deepEqual(urls, [`${origin}/assets/ok.js`, `${origin}/assets/other.js`]);
});

test('rejects off-origin imports before fetching them even when route markers are present', async () => {
  const entry = `${origin}/assets/index.js`;
  const fetched = [];
  await assert.rejects(
    () => readFrontendGraph(entry, async (url) => {
      fetched.push(url);
      return {
        ok: true, status: 200, url,
        text: async () => 'Past events & results; PDGA Results; import("https://evil.example/assets/extra.js")',
      };
    }, origin),
    /frontend_import_origin_or_path_mismatch/,
  );
  assert.deepEqual(fetched, [entry]);
});

test('rejects imported JS paths outside the trusted asset directory', () => {
  assert.throws(
    () => findJsAssetImports('import("../admin.js")', `${origin}/assets/index.js`, origin),
    /frontend_import_origin_or_path_mismatch/,
  );
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

test('rejects external CSS href before any request', async () => {
  let requests = 0;
  await assert.rejects(
    () => readCssAsset('https://untrusted.example/assets/injected.css', origin, async () => {
      requests++;
      throw new Error('must not fetch');
    }, origin),
    /css_asset_origin_or_path_mismatch/,
  );
  assert.equal(requests, 0);
  assert.throws(
    () => resolveTrustedAssetUrl('/other.css', origin, origin, 'css'),
    /css_asset_origin_or_path_mismatch/,
  );
});

test('CSS fetch rejects redirects and effective off-origin responses', async () => {
  let fetchOptions;
  const result = await readCssAsset('/assets/site.css', origin, async (url, options) => {
    fetchOptions = options;
    return { ok: true, status: 200, url, text: async () => '.a { color: red; }' };
  }, origin);
  assert.equal(fetchOptions.redirect, 'error');
  assert.equal(result.normalizedCss, '.a{color:red;}');
  await assert.rejects(
    () => readCssAsset('/assets/site.css', origin, async () => ({
      ok: true, status: 200, url: 'https://untrusted.example/assets/site.css', text: async () => '',
    }), origin),
    /css_response_origin_mismatch/,
  );
});

test('HTML staging response origin is required even after a successful HTTP response', () => {
  assert.doesNotThrow(() => assertTrustedResponseOrigin({ url: origin + '/' }, origin, 'staging_html'));
  assert.throws(
    () => assertTrustedResponseOrigin({ url: 'https://untrusted.example/' }, origin, 'staging_html'),
    /staging_html_response_origin_mismatch/,
  );
  assert.throws(
    () => assertTrustedResponseOrigin({ url: '' }, origin, 'staging_html'),
    /staging_html_response_origin_mismatch/,
  );
});

test('CSS source is bounded to the existing asset-size budget', async () => {
  await assert.rejects(
    () => readCssAsset('/assets/site.css', origin, async (url) => ({
      ok: true, status: 200, url, text: async () => 'x'.repeat(4_000_001),
    }), origin),
    /css_asset_size_limit/,
  );
});

test('rejects query-string and extensionless external imports without fetching them', async () => {
  const entry = `${origin}/assets/index.js`;
  for (const specifier of [
    'https://untrusted.example/assets/extra.js?rev=1',
    'https://untrusted.example/assets/extra.js#v2',
    'https://untrusted.example/assets/extra.mjs',
    'https://untrusted.example/extensionless',
  ]) {
    const fetched = [];
    await assert.rejects(
      () => readFrontendGraph(entry, async (url) => {
        fetched.push(url);
        return {
          ok: true, status: 200, url,
          text: async () => `Past events & results; PDGA Results; import("${specifier}")`,
        };
      }, origin),
      /frontend_import_origin_or_path_mismatch/,
    );
    assert.deepEqual(fetched, [entry], `unexpected fetch for ${specifier}`);
  }
});

test('traverses valid same-origin JS import with query-string suffix', async () => {
  const entry = `${origin}/assets/index.js`;
  const child = `${origin}/assets/chunk.js?rev=1`;
  const result = await readFrontendGraph(entry, fetcher({
    [entry]: 'import("./chunk.js?rev=1"); Past events & results',
    [child]: 'PDGA Results',
  }), origin);
  assert.deepEqual(result.urls, [entry, child]);
  assert.ok(result.bundle.includes('PDGA Results'));
});

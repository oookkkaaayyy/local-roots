const MAX_ASSETS = 24;
const MAX_ASSET_CHARS = 4_000_000;
const MAX_TOTAL_CHARS = 12_000_000;
// Inspect every literal import specifier, not only ones ending exactly in .js.
// Query/hash suffixes, .mjs, and extensionless URLs must not bypass origin checks.
const JS_IMPORTS = /\bimport\s*\(\s*["']([^"']+)["']\s*\)|\bfrom\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']/g;

export function findJsAssetImports(source, fromUrl, expectedOrigin) {
  const urls = new Set();
  for (const match of source.matchAll(JS_IMPORTS)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    const url = new URL(specifier, fromUrl);
    if (!expectedOrigin || url.origin !== expectedOrigin || !url.pathname.startsWith('/assets/') || !url.pathname.endsWith('.js')) {
      throw new Error('frontend_import_origin_or_path_mismatch');
    }
    urls.add(url.toString());
  }
  return [...urls];
}

export async function readFrontendGraph(entryUrl, fetchAsset, expectedOrigin) {
  const entry = new URL(entryUrl);
  if (!expectedOrigin || entry.origin !== expectedOrigin) {
    throw new Error('frontend_entry_origin_mismatch');
  }
  if (!entry.pathname.startsWith('/assets/') || !entry.pathname.endsWith('.js')) {
    throw new Error('frontend_entry_not_asset');
  }
  const pending = [entry.toString()];
  const seen = new Set();
  let combined = '';
  while (pending.length) {
    const url = pending.shift();
    if (seen.has(url)) continue;
    if (seen.size >= MAX_ASSETS) throw new Error('frontend_asset_count_limit');
    seen.add(url);
    const response = await fetchAsset(url, { redirect: 'error' });
    if (!response.ok) throw new Error(`frontend_asset_http_${response.status}`);
    if (response.url && new URL(response.url).origin !== expectedOrigin) throw new Error('frontend_asset_origin_mismatch');
    const source = await response.text();
    if (source.length > MAX_ASSET_CHARS || combined.length + source.length > MAX_TOTAL_CHARS) {
      throw new Error('frontend_asset_size_limit');
    }
    combined += `\n${source}`;
    for (const next of findJsAssetImports(source, url, expectedOrigin)) {
      if (!seen.has(next) && !pending.includes(next)) pending.push(next);
    }
  }
  return { bundle: combined, urls: [...seen] };
}


export function assertTrustedResponseOrigin(response, expectedOrigin, label = 'staging') {
  if (!expectedOrigin || !response.url || new URL(response.url).origin !== expectedOrigin) {
    throw new Error(`${label}_response_origin_mismatch`);
  }
}

export function resolveTrustedAssetUrl(href, pageUrl, expectedOrigin, extension) {
  const url = new URL(href, pageUrl);
  if (!expectedOrigin || url.origin !== expectedOrigin ||
      !url.pathname.startsWith('/assets/') || !url.pathname.endsWith(`.${extension}`)) {
    throw new Error(`${extension}_asset_origin_or_path_mismatch`);
  }
  return url.toString();
}

export async function readCssAsset(href, pageUrl, fetchCss, expectedOrigin) {
  const url = resolveTrustedAssetUrl(href, pageUrl, expectedOrigin, 'css');
  const response = await fetchCss(url, { redirect: 'error' });
  if (!response.ok) throw new Error(`css_asset_http_${response.status}`);
  assertTrustedResponseOrigin(response, expectedOrigin, 'css');
  const source = await response.text();
  if (source.length > MAX_ASSET_CHARS) throw new Error('css_asset_size_limit');
  return { url, normalizedCss: source.replace(/\s+/g, '') };
}

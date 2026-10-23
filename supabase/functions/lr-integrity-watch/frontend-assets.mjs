const MAX_ASSETS = 24;
const MAX_ASSET_CHARS = 4_000_000;
const MAX_TOTAL_CHARS = 12_000_000;
const JS_IMPORTS = /\bimport\s*\(\s*["']([^"']+\.js)["']\s*\)|\bfrom\s*["']([^"']+\.js)["']|\bimport\s*["']([^"']+\.js)["']/g;

export function findJsAssetImports(source, fromUrl, expectedOrigin) {
  const urls = new Set();
  for (const match of source.matchAll(JS_IMPORTS)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    const url = new URL(specifier, fromUrl);
    if (url.origin !== expectedOrigin || !url.pathname.startsWith('/assets/') || !url.pathname.endsWith('.js')) continue;
    urls.add(url.toString());
  }
  return [...urls];
}

export async function readFrontendGraph(entryUrl, fetchAsset) {
  const entry = new URL(entryUrl);
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
    if (response.url && new URL(response.url).origin !== entry.origin) throw new Error('frontend_asset_origin_mismatch');
    const source = await response.text();
    if (source.length > MAX_ASSET_CHARS || combined.length + source.length > MAX_TOTAL_CHARS) {
      throw new Error('frontend_asset_size_limit');
    }
    combined += `\n${source}`;
    for (const next of findJsAssetImports(source, url, entry.origin)) {
      if (!seen.has(next) && !pending.includes(next)) pending.push(next);
    }
  }
  return { bundle: combined, urls: [...seen] };
}

const MAX_ASSETS = 24;
const MAX_ASSET_CHARS = 4_000_000;
const MAX_TOTAL_CHARS = 12_000_000;
// Inspect every literal import specifier, not only ones ending exactly in .js.
// Query/hash suffixes, .mjs, and extensionless URLs must not bypass origin checks.
// Bind static from-clauses to actual module declarations. Rendered copy
// containing the phrase "from './poster.js'" is not a JavaScript asset.
const JS_IMPORTS = /\bimport\s*\(\s*["']([^"']+)["']\s*\)|\b(?:import|export)[\w{}*,\s$]*?\bfrom\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']/g;

// A textual import inside page copy, comments or template text is not a
// JavaScript dependency. The regex below recognizes import syntax; this small
// lexical pass qualifies its starting offset as executable code. Template
// interpolation remains executable and is inspected, including nested templates.
function executableCodeOffsets(source) {
  const code = new Uint8Array(source.length);
  const contexts = [{ kind: 'code', interpolation: false, depth: 0 }];
  for (let i = 0; i < source.length; i++) {
    const current = contexts[contexts.length - 1];
    const character = source[i];
    const next = source[i + 1];
    if (current.kind === 'code') {
      if (current.interpolation && character === '}') {
        if (current.depth === 0) { contexts.pop(); continue; }
        current.depth--;
      } else if (current.interpolation && character === '{') {
        current.depth++;
      }
      if (character === "'" || character === '"') {
        contexts.push({ kind: 'quoted', quote: character }); continue;
      }
      if (character === '`') {
        contexts.push({ kind: 'template' }); continue;
      }
      if (character === '/' && next === '/') {
        contexts.push({ kind: 'line-comment' }); i++; continue;
      }
      if (character === '/' && next === '*') {
        contexts.push({ kind: 'block-comment' }); i++; continue;
      }
      code[i] = 1;
    } else if (current.kind === 'quoted') {
      if (character === '\\') { i++; continue; }
      if (character === current.quote) contexts.pop();
    } else if (current.kind === 'template') {
      if (character === '\\') { i++; continue; }
      if (character === '`') { contexts.pop(); continue; }
      if (character === '
  for (const match of source.matchAll(JS_IMPORTS)) {
    if (!executable[match.index]) continue;
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
 && next === '{') {
        contexts.push({ kind: 'code', interpolation: true, depth: 0 });
        i++; continue;
      }
    } else if (current.kind === 'line-comment') {
      if (character === '\n' || character === '\r') {
        contexts.pop(); code[i] = 1;
      }
    } else if (current.kind === 'block-comment') {
      if (character === '*' && next === '/') { contexts.pop(); i++; }
    }
  }
  return code;
}

export function findJsAssetImports(source, fromUrl, expectedOrigin) {
  const urls = new Set();
  const executable = executableCodeOffsets(source);
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

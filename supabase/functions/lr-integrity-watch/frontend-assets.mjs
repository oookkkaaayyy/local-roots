const MAX_ASSETS = 24;
const MAX_ASSET_CHARS = 4_000_000;
const MAX_TOTAL_CHARS = 12_000_000;
// Inspect every literal import specifier, not only ones ending exactly in .js.
// Query/hash suffixes, .mjs, and extensionless URLs must not bypass origin checks.
// Bind static from-clauses to actual module declarations. Rendered copy
// containing the phrase "from './poster.js'" is not a JavaScript asset.
const JS_IMPORTS = /\bimport\s*\(\s*["']([^"']+)["']\s*\)|\b(?:import|export)[\w{}*,\s$]*?\bfrom\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']/g;

// Ignore import-shaped text in strings, template copy and comments, while
// retaining executable imports inside template interpolations (including nested).
// Vite bundles contain import-shaped help text inside JS strings. Recognize
// executable import/export tokens before validating their specifiers. Track
// regexp literals as well: quotes inside regexps must not alter string state.
function executableImportStarts(source) {
  const starts = new Set();
  const contexts = [{ kind: 'code', interpolation: false, depth: 0, regexpAllowed: true }];
  for (let i = 0; i < source.length; i++) {
    const current = contexts[contexts.length - 1];
    const character = source[i];
    const next = source[i + 1];
    if (current.kind === 'code') {
      if (current.interpolation && character === '}') {
        if (current.depth === 0) { contexts.pop(); continue; }
        current.depth--;
        current.regexpAllowed = false;
        continue;
      }
      if (character === "'" || character === '"') {
        current.regexpAllowed = false;
        contexts.push({ kind: 'quoted', quote: character });
        continue;
      }
      if (character === '\x60') {
        current.regexpAllowed = false;
        contexts.push({ kind: 'template' });
        continue;
      }
      if (character === '/' && next === '/') {
        contexts.push({ kind: 'line-comment' });
        i++;
        continue;
      }
      if (character === '/' && next === '*') {
        contexts.push({ kind: 'block-comment' });
        i++;
        continue;
      }
      if (character === '/' && current.regexpAllowed) {
        current.regexpAllowed = false;
        contexts.push({ kind: 'regexp', inClass: false });
        continue;
      }
      if (character === '/') {
        current.regexpAllowed = true;
        continue;
      }
      if (/\s/.test(character)) continue;
      if (/[A-Za-z_$]/.test(character)) {
        const start = i;
        while (i + 1 < source.length && /[\w$]/.test(source[i + 1])) i++;
        const word = source.slice(start, i + 1);
        if (word === 'import' || word === 'export') starts.add(start);
        current.regexpAllowed = /^(return|throw|case|else|do|yield|await|typeof|void|delete|in|instanceof|of|new|extends)$/.test(word);
        continue;
      }
      if (/[0-9]/.test(character)) {
        while (i + 1 < source.length && /[\w.]/.test(source[i + 1])) i++;
        current.regexpAllowed = false;
        continue;
      }
      if (character === '{') {
        if (current.interpolation) current.depth++;
        current.regexpAllowed = true;
        continue;
      }
      if (character === ')' || character === ']' || character === '}') {
        current.regexpAllowed = false;
        continue;
      }
      if (character === '.') {
        current.regexpAllowed = false;
        continue;
      }
      current.regexpAllowed = true;
    } else if (current.kind === 'quoted') {
      if (character === '\\') { i++; continue; }
      if (character === current.quote) contexts.pop();
    } else if (current.kind === 'template') {
      if (character === '\\') { i++; continue; }
      if (character === '\x60') { contexts.pop(); continue; }
      if (character === '$' && next === '{') {
        contexts.push({ kind: 'code', interpolation: true, depth: 0, regexpAllowed: true });
        i++;
        continue;
      }
    } else if (current.kind === 'regexp') {
      if (character === '\\') { i++; continue; }
      if (character === '[') { current.inClass = true; continue; }
      if (character === ']') { current.inClass = false; continue; }
      if (character === '/' && !current.inClass) {
        contexts.pop();
        while (i + 1 < source.length && /[a-z]/i.test(source[i + 1])) i++;
        continue;
      }
    } else if (current.kind === 'line-comment') {
      if (character === '\n' || character === '\r') contexts.pop();
    } else if (current.kind === 'block-comment') {
      if (character === '*' && next === '/') { contexts.pop(); i++; }
    }
  }
  // A line comment ending at EOF is valid JavaScript, not an unclosed token.
  if (contexts[contexts.length - 1].kind === 'line-comment') contexts.pop();
  if (contexts.length !== 1 || contexts[0].kind !== 'code') {
    throw new Error('frontend_import_lexical_unclosed');
  }
  return starts;
}

export function findJsAssetImports(source, fromUrl, expectedOrigin) {
  const urls = new Set();
  const executable = executableImportStarts(source);
  for (const match of source.matchAll(JS_IMPORTS)) {
    if (!executable.has(match.index)) continue;
    const specifier = match[1] ?? match[2] ?? match[3];
    const url = new URL(specifier, fromUrl);
    if (!expectedOrigin || url.origin !== expectedOrigin || !url.pathname.startsWith('/assets/') || !url.pathname.endsWith('.js')) {
      const error = new Error('frontend_import_origin_or_path_mismatch');
      // Diagnostic metadata is private to the caller; keep the error message
      // and the provider's public response contract unchanged.
      error.rejectedImport = {
        source_asset_url: fromUrl,
        specifier,
        resolved_url: url.toString(),
        source_offset: match.index,
      };
      throw error;
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

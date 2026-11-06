// Read-only, fail-closed acceptance probe for actual served Local Roots staging assets.
// Execute on a network with access to https://local-roots.pages.dev/.
// This script makes GET requests only. It never calls the Supabase RPC or writes snapshots.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFrontendGraph, readCssAsset, assertTrustedResponseOrigin } from '../../supabase/functions/lr-integrity-watch/frontend-assets.mjs';

const STAGING_URL = 'https://local-roots.pages.dev/';
const ORIGIN = new URL(STAGING_URL).origin;
const SOURCE = new URL('../../supabase/functions/lr-integrity-watch/index.ts', import.meta.url);
const HELPER = new URL('../../supabase/functions/lr-integrity-watch/frontend-assets.mjs', import.meta.url);
const INDEX_SHA = 'fde8d8599aa4fefd7b12e42ed849627598f8c097';
const HELPER_SHA = 'fbdaa1527ff5e81848507d1c6f3c33ff65e587e8';
const timeoutMs = 10000;
function gitBlobSha(content) {
  const bytes = Buffer.from(content);
  return createHash('sha1').update('blob ' + bytes.byteLength + '\\0').update(bytes).digest('hex');
}
const indexSource = readFileSync(SOURCE,'utf8');
const helperSource = readFileSync(HELPER,'utf8');
if (gitBlobSha(indexSource) !== INDEX_SHA || gitBlobSha(helperSource) !== HELPER_SHA) {
  console.error('FAIL_CLOSED: PR123 index/helper source identity differs from the qualified head');
  process.exit(2);
}
function markers(variable) {
  const found = indexSource.match(new RegExp('const ' + variable + ' = \\[([\\s\\S]*?)\\];'));
  if (!found) throw new Error('required_marker_definition_missing_' + variable);
  return [...found[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
}
const FRONT = markers('REQUIRED_FRONTEND_MARKERS');
const CSS = markers('REQUIRED_CSS_MARKERS');
if (FRONT.length !== 19 || CSS.length !== 8) throw new Error('unrecognized_marker_contract');
const result = {
  observed_staging_url: STAGING_URL,
  watchdog_pr_head: '57bcd953e477ba13a5576e7099217da0ff7c07bf',
  frontend_marker_count: FRONT.length,
  css_marker_count: CSS.length,
  staging_http_status: null,
  staging_headers_ok: false,
  staging_noindex_ok: false,
  shell_ok: false,
  frontend_bundle_ok: false,
  css_bundle_ok: false,
  missing_frontend_markers: [...FRONT],
  missing_css_markers: [...CSS],
  frontend_asset_urls: [],
  css_bundle_url: null,
  failures: []
};
async function get(url, init={}) {
  return fetch(url,{
    ...init,
    redirect:'error',
    signal:AbortSignal.timeout(timeoutMs),
    headers:{ 'User-Agent':'LocalRootsIntegrityWatch/11.0-readonly-proof' }
  });
}
try {
  const page = await get(STAGING_URL);
  assertTrustedResponseOrigin(page, ORIGIN, 'staging_html');
  result.staging_http_status = page.status;
  const robots = page.headers.get('x-robots-tag') ?? '';
  const frame = page.headers.get('x-frame-options') ?? '';
  const type = page.headers.get('x-content-type-options') ?? '';
  const referrer = page.headers.get('referrer-policy') ?? '';
  const hsts = page.headers.get('strict-transport-security') ?? '';
  result.staging_noindex_ok = robots.toLowerCase().includes('noindex');
  result.staging_headers_ok = frame.toUpperCase() === 'DENY'
    && type.toLowerCase() === 'nosniff'
    && referrer.toLowerCase() === 'strict-origin-when-cross-origin'
    && hsts.toLowerCase().includes('max-age=31536000');
  const html = await page.text();
  if(html.length > 4_000_000) throw new Error('staging_html_size_limit');
  result.shell_ok = page.status===200
    && html.includes('<div id="root"></div>')
    && html.includes('<title>Local Roots · Southern California Disc Golf</title>');
  if(!result.shell_ok) result.failures.push('staging_shell_mismatch');
  if(!result.staging_noindex_ok) result.failures.push('staging_noindex_missing');
  if(!result.staging_headers_ok) result.failures.push('staging_security_headers_missing');
  const script = html.match(/<script[^>]+src=["']([^"']+\\.js)["']/i);
  if(!script?.[1]) result.failures.push('staging_js_entry_missing');
  else {
    try {
      const entry = new URL(script[1], STAGING_URL).toString();
      const graph = await readFrontendGraph(entry,get,ORIGIN);
      result.frontend_asset_urls=graph.urls;
      result.missing_frontend_markers=FRONT.filter(m=>!graph.bundle.includes(m));
      result.frontend_bundle_ok=result.missing_frontend_markers.length===0;
      if(!result.frontend_bundle_ok) result.failures.push('staging_missing_frontend_markers');
    } catch(e) {result.failures.push('frontend_graph_'+(e?.message??String(e)));}
  }
  const link = html.match(/<link[^>]+href=["']([^"']+\\.css)["'][^>]*>/i);
  if(!link?.[1]) result.failures.push('staging_css_missing');
  else {
    try {
      const css = await readCssAsset(link[1],STAGING_URL,get,ORIGIN);
      result.css_bundle_url=css.url;
      result.missing_css_markers=CSS.filter(m=>!css.normalizedCss.includes(m));
      result.css_bundle_ok=result.missing_css_markers.length===0;
      if(!result.css_bundle_ok) result.failures.push('staging_missing_css_markers');
    } catch(e){result.failures.push('css_asset_'+(e?.message??String(e)));}
  }
} catch(e){result.failures.push('staging_request_'+(e?.message??String(e)));}
result.staging_ok = result.shell_ok && result.staging_headers_ok && result.staging_noindex_ok && result.frontend_bundle_ok && result.css_bundle_ok && result.failures.length===0;
console.log(JSON.stringify(result,null,2));
process.exitCode=result.staging_ok?0:1;

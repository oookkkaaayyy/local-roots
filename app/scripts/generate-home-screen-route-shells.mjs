import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const routeShells = [
  {
    path: 'dyed-and-unattached/index.html',
    title: 'Dyed &amp; Unattached · Local Roots',
    description: 'Request a custom pet portrait disc stencil from Dyed &amp; Unattached, a Local Roots sub-brand.',
    manifest: '/dyed-and-unattached/manifest.webmanifest?v=ios-icons-20261020',
    appTitle: 'D&amp;U',
    iconAsset: 'brand/dyed-unattached-icon-180.png',
  },
  {
    path: 'weather/index.html',
    title: 'Disc Golf Weather · Local Roots',
    description: 'Compare verified Southern California course forecasts by playing hours.',
    manifest: '/weather/manifest.webmanifest',
    appTitle: 'LR Weather',
    iconAsset: 'apple-touch-icon.png',
  },
  {
    path: 'admin/dyed-and-unattached/index.html',
    title: 'D&amp;U Production Queue · Local Roots',
    description: 'Protected Dyed &amp; Unattached production queue.',
    manifest: '/du-manifest.webmanifest?v=ios-icons-20261020',
    appTitle: 'D&amp;U',
    iconAsset: 'brand/dyed-unattached-icon-180.png',
    noindex: true,
  },
];

function replaceRequired(html, pattern, replacement, name) {
  if (!pattern.test(html)) throw new Error(`Could not find ${name} in the built Local Roots HTML shell`);
  return html.replace(pattern, replacement);
}

export function pngDataUrl(bytes) {
  if (bytes.toString('ascii', 1, 4) !== 'PNG') throw new Error('Apple touch icon source must be a PNG');
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== 180 || height !== 180) throw new Error(`Apple touch icon must be 180x180; got ${width}x${height}`);
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

export function withInlineAppleTouchIcon(html, dataUrl) {
  const matches = html.match(/<link\s+rel="apple-touch-icon"[^>]*>/gi) ?? [];
  if (matches.length !== 1) throw new Error(`Expected exactly one apple-touch-icon link, found ${matches.length}`);
  const link = '<link rel="apple-touch-icon" sizes="180x180" type="image/png" href="' + dataUrl + '" data-app-touch-icon />';
  return html.replace(matches[0], link);
}

export function makeRouteShell(rootHtml, { title, description, manifest, appTitle, iconDataUrl, noindex }) {
  let html = rootHtml;
  html = replaceRequired(html, /<link\s+rel="manifest"[^>]*data-app-manifest[^>]*\/?\s*>/i,
    `<link rel="manifest" href="${manifest}" data-app-manifest />`, 'manifest link');
  html = replaceRequired(html, /<link\s+rel="apple-touch-icon"[^>]*data-app-touch-icon[^>]*\/?\s*>/i,
    `<link rel="apple-touch-icon" sizes="180x180" type="image/png" href="${iconDataUrl}" data-app-touch-icon />`, 'Apple touch icon');
  html = replaceRequired(html, /<meta\s+name="apple-mobile-web-app-title"[^>]*data-app-title[^>]*\/?\s*>/i,
    `<meta name="apple-mobile-web-app-title" content="${appTitle}" data-app-title />`, 'Apple app title');
  html = replaceRequired(html, /<meta\s+name="description"[^>]*\/?\s*>/i,
    `<meta name="description" content="${description}" />`, 'description');
  html = replaceRequired(html, /<title>[^<]*<\/title>/i, `<title>${title}</title>`, 'document title');
  if (noindex) html = html.replace('</head>', '    <meta name="robots" content="noindex,nofollow,noarchive" />\n  </head>');
  return html;
}

export async function generateHomeScreenRouteShells(distDir = resolve(projectRoot, 'dist')) {
  const rootTemplate = await readFile(resolve(distDir, 'index.html'), 'utf8');
  const rootIcon = pngDataUrl(await readFile(resolve(projectRoot, 'public/apple-touch-icon.png')));
  const rootHtml = withInlineAppleTouchIcon(rootTemplate, rootIcon);
  await writeFile(resolve(distDir, 'index.html'), rootHtml);
  for (const route of routeShells) {
    const output = resolve(distDir, route.path);
    await mkdir(dirname(output), { recursive: true });
    const iconDataUrl = pngDataUrl(await readFile(resolve(projectRoot, 'public', route.iconAsset)));
    await writeFile(output, makeRouteShell(rootHtml, { ...route, iconDataUrl }));
  }

  // Dye Studio is an independent static app shell, so embed its approved D&U icon too.
  const studioPath = resolve(distDir, 'dyed-and-unattached/dye-studio/index.html');
  const studioHtml = await readFile(studioPath, 'utf8');
  const duIcon = pngDataUrl(await readFile(resolve(projectRoot, 'public/brand/dyed-unattached-icon-180.png')));
  await writeFile(studioPath, withInlineAppleTouchIcon(studioHtml, duIcon));

  // Isolated iOS 27 icon experiment: the only icon source on this page is the
  // approved Local Roots 180px Apple touch PNG embedded in the initial HTML.
  // Keep this route preview-only until an owner tests Safari's install preview.
  const iconDataUrl = rootIcon;
  const previewDir = resolve(distDir, 'ios-icon-data-preview');
  await mkdir(previewDir, { recursive: true });
  await writeFile(resolve(previewDir, 'index.html'), `<!doctype html>
<html lang="en"><head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="LR Icon Test">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <link rel="manifest" href="/ios-icon-data-preview/manifest.webmanifest">
  <link rel="apple-touch-icon" sizes="180x180" type="image/png" href="${iconDataUrl}">
  <title>Local Roots Icon Test</title>
</head><body><main><h1>Local Roots icon test</h1><p>This temporary page isolates the embedded Apple touch icon for a Safari Home Screen preview.</p></main></body></html>\n`);
  await writeFile(resolve(previewDir, 'manifest.webmanifest'), `${JSON.stringify({
    id: '/ios-icon-data-preview/',
    name: 'Local Roots Icon Test',
    short_name: 'LR Icon Test',
    start_url: '/ios-icon-data-preview/',
    scope: '/ios-icon-data-preview/',
    display: 'standalone',
  }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await generateHomeScreenRouteShells();
}

import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CART_PREVIEW_BRANCH = 'codex/cart-show-scores-feedback-20261023';
export const CART_PREVIEW_PATH = 'hbnf-final-controller';

const APP_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(APP_DIR, '..');
const CONTROLLER_SOURCE = resolve(REPOSITORY_ROOT, CART_PREVIEW_PATH);
const VISUAL_ASSETS = ['hbnf-cart-ui-v6.css', 'hbnf-cart-icon-180.png'];
const CSP = "default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'none'; script-src 'none'; worker-src 'none'; manifest-src 'none'";

function removeSection(html, openingTagPattern, label) {
  const start = html.search(openingTagPattern);
  if (start < 0) throw new Error(`Cart preview expected the ${label} section.`);
  const openingEnd = html.indexOf('>', start) + 1;
  const closingStart = html.indexOf('</section>', openingEnd);
  if (openingEnd === 0 || closingStart < 0) throw new Error(`Cart preview could not safely remove the ${label} section.`);
  return html.slice(0, start) + html.slice(closingStart + '</section>'.length);
}

function makeStaticPreview(source) {
  let html = source;
  let scriptCount = 0;
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, () => {
    scriptCount += 1;
    return '';
  });
  if (scriptCount === 0) throw new Error('Cart preview expected source scripts to disable.');

  for (const id of ['pairAcceptPanel', 'authPanel', 'managePairPanel']) {
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = removeSection(html, new RegExp(`<section\\b(?=[^>]*\\bid=["']${escapedId}["'])[^>]*>`, 'i'), id);
  }
  html = removeSection(html, /<section\b(?=[^>]*\baria-label=["']Guest access["'])[^>]*>/i, 'Guest access');
  html = html.replace(/<link\b(?=[^>]*\brel=["']manifest["'])[^>]*>/gi, '');
  html = html.replace(/<meta\b(?=[^>]*\bname=["']hbnf-(?:access|build)["'])[^>]*>/gi, '');
  html = html.replace(/<(button|input|select|textarea)\b([^>]*)>/gi, (_tag, name, attrs) => {
    return `<${name}${attrs}${/\sdisabled(?:[=\s]|$)/i.test(attrs) ? '' : ' disabled'}>`;
  });
  html = html.replace(/<a\b([^>]*)>/gi, (_tag, attrs) => {
    const inertAttrs = attrs.replace(/\s(?:href|target|rel)=("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    return `<a${inertAttrs} aria-disabled="true" tabindex="-1">`;
  });
  html = html.replace(/<body\b([^>]*)>/i, '<body$1><aside class="cart-preview-notice" role="note">Visual preview only — controls are disabled.</aside>');

  if (/<script\b|navigator\.serviceWorker|hbnf-cart-sw|rel=["']manifest["']/i.test(html)) {
    throw new Error('Static Cart preview retained an executable or installable PWA entry point.');
  }
  if (/<(?:button|input|select|textarea)\b(?![^>]*\bdisabled\b)[^>]*>/i.test(html)) {
    throw new Error('Static Cart preview contains an enabled control.');
  }
  if (/<a\b[^>]*\bhref\s*=/i.test(html)) throw new Error('Static Cart preview contains a navigable link.');
  if (/<section\b(?=[^>]*\bid=["'](?:pairAcceptPanel|authPanel|managePairPanel)["'])/i.test(html) ||
      /<section\b(?=[^>]*\baria-label=["']Guest access["'])/i.test(html)) {
    throw new Error('Static Cart preview retained pairing or QR UI.');
  }
  const visibleMarkup = html.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '');
  if (/\bpair(?:ed|ing)?\b|\bqr\b|\btoken\b/i.test(visibleMarkup)) {
    throw new Error('Static Cart preview retained pairing, QR, or token text.');
  }
  return html;
}

export function createCartPreviewPlugin(env = process.env) {
  let outputDirectory = null;
  const isAuthorizedPreview = env.CF_PAGES === '1' &&
    env.CF_PAGES_BRANCH === CART_PREVIEW_BRANCH &&
    env.CF_PAGES_BRANCH !== 'main';

  return {
    name: 'hbnf-cart-visual-preview-only',
    apply: 'build',
    configResolved(config) {
      outputDirectory = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      if (!isAuthorizedPreview) return;
      if (!outputDirectory) throw new Error('Cart preview output directory was not resolved.');

      const routeDirectory = resolve(outputDirectory, CART_PREVIEW_PATH);
      await mkdir(routeDirectory, { recursive: true });
      const sourceHtml = await readFile(resolve(CONTROLLER_SOURCE, 'hbnf-cart.html'), 'utf8');
      await writeFile(resolve(routeDirectory, 'hbnf-cart.html'), makeStaticPreview(sourceHtml));
      for (const name of VISUAL_ASSETS) {
        await copyFile(resolve(CONTROLLER_SOURCE, name), resolve(routeDirectory, name));
      }

      const headersPath = resolve(outputDirectory, '_headers');
      let headers = await readFile(headersPath, 'utf8').catch(error => {
        if (error.code === 'ENOENT') return '';
        throw error;
      });
      const routeRule = `/${CART_PREVIEW_PATH}/*\n  Content-Security-Policy: ${CSP}\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n`;
      if (!headers.includes(`/${CART_PREVIEW_PATH}/*`)) {
        headers = `${headers.replace(/\s*$/, '')}${headers ? '\n\n' : ''}${routeRule}`;
        await writeFile(headersPath, headers);
      }
    },
  };
}

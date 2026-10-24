import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const controller = path.join(here, "..", "hbnf-final-controller");
const output = path.join("/private/tmp", "hbnf-cart-inert-preview");
const assets = ["hbnf-cart-ui-v6.css", "hbnf-cart-icon-180.png", "hbnf-guest-qr.png"];

export function makeInertPreview(html, css) {
  if (/@import\b|url\(\s*['"]?(?:https?:|\/\/)/i.test(css)) {
    throw new Error("Preview stylesheet contains a remote resource.");
  }
  if (/<(?:iframe|object|embed|form)\b/i.test(html) || /\s+src=(['"])https?:\/\//i.test(html)) {
    throw new Error("Preview HTML contains an active or remote resource.");
  }
  const htmlHash = createHash("sha256").update(html).digest("hex");
  const cssHash = createHash("sha256").update(css).digest("hex");
  let rendered = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<link\b(?=[^>]*\brel=["'](?:manifest|apple-touch-icon)["'])[^>]*>/gi, "")
    .replace(/\s+href=(['"])https?:\/\/[^'"]*\1/gi, "")
    .replace(/(<strong\s+id="cartLanTruth"[^>]*>)[\s\S]*?(<\/strong>)/, "$1Offline preview$2")
    .replace(/(<strong\s+id="internetTruth"[^>]*>)[\s\S]*?(<\/strong>)/, "$1Not connected$2")
    .replace(/(<strong\s+id="matrixOutputTruth"[^>]*>)[\s\S]*?(<\/strong>)/, "$1Not checked$2")
    .replace(/<body([^>]*)>/i, '<body$1 data-inert-preview="true">');
  const csp = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'none\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data:; font-src \'self\'; connect-src \'none\'; media-src \'none\'; object-src \'none\'; form-action \'none\'; base-uri \'none\'">';
  const banner = '<aside class="inert-preview-banner" role="note">Offline visual preview · controls are inactive · no network requests or commands</aside>';
  const previewStyles = '<style>.inert-preview-banner{position:sticky;top:0;z-index:1000;padding:10px 14px;border:2px solid #f0ca73;border-radius:10px;background:#06100d;color:#eff8f3;font-weight:800;text-align:center}</style>';
  rendered = rendered.replace("<head>", `<head>\n  <meta name="hbnf-preview-source-sha256" content="${htmlHash}">\n  <meta name="hbnf-preview-css-sha256" content="${cssHash}">\n  ${csp}\n  ${previewStyles}`)
    .replace(/<body([^>]*)>/i, `<body$1>${banner}`);
  return rendered;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const html = fs.readFileSync(path.join(controller, "hbnf-cart.html"), "utf8");
  const css = fs.readFileSync(path.join(controller, "hbnf-cart-ui-v6.css"), "utf8");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, "index.html"), makeInertPreview(html, css));
  for (const asset of assets) fs.copyFileSync(path.join(controller, asset), path.join(output, asset));
  process.stdout.write(`${output}/index.html\n`);
}

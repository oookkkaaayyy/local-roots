import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const controller = path.join(root, "hbnf-final-controller");
const html = fs.readFileSync(path.join(controller, "hbnf-cart.html"), "utf8");
const css = fs.readFileSync(path.join(controller, "hbnf-cart-ui-v6.css"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(controller, "hbnf-cart-manifest.webmanifest"), "utf8"));
const installer = fs.readFileSync(path.join(root, "hbnf-ui-v6-package/install_ui_v6.py"), "utf8");
const uiWorkflow = fs.readFileSync(path.join(root, ".github/workflows/hbnf-cart-ui-v6-package.yml"), "utf8");
const releaseWorkflow = fs.readFileSync(path.join(root, ".github/workflows/hbnf-coordinated-release-ci.yml"), "utf8");

assert.match(html, /hbnf-cart2-phase2-wow-r2-20261007/);
assert.doesNotMatch(html, /skins-owner-pwa-r1/);
assert.equal(manifest.id, "/hbnf-cart.html");
assert.equal(manifest.start_url, "/hbnf-cart.html?app=20261007-wow-r2");
assert.equal(manifest.scope, "/hbnf-cart.html");
assert.deepEqual(manifest.icons.map(({ sizes }) => sizes), ["192x192", "512x512"]);

const referenced = new Set();
// Inspect resource-bearing elements. Anchor hrefs are navigation routes, not
// packaged static assets (for example /guest/hbnf-cart/).
for (const [, , attrs] of html.matchAll(/<(script|link|img|source|iframe)\b([^>]*)>/gi)) {
  for (const [, raw] of attrs.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const local = raw.split(/[?#]/, 1)[0];
    if (!local || /^(?:https?:|data:|#)/i.test(local)) continue;
    referenced.add(path.basename(local));
  }
}
for (const icon of manifest.icons) referenced.add(path.basename(icon.src));
for (const name of referenced) {
  assert.ok(fs.existsSync(path.join(controller, name)), `missing owner PWA asset: ${name}`);
}

for (const name of [
  "hbnf-cart-skins-score.mjs",
  "hbnf-cart-net.mjs",
  "hbnf-cart-sw.js",
  "hbnf-cart-icon-180.png",
  "hbnf-cart-icon-192.png",
  "hbnf-cart-icon-512.png",
]) {
  assert.ok(installer.includes(`"${name}"`), `installer omits ${name}`);
  assert.ok(uiWorkflow.includes(`hbnf-final-controller/${name}`), `V7.3 package omits ${name}`);
  assert.ok(releaseWorkflow.includes(`hbnf-final-controller/${name}`), `release package omits ${name}`);
}

assert.match(html, /navigator\.serviceWorker\.register/);
const sliders = [...html.matchAll(/<input\b[^>]*type="range"[^>]*>/g)].map(([tag]) => tag);
assert.equal(sliders.length, 7, "all course/audio/brightness sliders are covered");
for (const tag of sliders) {
  const id = tag.match(/\bid="([^"]+)"/)?.[1];
  assert.ok(id, "each course slider has a stable identifier");
  if (/aria-label=/.test(tag)) continue;
  const inputAt = html.indexOf(tag);
  const labelStart = html.lastIndexOf("<label", inputAt);
  const labelEnd = html.indexOf("</label>", inputAt);
  assert.ok(labelStart >= 0 && labelEnd > inputAt, `${id} must have an accessible label`);
}
assert.match(css, /height:44px;min-height:44px/, "range hit area is at least 44px high");
assert.match(css, /width:100%/, "range hit area fills its control column");
assert.match(css, /min-width:44px/, "range hit area remains at least 44px wide");
assert.match(css, /::-webkit-slider-thumb[^}]*width:20px;height:20px/);
assert.match(css, /::-moz-range-thumb[^}]*width:16px;height:16px/);
assert.match(html, /:focus-visible/, "keyboard focus styling remains visible");
assert.ok(fs.existsSync(path.join(controller, "hbnf-cart-sw.js")), "owner PWA service worker missing");
assert.match(uiWorkflow, /HBNF-CART-UI-V7-3-PHASE2-INTEGRATED-R1-20261006/);
assert.match(uiWorkflow, /tests\/hbnf_owner_pwa_package\.mjs/);
assert.match(releaseWorkflow, /tests\/hbnf_owner_pwa_package\.mjs/);

console.log("HBNF owner PWA package closure: PASS");

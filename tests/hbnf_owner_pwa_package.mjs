import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const controller = path.join(root, "hbnf-final-controller");
const guestRoute = path.join(controller, "guest/hbnf-cart");
const html = fs.readFileSync(path.join(controller, "hbnf-cart.html"), "utf8");
const css = fs.readFileSync(path.join(controller, "hbnf-cart-ui-v6.css"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(controller, "hbnf-cart-manifest.webmanifest"), "utf8"));
const installer = fs.readFileSync(path.join(root, "hbnf-ui-v6-package/install_ui_v6.py"), "utf8");
const uiWorkflow = fs.readFileSync(path.join(root, ".github/workflows/hbnf-cart-ui-v6-package.yml"), "utf8");
const releaseWorkflow = fs.readFileSync(path.join(root, ".github/workflows/hbnf-coordinated-release-ci.yml"), "utf8");

assert.match(html, /hbnf-cart2-owner-ux-r4-20261008/);
assert.doesNotMatch(html, /skins-owner-pwa-r1/);
assert.equal(manifest.id, "/hbnf-cart.html");
assert.equal(manifest.start_url, "/hbnf-cart.html?app=20261008-owner-ux-r4");
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
  assert.ok(uiWorkflow.includes(`hbnf-final-controller/${name}`), `Owner/Guest package omits ${name}`);
  assert.ok(releaseWorkflow.includes(`hbnf-final-controller/${name}`), `release package omits ${name}`);
}

assert.match(html, /navigator\.serviceWorker\.register/);
assert.match(html, /id="featureFontIndex"[\s\S]*value="4" selected[\s\S]*Slot 0 · Tom Thumb 6px[\s\S]*Slot 2 · Console 6×8[\s\S]*Slot 3 · C64-esque 9px/);
assert.doesNotMatch(html, /TinyUnicode/i, "unsupported UTF-8 font slot is not offered by the ASCII overlay adapter");
const featureModule = fs.readFileSync(path.join(controller, "hbnf-cart-features.mjs"), "utf8");
assert.match(featureModule, /nativeTextFontIndexV1===true/);
assert.match(featureModule, /if \(fontIndex\) fontIndex\.disabled=!fontIndexReady/);
assert.match(featureModule, /if \(canonicalCapabilities\(\)\.nativeTextFontIndexV1===true\) data\.fontIndex=/);
assert.doesNotMatch(featureModule, /\?\.value\s*\?\?/);
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
assert.match(uiWorkflow, /HBNF-CART-OWNER-UX-R4-GUEST-ROUTE-R2-20261008/);
assert.match(installer, /BUILD_MARKER="hbnf-cart2-owner-ux-r4-20261008"/);
assert.match(installer, /\?release="\+BUILD_MARKER\+/);
assert.match(installer, /HBNF_CART_OWNER_UX_R4_GUEST_ROUTE_R2_INSTALL=PASS/);
assert.match(installer, /if not verified:\s+raise RuntimeError\("Deploy finished but exact Owner UX R4 \+ Guest Route R2 marker did not verify/);
assert.doesNotMatch(installer, /HBNF_CART_UI_V7_3_PHASE2_INTEGRATED_R1_20261006|HBNF_CART_UI_V7_3_PWA_R1_INSTALL/);
assert.match(uiWorkflow, /"schema":"hbnf-cart-owner-ux-r4-guest-route-r2-package-v1"/);
assert.match(uiWorkflow, /tests\/hbnf_owner_pwa_package\.mjs/);
assert.match(releaseWorkflow, /tests\/hbnf_owner_pwa_package\.mjs/);

for (const name of ["index.html", "guest.js", "guest.css"]) {
  const rel = `guest/hbnf-cart/${name}`;
  assert.ok(fs.existsSync(path.join(controller, rel)), `Guest route asset missing: ${rel}`);
  assert.match(installer, new RegExp(rel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `installer omits ${rel}`);
  assert.ok(uiWorkflow.includes(`hbnf-final-controller/${rel}`), `package workflow omits ${rel}`);
}
assert.match(installer, /FILES\+GUEST_FILES/);
assert.match(uiWorkflow, /\.rglob\("\*"\)/, "package manifest must hash nested Guest files");

const guestHtml = fs.readFileSync(path.join(guestRoute, "index.html"), "utf8");
const guestJs = fs.readFileSync(path.join(guestRoute, "guest.js"), "utf8");
for (const vibe of ["chill", "groove", "heavy", "psychedelic", "cosmic"]) {
  assert.match(guestHtml, new RegExp(`data-value="${vibe}"`), `Guest page exposes approved ${vibe} name`);
}
assert.match(guestHtml, /data-guest-action="vibe_auto" data-vibe-control disabled/);
assert.match(guestHtml, /Guest Vibes stay disabled until the Cart’s matching Vibe runtime is qualified/);
assert.doesNotMatch(guestHtml, /data-value="(?:mellow|moderate|energetic|peak)"/);
assert.match(guestJs, /button\.hasAttribute\("data-vibe-control"\)/, "Guest status refresh must never enable an unqualified Vibe action");
assert.match(guestJs, /Vibe selection is unavailable until the matching Cart runtime is qualified/);

console.log("HBNF owner PWA package closure: PASS");

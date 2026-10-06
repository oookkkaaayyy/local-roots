import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const controller = path.join(root, "hbnf-final-controller");
const html = fs.readFileSync(path.join(controller, "hbnf-cart.html"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(controller, "hbnf-cart-manifest.webmanifest"), "utf8"));
const installer = fs.readFileSync(path.join(root, "hbnf-ui-v6-package/install_ui_v6.py"), "utf8");
const uiWorkflow = fs.readFileSync(path.join(root, ".github/workflows/hbnf-cart-ui-v6-package.yml"), "utf8");
const releaseWorkflow = fs.readFileSync(path.join(root, ".github/workflows/hbnf-coordinated-release-ci.yml"), "utf8");

assert.match(html, /hbnf-cart-final-v7-3-skins-owner-20261006/);
assert.equal(manifest.id, "/hbnf-cart.html");
assert.equal(manifest.start_url, "/hbnf-cart.html?app=20261006-skins-owner-1");
assert.equal(manifest.scope, "/hbnf-cart.html");
assert.deepEqual(manifest.icons.map(({ sizes }) => sizes), ["192x192", "512x512"]);

const referenced = new Set();
for (const [, raw] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const local = raw.split(/[?#]/, 1)[0];
  if (!local || /^(?:https?:|data:|#)/i.test(local)) continue;
  referenced.add(path.basename(local));
}
for (const icon of manifest.icons) referenced.add(path.basename(icon.src));
for (const name of referenced) {
  assert.ok(fs.existsSync(path.join(controller, name)), `missing owner PWA asset: ${name}`);
}

for (const name of [
  "hbnf-cart-skins-score.mjs",
  "hbnf-cart-icon-180.png",
  "hbnf-cart-icon-192.png",
  "hbnf-cart-icon-512.png",
]) {
  assert.ok(installer.includes(`"${name}"`), `installer omits ${name}`);
  assert.ok(uiWorkflow.includes(`hbnf-final-controller/${name}`), `V7.3 package omits ${name}`);
  assert.ok(releaseWorkflow.includes(`hbnf-final-controller/${name}`), `release package omits ${name}`);
}

assert.ok(!/serviceWorker\s*\.\s*register\s*\(/.test(html + fs.readFileSync(path.join(controller, "hbnf-cart.js"), "utf8")),
  "owner controller must not introduce a service worker cache lifecycle");
assert.match(uiWorkflow, /HBNF-CART-UI-V7-3-SKINS-OWNER-20261006/);
assert.match(uiWorkflow, /tests\/hbnf_owner_pwa_package\.mjs/);
assert.match(releaseWorkflow, /tests\/hbnf_owner_pwa_package\.mjs/);

console.log("HBNF owner PWA package closure: PASS");

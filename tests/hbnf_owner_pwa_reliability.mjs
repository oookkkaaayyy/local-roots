import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fetchWithDeadline, parsePairFragment } from "../hbnf-final-controller/hbnf-cart-net.mjs";

const root = path.resolve(import.meta.dirname, "..");
const controller = path.join(root, "hbnf-final-controller");
const html = fs.readFileSync(path.join(controller, "hbnf-cart.html"), "utf8");
const js = fs.readFileSync(path.join(controller, "hbnf-cart.js"), "utf8");
const sw = fs.readFileSync(path.join(controller, "hbnf-cart-sw.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(controller, "hbnf-cart-manifest.webmanifest"), "utf8"));
const installer = fs.readFileSync(path.join(root, "hbnf-ui-v6-package/install_ui_v6.py"), "utf8");
const VERSION = "20261007-wow-r2";
const TOKEN = "a".repeat(64);

assert.equal(parsePairFragment(`#pair=${TOKEN}`), TOKEN);
assert.equal(parsePairFragment(`#x=1&pair=${TOKEN}&y=2`), TOKEN);
assert.equal(parsePairFragment("#pair=bad"), "");
assert.match(js, /detectPairFragment\(\);/);
assert.match(js, /managePairPanel\.hidden = !validDeviceToken\(deviceToken\(\)\)/);
assert.match(js, new RegExp(`hbnf-cart-net\\.mjs\\?v=${VERSION}`));
assert.match(js, new RegExp(`hbnf-cart-semantic\\.mjs\\?v=${VERSION}`));

const fast = await fetchWithDeadline(async (_url, options) => ({ ok: true, signal: options.signal }), "https://example.test", {}, 100, "Fast path");
assert.equal(fast.ok, true);
let aborted = false;
const slow = (_url, options) => new Promise((_resolve, reject) => {
  if (options.signal) options.signal.addEventListener("abort", () => {
    aborted = true;
    const error = new Error("aborted");
    error.name = "AbortError";
    reject(error);
  });
});
await assert.rejects(
  () => fetchWithDeadline(slow, "https://example.test", {}, 25, "Slow path"),
  error => error && error.name === "TimeoutError" && /Slow path timed out/.test(error.message),
);
assert.equal(aborted, true);
assert.match(js, /fetchWithDeadline\(fetch, endpoint/);
assert.match(js, /fetchWithDeadline\(fetch, visualStatusEndpoint/);
assert.match(js, /window\.addEventListener\("online"/);
assert.match(js, /window\.addEventListener\("offline"/);

assert.equal(manifest.start_url, `/hbnf-cart.html?app=${VERSION}`);
assert.match(html, /navigator\.serviceWorker\.register/);
assert.match(html, new RegExp(`hbnf-cart-sw\\.js\\?v=${VERSION}`));
assert.match(html, /scope:"\/hbnf-cart\.html"/);
assert.match(sw, /hbnf-owner-pwa-v7-3-phase2-wow-r2-20261007/);
assert.match(sw, /self\.skipWaiting\(\)/);
assert.match(sw, /self\.clients\.claim\(\)/);
assert.match(sw, /url\.origin !== self\.location\.origin/);
assert.match(sw, /request\.method !== "GET"/);
assert.doesNotMatch(sw, /supabase\.co|functions\/v1|192\.168\.77\./i);
for (const name of ["hbnf-cart-net.mjs", "hbnf-cart-sw.js"]) {
  assert.ok(installer.includes(`"${name}"`), `installer omits ${name}`);
}
for (const asset of [
  "hbnf-cart.html",
  "hbnf-cart.js",
  "hbnf-cart-net.mjs",
  "hbnf-cart-semantic.mjs",
  "hbnf-cart-ui-v6.css",
  "hbnf-cart-ui-v6.mjs",
  "hbnf-cart-features.mjs",
  "hbnf-cart-skins-score.mjs",
  "hbnf-cart-manifest.webmanifest",
  "hbnf-cart-icon-180.png",
  "hbnf-cart-icon-192.png",
  "hbnf-cart-icon-512.png",
]) {
  assert.match(sw, new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `service worker core omits ${asset}`);
}
console.log("PASS: owner PWA deadline, pairing, versioned imports, offline shell cache, and cache isolation contracts");

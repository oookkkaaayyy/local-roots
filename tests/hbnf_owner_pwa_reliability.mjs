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
const VERSION = "20261008-owner-ux-r4";
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
assert.match(js, /badge\.textContent = "Cart service unavailable"/);
assert.match(js, /matrixHealth\.textContent = "Not confirmed"/);
assert.match(js, /auxHealth\.textContent = "Not confirmed"/);
assert.match(js, /window\.addEventListener\("online"/);
assert.match(js, /window\.addEventListener\("offline"/);

assert.equal(manifest.start_url, `/hbnf-cart.html?app=${VERSION}`);
assert.match(html, /navigator\.serviceWorker\.register/);
assert.match(html, new RegExp(`hbnf-cart-sw\\.js\\?v=${VERSION}`));
assert.match(html, /scope:"\/hbnf-cart\.html"/);
assert.match(sw, /hbnf-owner-pwa-v7-4-owner-ux-r4-20261008/);
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

assert.ok(html.indexOf('class="panel quick-brightness"') < html.indexOf('class="panel cart-commands"'), "Matrix and Underglow brightness must be immediately accessible at the top of the primary screen");
assert.ok(html.indexOf('class="panel quick-brightness"') < html.indexOf('class="panel quick-vibe"') && html.indexOf('class="panel quick-vibe"') < html.indexOf('class="panel cart-commands"'), "Brightness and Vibe belong before show-sequence controls");
assert.match(html, /data-command="AUTO">SHOW AUTO<\/button>/, "Show Auto must be distinguishable from Auto Vibe");
assert.ok(html.indexOf('class="panel quick-brightness"') < html.indexOf('class="panel quick-vibe"'), "Brightness must precede Vibe");
assert.match(html, /data-vibe="chill"[\s\S]*data-vibe="groove"[\s\S]*data-vibe="heavy"[\s\S]*data-vibe="psychedelic"[\s\S]*data-vibe="cosmic"/);
assert.match(html, /id="vibeAuto"[^>]*disabled/);
assert.match(html, /Manual Vibes and Auto Vibe remain unavailable until the approved runtime/);
assert.match(js, /command\("VIBE", \{ vibe: button\.dataset\.vibe \}\)/);
assert.match(js, /Runtime not qualified/);
assert.match(html, /href="#textPanel"/);
assert.match(html, /href="#scoresPanel"/);
assert.match(html, /id="backendTruth"/);
assert.match(html, /cached page does not provide local control; commands require the Cart service/i);
assert.match(html, /aria-label="Guest access"[\s\S]*id="guestMode"[^>]*disabled/);
assert.match(js, /Command accepted · revision .*pending device confirmation/);
assert.match(js, /Tuning accepted · revision .*pending device confirmation/);
assert.doesNotMatch(js, /tuning applied/, "queued TUNE acceptance must not be presented as device application");
assert.match(js, /Connected and synchronized/);
assert.match(js, /Command failed at revision/);
assert.match(js, /Command submitted · revision .*device application and underglow output are not confirmed/);
assert.match(js, /backendHealth\) backendHealth\.textContent = "Reachable"/);
assert.match(js, /backendHealth\) backendHealth\.textContent = "Unavailable"/);
assert.match(js, /refresh\(\)\.catch\(showRefreshError\)/);
assert.match(js, /this status check sent no control or scoring command/);
assert.match(js, /pendingRevision !== null[\s\S]*Cart change accepted · revision/);
assert.match(js, /if \(fullyApplied \|\| failed\) pendingRevision = null/);
assert.match(js, /setInterval\([\s\S]*refresh\(\)\.catch\(showRefreshError\)/);
assert.match(js, /visibilitychange[\s\S]*refresh\(\)\.catch\(showRefreshError\)/);
assert.doesNotMatch(js, /refresh\(\)\.catch\(\(\) => \{\}\)/);
assert.match(js, /await refresh\(\{ hydrate: true \}\);\s*}/, "an unresolved tune must remain pending after the final status poll");
assert.match(js, /x\.reported && x\.reported\.confirmed === true/);
assert.match(js, /invalid_or_mismatched_foundation_ack.*Matrix command not confirmed/);
const css = fs.readFileSync(path.join(controller, "hbnf-cart-ui-v6.css"), "utf8");
assert.match(css, /min-height:50px/);
assert.match(css, /@media\(max-width:340px\)/);
assert.match(sw, /hbnf-owner-pwa-v7-4-owner-ux-r4-20261008/);
console.log("PASS: owner mission hierarchy, Vibe controls, status truth, responsive layouts, Guest default, and PWA versioning");

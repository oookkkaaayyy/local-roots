import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fetchWithDeadline, parsePairFragment } from "../hbnf-final-controller/hbnf-cart-net.mjs";

const root = path.resolve(import.meta.dirname, "..");
const controller = path.join(root, "hbnf-final-controller");
const html = fs.readFileSync(path.join(controller, "hbnf-cart.html"), "utf8");
const js = fs.readFileSync(path.join(controller, "hbnf-cart.js"), "utf8");
const sw = fs.readFileSync(path.join(controller, "hbnf-cart-sw.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(controller, "hbnf-cart-manifest.webmanifest"), "utf8"));
const installer = fs.readFileSync(path.join(root, "hbnf-ui-v6-package/install_ui_v6.py"), "utf8");
const VERSION = "20261014-owner-control-v1";
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
assert.match(sw, /hbnf-owner-pwa-v8-cart-control-owner-v3-20261014/);
assert.match(sw, /self\.skipWaiting\(\)/);
assert.match(sw, /self\.clients\.claim\(\)/);
assert.match(sw, /url\.origin !== self\.location\.origin/);
assert.match(sw, /request\.method !== "GET"/);
assert.doesNotMatch(sw, /supabase\.co|functions\/v1|192\.168\.77\./i);

// Exercise the real service-worker fetch handler with a controllable timeout.
// A response timeout must also cancel the underlying app-shell request.
const listeners = new Map();
const cachedShell = { fromCache: true };
const cache = { put: async () => {}, match: async () => cachedShell };
let timeoutCallback;
const requestSignals = [];
const serviceWorkerContext = {
  self: {
    location: { origin: "https://cart.example" },
    addEventListener: (name, callback) => listeners.set(name, callback),
  },
  caches: { open: async () => cache, keys: async () => [], delete: async () => {} },
  URL,
  Set,
  Promise,
  AbortController,
  Response,
  fetch: (_request, init) => {
    const requestSignal = init?.signal;
    requestSignals.push(requestSignal);
    return new Promise((_resolve, reject) => {
      requestSignal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    });
  },
  setTimeout: callback => { timeoutCallback = callback; return 1; },
  clearTimeout: () => {},
};
vm.runInNewContext(sw, serviceWorkerContext);
let shellResponse;
listeners.get("fetch")({
  request: { method: "GET", mode: "navigate", url: "https://cart.example/hbnf-cart.html" },
  respondWith: promise => { shellResponse = promise; },
});
for (let turn = 0; turn < 8 && typeof timeoutCallback !== "function"; turn++) await Promise.resolve();
assert.equal(typeof timeoutCallback, "function");
timeoutCallback();
assert.equal(requestSignals[0].aborted, true);
assert.equal(await shellResponse, cachedShell);

// A navigation cancelled by its caller must also cancel the underlying fetch.
const clientController = new AbortController();
let cancelledShellResponse;
listeners.get("fetch")({
  request: {
    method: "GET",
    mode: "navigate",
    url: "https://cart.example/hbnf-cart.html",
    signal: clientController.signal,
  },
  respondWith: promise => { cancelledShellResponse = promise; },
});
for (let turn = 0; turn < 8 && requestSignals.length < 2; turn++) await Promise.resolve();
assert.equal(requestSignals.length, 2);
assert.equal(requestSignals[1].aborted, false);
clientController.abort();
assert.equal(requestSignals[1].aborted, true);
assert.equal(await cancelledShellResponse, cachedShell);

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

const css = fs.readFileSync(path.join(controller, "hbnf-cart-ui-v6.css"), "utf8");
assert.ok(html.indexOf('class="panel truth-panel"') < html.indexOf('class="panel quick-brightness"') && html.indexOf('class="panel quick-brightness"') < html.indexOf('class="panel quick-vibe"') && html.indexOf('class="panel quick-vibe"') < html.indexOf('id="scoreboardActionPanel"') && html.indexOf('id="scoreboardActionPanel"') < html.indexOf('id="textPanel"'), "device status, brightness, Vibe, Show Scores, and text follow the approved everyday order");
assert.match(html, /data-command="AUTO">SHOW AUTO<\/button>/, "Show Auto must be distinguishable from Auto Vibe");
assert.match(html, /<details class="panel truth-panel" aria-label="System Info">\s*<summary>System Info<\/summary>/, "detailed device status is collapsed under System Info");
assert.match(html, /Underglow command[\s\S]*do not prove physical AUX illumination/);
assert.match(html, /<summary>Animation Mix<\/summary>/);
for (const label of ["Balanced (Course Flow)","Upbeat (Field Mix)","Signature (HBNF Signature)","Ambient (Quiet Cosmos)"]) assert.ok(html.includes(label), `Animation Mix keeps descriptive label ${label}`);
assert.match(css, /\.scene-description/);
assert.ok(html.indexOf('id="textPanel"') < html.indexOf('aria-label="Motion and audio response"'), "text stays ahead of secondary response tuning");
assert.ok(html.indexOf('id="textPanel"') < html.indexOf('id="scoresPanel"'), "text is primary; scoring remains later in the page");
assert.match(html, /data-vibe="chill"[\s\S]*data-vibe="groove"[\s\S]*data-vibe="heavy"[\s\S]*data-vibe="psychedelic"[\s\S]*data-vibe="cosmic"/);
assert.match(html, /id="vibeAuto"[^>]*disabled/);
assert.match(html, /Vibe changes are locked here; existing Matrix operation is unchanged/);
assert.match(js, /command\("VIBE", \{ vibe: button\.dataset\.vibe \}\)/);
assert.match(js, /Unavailable here/);
assert.match(html, /id="featureScoreboard"[^>]*disabled[^>]*aria-describedby="scoreboardAvailability"/);
assert.match(html, /approved secure Matrix overlay control is available/);
assert.match(html, /id="matrixBrightness"[^>]*disabled data-tune-control/);
assert.match(html, /id="auxBrightness"[^>]*disabled data-tune-control/);
assert.match(js, /setTuneControlsEnabled/);
assert.match(js, /validBrightness\(matrixBrightness\) && validBrightness\(auxBrightness\)/);
assert.match(js, /if \(!tuneStateReady\) throw new Error\("Saved brightness settings are not confirmed/);
assert.doesNotMatch(js, /pathValue\(state, \["devices","matrix","brightness"\], 8\)/);
assert.doesNotMatch(js, /pathValue\(state, \["devices","aux","brightness"\], 64\)/);
assert.match(html, /href="#scoresPanel"/);
assert.match(html, /id="backendTruth"/);
assert.match(html, /Owner commands require the Cart service/i);
assert.match(html, /aria-label="Guest access"[\s\S]*id="guestMode"[^>]*disabled/);
assert.match(js, /Command accepted · revision .*pending device confirmation/);
assert.match(js, /Tuning accepted · revision .*pending device confirmation/);
assert.doesNotMatch(js, /tuning applied/, "queued TUNE acceptance must not be presented as device application");
assert.match(js, /Commands acknowledged/);
assert.match(js, /Command failed at revision/);
assert.match(js, /Command submitted · revision .*physical AUX illumination are not confirmed/);
assert.match(js, /backendHealth\) backendHealth\.textContent = "Available"/);
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
assert.match(css, /min-height:50px/);
assert.match(css, /#featureScoreboard[^}]*min-height:64px/);
assert.match(css, /height:56px;min-height:56px/);
assert.match(css, /::-webkit-slider-thumb[^}]*width:28px;height:28px/);
assert.match(css, /@media\(max-width:340px\)/);
assert.match(sw, /hbnf-owner-pwa-v8-cart-control-owner-v3-20261014/);
console.log("PASS: owner control hierarchy, Animation Mix labels, device-ack truth, responsive layout, and PWA versioning");

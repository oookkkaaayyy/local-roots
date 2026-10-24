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
const VERSION = "20261023-cart-ux-v5";
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
assert.match(js, /OPAL_LOCAL_PWA\s*\? "Controls are unavailable\. Check the connection and try again\."\s*:\s*"Couldn’t connect\. No change was sent\."/);
assert.match(js, /matrixHealth\.textContent = "Not confirmed"/);
assert.match(js, /auxHealth\.textContent = "Not confirmed"/);
assert.match(js, /window\.addEventListener\("online"/);
assert.match(js, /window\.addEventListener\("offline"/);

assert.equal(manifest.start_url, `/hbnf-cart.html?app=${VERSION}`);
assert.match(html, /navigator\.serviceWorker\.register/);
assert.match(html, new RegExp(`hbnf-cart-sw\\.js\\?v=${VERSION}`));
assert.match(html, /scope:"\/hbnf-cart\.html"/);
assert.match(sw, /hbnf-owner-pwa-v17-cart-ux-20261023/);
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

for (const name of ["hbnf-cart-net.mjs", "hbnf-cart-local.mjs", "hbnf-cart-sw.js"]) {
  assert.ok(installer.includes(`"${name}"`), `installer omits ${name}`);
}
for (const asset of [
  "hbnf-cart.html",
  "hbnf-cart.js",
  "hbnf-cart-local.mjs",
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
  "hbnf-guest-qr.png",
]) {
  assert.match(sw, new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `service worker core omits ${asset}`);
}
console.log("PASS: owner PWA deadline, pairing, versioned imports, offline shell cache, and cache isolation contracts");

const css = fs.readFileSync(path.join(controller, "hbnf-cart-ui-v6.css"), "utf8");
assert.ok(html.indexOf('class="panel quick-vibe"') < html.indexOf('class="panel quick-brightness"') && html.indexOf('class="panel quick-brightness"') < html.indexOf('class="panel cart-commands"'), "Vibe, brightness, then Next/Auto/Power form the everyday control order");
assert.match(html, /data-command="AUTO">Auto show<\/button>/, "Auto show must be distinguishable from Automatic lighting style");
assert.match(html, /<details class="panel truth-panel" aria-label="Connection details">\s*<summary>Connection details<\/summary>/, "detailed device status is collapsed under Connection details");
assert.match(html, /Shows the latest device check, not whether the lights are on\./, "device status must distinguish a device check from confirmed physical illumination");
assert.match(html, /<summary>Choose show style<\/summary>/);
for (const [value,label] of [["course-flow","Steady pace"],["field-mix","Upbeat"],["hbnf-signature","HBNF signature"],["quiet-cosmos","Calm"]]) assert.ok(html.includes(`<option value="${value}">${label}</option>`), `show-style choice keeps the current user-facing label ${label}`);
assert.match(css, /\.scene-description/);
assert.ok(html.indexOf('id="textPanel"') < html.indexOf('aria-label="Motion and audio response"'), "text stays ahead of secondary response tuning");
assert.ok(html.indexOf('id="textPanel"') < html.indexOf('id="scoresPanel"'), "text is primary; scoring remains later in the page");
assert.match(html, /data-vibe="chill"[\s\S]*data-vibe="groove"[\s\S]*data-vibe="heavy"[\s\S]*data-vibe="psychedelic"[\s\S]*data-vibe="cosmic"/);
assert.match(html, /id="vibeAuto"[^>]*disabled/);
assert.match(html, /id="vibeAvailability"[^>]*role="status"[^>]*>Checking lighting controls…/);
assert.ok(js.includes("Can’t connect to the Cart. Check the connection and try again.") && js.includes("Lighting styles aren’t available."), "Vibe availability distinguishes a lost connection from unavailable lighting controls");
assert.match(js, /button\.disabled = !ready/);
assert.match(js, /autoButton\.hidden = !autoReady/);
assert.match(js, /command\("VIBE", \{ vibe: button\.dataset\.vibe \}\)/);
assert.match(html, /href="#scoresPanel"/);
assert.match(html, /id="backendTruth"/);
assert.match(html, /Local controls · Cart Wi-Fi/);
assert.ok(js.includes("Controls aren’t ready. No change was sent."), "not-ready controls must say no change was sent");
assert.match(html, /aria-label="Guest access"[\s\S]*id="guestMode"[^>]*disabled/);
assert.match(js, /statusNode\.textContent = "Change sent\. Checking for an update…"/);
assert.match(js, /statusNode\.textContent = "Change sent\. Waiting for an update…"/);
assert.match(js, /const applied = snap\.desired && observed\.length >= 2 && observed\.every[\s\S]*x\.reported\.confirmed === true/,
  "settings are shown as updated only after both devices confirm the same revision");
assert.match(js, /Couldn’t confirm the request\. Check the connection and try again\./);
assert.match(js, /const confirmed = reports\.length >= 2 && reports\.every[\s\S]*x\.reported\.confirmed === true/);
assert.match(js, /backendHealth\) backendHealth\.textContent = "Reachable"/);
assert.match(js, /backendHealth\) backendHealth\.textContent = "Unavailable"/);
assert.match(js, /refresh\(\)\.catch\(showRefreshError\)/);
assert.match(js, /out = await call\(\{ action: "status" \}\);/);
assert.match(js, /pendingRevision !== null[\s\S]*Change sent\. Waiting for an update\./);
assert.match(js, /if \(fullyApplied \|\| failed\) pendingRevision = null/);
assert.match(js, /setInterval\([\s\S]*refresh\(\)\.catch\(showRefreshError\)/);
assert.match(js, /visibilitychange[\s\S]*refresh\(\)\.catch\(showRefreshError\)/);
assert.doesNotMatch(js, /refresh\(\)\.catch\(\(\) => \{\}\)/);
assert.match(js, /await refresh\(\{ hydrate: true \}\);\s*}/, "an unresolved tune must remain pending after the final status poll");
assert.match(js, /x\.reported && x\.reported\.confirmed === true/);
assert.match(js, /invalid_or_mismatched_foundation_ack.*Matrix command not confirmed/);
assert.match(css, /min-height:50px/);
assert.match(css, /@media\(max-width:340px\)/);
assert.match(sw, /hbnf-owner-pwa-v17-cart-ux-20261023/);
console.log("PASS: owner control hierarchy, show-style labels, device-confirmation truth, responsive layout, and PWA versioning");

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";

const html = fs.readFileSync("hbnf-final-controller/hbnf-cart.html", "utf8");
const js = fs.readFileSync("hbnf-final-controller/hbnf-cart.js", "utf8");

assert.match(html, /<h1>Cart Controls<\/h1>/);
assert.match(html, /id="featureRefreshLive"[^>]*>Refresh scores<\/button>/);
assert.match(html, /id="featureScoreboard"[^>]*>Show scores<\/button>/);
assert.match(html, /href="#featureText">Text<\/a>/);
assert.match(html, /Guest QR controls are available to anyone with the link/);
assert.doesNotMatch(html, /id="guestMode"|guestModeAction|Turn it on when you.re ready to invite guests/);
assert.doesNotMatch(js, /GUEST_MODE|guestModeToggle|guestDefault/);
assert.match(html, /hbnf-cart-ui-v6\.mjs/);
assert.match(html, /hbnf-cart-features\.mjs/);
assert.match(html, /apple-touch-icon" sizes="180x180" href="\.\/hbnf-cart-icon-180\.png\?v=20261022-owner-pwa-ux-v1/);

const manifest = JSON.parse(fs.readFileSync("hbnf-final-controller/hbnf-cart-manifest.webmanifest", "utf8"));
assert.deepEqual(manifest.icons, [
  { src: "/hbnf-cart-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/hbnf-cart-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
]);

const header = fs.readFileSync("firmware/phase2/integration-r6/usermod/hbnf_home_screen_icon.h", "utf8");
const encoded = header.match(/HBNF_HOME_SCREEN_ICON_PNG\[\].*?=\s*\{([\s\S]*?)\};/);
assert.ok(encoded, "accepted firmware source must contain the approved Home Screen icon");
const approvedIcon = Buffer.from([...encoded[1].matchAll(/0x([0-9A-Fa-f]{2})/g)].map(match => parseInt(match[1], 16)));
const icon180 = fs.readFileSync("hbnf-final-controller/hbnf-cart-icon-180.png");
assert.deepEqual(icon180, approvedIcon, "Apple touch icon must be the approved Cart icon bytes");
const source = crypto.createHash("sha256").update(approvedIcon).digest("hex");
assert.equal(source, "2aa8ffe82d6639339125a616ef5d3ea7cb20783f092d02c9e046908946c3ec9e");
for (const [file, size] of [["180", 180], ["192", 192], ["512", 512]]) {
  const png = fs.readFileSync(`hbnf-final-controller/hbnf-cart-icon-${file}.png`);
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16), size, `icon-${file} width`);
  assert.equal(png.readUInt32BE(20), size, `icon-${file} height`);
}

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(ids).size, ids.length, "Owner PWA element IDs must be unique");

console.log("PASS: compact Owner PWA actions, public guest-link truth, and unique IDs");

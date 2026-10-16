import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const owner = readFileSync("hbnf-final-controller/hbnf-cart.html", "utf8");
const guest = readFileSync("hbnf-final-controller/guest/hbnf-cart/index.html", "utf8");
const worker = readFileSync("hbnf-final-controller/hbnf-cart-sw.js", "utf8");
const qr = readFileSync("hbnf-final-controller/hbnf-guest-qr.png");
const localBuilder = readFileSync("scripts/hbnf_build_local_owner_pwa.py", "utf8");
const cloudBuilder = readFileSync("scripts/hbnf_build_owner_guest_package.py", "utf8");

const guestUrl = "https://hbnightflyers.com/guest/hbnf-cart/";
assert.match(owner, /src="\.\/hbnf-guest-qr\.png\?v=20261016-guest-qr-v1"/);
assert.match(owner, new RegExp(guestUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(owner, /width="192" height="192" alt="QR code linking to HBNF Cart Guest controls"/);
assert.match(owner, /Guests can scan with cellular|They can scan with cellular/);
assert.match(owner, /The Opal must have internet access for guest controls/);
assert.match(owner, /https:\/\/hbnightflyers\.com\/skins\.html/);
assert.match(owner, /https:\/\/hbnightflyers\.com\/glow\.html/);
assert.match(guest, /HBNF-Cart Wi-Fi is not required/);
assert.match(guest, /Opal's internet connection/);
assert.match(guest, /https:\/\/hbnightflyers\.com\/skins\.html/);
assert.match(guest, /https:\/\/hbnightflyers\.com\/glow\.html/);
assert.match(worker, /\/hbnf-guest-qr\.png\?v=\$\{VERSION\}/);
assert.match(localBuilder, /"hbnf-guest-qr\.png"/);
assert.match(cloudBuilder, /"hbnf-guest-qr\.png"/);

assert.equal(qr.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "QR must be PNG");
assert.equal(qr.readUInt32BE(16), 512, "QR width must be 512px");
assert.equal(qr.readUInt32BE(20), 512, "QR height must be 512px");
assert.equal(createHash("sha256").update(qr).digest("hex"), "f6a2593bbc55ab12503ab9c6eb8ac11813858c1ea14909071476cd7290854f27");

console.log("PASS: owner QR target/cache/package contract, cellular guest instructions, direct Skins/Glow links, and pinned QR PNG identity");

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const owner = readFileSync("hbnf-final-controller/hbnf-cart.html", "utf8");
const guest = readFileSync("hbnf-final-controller/guest/hbnf-cart/index.html", "utf8");
const guestJs = readFileSync("hbnf-final-controller/guest/hbnf-cart/guest.js", "utf8");
const guestCss = readFileSync("hbnf-final-controller/guest/hbnf-cart/guest.css", "utf8");
const ownerJs = readFileSync("hbnf-final-controller/hbnf-cart.js", "utf8");
const worker = readFileSync("hbnf-final-controller/hbnf-cart-sw.js", "utf8");
const qr = readFileSync("hbnf-final-controller/hbnf-guest-qr.png");
const localBuilder = readFileSync("scripts/hbnf_build_local_owner_pwa.py", "utf8");
const cloudBuilder = readFileSync("scripts/hbnf_build_owner_guest_package.py", "utf8");

const guestUrl = "https://hbnightflyers.com/guest/hbnf-cart/";
assert.match(owner, /src="\.\/hbnf-guest-qr\.png\?v=20261023-cart-ux-v3"/);
assert.match(owner, new RegExp(guestUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(owner, /width="192" height="192" alt="Guest controls QR code"/);
assert.match(owner, /Guests can use the QR link while guest access is on/);
assert.match(owner, /Scan with a phone on cellular\. Guest access must be on and the Cart online\./);
assert.match(owner, /https:\/\/hbnightflyers\.com\/skins\.html/);
assert.match(owner, /https:\/\/hbnightflyers\.com\/glow\.html/);
assert.match(guest, /Use these controls over cellular while Guest Mode is on\./);
assert.match(guest, /https:\/\/hbnightflyers\.com\/skins\.html/);
assert.match(guest, /https:\/\/hbnightflyers\.com\/glow\.html/);
assert.match(worker, /\/hbnf-guest-qr\.png\?v=\$\{VERSION\}/);
assert.match(localBuilder, /"hbnf-guest-qr\.png"/);
assert.match(cloudBuilder, /"hbnf-guest-qr\.png"/);
assert.match(owner, /id="vibeOptions"/);
assert.match(owner, /id="vibeAvailability"[^>]+role="status"/);
assert.match(ownerJs, /const autoReady = ready && canonicalCapabilities\.autoVibeControlV1 === true/);
assert.match(owner, /\[hidden\]\{display:none!important\}/);
assert.match(guest, /id="vibeOptions"/);
assert.match(guest, /id="guestAutoVibe"[^>]+hidden/);
assert.match(guestJs, /autoVibeReady=!!\(snapshot&&snapshot\.capabilities&&snapshot\.capabilities\.autoVibeControlV1===true\)/);
assert.match(guestJs, /if\(auto\)auto\.hidden=!autoVibeReady/);
assert.match(guestCss, /\[hidden\]\{display:none!important\}/);
assert.match(guestJs, /button\.setAttribute\("aria-pressed",button\.getAttribute\("data-value"\)===selected\?"true":"false"\)/);
assert.doesNotMatch(owner+guest+ownerJs+guestJs,/Manual Vibe|Desired ·|Not qualified|runtime is qualified|COMMANDS ACKNOWLEDGED|LOCAL DEVICES UNAVAILABLE|cached round data|Mac and internet are not needed|canonical backend|authoritative scorecard/i);

assert.equal(qr.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "QR must be PNG");
assert.equal(qr.readUInt32BE(16), 512, "QR width must be 512px");
assert.equal(qr.readUInt32BE(20), 512, "QR height must be 512px");
assert.equal(createHash("sha256").update(qr).digest("hex"), "f6a2593bbc55ab12503ab9c6eb8ac11813858c1ea14909071476cd7290854f27");

console.log("PASS: owner QR target/cache/package contract, cellular guest instructions, direct Skins/Glow links, and pinned QR PNG identity");

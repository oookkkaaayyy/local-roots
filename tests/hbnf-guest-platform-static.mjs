import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root=path.resolve("hbnf-guest-controller");
const html=fs.readFileSync(path.join(root,"hbnf-guest.html"),"utf8");
const js=fs.readFileSync(path.join(root,"hbnf-guest.js"),"utf8");
const css=fs.readFileSync(path.join(root,"hbnf-guest.css"),"utf8");
const sw=fs.readFileSync(path.join(root,"hbnf-guest-sw.js"),"utf8");
const manifest=JSON.parse(fs.readFileSync(path.join(root,"hbnf-guest-manifest.webmanifest"),"utf8"));

for(const name of ["hbnf-guest.html","hbnf-guest.css","hbnf-guest.js","hbnf-guest-manifest.webmanifest","hbnf-guest-sw.js","hbnf-guest-icon-180.png","hbnf-guest-icon-192.png","hbnf-guest-icon-512.png"]){
  assert.ok(fs.existsSync(path.join(root,name)),name+" missing");
}

assert.match(html,/Guest controls are loading/);
assert.match(html,/The page will remain usable even if the cart is offline/);
assert.match(html,/apple-touch-icon/);
assert.doesNotMatch(html,/type=["']module["']/i);
assert.doesNotMatch(html,/Firmware|rollout preflight|router admin|OTA install/i);
assert.match(js,/Guest controls are currently closed/);
assert.match(js,/serviceWorker/);
assert.doesNotMatch(js, /\?\./, "Guest script must remain compatible without optional chaining");
assert.doesNotMatch(js, /\?\?/, "Guest script must remain compatible without nullish coalescing");
assert.equal(manifest.start_url,"/hbnf-guest.html");
assert.equal(manifest.display,"standalone");
assert.ok(manifest.icons.some(x=>x.sizes==="192x192"));
assert.ok(manifest.icons.some(x=>x.sizes==="512x512"));
assert.match(sw,/hbnf-guest-icon-192.png/);
assert.match(sw,/hbnf-guest-icon-512.png/);
assert.ok(css.length>500);

console.log("PASS: HBNF guest static shell, PWA asset contract, owner-surface isolation and offline fallback checks");

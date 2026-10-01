import fs from "node:fs";
import assert from "node:assert/strict";

const html=fs.readFileSync("hbnf-final-controller/hbnf-cart.html","utf8");
const features=fs.readFileSync("hbnf-final-controller/hbnf-cart-features.mjs","utf8");
const backend=fs.readFileSync("hbnf-wow-bundle/backend/index.ts","utf8");

for (const id of [
  "featureLook","featureColor","featurePalette","featureApplyLook","featureSaveLook","featureApplySaved",
  "featureText","featureSendText","featureLive","featureRefreshLive","featureScoreboard",
  "featureAcePot","featureOtaStatus","featureOtaCheck","featureOtaInstall"
]) assert.ok(html.includes('id="'+id+'"'), "missing UI id "+id);

assert.ok(html.includes("hbnf-cart-features.mjs"),"feature module not loaded");
assert.ok(features.includes('action,...payload'),"Matrix API helper missing");
assert.ok(features.includes('matrixApi("text"'),"text action missing");
assert.ok(features.includes('matrixApi("live_status"'),"live_status action missing");
assert.ok(features.includes('matrixApi("scoreboard"'),"scoreboard action missing");
assert.ok(features.includes('matrixApi("ace_pot"'),"ace_pot action missing");
assert.ok(features.includes('fetch("/json/pal"'),"dynamic WLED palette list missing");
assert.ok(features.includes("OPAL_CHECK"),"OTA check path missing");
assert.ok(features.includes("OPAL_INSTALLER"),"trusted installer handoff missing");
assert.ok(features.includes('location.hostname === "192.168.77.10"'),"local-only WLED gate missing");
assert.ok(!features.includes("?."),"optional chaining is not allowed in iOS-12-targeted feature module");
assert.ok(backend.includes('action==="live_status"'),"backend read-only live_status action missing");
assert.ok(backend.includes("const live=await liveInfo(sb)"),"live_status is not backed by existing liveInfo()");
console.log("HBNF coordinated controller contract: PASS");

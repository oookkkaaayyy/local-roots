import fs from "node:fs";
import assert from "node:assert/strict";

const html=fs.readFileSync("hbnf-final-controller/hbnf-cart.html","utf8");
const features=fs.readFileSync("hbnf-final-controller/hbnf-cart-features.mjs","utf8");
const backend=fs.readFileSync("hbnf-wow-bundle/backend/index.ts","utf8");
const shared=fs.readFileSync("hbnf-wow-bundle/backend/shared.ts","utf8");

for (const id of [
  "featureLook","featureColor","featurePalette","featureApplyLook","featureSaveLook","featureApplySaved",
  "featureText","featureSendText","featureLive","featureRefreshLive","featureScoreboard",
  "featureAcePot","featureOtaStatus","featureOtaCheck","featureOtaInstall","featureOtaResult","featurePreflight","featurePreflightResult"
]) assert.ok(html.includes('id="'+id+'"'), "missing UI id "+id);

assert.ok(html.includes("hbnf-cart-features.mjs"),"feature module not loaded");
assert.ok(features.includes('Object.assign({action:action}'),"Matrix API helper missing");
assert.ok(features.includes('matrixApi("text"'),"text action missing");
assert.ok(features.includes('matrixApi("live_status"'),"live_status action missing");
assert.ok(features.includes('matrixApi("scoreboard"'),"scoreboard action missing");
assert.ok(features.includes('matrixApi("ace_pot"'),"ace_pot action missing");
assert.ok(features.includes('fetchJson("/json/pal"'),"dynamic WLED palette list missing");
assert.ok(features.includes("LIVE_CACHE_KEY"),"live-data cache missing");
assert.ok(features.includes("snapshotRestorePayload"),"look rollback path missing");
assert.ok(features.includes("Palette readback did not match"),"palette readback verification missing");
assert.ok(features.includes("runPreflight"),"rollout preflight missing");
assert.ok(features.includes("OPAL_CHECK"),"OTA check path missing");
assert.ok(features.includes("OPAL_RESULT"),"OTA result path missing");
assert.ok(features.includes("refreshOtaResult"),"OTA result refresh logic missing");
assert.ok(features.includes("OPAL_INSTALLER"),"trusted installer handoff missing");
assert.ok(features.includes('location.hostname === "192.168.77.10"'),"local-only WLED gate missing");
assert.ok(!features.includes("?."),"optional chaining is not allowed in iOS-12-targeted feature module");
assert.ok(backend.includes('action==="live_status"'),"backend read-only live_status action missing");
assert.ok(backend.includes("const live=await liveInfo(sb)"),"live_status is not backed by existing liveInfo()");
assert.ok(shared.includes('"http://192.168.77.10"'),"Matrix-local backend CORS origin missing");
const liveIndex=backend.indexOf('if(action==="live_status")');
const generalControlIndex=backend.indexOf('try{control=await getControlState(sb);}catch(e)',backend.indexOf('if(action==="status")')+1);
assert.ok(liveIndex>=0 && generalControlIndex>=0 && liveIndex<generalControlIndex,"live_status still depends on general Matrix control-state read");
console.log("HBNF coordinated controller contract: PASS");

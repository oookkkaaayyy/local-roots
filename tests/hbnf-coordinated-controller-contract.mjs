import fs from "node:fs";
import assert from "node:assert/strict";

const html=fs.readFileSync("hbnf-final-controller/hbnf-cart.html","utf8");
const controller=fs.readFileSync("hbnf-final-controller/hbnf-cart.js","utf8");
const features=fs.readFileSync("hbnf-final-controller/hbnf-cart-features.mjs","utf8");
const backend=fs.readFileSync("hbnf-wow-bundle/backend/index.ts","utf8");
const shared=fs.readFileSync("hbnf-wow-bundle/backend/shared.ts","utf8");

for (const id of [
  "featureLook","featureColor","featurePalette","featureLookName","featureSavedLooks","featureApplyLook","featureSaveLook","featureApplySaved","featureDeleteSaved",
  "featureText","featureSendText","featureLive","featureRefreshLive","featureScoreboard",
  "featureAcePot","featureOtaStatus","featureOtaCheck","featureOtaInstall","featureOtaResult","featurePreflight","featurePreflightResult"
]) assert.ok(html.includes('id="'+id+'"'), "missing UI id "+id);

assert.ok(html.includes("hbnf-cart-features.mjs"),"feature module not loaded");
assert.ok(controller.includes("window.HBNFCanonical"),"canonical browser bridge missing");
assert.ok(controller.includes("async function command(type, payload = {})"),"canonical command payload bridge missing");
assert.ok(features.includes('bridge.command("SCENE"'),"show mutation is not routed through canonical cart control");
assert.ok(features.includes('bridge.command("PALETTE"'),"palette mutation is not routed through canonical cart control");
assert.ok(!features.includes('method:"POST"') || !features.includes('"/json/state"'),"feature module must not POST directly to WLED state");
assert.ok(!features.includes('matrixApi("text"'),"text must not use legacy direct Matrix mutation");
assert.ok(!features.includes('matrixApi("scoreboard"'),"scoreboard must not use legacy direct Matrix mutation");
assert.ok(!features.includes('matrixApi("ace_pot"'),"ace pot must not use legacy direct Matrix mutation");
assert.ok(features.includes("canonicalOverlayBridge"),"canonical overlay bridge gate missing");
assert.ok(controller.includes("getCapabilities"),"canonical capability bridge missing");
assert.ok(features.includes("canonicalOverlayIntentV1"),"overlay capability gate missing");
assert.ok(features.includes("canonicalPaletteIntentV1"),"palette capability gate missing");
assert.ok(features.includes("syncOverlayAvailability"),"overlay fail-closed UI gate missing");
assert.ok(features.includes('action !== "live_status"'),"legacy Matrix endpoint is not restricted to read-only live_status");
assert.ok(features.includes('fetchJson("/json/pal"'),"dynamic WLED palette list missing");
assert.ok(features.includes("rollbackCanonicalLook"),"canonical look rollback path missing");
assert.ok(features.includes("Canonical scene readback did not match"),"canonical scene readback verification missing");
assert.ok(features.includes("Canonical palette readback did not match"),"canonical palette readback verification missing");
assert.ok(features.includes("LIVE_CACHE_KEY"),"live-data cache missing");
assert.ok(features.includes("SAVED_LOOKS_KEY"),"named saved-look library missing");
assert.ok(features.includes("MAX_SAVED_LOOKS"),"saved-look bound missing");
assert.ok(features.includes("deleteSavedLook"),"saved-look delete path missing");
assert.ok(features.includes("liveRefreshInFlight"),"live refresh overlap guard missing");
assert.ok(features.includes("runPreflight"),"rollout preflight missing");
assert.ok(features.includes("artifact_verified"),"OTA artifact verification missing");
assert.ok(features.includes("based_on_firmware_sha256"),"OTA base-lineage verification missing");
assert.ok(features.includes("LIVE_CACHE_MAX_MS"),"live cache expiry missing");
assert.ok(features.includes("ACCEPTED_BASE_SHA256"),"accepted firmware base gate missing");
assert.ok(features.includes("EXPECTED_MATRIX_MAC"),"expected Matrix identity gate missing");
assert.ok(features.includes("OPAL_CHECK"),"OTA check path missing");
assert.ok(features.includes("OPAL_RESULT"),"OTA result path missing");
assert.ok(features.includes("refreshOtaResult"),"OTA result refresh logic missing");
assert.ok(features.includes("OPAL_INSTALLER"),"trusted installer handoff missing");
assert.ok(features.includes('location.hostname === "192.168.77.10"'),"local-only Matrix read gate missing");
assert.ok(!features.includes("?."),"optional chaining is not allowed in iOS-12-targeted feature module");
assert.ok(backend.includes('action==="live_status"'),"backend read-only live_status action missing");
assert.ok(backend.includes("const live=await liveInfo(sb)"),"live_status is not backed by existing liveInfo()");
assert.ok(shared.includes('"http://192.168.77.10"'),"Matrix-local backend CORS origin missing");
const liveIndex=backend.indexOf('if(action==="live_status")');
const generalControlIndex=backend.indexOf('try{control=await getControlState(sb);}catch(e)',backend.indexOf('if(action==="status")')+1);
assert.ok(liveIndex>=0 && generalControlIndex>=0 && liveIndex<generalControlIndex,"live_status still depends on general Matrix control-state read");
console.log("HBNF coordinated controller contract: PASS");

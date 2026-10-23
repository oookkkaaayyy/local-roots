import fs from "node:fs";
import assert from "node:assert/strict";

const html=fs.readFileSync("hbnf-final-controller/hbnf-cart.html","utf8");
const controller=fs.readFileSync("hbnf-final-controller/hbnf-cart.js","utf8");
const features=fs.readFileSync("hbnf-final-controller/hbnf-cart-features.mjs","utf8");
const stagedControl=fs.readFileSync("staging/coordinated-backend/hbnf-cart-control/index.ts","utf8");

for (const id of [
  "featureLook","featureColor","featurePalette","featureLookName","featureSavedLooks","featureApplyLook","featureSaveLook","featureApplySaved","featureDeleteSaved",
  "featureText","featureSendText","featureLive","featureRefreshLive","featureScoreboard",
  "featureAcePot","featureOtaStatus","featureOtaCheck","featureOtaInstall","featureOtaResult","featurePreflight","featurePreflightResult"
]) assert.ok(html.includes('id="'+id+'"'), "missing UI id "+id);

assert.ok(html.includes("hbnf-cart-features.mjs"),"feature module not loaded");
assert.match(html, /<section id="scoresPanel"[\s\S]*?id="liveRefreshStatus"[^>]*role="status"[^>]*aria-live="polite"/, "manual score refresh feedback must be visible in the Scores section");
assert.ok(features.includes('setLiveRefreshStatus("Refreshing scores…")'),"manual refresh does not announce its pending state in Scores");
assert.ok(features.includes('setLiveRefreshStatus("Scores refreshed.")'),"manual refresh does not announce success in Scores");
assert.ok(features.includes('setLiveRefreshStatus("Couldn’t refresh scores. Check the connection and try again.",true)'),"manual refresh does not announce failure in Scores");
assert.ok(controller.includes("window.HBNFCanonical"),"canonical browser bridge missing");
assert.ok(controller.includes("async function command(type, payload = {})"),"canonical command payload bridge missing");
assert.ok(controller.includes("read: function(action, payload)"),"canonical read bridge missing");
assert.ok(controller.includes("getCapabilities"),"canonical capability bridge missing");

assert.ok(features.includes('bridge.command("SCENE"'),"show mutation is not routed through canonical cart control");
assert.ok(features.includes('bridge.command("PALETTE"'),"palette mutation is not routed through canonical cart control");
assert.ok(!features.includes('"/json/state"'),"feature module must not use direct WLED state mutation");
assert.ok(!features.includes("hbnf-matrix-control"),"feature UI must not call legacy Matrix backend directly");
assert.ok(features.includes("canonicalOverlayBridge"),"canonical overlay bridge gate missing");
assert.ok(features.includes("canonicalOverlayIntentV1"),"overlay capability gate missing");
assert.ok(features.includes("canonicalPaletteIntentV1"),"palette capability gate missing");
assert.ok(features.includes("syncOverlayAvailability"),"feature fail-closed UI gate missing");
assert.ok(features.includes('canonicalRead("live_status"'),"live data is not routed through canonical cart backend");
assert.ok(stagedControl.includes('action === "live_status"'),"canonical backend live_status missing");
assert.ok(stagedControl.includes("chooseLive"),"canonical live_status does not reuse current selector");

assert.ok(features.includes('fetchJson(matrixApiUrl("/json/pal")'),"dynamic WLED palette list missing");
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
assert.ok(features.includes('location.hostname === "192.168.77.10"'),"local Matrix gate missing");
assert.ok(!features.includes("?."),"optional chaining is not allowed in iOS-12-targeted feature module");

console.log("HBNF coordinated controller contract: PASS");

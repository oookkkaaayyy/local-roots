import fs from "node:fs";
import assert from "node:assert/strict";
import vm from "node:vm";

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

{
  const start=features.indexOf("async function refreshLive(silent) {");
  const end=features.indexOf("\nasync function showScoreboard()",start);
  assert.ok(start>=0&&end>start,"live refresh function boundaries must be present");
  let resolveRead;
  const status=[];
  const context={
    setLiveRefreshStatus:(message,bad)=>status.push([message,!!bad]),
    canonicalRead:()=>new Promise(resolve=>{resolveRead=resolve;}),
    renderLive:()=>{},saveLiveCache:()=>{},readLiveCache:()=>null,
    Date,liveRefreshInFlight:false,liveRefreshManualRequested:false,
  };
  vm.runInNewContext("let liveRefreshInFlight=false; let liveRefreshManualRequested=false;\n"+features.slice(start,end),context);
  const automatic=context.refreshLive(true);
  await Promise.resolve();
  await context.refreshLive(false);
  assert.deepEqual(status,[["Refreshing scores…",false]],"manual tap during automatic refresh must show pending feedback immediately");
  resolveRead({live:{active:true,entries:["A 3"]}});
  await automatic;
  assert.deepEqual(status,[["Refreshing scores…",false],["Scores refreshed.",false]],"the shared refresh must resolve the manual feedback");
}


{
  const start=features.indexOf("async function showScoreboard() {");
  const end=features.indexOf("\nasync function showManualScoreboard()",start);
  assert.ok(start>=0&&end>start,"Show Scores action boundaries must be present");
  assert.match(html,/id="scoreActionStatus"[^>]*role="status"[^>]*aria-live="polite"/,"Show Scores feedback must be announced accessibly");
  const body=features.slice(start,end);
  const makeContext=(read,overlay)=>{
    const status=[];
    const context={
      canonicalRead:read,canonicalOverlayBridge:()=>({overlay}),
    };
    const element={hidden:true,className:""};
    let currentMessage="";
    Object.defineProperty(element,"textContent",{get:()=>currentMessage,set:value=>{currentMessage=value;status.push([value,element.className==="status bad"]);}});
    context.$=id=>id==="scoreActionStatus"?element:null;
    vm.runInNewContext(body,context);
    return {context,status,element};
  };
  for(const [live,expected] of [[null,"There’s no active round to show yet."],[{active:false},"There’s no active round to show yet."],[{active:true,entries:[]},"This round doesn’t have any scores yet."]]){
    let overlays=0;
    const {context,status}=makeContext(async()=>({live}),async()=>{overlays++;});
    await context.showScoreboard();
    assert.equal(status.length,2,"Show Scores must announce checking and the resolved state");
    assert.match(status[1][0],new RegExp(expected.replace(/[.*+?^${}()|\\[\\]\\\\]/g,"\\$&")));
    assert.equal(overlays,0,"Show Scores must not send without a real scored round");
  }
  let rejectOverlay;
  let resolveOverlay;
  const pending=makeContext(async()=>({live:{active:true,label:"Round",entries:["A 3"]}}),()=>new Promise((resolve,reject)=>{resolveOverlay=resolve;rejectOverlay=reject;}));
  const sending=pending.context.showScoreboard();
  for(let i=0;i<6;i++) await Promise.resolve();
  assert.deepEqual(pending.status.map(row=>row[0]),["Checking for an active round…","Sending scores to the Cart display…"],"pending Score send must be shown immediately");
  resolveOverlay();
  await sending;
  assert.match(pending.status[2][0],/^Scores sent\./,"successful send must tell the user to verify the display");
  const failed=makeContext(async()=>({live:{active:true,entries:["A 3"]}}),async()=>{throw new Error("offline");});
  await assert.rejects(failed.context.showScoreboard(),/offline/);
  assert.match(failed.status[2][0],/^Couldn’t send the scores to the Cart display\./,"send failure must explain the next recovery step");
}

console.log("HBNF coordinated controller contract: PASS");

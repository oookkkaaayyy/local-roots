import fs from "node:fs";
import assert from "node:assert/strict";

const liveControl=fs.readFileSync("evidence/live-production-20261001/hbnf-cart-control/index.ts","utf8");
const stagedControl=fs.readFileSync("staging/coordinated-backend/hbnf-cart-control/index.ts","utf8");
const stagedReducer=fs.readFileSync("staging/coordinated-backend/hbnf-cart-control/guest-command.ts","utf8");
const liveFoundation=fs.readFileSync("evidence/live-production-20261001/hbnf-matrix-adapter-foundation/index.ts","utf8");
const stagedFoundation=fs.readFileSync("staging/coordinated-backend/hbnf-matrix-adapter-foundation/index.ts","utf8");
const confirmation=fs.readFileSync("staging/coordinated-backend/hbnf-matrix-adapter-foundation/confirmation.ts","utf8");
const stagedReconcile=fs.readFileSync("staging/coordinated-backend/hbnf-cart-reconcile/index.ts","utf8");
const reconcileOutcome=fs.readFileSync("staging/coordinated-backend/hbnf-cart-reconcile/foundation-result.ts","utf8");
const feature=fs.readFileSync("hbnf-final-controller/hbnf-cart-features.mjs","utf8");
const controller=fs.readFileSync("hbnf-final-controller/hbnf-cart.js","utf8");

for (const marker of [
  'x-hbnf-device','action === "pair_device"','case "TUNE"','case "PALETTE"'
]) {
  assert.ok(liveControl.toLowerCase().includes(marker.toLowerCase()),"live v16 baseline marker missing: "+marker);
  const stagedSource=['case "TUNE"','case "PALETTE"'].includes(marker) ? stagedReducer : stagedControl;
  assert.ok(stagedSource.toLowerCase().includes(marker.toLowerCase()),"staged control/reducer regressed live marker: "+marker);
}
assert.ok(stagedReducer.includes('case "OVERLAY_START"'),"canonical overlay start reducer missing");
assert.ok(stagedControl.includes("canonicalOverlayIntentV1"),"staged overlay capability marker missing");
assert.ok(stagedControl.includes("canonicalPaletteIntentV1"),"staged palette capability marker missing");
assert.ok(stagedReducer.includes('case "OVERLAY_EXPIRE"'),"canonical overlay expiry reducer missing");
assert.ok(stagedReducer.includes('["text","scoreboard"]'),"overlay kind allowlist missing");
assert.ok(stagedReducer.includes('expiresAt:now + ttlMs'),"overlay TTL persistence missing");

for (const marker of [
  'const EFFECT_ID=142','{id:0,on:true,bri:255,fx:EFFECT_ID}',
  '{id:1,start:512,stop:534,on:true,bri:255,fx:EFFECT_ID}',
  'matrixBrightness','auxBrightness'
]) {
  assert.ok(liveFoundation.includes(marker),"live foundation marker missing: "+marker);
  assert.ok(stagedFoundation.includes(marker),"staged foundation regressed marker: "+marker);
}
assert.ok(stagedFoundation.includes("function paletteSpec"),"foundation palette normalization missing");
assert.ok(stagedFoundation.includes("function overlaySpec"),"foundation overlay normalization missing");
assert.match(stagedFoundation,/const rawFontIndex=data\.fontIndex;[\s\S]*return\{id,kind,ttlMs,text,color,fontIndex\}/,"foundation adapter must pass the validated native font index through to WLED");
assert.match(stagedFoundation,/\[0,2,3,4\]\.includes\(fontIndex\)/,"foundation adapter must reject unsupported WLED slots");
assert.match(stagedReducer,/const rawFontIndex = \(data as Record<string, unknown>\)\.fontIndex;[\s\S]*fontIndex = rawFontIndex === undefined \? 4 : rawFontIndex/);
assert.ok(stagedFoundation.includes("palette,"),"foundation HBNF palette projection missing");
assert.ok(stagedFoundation.includes("overlay"),"foundation HBNF overlay projection missing");
assert.ok(stagedFoundation.includes('["hbnf-balanced","copper","ocean"]'),"legacy palette compatibility missing");
assert.ok(stagedFoundation.includes('verification:"mqtt-connection-liveness-only"'),"foundation adapter overstates MQTT liveness as command verification");
assert.ok(stagedFoundation.includes('mqtt_publish_accepted_status_not_observed'),"foundation adapter does not distinguish missing WLED liveness from publish failure");
assert.ok(stagedFoundation.includes('if(!p.enabled){') && stagedFoundation.includes('const transport=await confirmTransport();'),"disabled/off projection bypasses liveness observation");
assert.ok(!stagedFoundation.includes('confirmed:false,transportConfirmed:true'),"MQTT publish acceptance is incorrectly treated as off-command transport confirmation");
assert.ok(/commandApplicationConfirmed:\s*false/.test(confirmation),"foundation adapter must not claim a correlated command application ack");
assert.ok(confirmation.includes('masterUnityObserved'),"master brightness observation is not explicitly represented");
assert.ok(stagedReconcile.includes('classifyFoundationInvocation'),"reconcile does not preserve adapter outcome classes");
assert.ok(stagedReconcile.includes('p_status: "submitted"'),"reconcile overstates a projection submission as applied/off state");
assert.ok(stagedReconcile.includes('p_status: "submitted",') && stagedReconcile.includes('requestedEnabled: matrixProjection.enabled'),"AUX proxy observation does not distinguish requested off from observed off");
assert.ok(stagedReconcile.includes('carryForwardObservation(prior, cart.revision, fence.epoch, fence.release_id)'),"reconcile carry-forward does not require the exact current revision and fence");
assert.ok(reconcileOutcome.includes('Number(prior.reported?.cartRevision) === cartRevision') && reconcileOutcome.includes('Number(prior.reported?.fenceEpoch) === fenceEpoch'),"carry-forward can restamp a stale device report onto a new revision");
const carryForwardBody = stagedReconcile.match(/const carryForward = async \(deviceId:[\s\S]*?\n  \};/);
assert.ok(carryForwardBody, "carry-forward implementation is missing");
assert.ok(!carryForwardBody[0].includes('hbnf_cart_upsert_observed'), "carried evidence must not rewrite the observation row or timestamp");
assert.ok(!carryForwardBody[0].includes('new Date().toISOString()'), "carry-forward must never create a fresh observation timestamp");
assert.ok(reconcileOutcome.includes('commandApplicationConfirmed: false'), "carried evidence must not imply device application");
assert.ok(stagedReconcile.includes('results.every((x) => x.status === "carried" || x.status === "off") ? "carried"'), "carry-only reconciliation must not report a new submission");
assert.ok(stagedReconcile.includes('results.every((x) => good.has(x.status)) ? "submitted" : "degraded"'),"reconcile response overstates submitted commands as applied");
assert.ok(reconcileOutcome.includes('foundation_ack_field_mismatch'),"reconcile no longer distinguishes mismatched ack fields");

assert.ok(controller.includes("window.HBNFCanonical"),"browser canonical bridge missing");
assert.ok(controller.includes("OVERLAY_START"),"browser overlay command bridge missing");
assert.ok(feature.includes('bridge.command("SCENE"'),"show mutation bypasses canonical owner");
assert.ok(feature.includes('bridge.command("PALETTE"'),"palette mutation bypasses canonical owner");
assert.ok(feature.includes('bridge.overlay("scoreboard"'),"scoreboard not using canonical overlay intent");
assert.ok(feature.includes('bridge.overlay("text"'),"text/ace-pot not using canonical overlay intent");
assert.ok(!feature.includes('matrixApi("text"'),"legacy direct text mutation still present");
assert.ok(!feature.includes('matrixApi("scoreboard"'),"legacy direct scoreboard mutation still present");
assert.ok(!feature.includes('matrixApi("ace_pot"'),"legacy direct ace-pot mutation still present");
assert.ok(stagedControl.includes('action === "live_status"'),"canonical read-only live_status missing");
assert.ok(stagedControl.includes('chooseLive'),"canonical live_status does not reuse current live selector");
assert.ok(feature.includes('canonicalRead("live_status"'),"feature UI live data bypasses canonical read path");
assert.ok(!feature.includes("hbnf-matrix-control"),"feature UI still depends on legacy Matrix backend");

console.log("HBNF coordinated backend staging contract: PASS");

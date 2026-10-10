import fs from "node:fs";
import assert from "node:assert/strict";

const liveControl=fs.readFileSync("evidence/live-production-20261001/hbnf-cart-control/index.ts","utf8");
const stagedControl=fs.readFileSync("staging/coordinated-backend/hbnf-cart-control/index.ts","utf8");
const stagedReducer=fs.readFileSync("staging/coordinated-backend/hbnf-cart-control/guest-command.ts","utf8");
const liveFoundation=fs.readFileSync("evidence/live-production-20261001/hbnf-matrix-adapter-foundation/index.ts","utf8");
const stagedFoundation=fs.readFileSync("staging/coordinated-backend/hbnf-matrix-adapter-foundation/index.ts","utf8");
const stagedProjection=fs.readFileSync("staging/coordinated-backend/hbnf-cart-control/matrix-relay-projection.ts","utf8");

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

for (const marker of ['fx:142','start:512,stop:534','matrixBrightness','auxBrightness','palette:pal','overlay}}']) {
 assert.ok(stagedProjection.includes(marker),"staged relay projection missing: "+marker);
}
assert.ok(stagedFoundation.includes('status:"pending_relay"'),"legacy adapter must fail closed to the single relay writer");
assert.ok(!stagedFoundation.toLowerCase().includes("mqtt") && !stagedFoundation.includes("broker.emqx"),"legacy public MQTT command path remains");
assert.ok(/commandApplicationConfirmed:false/.test(stagedFoundation),"legacy adapter must never confirm application");
assert.ok(stagedProjection.includes('["hbnf-balanced","copper","ocean"]'),"legacy palette compatibility missing");
assert.match(stagedProjection,/fontIndex/,"native font index must remain in normalized overlay payload");
assert.ok(stagedReducer.includes('const rawFontIndex = (data as Record<string, unknown>).fontIndex'),"native font index validation remains");
assert.ok(stagedReconcile.includes('status:"pending_relay"'),"reconcile must report relay-pending, not device-applied");
assert.ok(!stagedReconcile.includes('hbnf_cart_upsert_observed'),"reconcile must not manufacture a device observation");
assert.ok(reconcileOutcome.includes('commandApplicationConfirmed:false'),"carried evidence must not imply application");
assert.ok(reconcileOutcome.includes('["online","off"].includes'),"only real device statuses may be carried");
assert.ok(!reconcileOutcome.includes('"submitted"'),"submitted is not an observation status");
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

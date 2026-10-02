import fs from "node:fs";
import assert from "node:assert/strict";

const liveControl=fs.readFileSync("evidence/live-production-20261001/hbnf-cart-control/index.ts","utf8");
const stagedControl=fs.readFileSync("staging/coordinated-backend/hbnf-cart-control/index.ts","utf8");
const liveFoundation=fs.readFileSync("evidence/live-production-20261001/hbnf-matrix-adapter-foundation/index.ts","utf8");
const stagedFoundation=fs.readFileSync("staging/coordinated-backend/hbnf-matrix-adapter-foundation/index.ts","utf8");
const feature=fs.readFileSync("hbnf-final-controller/hbnf-cart-features.mjs","utf8");
const controller=fs.readFileSync("hbnf-final-controller/hbnf-cart.js","utf8");

for (const marker of [
  'x-hbnf-device','action === "pair_device"','case "TUNE"','case "PALETTE"'
]) {
  assert.ok(liveControl.toLowerCase().includes(marker.toLowerCase()),"live v16 baseline marker missing: "+marker);
  assert.ok(stagedControl.toLowerCase().includes(marker.toLowerCase()),"staged control regressed live marker: "+marker);
}
assert.ok(stagedControl.includes('case "OVERLAY_START"'),"canonical overlay start reducer missing");
assert.ok(stagedControl.includes("canonicalOverlayIntentV1"),"staged overlay capability marker missing");
assert.ok(stagedControl.includes("canonicalPaletteIntentV1"),"staged palette capability marker missing");
assert.ok(stagedControl.includes('case "OVERLAY_EXPIRE"'),"canonical overlay expiry reducer missing");
assert.ok(stagedControl.includes('["text","scoreboard"]'),"overlay kind allowlist missing");
assert.ok(stagedControl.includes('expiresAt:now + ttlMs'),"overlay TTL persistence missing");

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
assert.ok(stagedFoundation.includes("palette,"),"foundation HBNF palette projection missing");
assert.ok(stagedFoundation.includes("overlay"),"foundation HBNF overlay projection missing");
assert.ok(stagedFoundation.includes('["hbnf-balanced","copper","ocean"]'),"legacy palette compatibility missing");

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

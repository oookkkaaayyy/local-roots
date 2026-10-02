import fs from "node:fs";
import assert from "node:assert/strict";

const gates=JSON.parse(fs.readFileSync("config/HBNF_COORDINATED_RELEASE_GATES.json","utf8"));
const html=fs.readFileSync("hbnf-final-controller/hbnf-cart.html","utf8");
const features=fs.readFileSync("hbnf-final-controller/hbnf-cart-features.mjs","utf8");
const installer=fs.readFileSync("hbnf-ui-v6-package/install_ui_v6.py","utf8");
const liveManifest=JSON.parse(fs.readFileSync("evidence/live-production-20261001/MANIFEST.json","utf8"));
const candidateManifest=JSON.parse(fs.readFileSync("config/HBNF_COORDINATED_CANDIDATE_MANIFEST.json","utf8"));
const stagedControl=fs.readFileSync("staging/coordinated-backend/hbnf-cart-control/index.ts","utf8");

assert.equal(gates.acceptedBaseline.firmwareSha256,"0aeb668e58cad3bae5b636fdc79573a263c3d0e911903ed48af0bbc2e5681f61");
assert.equal(gates.acceptedBaseline.matrixMac,"70:4b:ca:5b:34:5c");
assert.equal(gates.currentProduction.canonicalFence.active,true,"current production fence must not be treated as inactive");
assert.equal(gates.currentProduction.canonicalFence.epoch,2);
assert.equal(liveManifest.functions["hbnf-cart-control"].version,16);
assert.equal(liveManifest.functions["hbnf-matrix-adapter-foundation"].version,2);
assert.equal(candidateManifest.backend.changed["hbnf-cart-control"].baseEzbrSha256,liveManifest.functions["hbnf-cart-control"].ezbr_sha256);
assert.equal(candidateManifest.backend.changed["hbnf-matrix-adapter-foundation"].baseEzbrSha256,liveManifest.functions["hbnf-matrix-adapter-foundation"].ezbr_sha256);
assert.equal(candidateManifest.opalUpdater.basePackageSha256,"090300853504e3e2bc6fe50c64cbb2b87c6688e38af9dc51dfcada2d87fbcdff");
assert.ok(html.includes('id="motion"'),"accepted Motion control missing");
assert.ok(html.includes('id="audioResponse"'),"accepted Audio Response control missing");
for (const id of ["featureLook","featureColor","featurePalette","featureText","featureLive","featureOtaCheck","featurePreflight"]) {
  assert.ok(html.includes('id="'+id+'"'),"required visible control missing: "+id);
}
assert.ok(features.includes('fetchJson("/json/pal"'),"dynamic palette API missing");
assert.ok(features.includes("rollbackCanonicalLook"),"canonical look rollback missing");
assert.ok(features.includes("LIVE_CACHE_KEY"),"live cache missing");
assert.ok(features.includes("runPreflight"),"preflight missing");
assert.ok(features.includes("canonicalOverlayIntentV1"),"overlay capability gate missing");
assert.ok(features.includes("canonicalPaletteIntentV1"),"palette capability gate missing");
assert.ok(!features.includes("?."),"optional chaining not allowed in iOS-12-targeted feature module");
assert.ok(stagedControl.includes('action === "live_status"'),"canonical read-only live_status missing");
assert.ok(installer.includes('"hbnf-cart-features.mjs"'),"installer package omits feature module");

const blockers=Object.entries(gates.productionBlockers).filter((pair)=>pair[1]!==true).map((pair)=>pair[0]);
console.log("HBNF_SOURCE_GATES=PASS");
console.log("HBNF_PRODUCTION_BLOCKERS="+blockers.join(","));
if (!blockers.length) console.log("HBNF_PRODUCTION_READY=PASS");
else console.log("HBNF_PRODUCTION_READY=NO");

import fs from "node:fs";
import assert from "node:assert/strict";

const gates=JSON.parse(fs.readFileSync("config/HBNF_COORDINATED_RELEASE_GATES.json","utf8"));
const html=fs.readFileSync("hbnf-final-controller/hbnf-cart.html","utf8");
const features=fs.readFileSync("hbnf-final-controller/hbnf-cart-features.mjs","utf8");
const backend=fs.readFileSync("hbnf-wow-bundle/backend/index.ts","utf8");
const shared=fs.readFileSync("hbnf-wow-bundle/backend/shared.ts","utf8");
const installer=fs.readFileSync("hbnf-ui-v6-package/install_ui_v6.py","utf8");

assert.equal(gates.acceptedBaseline.firmwareSha256,"0aeb668e58cad3bae5b636fdc79573a263c3d0e911903ed48af0bbc2e5681f61");
assert.equal(gates.acceptedBaseline.matrixMac,"70:4b:ca:5b:34:5c");
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
assert.ok(shared.includes('"http://192.168.77.10"'),"Matrix local origin missing from backend CORS");
assert.ok(backend.includes('action==="live_status"'),"read-only live_status missing");
assert.ok(installer.includes('"hbnf-cart-features.mjs"'),"installer package omits feature module");

const blockers=Object.entries(gates.productionBlockers).filter((pair)=>pair[1]!==true).map((pair)=>pair[0]);
console.log("HBNF_SOURCE_GATES=PASS");
console.log("HBNF_PRODUCTION_BLOCKERS="+blockers.join(","));
if (!blockers.length) console.log("HBNF_PRODUCTION_READY=PASS");
else console.log("HBNF_PRODUCTION_READY=NO");

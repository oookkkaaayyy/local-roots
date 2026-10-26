import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const html = read("hbnf-final-controller/hbnf-cart.html");
const features = read("hbnf-final-controller/hbnf-cart-features.mjs");
const controller = read("hbnf-final-controller/hbnf-cart.js");
const cartControl = read("staging/coordinated-backend/hbnf-cart-control/index.ts");
const uvProxy = read("staging/coordinated-backend/hbnf-cart-control/uv-policy-proxy.mjs");
const auth = read("staging/coordinated-backend/hbnf-cart-control/guest-command.ts");
const aux = read("hbnf-aux-lighting/backend/aux_control.ts");
const css = read("hbnf-final-controller/hbnf-cart-ui-v6.css");

assert.match(html, /id="uvMainBrightness"[^>]*value="64"/);
assert.match(html, /id="uvShortBrightness"[^>]*value="64"/);
assert.match(html, /id="uvSharedBrightness"[^>]*value="64"[^>]*disabled/);
assert.match(html, /id="uvSharedBrightness"[\s\S]*id="uvMainBrightness"/);
assert.match(html, /id="uvSystemControls"[^>]*aria-label="UV controls"/);
assert.match(html, /aria-label="Both UV channels brightness" aria-describedby="uvLevelHelp"/);
const systemUv = html.slice(html.indexOf('<details id="uvSystemControls"'), html.indexOf('<details class="panel sub-controls" aria-label="Fine tuning">'));
assert.match(systemUv, /Cart UV[\s\S]*aria-label="Cart UV brightness"[\s\S]*Bar UV[\s\S]*aria-label="Bar UV brightness"/);
assert.match(systemUv, /Levels are saved on this iPad/);
assert.match(read("hbnf-final-controller/hbnf-cart-ui-v6.mjs"), /move\("#uvSystemControls", "system"\)/);
assert.doesNotMatch(html, /uvFollowApply|Apply rhythm limits/);
assert.match(html, /id="uvApply"[^>]*disabled/);
assert.match(html, /id="uvOff"[^>]*disabled/);
assert.match(html, /<details class="sub-controls uv-manual">[\s\S]*Detached manual controls/);
assert.match(html, /Checking whether Cart UV commands are ready\. Brightness levels remain editable\./);
assert.match(html, /id="palettePanel"[^>]*hidden/);
assert.match(html, /aria-label="Saved looks and advanced color"[^>]*hidden/);
assert.match(html, /id="showStylePanel"/);
assert.match(features, /if \(!uvDefaultFollowAttempted\)[\s\S]*?await sendUv\("FOLLOW_MATRIX"\)/);
assert.match(features, /addEventListener\("change", \(\) => \{\s*if \(uvFollowActive\) void sendUv\("FOLLOW_MATRIX"\)/);
assert.match(features, /if \(uvRequestInFlight\)[\s\S]*uvFollowCapsPending/);
assert.match(features, /result\.uvControlEnabled === true/);
const uvControlEnable = features.match(/function setUvControlsReady\(ready\)[\s\S]*?\n}/)?.[0];
assert.ok(uvControlEnable, "UV control readiness helper remains inspectable");
const uvLocalState = features.match(/function uvStateChanged\(persist = true\)[\s\S]*?\n}/)?.[0];
assert.ok(uvLocalState, "UV local state renderer remains inspectable");
const uvElements = new Map([
  ["uvApply", { disabled: false }], ["uvOff", { disabled: false }],
  ["uvMainBrightness", { disabled: false, value: "121" }],
  ["uvShortBrightness", { disabled: false, value: "88" }],
  ["uvSharedBrightness", { disabled: false }],
  ["uvMainValue", { value: "" }], ["uvShortValue", { value: "" }],
  ["uvSharedValue", { value: "" }],
]);
const exerciseUvControls = new Function("$", `let uvRequestInFlight=false,uvReadiness="unavailable",uvCapsStorageAvailable=true; const uvLevelSavedMessage=()=>"Brightness levels are saved on this iPad."; const writeUvCaps=()=>true; const window={localStorage:{}}; ${uvControlEnable}; ${uvLocalState}; return {
  set(ready,busy){uvRequestInFlight=busy;setUvControlsReady(ready);},
  render(){uvStateChanged(false);}
};`)(id => uvElements.get(id));
exerciseUvControls.set(false, false);
assert.equal(uvElements.get("uvApply").disabled, true);
assert.equal(uvElements.get("uvOff").disabled, true);
assert.equal(uvElements.get("uvMainBrightness").disabled, false);
assert.equal(uvElements.get("uvShortBrightness").disabled, false);
assert.equal(uvElements.get("uvSharedBrightness").disabled, false,
  "manual brightness remains editable while remote status/readiness is unknown");
exerciseUvControls.render();
assert.equal(uvElements.get("uvMainValue").value, "121");
assert.equal(uvElements.get("uvShortValue").value, "88");
assert.equal(uvElements.get("uvSharedValue").value, "Mixed");
exerciseUvControls.set(true, true);
assert.equal(uvElements.get("uvMainBrightness").disabled, true, "levels lock only while a command is in flight");
exerciseUvControls.set(true, false);
assert.equal(uvElements.get("uvApply").disabled, false);
assert.equal(uvElements.get("uvSharedBrightness").disabled, false);
assert.match(features, /uvSharedBrightness[\s\S]*uvMainBrightness[\s\S]*uvShortBrightness/);
assert.match(features, /mainLevel !== shortLevel/);
assert.match(features, /Math\.round\(\(mainLevel \+ shortLevel\) \/ 2\)/);
assert.match(uvLocalState, /writeUvCaps\(window\.localStorage, Number\(main\.value\), Number\(short\.value\)\)/);
assert.doesNotMatch(uvLocalState, /canonicalRead|sendUv/);
const storageFns = features.match(/function readUvCaps\(storage\)[\s\S]*?\n}\n\nfunction writeUvCaps\(storage, main, short\)[\s\S]*?\n}/)?.[0];
assert.ok(storageFns, "UV local preference storage helpers remain inspectable");
const mockStorage = new Map();
const storageApi = new Function("storage", `const UV_CAPS_STORAGE_KEY="hbnf_cart_uv_caps_v1"; ${storageFns}; return {read:()=>readUvCaps(storage), write:(main,short)=>writeUvCaps(storage,main,short)};`)({
  getItem: key => mockStorage.get(key) ?? null,
  setItem: (key, value) => mockStorage.set(key, value),
});
assert.deepEqual(storageApi.read(), { main: 64, short: 64, storageAvailable: true });
assert.equal(storageApi.write(123, 45), true);
assert.deepEqual(storageApi.read(), { main: 123, short: 45, storageAvailable: true });
assert.equal(storageApi.write(256, 45), false);
mockStorage.set("hbnf_cart_uv_caps_v1", "{bad json");
assert.deepEqual(storageApi.read(), { main: 64, short: 64, storageAvailable: false });
assert.match(features, /async function checkUvReadiness\(updateStatus = true\)[\s\S]*?if \(updateStatus\) status\.textContent/);
const uvReadiness = features.match(/async function checkUvReadiness\(updateStatus = true\)[\s\S]*?\n}\n\nasync function sendUv/)?.[0];
assert.ok(uvReadiness, "UV readiness handler remains inspectable");
assert.doesNotMatch(uvReadiness, /sendUv\(\s*["']OFF["']\s*\)/, "status/link failure must never issue implicit UV OFF");
assert.match(uvReadiness, /Cart status is unavailable\. \$\{uvLevelSavedMessage\(\)\} No command was sent\./);
assert.match(uvReadiness, /UV commands are locked until safety checks pass\. \$\{uvLevelSavedMessage\(\)\} No command was sent\./);
assert.doesNotMatch(uvReadiness, /(?:output|UV)\s+(?:is|was)\s+(?:confirmed\s+)?off/i, "readiness failure must not claim output is confirmed off");
const uvSend = features.match(/async function sendUv\(mode\)[\s\S]*?\n}\n\n\["uvMainBrightness"/)?.[0];
assert.ok(uvSend, "UV command handler remains inspectable");
assert.match(uvSend, /result\.acknowledgement\.acceptedByBroker === true/);
assert.match(uvSend, /UV result is unknown\. Check the Cart before trying again\./);
assert.match(uvSend, /AUX broker accepted the request; device output is not confirmed\./);
assert.doesNotMatch(uvSend, /sendUv\(\s*["']OFF["']\s*\)/, "missing command acknowledgment must never issue a follow-up OFF");
assert.doesNotMatch(uvSend, /(?:output|UV)\s+(?:is|was)\s+(?:confirmed\s+)?off/i, "unknown command outcome must not be reported as off");
assert.match(features, /canonicalRead\("uv_policy"/);
assert.match(features, /finally \{\s*uvRequestInFlight = false;\s*await checkUvReadiness\(false\);/);
assert.match(css, /grid-template-areas:"actions actions" "lights motion" "text text"/);
assert.match(features, /status\.textContent = "UV result is unknown/);
assert.match(controller, /body\.action === "uv_policy" \? 12000/);
assert.match(auth, /action === "uv_status" \|\| action === "uv_policy"/);
assert.match(cartControl, /action === "uv_status"/);
assert.match(cartControl, /action === "uv_policy"/);
assert.match(uvProxy, /\["OFF", "MANUAL", "FOLLOW_MATRIX"\]/);
assert.match(uvProxy, /Number\.isInteger\(value\)/);
assert.doesNotMatch(uvProxy, /vibeEnvelope|matrixBrightness/);
assert.match(aux, /action==="uv_policy"\|\|action==="uv"\).*owner_uv_proxy_required/);
assert.match(aux, /st\.runtimeTrusted&&uvOutputsVerified/);
assert.match(aux, /uvOutputsVerified:R3\.uvFollow\.outputsVerified===true/);
assert.match(read("hbnf-aux-lighting/backend/aux_uv_command.mjs"), /verified: false/);
assert.match(read("hbnf-aux-lighting/backend/aux_uv_command.mjs"), /uvEnabled = false/);

console.log("PASS: Cart UV rhythm-follow caps default independently, remain owner-authenticated, and stay disabled until AUX safety gates pass");

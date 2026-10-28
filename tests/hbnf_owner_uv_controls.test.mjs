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
assert.match(html, /class="muted score-source-links"[\s\S]*>Skins<\/a>[\s\S]*>Glow<\/a>/);
assert.match(css, /\.score-source-links a\{display:inline-flex;min-height:44px;align-items:center/);

assert.match(html, /id="uvMainBrightness"[^>]*value="64"/);
assert.match(html, /id="uvShortBrightness"[^>]*value="64"/);
assert.match(html, /id="uvSharedBrightness"[^>]*value="64"[^>]*disabled/);
assert.match(html, /id="uvSharedBrightness"[\s\S]*id="uvMainBrightness"/);
assert.match(html, /id="uvSystemControls"[^>]*aria-label="UV controls"/);
assert.match(html, /aria-label="Both UV channels brightness" aria-describedby="uvLevelHelp"/);
assert.match(html, /<strong>Cart<\/strong>[\s\S]*aria-label="Cart brightness"[\s\S]*<strong>Bar<\/strong>[\s\S]*aria-label="Bar brightness"/);
assert.match(html, /Levels are saved on this iPad/);
const ui = read("hbnf-final-controller/hbnf-cart-ui-v6.mjs");
assert.match(ui, /details\[aria-label="Fine tuning"\]/);
assert.match(ui, /if \(fineTuning\) views\.system\.appendChild\(fineTuning\)/);
assert.match(ui, /if \(fineTuning\) fineTuning\.appendChild\(uvSystemControls\)/);
assert.doesNotMatch(html, /uvFollowApply|Apply rhythm limits/);
assert.match(html, /id="uvApply"[^>]*disabled/);
assert.match(html, /id="uvOff"[^>]*disabled/);
assert.match(html, /id="uvFollow"[^>]*disabled/);
assert.match(html, /<details class="sub-controls uv-manual">[\s\S]*Manual brightness control/);
assert.match(html, /<button id="uvApply" type="button" disabled>Apply levels<\/button>/);
assert.doesNotMatch(html, /Apply manual override/);
assert.match(html, /Checking whether Cart UV commands are ready\. Brightness levels remain editable\./);
assert.match(html, /id="palettePanel"[^>]*hidden/);
assert.match(html, /aria-label="Saved looks and advanced color"[^>]*hidden/);
assert.match(html, /id="showStylePanel"/);
assert.doesNotMatch(features, /uvDefaultFollowAttempted|await sendUv\("FOLLOW_MATRIX"\)/);
assert.match(features, /addEventListener\("click", \(\) => sendUv\("FOLLOW_MATRIX"\)\)/);
assert.match(features, /addEventListener\("change", \(\) => \{\s*const mode = uvCommandForSharedSliderRelease\(uvReadiness, uvFollowActive\);\s*if \(mode\) void sendUv\(mode\);/);
assert.match(features, /if \(uvRequestInFlight\)[\s\S]*uvFollowCapsPending/);
assert.match(features, /result\.uvControlEnabled === true/);
const uvControlEnable = features.match(/function setUvControlsReady\(ready, safeOffAvailable = false\)[\s\S]*?\n}/)?.[0];
assert.ok(uvControlEnable, "UV control readiness helper remains inspectable");
const uvLocalState = features.match(/function uvStateChanged\(persist = true\)[\s\S]*?\n}/)?.[0];
assert.ok(uvLocalState, "UV local state renderer remains inspectable");
const uvTestReady = features.match(/function setUvCommissioningTestReady\(ready\)[\s\S]*?\n}/)?.[0];
assert.ok(uvTestReady, "UV commissioning readiness helper remains inspectable");
const uvElements = new Map([
  ["uvApply", { disabled: false }], ["uvOff", { disabled: false }], ["uvFollow", { disabled: false }],
  ["uvTestMain", { disabled: true }], ["uvTestShort", { disabled: true }],
  ["uvMainBrightness", { disabled: false, value: "121" }],
  ["uvShortBrightness", { disabled: false, value: "88" }],
  ["uvSharedBrightness", { disabled: false }],
  ["uvMainValue", { value: "" }], ["uvShortValue", { value: "" }],
  ["uvSharedValue", { value: "" }],
]);
const exerciseUvControls = new Function("$", `let uvRequestInFlight=false,uvReadiness="unavailable",uvCommissioningTestAvailable=false,uvCapsStorageAvailable=true; const uvLevelSavedMessage=()=>"Brightness levels are saved on this iPad."; const writeUvCaps=()=>true; const window={localStorage:{}}; ${uvControlEnable}; ${uvTestReady}; ${uvLocalState}; return {
  set(ready,busy,safeOff=false){uvRequestInFlight=busy;setUvControlsReady(ready,safeOff);},
  render(){uvStateChanged(false);}
};`)(id => uvElements.get(id));
exerciseUvControls.set(false, false);
assert.equal(uvElements.get("uvApply").disabled, true);
assert.equal(uvElements.get("uvOff").disabled, true);
exerciseUvControls.set(false, false, true);
assert.equal(uvElements.get("uvOff").disabled, false, "explicit UV off stays available with a verified output path");
exerciseUvControls.set(false, false);
assert.equal(uvElements.get("uvFollow").disabled, true);
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
assert.equal(uvElements.get("uvFollow").disabled, false);
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
assert.match(uvReadiness, /setUvCommissioningTestReady\(true\)/,
  "the bounded commissioning tests remain reachable when only the status read fails");
assert.match(uvReadiness, /Cart status is unavailable\. \$\{uvLevelSavedMessage\(\)\} A bounded Cart\/Bar test is available below\./);
assert.match(uvReadiness, /UV commands are locked until safety checks pass\. \$\{uvLevelSavedMessage\(\)\} No command was sent\./);
assert.doesNotMatch(uvReadiness, /(?:output|UV)\s+(?:is|was)\s+(?:confirmed\s+)?off/i, "readiness failure must not claim output is confirmed off");
const uvSend = features.match(/async function sendUv\(mode\)[\s\S]*?\n}\n\n\["uvMainBrightness"/)?.[0];
assert.ok(uvSend, "UV command handler remains inspectable");
const uvPolicySpec = JSON.parse(read("hbnf-aux-lighting/backend/aux_uv_policy_spec.json"));
assert.match(uvSend, /canonicalRead\("uv_policy",\s*\{\s*mode,\s*brightnessBySegment:\s*\{\s*main:\s*Number\(main\.value\),\s*short:\s*Number\(short\.value\)/,
  "Cart and Bar sliders must map to the shared main/short channel contract");
assert.deepEqual(uvPolicySpec.brightness.requiredChannels, ["main", "short"]);
assert.match(features, /if \(\$\("uvApply"\)\) \$\("uvApply"\)\.addEventListener\("click", \(\) => sendUv\("MANUAL"\)\)/);
assert.match(features, /if \(\$\("uvOff"\)\) \$\("uvOff"\)\.addEventListener\("click", \(\) => sendUv\("OFF"\)\)/);
assert.match(uvSend, /ack\.acceptedByDevice === true && ack\.deviceReadback === true/);
assert.match(uvSend, /UV result is unknown\. Check the Cart before trying again\./);
assert.match(uvSend, /Cart confirmed the UV command and readback; illumination was not observed\./);
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
assert.equal(JSON.parse(read("hbnf-aux-lighting/backend/uv_hardware_profile.json")).verified, false);
assert.match(read("hbnf-aux-lighting/backend/aux_uv_command.mjs"), /uvEnabled = false/);

console.log("PASS: Cart UV rhythm-follow caps default independently, remain owner-authenticated, and stay disabled until AUX safety gates pass");

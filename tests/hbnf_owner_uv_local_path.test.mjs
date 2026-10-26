import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { executeUvRequest, UV_HARDWARE_CONFIG } from "../hbnf-aux-lighting/backend/aux_uv_command.mjs";

const source = async path => readFile(new URL(path, import.meta.url), "utf8");

test("WAN-independent Cart control does not send UV requests through raw local WLED routes", async () => {
  const cart = await source("../hbnf-final-controller/hbnf-cart.js");
  const localClient = await source("../hbnf-final-controller/hbnf-cart-local.mjs");
  const localAcl = await source("../staging/coordinated-backend/opal/owner-local-control/aux_command_access.lua");
  const localUv = await source("../staging/coordinated-backend/opal/owner-local-control/uv_policy_access.lua");
  const localUvStatus = await source("../staging/coordinated-backend/opal/owner-local-control/uv_status_access.lua");
  const localUvRuntime = await source("../staging/coordinated-backend/opal/owner-local-control/uv_runtime.lua");
  const nginx = await source("../staging/coordinated-backend/opal/owner-local-control/nginx.conf.example");
  const cartFeatures = await source("../hbnf-final-controller/hbnf-cart-features.mjs");
  const packageBuilder = await source("../scripts/hbnf_build_owner_local_control_package.py");
  const installer = await source("../staging/coordinated-backend/opal/owner-local-control/install.sh");

  assert.match(cart, /const OPAL_LOCAL_COMMANDS = new Set\(\["OFF", "ON", "SCENE", "VIBE", "VIBE_AUTO", "PALETTE", "OVERLAY_START", "OVERLAY_CLEAR"\]\)/);
  assert.match(cart, /if \(OPAL_LOCAL_PWA && body\.action === "status"\)/);
  assert.match(cart, /if \(OPAL_LOCAL_PWA && body\.action === "command"\)/);
  assert.match(cart, /if \(OPAL_LOCAL_PWA && body\.action === "uv_status"\)\s*\{\s*return localOwnerControl\.uvStatus\(deviceToken\(\)\);\s*\}/);
  assert.match(cart, /if \(OPAL_LOCAL_PWA && body\.action === "uv_policy"\)\s*\{\s*return localOwnerControl\.uvPolicy\(deviceToken\(\), body\);\s*\}/);
  assert.match(cart, /const result = await callCloud\(cloudBody\)/);
  const localUvRouting = cart.match(/async function call\(body\) \{([\s\S]*?)\n\}\n\nfunction revalidateLocalPairOnline/)?.[1] || "";
  const route = new Function("OPAL_LOCAL_PWA", "localOwnerControl", "deviceToken", "callCloud", `return async body => {${localUvRouting}}`)(
    true,
    { uvStatus: async () => ({ local: true }), uvPolicy: async () => { throw new Error("local gateway unavailable"); } },
    () => "a".repeat(64),
    async () => { throw new Error("cloud fallback must not run"); },
  );
  assert.deepEqual(await route({ action: "uv_status" }), { local: true });
  await assert.rejects(route({ action: "uv_policy" }), /local gateway unavailable/);
  assert.match(cartFeatures, /canonicalRead\("uv_status"\)/);
  assert.match(cartFeatures, /canonicalRead\("uv_policy"/);
  assert.doesNotMatch(cartFeatures, /Starting automatic Matrix\/AUX rhythm following/);
  assert.match(cartFeatures, /Current output state is unavailable; no output command was sent\. Choose Apply manual override, Follow Matrix, or UV off/);
  assert.match(cartFeatures, /ack\.acceptedByDevice === true/);

  const acceptedKeys = [...localAcl.matchAll(/key == "([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual([...new Set(acceptedKeys)].sort(), ["bri", "on"]);
  assert.match(nginx, /location = \/api\/aux\/control[\s\S]*?aux_command_access\.lua[\s\S]*?proxy_pass http:\/\/192\.168\.77\.11\/json\/state/);
  assert.match(localClient, /async uvPolicy\(token, request = \{\}\)/);
  assert.match(localClient, /async uvStatus\(token\)[\s\S]*?request\(token, "\/api\/aux\/uv-status"\)/);
  assert.match(nginx, /location = \/api\/aux\/uv-policy[\s\S]*?auth_owner\.lua[\s\S]*?uv_policy_access\.lua/);
  const uvLocation = nginx.match(/location = \/api\/aux\/uv-policy \{([\s\S]*?)\n    \}/)?.[1] || "";
  assert.doesNotMatch(uvLocation, /proxy_pass/);
  assert.match(localUv, /key ~= "mode" and key ~= "brightnessBySegment"/);
  assert.match(localUv, /key ~= "main" and key ~= "short"/);
  assert.match(localUv, /ngx\.location\.capture\("\/__aux_uv_apply"/);
  assert.match(localUv, /runtime\.segment_matches\(readback\.segments\[1\]/);
  assert.match(localUv, /acceptedByDevice = true, deviceReadback = true/);
  assert.match(localUv, /if auth\.owner_access\(false\) ~= true then return end/);
  assert.match(nginx, /location = \/__aux_uv_state \{\s*internal;[\s\S]*?proxy_pass http:\/\/192\.168\.77\.11\/json\/state/);
  assert.match(nginx, /location = \/__aux_uv_apply \{\s*internal;[\s\S]*?proxy_pass http:\/\/192\.168\.77\.11\/json\/state/);
  assert.match(localUvRuntime, /identity\.release ~= M\.RELEASE/);
  assert.match(localUvRuntime, /tonumber\(identity\.uvOutputsVerified\) ~= 1/);
  assert.match(localUvRuntime, /not segments\[1\] or not segments\[2\]/);
  assert.match(nginx, /location = \/api\/aux\/uv-status[\s\S]*?auth_owner\.lua[\s\S]*?uv_status_access\.lua/);
  const uvStatusLocation = nginx.match(/location = \/api\/aux\/uv-status \{([\s\S]*?)\n    \}/)?.[1] || "";
  assert.doesNotMatch(uvStatusLocation, /proxy_pass/);
  assert.match(localUvStatus, /runtime\.read_state\(\)/);
  assert.match(localUvStatus, /uvControlEnabled = current ~= nil and profile_ready == true/);
  assert.match(localUvStatus, /hardwareProfileReady = profile_ready == true/);
  assert.match(localUv, /runtime\.profile_ready\(\)/);
  assert.match(localUv, /if profile_ready ~= true then[\s\S]*?mutationIssued = false/);
  assert.match(localUvRuntime, /uv_hardware_profile\.json/);
  assert.match(localUvRuntime, /requiredCommissioningGates/);
  assert.match(localUvRuntime, /requiredRuntimeGates/);
  assert.match(localUvRuntime, /key ~= "hardwareReady"/);
  assert.match(localUvStatus, /mutationIssued = false/);
  assert.match(localUvStatus, /outputOn =/);
  assert.match(localUvStatus, /return ngx\.exit\(200\)/);
  assert.match(installer, /"\$PKG\/uv_status_access\.lua"/);
  assert.match(installer, /"\$PKG\/uv_runtime\.lua"/);
  assert.match(installer, /uv_hardware_profile\.json/);
  assert.match(packageBuilder, /"uv_hardware_profile\.json"/);
  assert.match(packageBuilder, /"uv_status_access\.lua"/);
  assert.match(packageBuilder, /"uv_runtime\.lua"/);
});

test("current UV profile fails closed and never publishes manual brightness", async () => {
  let publishCount = 0;
  const result = await executeUvRequest({
    request: { mode: "MANUAL", brightnessBySegment: { main: 80, short: 40 } },
    state: {},
    auxEnabled: true,
    uvEnabled: true,
    uvOutputsVerified: true,
    hardware: UV_HARDWARE_CONFIG,
    publish: async () => { publishCount += 1; },
  });
  assert.equal(UV_HARDWARE_CONFIG.verified, false);
  assert.equal(result.status, 409);
  assert.equal(result.body.mutationIssued, false);
  assert.equal(result.body.preview, true);
  assert.equal(publishCount, 0);
});

console.log("PASS: authenticated Opal UV routes validate fixed segments, gate on AUX runtime, and confirm local state readback");

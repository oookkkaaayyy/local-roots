import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { proxyUvAction } from "../staging/coordinated-backend/hbnf-cart-control/uv-policy-proxy.mjs";

const read = path => fs.readFileSync(path, "utf8");
const html = read("hbnf-final-controller/hbnf-cart.html");
const features = read("hbnf-final-controller/hbnf-cart-features.mjs");
const local = read("hbnf-final-controller/hbnf-cart-local.mjs");
const policy = read("staging/coordinated-backend/opal/owner-local-control/uv_policy_access.lua");
const status = read("staging/coordinated-backend/opal/owner-local-control/uv_status_access.lua");
const runtime = read("staging/coordinated-backend/opal/owner-local-control/uv_runtime.lua");

test("first-output tests are owner-local, limited to verified segments, and turn both UV outputs off", async () => {
  assert.match(html, /id="uvTestMain"[^>]*disabled>Test Cart/);
  assert.match(html, /id="uvTestShort"[^>]*disabled>Test Bar/);
  assert.match(features, /result\.commissioningTestAvailable === true && result\.uvOutputsVerified === true/);
  assert.match(local, /mode === "COMMISSIONING_TEST"[\s\S]*?this\.request\(token, "\/api\/aux\/uv-policy"/);
  assert.match(local, /brightness \}, 20000\)/, "commissioning pulse request allows time for the timed pulse and readback");
  assert.match(policy, /if auth\.owner_access\(false\) ~= true then return end/);
  assert.match(policy, /if mode == "COMMISSIONING_TEST" then/);
  assert.match(policy, /channel ~= "main" and channel ~= "short"/);
  assert.match(policy, /runtime\.read_state\(\)/);
  assert.match(policy, /ngx\.sleep\(3\)/);
  assert.match(policy, /uv_policy_lock/);
  assert.match(policy, /pcall\(apply_and_read, \{ segment\(1, false, 0\), segment\(2, false, 0\) \}\)/);
  assert.match(policy, /if mode ~= "OFF" then[\s\S]*runtime\.profile_ready\(\)/);
  assert.match(status, /commissioningTestAvailable = current ~= nil/);
  assert.match(runtime, /segments\[1\]\.start\) ~= 22[\s\S]*segments\[2\]\.stop\) ~= 24/);

  let fetches = 0;
  const cloud = await proxyUvAction("uv_policy", {
    mode: "COMMISSIONING_TEST", channel: "main", brightness: 255,
  }, {
    operatorAuthorized: true,
    endpoint: "https://example.invalid",
    fetchImpl: async () => { fetches++; throw new Error("must not fetch"); },
  });
  assert.equal(cloud.status, 400);
  assert.equal(cloud.body.mutationIssued, false);
  assert.equal(fetches, 0);
});

test("safe UV off stays available when commissioning gates keep on-controls locked", () => {
  const helper = features.match(/function setUvControlsReady\(ready, safeOffAvailable = false\)[\s\S]*?\n}/)?.[0];
  assert.ok(helper, "UV control readiness helper remains inspectable");
  const elements = new Map(["uvApply", "uvFollow", "uvOff", "uvMainBrightness", "uvShortBrightness", "uvSharedBrightness"]
    .map(id => [id, { disabled: false }]));
  const controls = new Function("$", `let uvRequestInFlight=false; ${helper}; return setUvControlsReady;`)(id => elements.get(id));
  controls(false, true);
  assert.equal(elements.get("uvApply").disabled, true);
  assert.equal(elements.get("uvFollow").disabled, true);
  assert.equal(elements.get("uvOff").disabled, false);
  controls(false, false);
  assert.equal(elements.get("uvOff").disabled, true);
  controls(false, true);
  controls(false, true);
  assert.equal(elements.get("uvOff").disabled, false);
  controls(false, true);
  assert.equal(elements.get("uvSharedBrightness").disabled, false);
});

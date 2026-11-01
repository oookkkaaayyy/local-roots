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
const pwaInstall = read("staging/coordinated-backend/opal/owner-pwa-local-v1.0.16/install.sh");
const pwaRollback = read("staging/coordinated-backend/opal/owner-pwa-local-v1.0.16/rollback.sh");

test("unadmitted UV commissioning refuses before ANY Opal WLED command", async () => {
  assert.match(html, /id="uvTestMain"[^>]*disabled>Test Cart/);
  assert.match(html, /id="uvTestShort"[^>]*disabled>Test Bar/);
  assert.match(features, /result\\.commissioningTestAvailable === true && result\\.uvOutputsVerified === true/);
  assert.match(local, /mode === "COMMISSIONING_TEST"[\\s\\S]*?this\\.request\\(token, "\\/api\\/aux\\/uv-policy"/);
  assert.match(policy, /if auth\\.owner_access\\(false\\) ~= true then return end/);
  const start = policy.indexOf('if mode == "COMMISSIONING_TEST" then');
  const end = policy.indexOf('\\nfor key in pairs(input) do', start);
  assert.ok(start >= 0 && end > start, "commissioning branch must precede ordinary control");
  const commissioning = policy.slice(start, end);
  assert.match(commissioning, /return respond\\(503, \\{ error = "uv_electrical_qualification_not_admitted"/);
  assert.match(commissioning, /mutationIssued = false/);
  assert.doesNotMatch(commissioning, /__aux_uv_apply|ngx\\.sleep|apply_and_read|\\bsegment\\(/,
    "a missing electrical receipt must never cause a commissioning PWM pulse");
  assert.match(status, /commissioningTestAvailable = false/);
  assert.match(status, /commissioningBlockedReason = "uv_electrical_qualification_not_admitted"/);
  assert.match(policy, /if mode ~= "OFF" then[\\s\\S]*runtime\\.profile_ready\\(\\)/,
    "ordinary UV ON and FOLLOW still require all profile gates");
  assert.match(policy, /local applied = ngx\\.location\\.capture\\("\\/__aux_uv_apply"[\\s\\S]*?local readback, readback_error = runtime\\.read_state\\(\\)/,
    "ordinary profile-qualified writes still require independent WLED readback");
  assert.match(runtime, /segments\\[1\\]\\.start\\) ~= 22[\\s\\S]*segments\\[2\\]\\.stop\\) ~= 24/);
  assert.match(pwaInstall, /One-time pre-mutation admission manifest is required/);
  assert.match(pwaInstall, /candidate\\.package_sha256/);
  assert.match(pwaRollback, /original one-time admission manifest is required/);

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

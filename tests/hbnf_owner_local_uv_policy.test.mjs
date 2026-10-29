import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { LocalOwnerControl, LOCAL_CONTROL_ORIGIN } from "../hbnf-final-controller/hbnf-cart-local.mjs";
import { UV_FOLLOW_EFFECT_ID, uvCommissioningReady, uvRuntimeReady } from "../hbnf-aux-lighting/backend/aux_uv_command.mjs";
import { UV_MODES, UV_POLICY_SPEC, nextUvOutput } from "../hbnf-aux-lighting/backend/aux_uv_policy.mjs";

const token = "a".repeat(64);

test("Cart-local UV status and bounded commands do not require an Owner pairing token", async () => {
  const requests = [];
  const client = new LocalOwnerControl({
    pageOrigin: "http://192.168.77.1",
    origin: LOCAL_CONTROL_ORIGIN,
    fetchFn: async (url, options) => {
      requests.push({ url, options });
      if (url.endsWith("/api/aux/uv-status")) {
        return new Response(JSON.stringify({ available: true, commissioningTestAvailable: true, mutationIssued: false }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, outputOffConfirmed: true, deviceReadback: true }), { status: 200 });
    },
  });

  const status = await client.uvStatus("");
  const pulse = await client.uvPolicy("", { mode: "COMMISSIONING_TEST", channel: "main", brightness: 255 });
  assert.equal(status.available, true);
  assert.equal(pulse.outputOffConfirmed, true);
  assert.deepEqual(requests.map(({ url }) => url), [
    `${LOCAL_CONTROL_ORIGIN}/api/aux/uv-status`,
    `${LOCAL_CONTROL_ORIGIN}/api/aux/uv-policy`,
  ]);
  assert.equal(requests[0].options.headers["X-HBNF-Device"], undefined);
  assert.equal(requests[1].options.headers["X-HBNF-Device"], undefined);
});

test("unpaired UV access is not enabled outside the exact Cart-local page", async () => {
  let requestCount = 0;
  const client = new LocalOwnerControl({
    pageOrigin: "https://hbnightflyers.com",
    origin: LOCAL_CONTROL_ORIGIN,
    fetchFn: async () => { requestCount += 1; },
  });
  await assert.rejects(client.uvStatus(""), /valid paired Owner session/);
  await assert.rejects(client.uvPolicy("", { mode: "COMMISSIONING_TEST", channel: "main", brightness: 255 }), /valid paired Owner session/);
  assert.equal(requestCount, 0);
});

test("UV local policy uses existing paired session without requiring Matrix transport and surfaces fail-closed Opal response", async () => {
  const requests = [];
  const client = new LocalOwnerControl({
    origin: "https://cart-control.invalid",
    fetchFn: async (url, options) => {
      requests.push({ url, options });
      if (url.endsWith("/api/session")) return new Response("{}", { status: 200 });
      return new Response(JSON.stringify({ error: "local_uv_policy_readiness_unverified", mutationIssued: false }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  await assert.rejects(
    client.uvPolicy(token, { mode: "vibe_reactive", brightnessBySegment: { main: 100, short: 40 } }),
    error => error.status === 503 && error.data.mutationIssued === false,
  );
  assert.equal(client.transport, null);
  assert.deepEqual(requests.map(({ url }) => url), [
    "https://cart-control.invalid/api/session",
    "https://cart-control.invalid/api/aux/uv-policy",
  ]);
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    mode: "VIBE_REACTIVE",
    brightnessBySegment: { main: 100, short: 40 },
  });
});

test("invalid local UV request is rejected before any network operation", async () => {
  let requestCount = 0;
  const client = new LocalOwnerControl({ fetchFn: async () => { requestCount += 1; } });
  await assert.rejects(client.uvPolicy(token, {
    mode: "MANUAL",
    brightnessBySegment: { main: 256, short: 40 },
  }), /Invalid local UV policy request/);
  assert.equal(requestCount, 0);
});

test("Matrix/audio loss falls back to each nonzero cap; fresh zero signal remains a valid dim command", () => {
  const config = { enabled: true, hardwareAvailable: true, maxBrightness: 255, rampPerTick: 255 };
  for (const mode of ["FOLLOW_MATRIX", "VIBE_REACTIVE"]) {
    const cap = 72;
    assert.equal(nextUvOutput({ mode, responseBrightness: cap }, config, {}), cap);
    assert.equal(nextUvOutput({ mode, responseBrightness: cap }, config,
      mode === "FOLLOW_MATRIX" ? { matrixFresh: false, matrixBrightness: 0 } : { vibeFresh: false, vibeEnvelope: 0 }), cap);
  }
  assert.equal(nextUvOutput({ mode: "FOLLOW_MATRIX", responseBrightness: 72 }, config,
    { matrixFresh: true, matrixBrightness: 0 }), 0);
  assert.equal(nextUvOutput({ mode: "VIBE_REACTIVE", responseBrightness: 72 }, config,
    { vibeFresh: true, vibeEnvelope: 0 }), 0);
});

test("Opal and shared backend point at the same declarative UV policy contract", async () => {
  const opal = await readFile(new URL("../staging/coordinated-backend/opal/owner-local-control/uv_policy_access.lua", import.meta.url), "utf8");
  const uvRuntime = await readFile(new URL("../staging/coordinated-backend/opal/owner-local-control/uv_runtime.lua", import.meta.url), "utf8");
  const uvStatus = await readFile(new URL("../staging/coordinated-backend/opal/owner-local-control/uv_status_access.lua", import.meta.url), "utf8");
  const nginx = await readFile(new URL("../staging/coordinated-backend/opal/owner-local-control/nginx.conf.example", import.meta.url), "utf8");
  const policyJson = await readFile(new URL("../hbnf-aux-lighting/backend/aux_uv_policy_spec.json", import.meta.url), "utf8");
  const opalSpec = JSON.parse(policyJson);

  assert.deepEqual(UV_MODES, opalSpec.modes);
  assert.equal(UV_FOLLOW_EFFECT_ID, opalSpec.followEffectId);
  assert.equal(uvCommissioningReady(Object.fromEntries(opalSpec.requiredCommissioningGates.map(key => [key, true]))), true);
  assert.equal(uvRuntimeReady({ auxEnabled: true, uvEnabled: true, uvOutputsVerified: true }), false);
  assert.deepEqual(opalSpec.brightness.requiredChannels, ["main", "short"]);
  assert.equal(opalSpec.networkBoundary.directWledRouteAllowed, false);
  assert.match(uvRuntime, /uv_policy_spec\.json/);
  assert.match(uvRuntime, /policy\.requiredRuntimeGates/);
  assert.match(uvRuntime, /policy\.requiredCommissioningGates/);
  assert.match(uvRuntime, /policy\.brightness/);
  assert.match(opal, /runtime\.profile_ready\(\)/);
  assert.match(opal, /one-channel PWM with per-bus white mode MANUAL_ONLY/);
  assert.match(opal, /col = \{\{0, 0, 0, 255\}\}/);
  assert.match(opal, /col = \{0, 0, 0, 255\}/);
  assert.match(uvRuntime, /One-channel PWM state is the RGBW white value/);
  assert.match(uvRuntime, /tonumber\(color\[4\]\) ~= expected\.col\[4\]/);
  assert.match(uvStatus, /response\.outputMode = "FOLLOW_MATRIX"/);
  assert.match(uvStatus, /response\.outputMode = "UNKNOWN"/);
  assert.match(uvStatus, /commissioningTestAvailable = current ~= nil/);
  assert.match(opal, /mode == "COMMISSIONING_TEST"/);
  assert.match(opal, /ngx\.sleep\(3\)/);
  assert.match(opal, /outputOffConfirmed = off_confirmed/);
  assert.match(opal, /if mode ~= "OFF" then[\s\S]*runtime\.profile_ready\(\)/);
  assert.match(uvRuntime, /segments\[1\]\.start\) ~= 22/);
  const localRoute = nginx.match(/location = \/api\/aux\/uv-policy \{([\s\S]*?)\n    \}/)?.[1] || "";
  assert.match(localRoute, /auth_owner\.lua/);
  assert.match(localRoute, /uv_policy_access\.lua/);
  assert.doesNotMatch(localRoute, /proxy_pass/);
});

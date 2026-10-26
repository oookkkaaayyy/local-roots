import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { LocalOwnerControl } from "../hbnf-final-controller/hbnf-cart-local.mjs";
import { UV_FOLLOW_EFFECT_ID, uvCommissioningReady, uvRuntimeReady } from "../hbnf-aux-lighting/backend/aux_uv_command.mjs";
import { UV_MODES, UV_POLICY_SPEC } from "../hbnf-aux-lighting/backend/aux_uv_policy.mjs";

const token = "a".repeat(64);

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

test("Opal and shared backend point at the same declarative UV policy contract", async () => {
  const opal = await readFile(new URL("../staging/coordinated-backend/opal/owner-local-control/uv_policy_access.lua", import.meta.url), "utf8");
  const nginx = await readFile(new URL("../staging/coordinated-backend/opal/owner-local-control/nginx.conf.example", import.meta.url), "utf8");
  const policyJson = await readFile(new URL("../hbnf-aux-lighting/backend/aux_uv_policy_spec.json", import.meta.url), "utf8");
  const opalSpec = JSON.parse(policyJson);

  assert.deepEqual(UV_MODES, opalSpec.modes);
  assert.equal(UV_FOLLOW_EFFECT_ID, opalSpec.followEffectId);
  assert.equal(uvCommissioningReady(Object.fromEntries(opalSpec.requiredCommissioningGates.map(key => [key, true]))), true);
  assert.equal(uvRuntimeReady({ auxEnabled: true, uvEnabled: true, uvOutputsVerified: true }), false);
  assert.deepEqual(opalSpec.brightness.requiredChannels, ["main", "short"]);
  assert.equal(opalSpec.networkBoundary.directWledRouteAllowed, false);
  assert.match(opal, /uv_policy_spec\.json/);
  assert.match(opal, /spec\.modes/);
  assert.match(opal, /spec\.brightness\.requiredChannels/);
  assert.match(opal, /spec\.requiredCommissioningGates/);
  assert.match(opal, /local_uv_policy_readiness_unverified/);
  const localRoute = nginx.match(/location = \/api\/aux\/uv-policy \{([\s\S]*?)\n    \}/)?.[1] || "";
  assert.match(localRoute, /auth_owner\.lua/);
  assert.match(localRoute, /uv_policy_access\.lua/);
  assert.doesNotMatch(localRoute, /proxy_pass/);
});

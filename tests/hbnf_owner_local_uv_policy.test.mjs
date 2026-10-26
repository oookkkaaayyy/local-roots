import assert from "node:assert/strict";
import test from "node:test";
import { LocalOwnerControl } from "../hbnf-final-controller/hbnf-cart-local.mjs";

const token = "a".repeat(64);

test("UV local policy uses existing paired session without requiring Matrix transport and surfaces fail-closed Opal response", async () => {
  const requests = [];
  const client = new LocalOwnerControl({
    origin: "https://cart-control.invalid",
    fetchFn: async (url, options) => {
      requests.push({ url, options });
      if (url.endsWith("/api/session")) return new Response("{}", { status: 200 });
      return new Response(JSON.stringify({ error: "local_uv_policy_runtime_unavailable", mutationIssued: false }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  await assert.rejects(
    client.uvPolicy(token, { mode: "MANUAL", brightnessBySegment: { main: 100, short: 40 } }),
    error => error.status === 503 && error.data.mutationIssued === false,
  );
  assert.equal(client.transport, null);
  assert.deepEqual(requests.map(({ url }) => url), [
    "https://cart-control.invalid/api/session",
    "https://cart-control.invalid/api/aux/uv-policy",
  ]);
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    mode: "MANUAL",
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

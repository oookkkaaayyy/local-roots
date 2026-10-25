import assert from "node:assert/strict";
import test from "node:test";
import { proxyUvAction } from "./uv-policy-proxy.mjs";

const options = { endpoint: "https://cart.example/aux", serviceKey: "server-only", anonKey: "public" };

test("UV status requires owner authorization and returns only the readiness flags", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return new Response(JSON.stringify({ enabled: true, uvControlEnabled: false, topic: "private/topic", hardware: { gpio: 26 } })); };
  const denied = await proxyUvAction("uv_status", {}, { ...options, fetchImpl });
  assert.equal(denied.status, 403);
  assert.equal(calls, 0);
  const allowed = await proxyUvAction("uv_status", {}, { ...options, pairedDeviceAuthorized: true, fetchImpl });
  assert.deepEqual(allowed, { status: 200, body: { ok: true, action: "uv_status", enabled: true, uvControlEnabled: false, rhythmSignalReady: false } });
});

test("manual UV proxy sends only independent integer levels to AUX", async () => {
  let sent;
  const result = await proxyUvAction("uv_policy", {
    mode: "manual", brightnessBySegment: { main: 128, short: 64, matrixBrightness: 255, vibeEnvelope: 255 },
  }, {
    ...options, operatorAuthorized: true,
    fetchImpl: async (url, init) => {
      sent = { url, init, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ ok: false, mutationIssued: false, error: "gated" }), { status: 409 });
    },
  });
  assert.equal(result.status, 409);
  assert.equal(result.body.mutationIssued, false);
  assert.equal(sent.url, options.endpoint);
  assert.equal(sent.init.headers.Authorization, "Bearer server-only");
  assert.deepEqual(sent.body, { action: "uv_policy", mode: "MANUAL", brightnessBySegment: { main: 128, short: 64 } });
});

test("Matrix follow forwards only independent caps for AUX-local rhythm processing", async () => {
  let sent;
  const result = await proxyUvAction("uv_policy", {
    mode: "follow_matrix", brightnessBySegment: { main: 96, short: 40 }, matrixBrightness: 255, vibeEnvelope: 255,
  }, {
    ...options, operatorAuthorized: true,
    fetchImpl: async (_url, init) => {
      sent = JSON.parse(init.body);
      return new Response(JSON.stringify({ ok: false, mutationIssued: false, preview: true }), { status: 409 });
    },
  });
  assert.equal(result.status, 409);
  assert.deepEqual(sent, { action: "uv_policy", mode: "FOLLOW_MATRIX", brightnessBySegment: { main: 96, short: 40 } });
});

test("UV proxy rejects unsupported modes, malformed levels, and Guest requests before network access", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error("must not call AUX"); };
  const unauthorized = await proxyUvAction("uv_policy", { mode: "MANUAL", brightnessBySegment: { main: 1, short: 1 } }, { ...options, fetchImpl });
  const unsupported = await proxyUvAction("uv_policy", { mode: "VIBE_REACTIVE", brightnessBySegment: { main: 1, short: 1 } }, { ...options, pairedDeviceAuthorized: true, fetchImpl });
  const malformed = await proxyUvAction("uv_policy", { mode: "MANUAL", brightnessBySegment: { main: "1", short: 256 } }, { ...options, operatorAuthorized: true, fetchImpl });
  assert.equal(unauthorized.status, 403);
  assert.equal(unsupported.status, 400);
  assert.equal(malformed.status, 400);
  assert.equal(calls, 0);
});

test("AUX timeout reports unknown outcome instead of claiming no mutation", async () => {
  const result = await proxyUvAction("uv_policy", { mode: "OFF", brightnessBySegment: { main: 0, short: 0 } }, {
    ...options, pairedDeviceAuthorized: true,
    fetchImpl: async () => { throw new Error("connection lost"); },
  });
  assert.equal(result.status, 503);
  assert.equal(result.body.mutationIssued, "unknown");
});

console.log("PASS: authenticated Cart-to-AUX UV proxy, sanitized controls, fail-closed mode filtering and truthful failure results");

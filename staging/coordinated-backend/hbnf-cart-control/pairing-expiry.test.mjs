import assert from "node:assert/strict";
import test from "node:test";
import { readAuthoritativeDeviceExpiry } from "./pairing-expiry.mjs";

const NOW = 1_798_200_000;
const HASH = "a".repeat(64);

test("pairing expiry comes from the server function and accepts only a live bounded integer", async () => {
  const calls = [];
  const service = { rpc: async (...args) => { calls.push(args); return { data: NOW + 100, error: null }; } };
  assert.equal(await readAuthoritativeDeviceExpiry(service, HASH, NOW), NOW + 100);
  assert.deepEqual(calls, [["hbnf_cart_device_session_expiry", { p_session_hash: HASH }]]);
});

test("missing, expired, overlong, unsafe, or failed server expiry remains unavailable", async () => {
  for (const data of [null, NOW, NOW + 180 * 24 * 60 * 60 + 1, Number.MAX_SAFE_INTEGER]) {
    const service = { rpc: async () => ({ data, error: null }) };
    assert.equal(await readAuthoritativeDeviceExpiry(service, HASH, NOW), null);
  }
  assert.equal(await readAuthoritativeDeviceExpiry({ rpc: async () => ({ data: NOW + 10, error: new Error("db") }) }, HASH, NOW), null);
  let called = false;
  assert.equal(await readAuthoritativeDeviceExpiry({ rpc: async () => { called = true; return { data: NOW + 10 }; } }, "bad", NOW), null);
  assert.equal(called, false);
});

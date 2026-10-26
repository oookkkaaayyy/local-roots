import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { executeUvRequest, UV_HARDWARE_CONFIG } from "../hbnf-aux-lighting/backend/aux_uv_command.mjs";

const source = async path => readFile(new URL(path, import.meta.url), "utf8");

test("WAN-independent Cart control does not send UV requests through raw local WLED routes", async () => {
  const cart = await source("../hbnf-final-controller/hbnf-cart.js");
  const localAcl = await source("../staging/coordinated-backend/opal/owner-local-control/aux_command_access.lua");
  const nginx = await source("../staging/coordinated-backend/opal/owner-local-control/nginx.conf.example");
  const cartFeatures = await source("../hbnf-final-controller/hbnf-cart-features.mjs");

  assert.match(cart, /const OPAL_LOCAL_COMMANDS = new Set\(\["OFF", "ON", "SCENE", "VIBE", "VIBE_AUTO", "PALETTE", "OVERLAY_START", "OVERLAY_CLEAR"\]\)/);
  assert.match(cart, /if \(OPAL_LOCAL_PWA && body\.action === "status"\)/);
  assert.match(cart, /if \(OPAL_LOCAL_PWA && body\.action === "command"\)/);
  assert.match(cart, /const result = await callCloud\(cloudBody\)/);
  assert.match(cartFeatures, /canonicalRead\("uv_status"\)/);
  assert.match(cartFeatures, /canonicalRead\("uv_policy"/);

  const acceptedKeys = [...localAcl.matchAll(/key == "([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual([...new Set(acceptedKeys)].sort(), ["bri", "on"]);
  assert.match(nginx, /location = \/api\/aux\/control[\s\S]*?aux_command_access\.lua[\s\S]*?proxy_pass http:\/\/192\.168\.77\.11\/json\/state/);
  assert.doesNotMatch(nginx, /location\s*=\s*\/api\/aux\/uv(?:-|\/|\s|\{)/i);
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

console.log("PASS: no existing local UV route; unauthorized/direct WLED substitute is rejected by source contract and current server policy remains fail-dark");

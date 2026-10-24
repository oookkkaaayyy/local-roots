import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { LocalOwnerControl, LOCAL_MATRIX_IP, LOCAL_AUX_IP, LOCAL_MATRIX_MAC, LOCAL_AUX_MAC, LOCAL_MATRIX_RELEASE } from "../hbnf-final-controller/hbnf-cart-local.mjs";
import { buildPatch } from "../staging/coordinated-backend/opal/mission-control-local/local-transport.js";

function directFixture({ auxReachable = true, palette = { mode: "legacy", id: "hbnf-balanced" } } = {}) {
  const calls = [];
  const matrix = {
    HBNF: {
      candidate: LOCAL_MATRIX_RELEASE, matrixBrightness: 69, auxBrightness: 255,
      vibe: 1, motion: 50, audioResponse: 50, scene: "course-flow",
      palette,
    },
    seg: [],
  };
  class FakeTransport {
    constructor({ url, onState }) { this.url = url; this.onState = onState; this.socket = null; this.snapshot = null; this.snapshotVersion = 0; this.snapshotAt = 0; this.identityVerifiedAt = 0; }
    verifyIdentity(info) { this.identityVerifiedAt = info.mac === LOCAL_MATRIX_MAC ? Date.now() : 0; return this.identityVerifiedAt > 0; }
    controlReady() { return !!(this.socket && this.socket.readyState === 1 && this.identityVerifiedAt && this.snapshot && this.snapshot.HBNF.candidate === LOCAL_MATRIX_RELEASE); }
    connect() { this.socket = { readyState: 1 }; this.read(); }
    read() { this.snapshot = structuredClone(matrix); this.snapshotVersion += 1; this.snapshotAt = Date.now(); this.onState?.(this.snapshot); }
    requestState() { this.read(); }
    async command(type, payload) {
      const patch = buildPatch(type, payload);
      Object.assign(matrix.HBNF, patch);
      this.read();
      return this.snapshot;
    }
    disconnect() { this.socket = null; }
  }
  const module = {
    buildPatch,
    LocalMatrixTransport: FakeTransport,
    async getJson(url) {
      calls.push(url);
      if (url === `http://${LOCAL_MATRIX_IP}/json/info`) return { mac: LOCAL_MATRIX_MAC };
      if (url === `http://${LOCAL_AUX_IP}/json/info`) {
        if (!auxReachable) throw new Error("AUX offline");
        return { mac: LOCAL_AUX_MAC, live: true, lm: "DDP", lip: LOCAL_MATRIX_IP };
      }
      if (url === `http://${LOCAL_AUX_IP}/json/state`) {
        if (!auxReachable) throw new Error("AUX offline");
        return { bri: 255, on: true };
      }
      throw new Error(`Unexpected device request: ${url}`);
    },
  };
  return { calls, matrix, module };
}

test("Opal Owner PWA forwards pushed Matrix state to its UI refresh callback", async t => {
  let received = 0;
  const f = directFixture();
  const owner = new LocalOwnerControl({ opalDirect: true, onState: () => { received += 1; }, directTransportLoader: async () => f.module, storage: null });
  t.after(() => owner.disconnectTransport());
  await owner.connect("", 0);
  const afterConnect = received;
  f.matrix.HBNF.vibe = 2;
  owner.transport.read();
  assert.ok(received > afterConnect, "a pushed Matrix snapshot must notify the Owner PWA adapter");
  assert.equal(owner.transport.snapshot.HBNF.vibe, 2);
});

test("Opal-hosted Owner PWA uses fresh local Matrix and AUX identity/readback without cloud credentials", async t => {
  const f = directFixture();
  const owner = new LocalOwnerControl({ opalDirect: true, directTransportLoader: async () => f.module, storage: null });
  t.after(() => owner.disconnectTransport());
  const status = await owner.connect("", 0);
  assert.equal(status.local, true);
  assert.equal(status.devices.matrix.mac, LOCAL_MATRIX_MAC);
  assert.equal(status.devices.matrix.firmware, LOCAL_MATRIX_RELEASE);
  assert.equal(status.devices.aux.mac, LOCAL_AUX_MAC);
  assert.equal(status.devices.aux.ddp, true);
  assert.equal(status.devices.aux.physical, "unverified");
  assert.equal(status.desired.state.paletteId, "legacy", "known legacy palette must be readable so Apply can preserve the prior state");
  assert.ok(f.calls.includes(`http://${LOCAL_MATRIX_IP}/json/info`));
  assert.ok(f.calls.includes(`http://${LOCAL_AUX_IP}/json/state`));
});

test("id-less legacy palette readback stays generic and unknown legacy IDs stay unconfirmed", async t => {
  const generic = directFixture({ palette: { mode: "legacy" } });
  const genericOwner = new LocalOwnerControl({ opalDirect: true, directTransportLoader: async () => generic.module, storage: null });
  t.after(() => genericOwner.disconnectTransport());
  assert.equal((await genericOwner.connect("", 0)).desired.state.paletteId, "legacy");

  const unknown = directFixture({ palette: { mode: "legacy", id: "future-unknown" } });
  const unknownOwner = new LocalOwnerControl({ opalDirect: true, directTransportLoader: async () => unknown.module, storage: null });
  t.after(() => unknownOwner.disconnectTransport());
  assert.equal((await unknownOwner.connect("", 0)).desired.state.paletteId, "");
});

test("local Owner PWA brightness, motion/audio, Vibes, scenes, palettes, text and scoreboard route through existing Matrix transport", async t => {
  const f = directFixture();
  const owner = new LocalOwnerControl({ opalDirect: true, directTransportLoader: async () => f.module, storage: null });
  t.after(() => owner.disconnectTransport());
  await owner.connect("", 0);
  const tune = await owner.command("", "TUNE", { matrixBrightness: 72, auxBrightness: 235, motion: 61, audioResponse: 44 }, ["matrixBrightness", "auxBrightness", "motion", "audioResponse"]);
  assert.equal(tune.state.HBNF.matrixBrightness, 72);
  assert.equal(tune.state.HBNF.auxBrightness, 235);
  assert.equal(tune.acknowledgments.matrix.confirmed, true);
  assert.equal(tune.acknowledgments.aux.matrixProjection, 235);
  assert.equal(tune.acknowledgments.aux.brightness, 255, "WLED state.bri is reported separately from the HBNF AUX output target");
  assert.equal(tune.snapshot.desired.state.devices.aux.brightness, 235);
  assert.equal(tune.snapshot.observed[1].reported.physical, "unverified");
  await owner.command("", "VIBE", { vibe: "cosmic" });
  await owner.command("", "SCENE", { sceneId: "quiet-cosmos" });
  await owner.command("", "PALETTE", { paletteId: "wled-4" });
  await owner.command("", "OVERLAY_START", { overlayId: "local-text-test", kind: "text", ttlMs: 5000, data: { text: "HELLO", color: "#FFFFFF" } });
  await owner.command("", "OVERLAY_START", { overlayId: "local-scores-test", kind: "scoreboard", ttlMs: 8000, data: { label: "F9", entries: ["AND 3"] } });
  assert.equal(f.matrix.HBNF.vibe, 4);
  assert.equal(f.matrix.HBNF.scene, "quiet-cosmos");
  assert.deepEqual(f.matrix.HBNF.palette, { mode: "wled", index: 4 });
  assert.equal(f.matrix.HBNF.overlay.id, "local-scores-test");
});

test("local Owner PWA fails closed when either required device cannot be read", async t => {
  const f = directFixture({ auxReachable: false });
  const owner = new LocalOwnerControl({ opalDirect: true, directTransportLoader: async () => f.module, storage: null });
  t.after(() => owner.disconnectTransport());
  await assert.rejects(owner.connect("", 0), /AUX offline/);
});

test("local route preserves cloud routes and labels score reads as internet-dependent", () => {
  const js = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart.js", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../hbnf-final-controller/hbnf-cart.html", import.meta.url), "utf8");
  assert.match(js, /const result = await callCloud\(cloudBody\)/);
  assert.match(js, /const SUPABASE_URL = "https:\/\/phcpbvuqibyarpfrftgx\.supabase\.co"/);
  assert.match(html, /Live scores need an internet connection\./i);
  assert.match(js, /You’re offline\. Local controls are still available\./);
});

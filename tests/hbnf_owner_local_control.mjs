import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { LocalOwnerControl, LOCAL_CONTROL_ORIGIN, LOCAL_MATRIX_MAC, LOCAL_AUX_MAC, LOCAL_MATRIX_RELEASE } from "../hbnf-final-controller/hbnf-cart-local.mjs";
import * as transportModule from "../staging/coordinated-backend/opal/mission-control-local/local-transport.js";

const token = "a".repeat(64);
const expiry = Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60;
const baseState = () => ({ state: { HBNF: { candidate: LOCAL_MATRIX_RELEASE, matrixBrightness: 69, auxBrightness: 255, vibe: 1, activeVibe: 1, motion: 50, audioResponse: 50, scene: "course-flow" }, seg: [] } });
function response(status, value) {
  return { status, ok: status >= 200 && status < 300, json: async () => value };
}

class FakeSocket {
  constructor(url, protocols, owner) {
    this.url = url;
    this.protocols = protocols;
    this.owner = owner;
    this.readyState = 0;
    this.sent = [];
    setImmediate(() => {
      if (this.readyState !== 0) return;
      this.readyState = 1;
      if (this.onopen) this.onopen();
      this.emit();
    });
  }
  send(raw) {
    this.sent.push(raw);
    const message = JSON.parse(raw);
    if (message.HBNF) Object.assign(this.owner.current.state.HBNF, message.HBNF);
    setImmediate(() => this.emit());
  }
  emit() { if (this.readyState === 1 && this.onmessage) this.onmessage({ data: JSON.stringify(this.owner.current) }); }
  close() { this.readyState = 3; if (this.onclose) this.onclose(); }
}

function fixture({ sessionStatus = 200, sessionExpiresAt = expiry, enrollmentStatus = 200, applyAuxControl = true } = {}) {
  const calls = [];
  const sockets = [];
  const owner = { current: baseState(), auxState: { bri: 255, on: true }, applyAuxControl };
  let firstSession = true;
  const fetchFn = async (url, options = {}) => {
    const parsed = new URL(url);
    calls.push({ url, path: parsed.pathname, method: options.method || "GET", headers: options.headers || {}, body: options.body || null });
    if (parsed.origin !== LOCAL_CONTROL_ORIGIN) throw new Error("Unexpected non-local request");
    if (parsed.pathname === "/api/session") {
      if (sessionStatus === 404 && firstSession) { firstSession = false; return response(404, { error: "owner_session_not_enrolled" }); }
      return response(sessionStatus === 404 ? 404 : sessionStatus, { authenticated: sessionStatus === 200, expiresAt: sessionExpiresAt });
    }
    if (parsed.pathname === "/api/session/enroll") return response(enrollmentStatus, enrollmentStatus === 200 ? { enrolled: true, expiresAt: expiry } : { error: "cloud_pair_validation_failed" });
    if (parsed.pathname === "/api/session/revoke") return response(200, { revoked: true, scope: "this_opal" });
    if (parsed.pathname === "/api/matrix/json/info") return response(200, { mac: LOCAL_MATRIX_MAC });
    if (parsed.pathname === "/api/aux/json/info") return response(200, { mac: LOCAL_AUX_MAC, live: true, lm: "DDP", lip: "192.168.77.10" });
    if (parsed.pathname === "/api/aux/json/state") return response(200, owner.auxState);
    if (parsed.pathname === "/api/aux/control") {
      if (options.headers["X-HBNF-Device"] !== token) return response(401, { error: "paired_owner_required" });
      const body = JSON.parse(options.body || "{}");
      if (Object.keys(body).some(key => !["bri", "on"].includes(key))) return response(400, { error: "invalid_aux_command" });
      if (owner.applyAuxControl) Object.assign(owner.auxState, body);
      return response(200, { ok: true });
    }
    throw new Error("Unexpected local path: " + parsed.pathname);
  };
  class FixtureTransport extends transportModule.LocalMatrixTransport {
    constructor(options) {
      super({ ...options, socketFactory: (url, protocols) => {
        const socket = new FakeSocket(url, protocols, owner);
        sockets.push(socket);
        return socket;
      } });
    }
  }
  return { calls, sockets, owner, fetchFn, module: { ...transportModule, LocalMatrixTransport: FixtureTransport } };
}

function makeClient(f) {
  return new LocalOwnerControl({ fetchFn: f.fetchFn, transportLoader: async () => f.module });
}

test("paired local status and commands use only Opal over WAN-off path", async () => {
  const f = fixture();
  const client = makeClient(f);
  const snapshot = await client.connect(token, expiry);
  assert.equal(snapshot.local, true);
  assert.equal(snapshot.devices.matrix.mac, LOCAL_MATRIX_MAC);
  assert.equal(snapshot.devices.aux.mac, LOCAL_AUX_MAC);
  assert.equal(snapshot.devices.aux.physical, "unverified");
  const ack = await client.command(token, "TUNE", { matrixBrightness: 70, auxBrightness: 235 });
  assert.equal(ack.acknowledgments.matrix.confirmed, true);
  assert.equal(ack.acknowledgments.aux.confirmed, true);
  assert.equal(ack.acknowledgments.aux.matrixProjection, 235);
  assert.equal(ack.acknowledgments.aux.brightness, 235);
  assert.equal(ack.acknowledgments.aux.physical, "unverified");
  assert.equal(f.calls.some(call => call.path === "/api/aux/control" && call.method === "POST"), true);
  assert.equal(f.sockets[0].url, "wss://cart-control.hbnightflyers.com/ws");
  assert.deepEqual(f.sockets[0].protocols, ["hbnf-owner-v1." + token]);
  assert.ok(f.calls.every(call => call.url.startsWith(LOCAL_CONTROL_ORIGIN)));
  assert.ok(f.calls.every(call => !call.url.includes(token)));
});

test("new local enrollment is bounded by the exact pairing expiry", async () => {
  const f = fixture({ sessionStatus: 404 });
  const client = makeClient(f);
  await client.connect(token, expiry);
  const enroll = f.calls.find(call => call.path === "/api/session/enroll");
  assert.ok(enroll);
  assert.deepEqual(JSON.parse(enroll.body), { action: "enroll", expiresAtEpoch: expiry });
});

test("local device reconnection revalidates identity before sending the queued control", async () => {
  const f = fixture();
  const client = makeClient(f);
  await client.connect(token, expiry);
  f.sockets[0].close();
  const ack = await client.command(token, "TUNE", { matrixBrightness: 71 });
  assert.equal(f.sockets.length, 2);
  assert.equal(ack.acknowledgments.matrix.confirmed, true);
  assert.equal(f.sockets[1].sent.some(raw => raw.includes('"matrixBrightness":71')), true);
});

test("AUX readback failure never returns a success acknowledgment", async () => {
  const f = fixture();
  const original = f.fetchFn;
  let failAux = false;
  f.fetchFn = async (url, options) => {
    if (failAux && new URL(url).pathname === "/api/aux/json/state") { failAux = false; return response(503, { error: "device_unavailable" }); }
    return original(url, options);
  };
  const client = makeClient(f);
  await client.connect(token, expiry);
  failAux = true;
  await assert.rejects(client.command(token, "TUNE", { auxBrightness: 230 }), /device_unavailable/);
});

test("AUX brightness mismatch is not acknowledged and both targets are restored", async () => {
  const f = fixture({ applyAuxControl: false });
  const client = makeClient(f);
  await client.connect(token, expiry);
  await assert.rejects(client.command(token, "TUNE", { matrixBrightness: 70, auxBrightness: 230 }), /AUX brightness readback did not match/);
  assert.equal(Number(f.owner.current.state.HBNF.auxBrightness), 255);
  assert.equal(Number(f.owner.auxState.bri), 255);
});

test("expired pairing cannot create or renew an offline session", async () => {
  const f = fixture({ sessionStatus: 404 });
  const client = makeClient(f);
  await assert.rejects(client.connect(token, Math.floor(Date.now() / 1000) - 1), /expiry is required/);
  assert.equal(f.calls.some(call => call.path === "/api/session/enroll"), false);
  assert.equal(f.sockets.length, 0);
});

test("unauthorized/revoked session fails before loading command transport", async () => {
  const f = fixture({ sessionStatus: 401 });
  let transportLoaded = false;
  const client = new LocalOwnerControl({ fetchFn: f.fetchFn, transportLoader: async () => { transportLoaded = true; return f.module; } });
  await assert.rejects(client.connect(token, expiry), /HTTP 401/);
  assert.equal(transportLoaded, false);
  assert.equal(f.sockets.length, 0);
});

test("invalid token, wrong Matrix identity, stale release, and unsupported commands fail closed", async () => {
  const f = fixture();
  const client = makeClient(f);
  await assert.rejects(client.connect("short", expiry), /paired for local control/);
  const wrong = fixture();
  wrong.fetchFn = async (url, options = {}) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/api/matrix/json/info") return response(200, { mac: "001122334455" });
    return f.fetchFn(url, options);
  };
  const wrongClient = makeClient(wrong);
  await assert.rejects(wrongClient.connect(token, expiry), /Unexpected Matrix identity/);
  assert.equal(wrong.sockets.length, 0);
  const unsupported = fixture();
  unsupported.owner.current.state.HBNF.candidate = "stale-release";
  const unsupportedClient = makeClient(unsupported);
  await assert.rejects(unsupportedClient.connect(token, expiry), /firmware is not/);
  assert.equal(unsupported.sockets[0].sent.some(x => x.includes('"matrixBrightness":1')), false);
});

test("valid release identity does not enable controls when required Matrix state fields are missing", async () => {
  const f = fixture();
  f.owner.current.state.HBNF.auxBrightness = undefined;
  const client = makeClient(f);
  await assert.rejects(client.connect(token, expiry), /readback is incomplete/);
  assert.equal(f.sockets[0].sent.some(x => x.includes('"matrixBrightness":1')), false);
});

test("local revocation clears the active socket and sends no cloud request", async () => {
  const f = fixture();
  const client = makeClient(f);
  await client.connect(token, expiry);
  await client.revoke(token);
  assert.equal(f.sockets[0].readyState, 3);
  assert.ok(f.calls.some(call => call.path === "/api/session/revoke"));
  assert.ok(f.calls.every(call => call.url.startsWith(LOCAL_CONTROL_ORIGIN)));
});

test("Opal gateway restricts origin, reads, and the bounded authenticated AUX write", async () => {
  const nginx = await readFile(new URL("../staging/coordinated-backend/opal/owner-local-control/nginx.conf.example", import.meta.url), "utf8");
  const auth = await readFile(new URL("../staging/coordinated-backend/opal/owner-local-control/auth.lua", import.meta.url), "utf8");
  assert.match(nginx, /server_name cart-control\.hbnightflyers\.com/);
  assert.match(nginx, /if \(\$http_origin != "https:\/\/hbnightflyers\.com"\)/);
  assert.match(nginx, /proxy_set_header Sec-WebSocket-Protocol ""/);
  assert.match(nginx, /add_header Sec-WebSocket-Protocol \$hbnf_ws_protocol always/);
  assert.match(nginx, /location = \/api\/aux\/control[\s\S]*?access_by_lua_file[\s\S]*?aux_command_access\.lua[\s\S]*?proxy_pass http:\/\/192\.168\.77\.11\/json\/state/);
  assert.match(nginx, /proxy_pass_request_headers off/);
  const auxLua = await readFile(new URL("../staging/coordinated-backend/opal/owner-local-control/aux_command_access.lua", import.meta.url), "utf8");
  assert.match(auxLua, /key == "bri"/);
  assert.match(auxLua, /key == "on"/);
  assert.doesNotMatch(auxLua, /proxy_pass|192\.168\.77/);
  const authLua = await readFile(new URL("../staging/coordinated-backend/opal/owner-local-control/auth.lua", import.meta.url), "utf8");
  assert.match(authLua, /hbnf_ws_protocol = "hbnf-owner-v1\." \.\. token:lower\(\)/);
  const enrollment = await readFile(new URL("../staging/coordinated-backend/opal/owner-local-control/enroll.lua", import.meta.url), "utf8");
  assert.match(enrollment, /ngx\.var\.hbnf_owner_token = token/);
  assert.match(nginx, /proxy_ssl_verify on/);
  assert.match(nginx, /location = \/__validate_paired_owner\s*\{\s*internal;/);
  assert.match(nginx, /proxy_set_body '\{"action":"verify_local_pairing"\}'/);
  assert.doesNotMatch(nginx, /location\s+~?\s*\/api\/[^\s{]*\s*\{[^}]*proxy_pass[^}]*json\/state/m);
  assert.match(auth, /require "resty\.sha256"/);
  assert.match(auth, /require "resty\.string"/);
  assert.match(auth, /digest:update\(token\)/);
  assert.match(auth, /owner_session_expired_or_revoked|session_revoked/);
  assert.match(auth, /REVOKED_DIR/);
  assert.match(auth, /expiry/);
  const edge = await readFile(new URL("../staging/coordinated-backend/hbnf-cart-control/index.ts", import.meta.url), "utf8");
  const authModel = await readFile(new URL("../staging/coordinated-backend/hbnf-cart-control/guest-command.ts", import.meta.url), "utf8");
  assert.match(edge, /if \(action === "verify_local_pairing"\)[\s\S]*?if \(!pairedDeviceAuthorized\) return response\(\{ error: "owner_pairing_required" \}, 401\);[\s\S]*?return response\(\{ paired: true \}\);/);
  assert.match(authModel, /action === "verify_local_pairing"/);
  assert.match(edge, /if \(action === "status"\)/);
  assert.doesNotMatch(edge.match(/if \(action === "status"\)[\s\S]*?if \(action === "guest_command"\)/)?.[0] || "", /pairedDeviceAuthorized/);
});

test("guarded Opal installer is fail-closed, narrowly scoped, and syntactically valid shell", async () => {
  const root = new URL("../staging/coordinated-backend/opal/owner-local-control/", import.meta.url);
  const installer = await readFile(new URL("install.sh", root), "utf8");
  const rollback = await readFile(new URL("rollback.sh", root), "utf8");
  const preflight = await readFile(new URL("preflight.sh", root), "utf8");
  assert.match(installer, /owner-network-isolation-verified/);
  assert.match(installer, /EXPECTED_OLD_TRANSPORT=a91e84c89a481739f9c47c619a1d3c5c35d690869c54159486d528d3863c746e/);
  assert.match(installer, /nginx -t/);
  assert.match(installer, /https:\/\/\$HOST\/api\/session/);
  assert.match(rollback, /CANDIDATE_TRANSPORT_SHA=/);
  assert.match(preflight, /cart-control\.hbnightflyers\.com/);
  assert.match(preflight, /resty\.sha256/);
  assert.doesNotMatch(installer + rollback, /uci\s+(?:set|commit)|iptables\s+-|reboot|sysupgrade|supabase.*deploy/i);
  for (const name of ["install.sh", "rollback.sh", "preflight.sh"]) execFileSync("sh", ["-n", fileURLToPath(new URL(name, root))]);
});

test("pairing link binds the server-issued 180-day expiry to the same local token", async () => {
  const app = await readFile(new URL("../hbnf-final-controller/hbnf-cart.js", import.meta.url), "utf8");
  assert.match(app, /#pair=\$\{encodeURIComponent\(out\.deviceToken\)\}&expires=\$\{encodeURIComponent\(out\.expiresAt\)\}/);
  assert.match(app, /DEVICE_EXPIRY_TOKEN_KEY/);
  assert.match(app, /localStorage\.setItem\(DEVICE_EXPIRY_KEY, String\(pendingPairExpiryEpoch\)\)/);
});

test("iOS 12 audit includes the new local owner module and gateway-loaded UI transport", async () => {
  const audit = await readFile(new URL("../tests/hbnf-ios12-compat-audit.mjs", import.meta.url), "utf8");
  const local = await readFile(new URL("../hbnf-final-controller/hbnf-cart-local.mjs", import.meta.url), "utf8");
  assert.match(audit, /hbnf-cart-local\.mjs/);
  assert.doesNotMatch(local, /\?\.|\?\?|\.replaceChildren\s*\(|\bglobalThis\b|\.at\s*\(/);
  assert.match(local, /wss:\/\//);
  assert.match(local, /credentials: "omit"/);
});

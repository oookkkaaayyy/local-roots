import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { LocalOwnerControl, LOCAL_CONTROL_ORIGIN, LOCAL_MATRIX_MAC, LOCAL_AUX_MAC, LOCAL_MATRIX_RELEASE } from "../hbnf-final-controller/hbnf-cart-local.mjs";
import * as transportModule from "../staging/coordinated-backend/opal/mission-control-local/local-transport.js";
import * as ownerHttpTransportModule from "../staging/coordinated-backend/opal/mission-control-local/owner-http-transport.js";

const token = "a".repeat(64);
const expiry = Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60;
const baseState = () => ({ HBNF: { candidate: LOCAL_MATRIX_RELEASE, matrixBrightness: 69, auxBrightness: 255, vibe: 1, activeVibe: 1, motion: 50, audioResponse: 50, scene: "course-flow" }, seg: [] });
function response(status, value) {
  return { status, ok: status >= 200 && status < 300, json: async () => value };
}

function fixture({ sessionStatus = 200, sessionExpiresAt = expiry, enrollmentStatus = 200, applyAuxControl = true, uvPolicyStatus = 503 } = {}) {
  const calls = [];
  const owner = { current: baseState(), auxState: { bri: 255, on: true }, applyAuxControl, applyMatrixControl: true, matrixAvailable: true };
  let currentSessionStatus = sessionStatus;
  let currentRevalidationStatus = 200;
  let firstSession = true;
  const fetchFn = async (url, options = {}) => {
    const parsed = new URL(url);
    calls.push({ url, path: parsed.pathname, method: options.method || "GET", headers: options.headers || {}, body: options.body || null });
    if (parsed.origin !== LOCAL_CONTROL_ORIGIN) throw new Error("Unexpected non-local request");
    if (parsed.pathname === "/api/session") {
      if (sessionStatus === 404 && firstSession) { firstSession = false; return response(404, { error: "owner_session_not_enrolled" }); }
      return response(currentSessionStatus, { authenticated: currentSessionStatus === 200, expiresAt: sessionExpiresAt });
    }
    if (parsed.pathname === "/api/session/enroll") return response(enrollmentStatus, enrollmentStatus === 200 ? { enrolled: true, expiresAt: expiry } : { error: "cloud_pair_validation_failed" });
    if (parsed.pathname === "/api/session/revalidate") return response(currentRevalidationStatus, currentRevalidationStatus === 200 ? { authenticated: true, cloudValidated: true, expiresAt: expiry } : { error: "cloud_pairing_revoked" });
    if (parsed.pathname === "/api/session/revoke") return response(200, { revoked: true, scope: "this_opal" });
    if (parsed.pathname === "/api/aux/uv-status") return response(200, { available: false, uvControlEnabled: false, mutationIssued: false, reason: "local_uv_readiness_unverified" });
    if (parsed.pathname === "/api/aux/uv-policy") return response(uvPolicyStatus, { error: "local_uv_policy_readiness_unverified", mutationIssued: false });
    if (parsed.pathname === "/api/matrix/json/info") return response(200, { mac: LOCAL_MATRIX_MAC });
    if (parsed.pathname === "/api/matrix/json/state") return owner.matrixAvailable ? response(200, JSON.parse(JSON.stringify(owner.current))) : response(503, { error: "device_unavailable" });
    if (parsed.pathname === "/api/matrix/control") {
      if (options.headers["X-HBNF-Device"] !== token) return response(401, { error: "paired_owner_required" });
      const body = JSON.parse(options.body || "{}");
      if (Object.keys(body).length !== 1 || !body.HBNF || Object.keys(body.HBNF).some(key => !["scene", "vibe", "matrixBrightness", "auxBrightness", "motion", "audioResponse", "palette", "overlay"].includes(key))) return response(400, { error: "invalid_matrix_command" });
      if (owner.applyMatrixControl) Object.assign(owner.current.HBNF, body.HBNF);
      return response(200, { success: true });
    }
    if (parsed.pathname === "/api/aux/json/info") return response(200, { mac: LOCAL_AUX_MAC, live: true, lm: "DDP", lip: "192.168.77.10" });
    if (parsed.pathname === "/api/aux/json/state") return response(200, JSON.parse(JSON.stringify(owner.auxState)));
    if (parsed.pathname === "/api/aux/control") {
      if (options.headers["X-HBNF-Device"] !== token) return response(401, { error: "paired_owner_required" });
      const body = JSON.parse(options.body || "{}");
      if (Object.keys(body).some(key => !["bri", "on"].includes(key))) return response(400, { error: "invalid_aux_command" });
      if (owner.applyAuxControl) Object.assign(owner.auxState, body);
      return response(200, { ok: true });
    }
    throw new Error("Unexpected local path: " + parsed.pathname);
  };
  return { calls, owner, fetchFn, setSessionStatus(value) { currentSessionStatus = value; }, setRevalidationStatus(value) { currentRevalidationStatus = value; }, module: ownerHttpTransportModule };
}

function makeClient(f, options = {}) {
  return new LocalOwnerControl({ ...options, fetchFn: f.fetchFn, transportLoader: async () => f.module });
}

test("paired local status and per-command HTTP writes use only Opal on the WAN-off path", async (t) => {
  const f = fixture();
  const client = makeClient(f);
  t.after(() => client.disconnectTransport());
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
  const matrixWrite = f.calls.find(call => call.path === "/api/matrix/control" && call.method === "POST");
  assert.ok(matrixWrite);
  assert.equal(matrixWrite.headers["X-HBNF-Device"], token);
  assert.deepEqual(JSON.parse(matrixWrite.body), { HBNF: { matrixBrightness: 70, auxBrightness: 235 } });
  assert.equal(f.calls.some(call => call.path === "/ws"), false);
  assert.equal(f.calls.some(call => call.path === "/api/matrix/json/state" && call.method === "GET"), true);
  assert.ok(f.calls.every(call => call.url.startsWith(LOCAL_CONTROL_ORIGIN)));
  assert.ok(f.calls.every(call => !call.url.includes(token)));
});

test("local UV status and policy use the authenticated Opal origin and policy remains fail-closed", async (t) => {
  const f = fixture();
  const client = makeClient(f);
  t.after(() => client.disconnectTransport());

  const status = await client.uvStatus(token);
  assert.deepEqual(status, {
    available: false,
    uvControlEnabled: false,
    mutationIssued: false,
    reason: "local_uv_readiness_unverified",
  });
  const statusRequest = f.calls.find(call => call.path === "/api/aux/uv-status");
  assert.ok(statusRequest);
  assert.equal(statusRequest.url.startsWith(LOCAL_CONTROL_ORIGIN), true);
  assert.equal(statusRequest.method, "GET");
  assert.equal(statusRequest.headers["X-HBNF-Device"], token);

  await assert.rejects(
    client.uvPolicy(token, { mode: "MANUAL", brightnessBySegment: { main: 90, short: 60 } }),
    error => error.status === 503 && error.data.mutationIssued === false,
  );
  const policyRequest = f.calls.find(call => call.path === "/api/aux/uv-policy");
  assert.ok(policyRequest);
  assert.equal(policyRequest.url.startsWith(LOCAL_CONTROL_ORIGIN), true);
  assert.equal(policyRequest.method, "POST");
  assert.equal(policyRequest.headers["X-HBNF-Device"], token);
  assert.deepEqual(JSON.parse(policyRequest.body), { mode: "MANUAL", brightnessBySegment: { main: 90, short: 60 } });
  assert.equal(f.calls.some(call => /supabase|functions\/v1/.test(call.url)), false);
});

test("id-less and documented legacy palette readbacks get a rollback alias; unknown IDs stay unconfirmed", async (t) => {
  for (const palette of [{ mode: "legacy" }, { mode: "legacy", id: "hbnf-balanced" }, { mode: "legacy", id: "copper" }, { mode: "legacy", id: "ocean" }]) {
    const f = fixture();
    f.owner.current.HBNF.palette = palette;
    const client = makeClient(f);
    t.after(() => client.disconnectTransport());
    const snapshot = await client.connect(token, expiry);
    assert.equal(snapshot.desired.state.paletteId, "legacy");
  }

  const f = fixture();
  f.owner.current.HBNF.palette = { mode: "legacy", id: "unrecognized" };
  const client = makeClient(f);
  t.after(() => client.disconnectTransport());
  const snapshot = await client.connect(token, expiry);
  assert.equal(snapshot.desired.state.paletteId, "", "unknown explicit palette IDs must not be guessed");
});

test("new local enrollment sends the pairing hint but server Lua rejects browser expiry as authority", async (t) => {
  const f = fixture({ sessionStatus: 404 });
  const client = makeClient(f);
  t.after(() => client.disconnectTransport());
  await client.connect(token, expiry);
  const enroll = f.calls.find(call => call.path === "/api/session/enroll");
  assert.ok(enroll);
  assert.deepEqual(JSON.parse(enroll.body), { action: "enroll", expiresAtEpoch: expiry });
});

test("Matrix reconnect recovers through fresh authenticated reads before the next command", async (t) => {
  const f = fixture();
  const client = makeClient(f);
  t.after(() => client.disconnectTransport());
  await client.connect(token, expiry);
  f.owner.matrixAvailable = false;
  await new Promise(resolve => setTimeout(resolve, 1600));
  f.owner.matrixAvailable = true;
  const ack = await client.command(token, "TUNE", { matrixBrightness: 71 });
  assert.equal(ack.acknowledgments.matrix.confirmed, true);
  assert.equal(f.owner.current.HBNF.matrixBrightness, 71);
});

test("periodic cloud revalidation does not interrupt HTTP control polling", async (t) => {
  const f = fixture();
  const client = makeClient(f, { localRevalidateMs: 10 });
  t.after(() => client.disconnectTransport());
  await client.connect(token, expiry);
  await new Promise(resolve => setTimeout(resolve, 35));
  assert.ok(f.calls.filter(call => call.path === "/api/session/revalidate").length >= 1);
  const ack = await client.command(token, "TUNE", { matrixBrightness: 72 });
  assert.equal(ack.acknowledgments.matrix.confirmed, true);
  assert.ok(f.calls.filter(call => call.path === "/api/matrix/json/state").length >= 2);
  client.disconnectTransport();
});

test("revoked session stops per-command writes at revalidation", async (t) => {
  const f = fixture();
  const client = makeClient(f, { localRevalidateMs: 10 });
  t.after(() => client.disconnectTransport());
  await client.connect(token, expiry);
  f.setRevalidationStatus(401);
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(f.calls.some(call => call.path === "/api/matrix/control"), false);
  assert.equal(client.transport, null);
});

test("AUX readback failure never returns a success acknowledgment", async (t) => {
  const f = fixture();
  const original = f.fetchFn;
  let failAux = false;
  f.fetchFn = async (url, options) => {
    if (failAux && new URL(url).pathname === "/api/aux/json/state") { failAux = false; return response(503, { error: "device_unavailable" }); }
    return original(url, options);
  };
  const client = makeClient(f);
  t.after(() => client.disconnectTransport());
  await client.connect(token, expiry);
  failAux = true;
  await assert.rejects(client.command(token, "TUNE", { auxBrightness: 230 }), /device_unavailable/);
});

test("AUX brightness mismatch is not acknowledged and both targets are restored", async (t) => {
  const f = fixture({ applyAuxControl: false });
  const client = makeClient(f);
  t.after(() => client.disconnectTransport());
  await client.connect(token, expiry);
  await assert.rejects(client.command(token, "TUNE", { matrixBrightness: 70, auxBrightness: 230 }), /AUX brightness readback did not match/);
  assert.equal(Number(f.owner.current.HBNF.auxBrightness), 255);
  assert.equal(Number(f.owner.auxState.bri), 255);
});

test("expired pairing cannot create or renew an offline session", async () => {
  const f = fixture({ sessionStatus: 404 });
  const client = makeClient(f);
  await assert.rejects(client.connect(token, Math.floor(Date.now() / 1000) - 1), /expiry has elapsed/);
  assert.equal(f.calls.some(call => call.path === "/api/session/enroll"), false);
  assert.equal(f.calls.some(call => call.path === "/api/matrix/control"), false);
});

test("unauthorized/revoked session fails before loading command transport", async () => {
  const f = fixture({ sessionStatus: 401 });
  let transportLoaded = false;
  const client = new LocalOwnerControl({ fetchFn: f.fetchFn, transportLoader: async () => { transportLoaded = true; return f.module; } });
  await assert.rejects(client.connect(token, expiry), /HTTP 401/);
  assert.equal(transportLoaded, false);
  assert.equal(f.calls.some(call => call.path === "/api/matrix/control"), false);
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
  assert.equal(wrong.calls.some(call => call.path === "/api/matrix/control"), false);
  const unsupported = fixture();
  unsupported.owner.current.HBNF.candidate = "stale-release";
  const unsupportedClient = makeClient(unsupported);
  await assert.rejects(unsupportedClient.connect(token, expiry), /firmware is not/);
  assert.equal(unsupported.calls.some(call => call.path === "/api/matrix/control"), false);
});

test("valid release identity does not enable controls when required Matrix state fields are missing", async () => {
  const f = fixture();
  f.owner.current.HBNF.auxBrightness = undefined;
  const client = makeClient(f);
  await assert.rejects(client.connect(token, expiry), /readback is incomplete/);
  assert.equal(f.calls.some(call => call.path === "/api/matrix/control"), false);
});

test("local revocation clears the local polling transport and sends no cloud request", async (t) => {
  const f = fixture();
  const client = makeClient(f);
  t.after(() => client.disconnectTransport());
  await client.connect(token, expiry);
  await client.revoke(token);
  assert.equal(client.transport, null);
  assert.ok(f.calls.some(call => call.path === "/api/session/revoke"));
  assert.ok(f.calls.every(call => call.url.startsWith(LOCAL_CONTROL_ORIGIN)));
});

test("Opal gateway restricts origin, reads, and the bounded authenticated AUX write", async () => {
  const nginx = await readFile(new URL("../staging/coordinated-backend/opal/owner-local-control/nginx.conf.example", import.meta.url), "utf8");
  const auth = await readFile(new URL("../staging/coordinated-backend/opal/owner-local-control/auth.lua", import.meta.url), "utf8");
  assert.match(nginx, /server_name cart-control\.hbnightflyers\.com/);
  assert.match(nginx, /if \(\$http_origin != "https:\/\/hbnightflyers\.com"\)/);
  assert.match(nginx, /listen 192\.168\.77\.1:8443 ssl/);
  assert.equal((nginx.match(/^\s*listen\s+/gm) || []).length, 1, "dedicated gateway may bind only one listener");
  assert.match(nginx, /location = \/api\/matrix\/control[\s\S]*?matrix_command_access\.lua[\s\S]*?proxy_pass http:\/\/192\.168\.77\.10\/json\/state/);
  assert.match(nginx, /location = \/mission-control-local\/owner-http-transport\.js/);
  assert.doesNotMatch(nginx, /location = \/ws/);
  assert.match(nginx, /proxy_pass_request_headers off/);
  assert.match(nginx, /location = \/api\/aux\/control[\s\S]*?access_by_lua_file[\s\S]*?aux_command_access\.lua[\s\S]*?proxy_pass http:\/\/192\.168\.77\.11\/json\/state/);
  assert.match(nginx, /proxy_pass_request_headers off/);
  const auxLua = await readFile(new URL("../staging/coordinated-backend/opal/owner-local-control/aux_command_access.lua", import.meta.url), "utf8");
  assert.match(auxLua, /key == "bri"/);
  assert.match(auxLua, /key == "on"/);
  assert.doesNotMatch(auxLua, /proxy_pass|192\.168\.77/);
  const authLua = await readFile(new URL("../staging/coordinated-backend/opal/owner-local-control/auth.lua", import.meta.url), "utf8");
  assert.match(authLua, /request_rate\("http:" \.\. remote, 120, 60\)/);
  assert.doesNotMatch(authLua, /sec-websocket-protocol|hbnf_ws_protocol/);
  const matrixLua = await readFile(new URL("../staging/coordinated-backend/opal/owner-local-control/matrix_command_access.lua", import.meta.url), "utf8");
  assert.match(matrixLua, /auth\.owner_access\(\)/);
  assert.match(matrixLua, /invalid_matrix_command/);
  assert.match(matrixLua, /unsupported_matrix_command/);
  assert.match(matrixLua, /ngx\.var\.hbnf_matrix_body = encoded/);
  assert.match(matrixLua, /#body > 2048/);
  assert.match(matrixLua, /only_keys\(input\.HBNF, keys\([\s\S]*?"scene", "vibe", "matrixBrightness", "auxBrightness", "motion", "audioResponse", "palette", "overlay"/);
  const enrollment = await readFile(new URL("../staging/coordinated-backend/opal/owner-local-control/enroll.lua", import.meta.url), "utf8");
  assert.match(enrollment, /ngx\.var\.hbnf_owner_token = token/);
  assert.match(enrollment, /local expiry = verified\.expiresAtEpoch/);
  assert.doesNotMatch(enrollment, /input\.expiresAtEpoch/);
  assert.match(enrollment, /authoritative_pair_expiry_unavailable/);
  assert.match(nginx, /proxy_ssl_verify on/);
  assert.match(nginx, /location = \/__validate_paired_owner\s*\{\s*internal;/);
  assert.match(nginx, /location = \/api\/session\/revalidate[\s\S]*?revalidate\.lua/);
  const revalidate = await readFile(new URL("../staging/coordinated-backend/opal/owner-local-control/revalidate.lua", import.meta.url), "utf8");
  assert.match(revalidate, /validation\.status == 401[\s\S]*?auth\.revoke\(token\)/);
  assert.match(revalidate, /validation\.status >=? 500|validation\.status < 500/);
  assert.match(revalidate, /cloudValidated = false/);
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
  assert.match(edge, /if \(action === "verify_local_pairing"\)[\s\S]*?if \(!pairedDeviceAuthorized \|\| !pairedDeviceSessionHash\) return response\(\{ error: "owner_pairing_required" \}, 401\);[\s\S]*?readAuthoritativeDeviceExpiry\(service, pairedDeviceSessionHash\)[\s\S]*?if \(expiresAtEpoch === null\) return response\(\{ error: "authoritative_pair_expiry_unavailable" \}, 503\);[\s\S]*?return response\(\{ paired: true, expiresAtEpoch \}\);/);
  assert.match(edge, /if \(pairedDeviceAuthorized\) pairedDeviceSessionHash = digest;/);
  const expiryMigration = await readFile(new URL("../supabase/migrations/20261026160033_hbnf_cart_device_session_expiry.sql", import.meta.url), "utf8");
  assert.match(expiryMigration, /s\.active is true[\s\S]*?s\.expires_at > clock_timestamp\(\)/);
  assert.match(expiryMigration, /revoke all on function public\.hbnf_cart_device_session_expiry\(text\) from public, anon, authenticated/);
  assert.match(expiryMigration, /grant execute on function public\.hbnf_cart_device_session_expiry\(text\) to service_role/);
  assert.match(authModel, /action === "verify_local_pairing"/);
  assert.match(edge, /if \(action === "status"\)/);
  assert.doesNotMatch(edge.match(/if \(action === "status"\)[\s\S]*?if \(action === "guest_command"\)/)?.[0] || "", /pairedDeviceAuthorized/);
});

test("guarded Opal installer uses an isolated :8443 Nginx instance with non-root request workers", async () => {
  const root = new URL("../staging/coordinated-backend/opal/owner-local-control/", import.meta.url);
  const installer = await readFile(new URL("install.sh", root), "utf8");
  const rollback = await readFile(new URL("rollback.sh", root), "utf8");
  const preflight = await readFile(new URL("preflight.sh", root), "utf8");
  const nginx = await readFile(new URL("nginx.conf.example", root), "utf8");
  const dedicated = await readFile(new URL("dedicated-nginx.conf.example", root), "utf8");
  const service = await readFile(new URL("hbnf-owner-local-control.init", root), "utf8");
  const sourceBase = JSON.parse(await readFile(new URL("SOURCE_BASE.json", root), "utf8"));
  assert.match(installer, /EXPECTED_OLD_TRANSPORT=51e4f03ff1ffc9d8cece0a3e6f14fefac77e642fe1a4eced95ca749d777f676a/);
  assert.match(installer, /BACKUP=\/root\/hbnf-owner-local-control\.rollback-v1\.0\.13/);
  assert.equal(sourceBase.opal_rollback_transport_sha256, "51e4f03ff1ffc9d8cece0a3e6f14fefac77e642fe1a4eced95ca749d777f676a");
  assert.equal(sourceBase.opal_rollback_transport_source_commit, sourceBase.base_commit);
  assert.equal(sourceBase.owner_accepted_network_exposure.owner_accepted, true);
  assert.equal(sourceBase.owner_accepted_network_exposure.observation_status, "NOT_TESTED");
  assert.equal(sourceBase.owner_accepted_network_exposure.isolation_test_required_for_admission, false);
  assert.match(sourceBase.owner_accepted_network_exposure.consequences[0], /bypass Owner\/Guest PWA/);
  assert.doesNotMatch(installer, /owner-network-isolation-verified/);
  const rollbackCapture = installer.slice(installer.indexOf('cp -p "$TARGET" "$BACKUP/local-transport.js"'), installer.indexOf("rollback_now(){"));
  assert.match(rollbackCapture, /backup_transport_sha=\$\(sha256sum "\$BACKUP\/local-transport\.js"/);
  assert.match(rollbackCapture, /\[ "\$backup_transport_sha" = "\$EXPECTED_OLD_TRANSPORT" \]/);
  assert.match(rollbackCapture, /backup_rollback_sha=\$\(sha256sum "\$BACKUP\/rollback\.sh"/);
  assert.match(rollbackCapture, /\[ "\$backup_rollback_sha" = "\$package_rollback_sha" \]/);
  assert.match(installer, /TARGET=\/www\/mission-control-local\/local-transport\.js/);
  assert.match(installer, /OWNER_HTTP_TARGET=\/www\/mission-control-local\/owner-http-transport\.js/);
  assert.match(installer, /\[ ! -e "\$OWNER_HTTP_TARGET" \]/);
  assert.match(installer, /cp -p "\$TARGET" "\$BACKUP\/local-transport\.js"/);
  assert.match(preflight, /EXPECTED_MATRIX_RELEASE=hbnf-cart2-phase2-r6-skins-readable-20261014/);
  assert.match(preflight, /@\.release_id/);
  assert.match(preflight, /\[ "\$matrix_leds" = "534" \]/);
  assert.match(preflight, /matrix_seg0_start/);
  assert.match(preflight, /matrix_seg0_stop/);
  assert.match(preflight, /matrix_seg0_start_y/);
  assert.match(preflight, /matrix_seg0_stop_y/);
  assert.match(preflight, /matrix_seg1_start/);
  assert.match(preflight, /matrix_seg1_stop/);
  assert.match(preflight, /matrix_topology_valid .*\$aux_leds/);
  assert.match(preflight, /worker_uid.*-ne 0/);
  assert.match(preflight, /nobody/);
  assert.doesNotMatch(preflight, /owner-network-isolation-verified/);
  assert.match(preflight, /OWNER_ACCEPTED_NETWORK_EXPOSURE/);
  assert.doesNotMatch(preflight, /negative control test from an unpaired guest client/);
  assert.match(installer, /chown "\$worker_uid:\$worker_gid" "\$STATE\/sessions"/);
  assert.match(installer, /STATE=\/etc\/hbnf-local-control-state/);
  assert.match(rollback, /STATE=\/etc\/hbnf-local-control-state/);
  assert.match(installer, /\/usr\/sbin\/nginx -t -c "\$CONF/);
  assert.match(installer, /https:\/\/\$HOST:8443\/api\/session/);
  assert.match(installer, /revalidate\.lua/);
  assert.match(rollback, /CANDIDATE_TRANSPORT_SHA=/);
  assert.match(rollback, /TARGET=\/www\/mission-control-local\/local-transport\.js/);
  assert.match(rollback, /OWNER_HTTP_TARGET=\/www\/mission-control-local\/owner-http-transport\.js/);
  assert.match(rollback, /mv "\$TARGET\.rollback" "\$TARGET"/);
  assert.match(rollback, /rm -f "\$OWNER_HTTP_TARGET"/);
  assert.match(preflight, /cart-control\.hbnightflyers\.com/);
  assert.match(preflight, /resty\.sha256/);
  assert.match(nginx, /listen 192\.168\.77\.1:8443 ssl/);
  assert.match(preflight, /GATEWAY_LAN_IP=192\.168\.77\.1/);
  assert.match(preflight, /WAN input policy must be DROP or REJECT/);
  assert.match(preflight, /explicit IPv[46] WAN accept rule for TCP 8443 exists/);
  assert.match(dedicated, /user nobody nogroup;/);
  assert.match(dedicated, /worker_processes 1;/);
  assert.match(dedicated, /pid \/var\/run\/hbnf-owner-local-control-nginx\.pid;/);
  assert.match(nginx, /lua_shared_dict hbnf_owner_sessions 32k;/);
  assert.match(dedicated, /proxy_temp_path \/etc\/hbnf-local-control-state\/tmp\/proxy;/);
  assert.match(service, /USE_PROCD=1/);
  assert.match(service, /procd_set_param respawn/);
  assert.match(service, /procd_set_param command "\$NGINX" -c "\$CONF" -g 'daemon off;'/);
  assert.doesNotMatch(service, /procd_set_param user nobody/);
  assert.match(installer, /if \[ "\$stop_failed" -ne 0 \] \|\| \[ "\$disable_failed" -ne 0 \]; then[\s\S]*?Preserving candidate files, state, and rollback backup[\s\S]*?return 0/);
  assert.match(installer, /Dedicated service is stopped and disabled[\s\S]*?rm -rf "\$BASE\/lua" "\$STATE" "\$LOG_DIR"/);
  assert.doesNotMatch(installer + rollback, /\/etc\/nginx\/nginx\.conf|\/etc\/nginx\/conf\.d|nginx -s reload(?!.*\$CONF)|uci\s+(?:set|commit)|iptables\s+-|reboot|sysupgrade|supabase.*deploy/i);
  assert.match(rollback, /\$SERVICE" stop/);
  assert.match(rollback, /\$SERVICE" disable/);
  assert.match(rollback, /EXPECTED_ROLLBACK_TRANSPORT_SHA=51e4f03ff1ffc9d8cece0a3e6f14fefac77e642fe1a4eced95ca749d777f676a/);
  assert.match(rollback, /BACKUP=\/root\/hbnf-owner-local-control\.rollback-v1\.0\.13/);
  for (const name of ["install.sh", "rollback.sh", "preflight.sh", "matrix_topology.sh", "hbnf-owner-local-control.init"]) execFileSync("sh", ["-n", fileURLToPath(new URL(name, root))]);
});

test("Owner PWA keeps the isolated HTTPS gateway and adds the accepted Opal-local transport", async () => {
  const local = await readFile(new URL("../hbnf-final-controller/hbnf-cart-local.mjs", import.meta.url), "utf8");
  assert.match(local, /LOCAL_CONTROL_ORIGIN = "https:\/\/cart-control\.hbnightflyers\.com:8443"/);
  assert.match(local, /"\/api\/matrix\/control"/);
  assert.match(local, /"\/api\/matrix\/json\/state"/);
  assert.match(local, /owner-http-transport\.js/);
  assert.match(local, /if \(this\.opalDirect\) return this\.connectOpalDirect\(\)/);
  assert.match(local, /ws:\/\/" \+ LOCAL_MATRIX_IP \+ "\/ws/);
  assert.match(local, /waitForFreshState\(this\.transport, beforeVersion\)/);
});

test("the test-installed Opal Mission Control WebSocket transport remains supported by the updated package", async () => {
  const local = await readFile(new URL("../staging/coordinated-backend/opal/mission-control-local/local-transport.js", import.meta.url), "utf8");
  assert.match(local, /export function ownerWebSocketProtocol/);
  assert.match(local, /export class LocalMatrixTransport/);
  assert.match(local, /transport\.socket\.send\(JSON\.stringify\(\{HBNF:patch\}\)\)/);
  assert.match(local, /type === "VIBE_AUTO"/);
  assert.match(local, /kind==="scoreboard"/);
});

test("Matrix preflight accepts the live 32x16 2D geometry and rejects truncated layouts", async () => {
  const root = new URL("../staging/coordinated-backend/opal/owner-local-control/", import.meta.url);
  const helper = fileURLToPath(new URL("matrix_topology.sh", root));
  const valid = ["534", "0", "32", "0", "16", "512", "534", "22"];
  const check = (values) => {
    const result = spawnSync("sh", ["-c", '. "$1"; shift; matrix_topology_valid "$@"', "sh", helper, ...values], { encoding: "utf8" });
    return result.status;
  };
  assert.equal(check(valid), 0, "confirmed 32x16 Matrix plus 22-pixel companion must pass");
  for (const [index, value] of [[0, "533"], [2, "31"], [3, "1"], [4, "15"], [4, "17"], [5, "511"], [6, "533"], [7, "21"]]) {
    const truncated = [...valid];
    truncated[index] = value;
    assert.notEqual(check(truncated), 0, `truncated topology at argument ${index} must fail`);
  }
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
  assert.match(audit, /owner-http-transport\.js/);
  const ownerHttp = await readFile(new URL("../staging/coordinated-backend/opal/mission-control-local/owner-http-transport.js", import.meta.url), "utf8");
  assert.doesNotMatch(ownerHttp, /\?\.|\?\?|\.replaceChildren\s*\(|\bglobalThis\b|\.at\s*\(/);
  assert.doesNotMatch(local, /\?\.|\?\?|\.replaceChildren\s*\(|\bglobalThis\b|\.at\s*\(/);
  assert.doesNotMatch(local, /wss:\/\//);
  assert.match(local, /credentials: "omit"/);
  assert.match(local, /scheduleLocalRevalidation/);
  assert.match(local, /localRevalidateMs/);
  const app = await readFile(new URL("../hbnf-final-controller/hbnf-cart.js", import.meta.url), "utf8");
  assert.match(app, /visibilitychange[\s\S]*?disconnectTransport\(\)/);
  assert.match(app, /pagehide[\s\S]*?disconnectTransport\(\)/);
});

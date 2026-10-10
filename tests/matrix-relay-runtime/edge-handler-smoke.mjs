import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import net from 'node:net';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(testDir, '../..');
const deno = process.env.DENO_BIN || 'deno';
const token = '0123456789abcdef0123456789abcdef0123456789abcdef';
const challengeId = '8db738e3-2bcb-4581-a567-066501fbb943';
const candidate = 'hbnf-cart2-phase2-offline-wow-r6-audio-cache-20261010';
const mac = '70:4b:ca:5b:34:5c';
const rpcCalls = [];
let challenge = null;
let expectedProjection = null;
const desired = { state: {
  power: 'on', selectedVibe: 'groove', sceneId: 'field-mix', paletteId: 'hbnf-balanced',
  devices: { matrix: { enabled: true, brightness: 44 }, aux: { enabled: true, brightness: 38 } },
  tuning: { motion: 61, audioResponse: 73, micSensitivity: 210 }, overlays: []
} };
const fence = { active: true, epoch: 7, release_id: 'r6' };

const db = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  const route = new URL(req.url, 'http://localhost').pathname;
  if (!route.startsWith('/rest/v1/rpc/')) { res.writeHead(404).end(); return; }
  const rpc = route.slice('/rest/v1/rpc/'.length);
  const params = body ? JSON.parse(body) : null;
  rpcCalls.push({ rpc, params });
  let value;
  if (rpc === 'hbnf_cart_get_context') value = { desired: { revision: 51, state: desired.state }, fence };
  else if (rpc === 'hbnf_cart_matrix_relay_issue') {
    expectedProjection = params.p_expected_state;
    challenge = {
      challenge_id: challengeId, desired_revision: 51, fence_epoch: 7, release_id: 'r6',
      expires_at: new Date(Date.now() + 20000).toISOString(), expected_state: params.p_expected_state,
      wled_payload: params.p_wled_payload, apply_authorized_at: null, consumed_at: null
    };
    value = challengeId;
  } else if (rpc === 'hbnf_cart_matrix_relay_get') value = challenge;
  else if (rpc === 'hbnf_cart_matrix_relay_authorize_apply') {
    if (challenge) challenge.apply_authorized_at = new Date().toISOString();
    value = Boolean(challenge);
  } else if (rpc === 'hbnf_cart_matrix_relay_confirm') {
    value = JSON.stringify(params.p_verified_state) === JSON.stringify(expectedProjection);
    if (value && challenge) challenge.consumed_at = new Date().toISOString();
  } else { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(value));
});
db.listen(0, '127.0.0.1'); await once(db, 'listening');
const dbPort = db.address().port;
const probe = net.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
const relayPort = probe.address().port; await new Promise(resolve => probe.close(resolve));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hbnf-edge-smoke-'));
const fnDir = path.join(temp, 'hbnf-cart-control'); fs.mkdirSync(fnDir, { recursive: true });
const modulePath = path.join(repo, 'staging/coordinated-backend/hbnf-cart-control/matrix-relay.ts');
const wrapper = path.join(fnDir, 'smoke.ts');
fs.writeFileSync(wrapper, `import { handleMatrixRelay } from ${JSON.stringify(new URL(`file://${modulePath}`).href)};\nDeno.serve({hostname:'127.0.0.1',port:${relayPort}}, handleMatrixRelay);\n`);
const child = spawn(deno, ['run', '--no-check', `--allow-net=127.0.0.1:${relayPort},127.0.0.1:${dbPort}`, '--allow-env=SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,HBNF_MATRIX_RELAY_TOKEN,HBNF_MATRIX_RELAY_ID', wrapper], {
  env: { ...process.env, SUPABASE_URL: `http://127.0.0.1:${dbPort}`, SUPABASE_SERVICE_ROLE_KEY: 'test-only-service-role', HBNF_MATRIX_RELAY_TOKEN: token, HBNF_MATRIX_RELAY_ID: 'opal-hbnf-cart' }, stdio: ['ignore', 'pipe', 'pipe']
});
let logs = ''; child.stdout.on('data', b => logs += b.toString()); child.stderr.on('data', b => logs += b.toString());
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error('Deno Edge handler exited early: ' + logs);
    try { const r = await fetch(`http://127.0.0.1:${relayPort}/`, { method: 'GET' }); if (r.status === 405) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(ready, 'Deno Edge handler did not become ready');
  const unauth = await fetch(`http://127.0.0.1:${relayPort}/`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hbnf-relay-id': 'opal-hbnf-cart' }, body: JSON.stringify({ op: 'next' }) });
  assert.equal(unauth.status, 401); assert.equal(rpcCalls.length, 0, 'unauthorized request reached PostgREST');
  const next = await fetch(`http://127.0.0.1:${relayPort}/`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'x-hbnf-relay-id': 'opal-hbnf-cart' }, body: JSON.stringify({ op: 'next', relayId: 'opal-hbnf-cart', matrixMac: mac, candidate }) });
  assert.equal(next.status, 200);
  const issued = await next.json(); assert.equal(issued.challengeId, challengeId); assert.equal(issued.cartRevision, 51); assert.equal(issued.fenceEpoch, 7);
  const issueCall = rpcCalls.find(x => x.rpc === 'hbnf_cart_matrix_relay_issue');
  assert.equal(issueCall.params.p_cart_id, 'hbnf-cart'); assert.equal(issueCall.params.p_matrix_mac, mac); assert.equal(issueCall.params.p_candidate, candidate);
  const makeForm = vibe => {
    const form = new FormData(); form.append('op', 'check'); form.append('relayId', 'opal-hbnf-cart'); form.append('challengeId', challengeId);
    const state = { on: expectedProjection.on, bri: expectedProjection.bri, seg: expectedProjection.segments, HBNF: { ...expectedProjection.hbnf, vibe } };
    const info = { mac: '704bca5b345c', ver: '0.16.0', leds: { count: 534 } };
    form.append('info', new Blob([JSON.stringify(info)], { type: 'application/json' }), 'info.json');
    form.append('state', new Blob([JSON.stringify(state)], { type: 'application/json' }), 'state.json'); return form;
  };
  const mismatch = await fetch(`http://127.0.0.1:${relayPort}/`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'x-hbnf-relay-id': 'opal-hbnf-cart' }, body: makeForm(0) });
  assert.equal(mismatch.status, 409); const apply = await mismatch.json();
  assert.equal(apply.status, 'apply_required'); assert.ok(apply.wledPayload);
  assert.equal(rpcCalls.filter(x => x.rpc === 'hbnf_cart_matrix_relay_authorize_apply').length, 1);
  const match = await fetch(`http://127.0.0.1:${relayPort}/`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'x-hbnf-relay-id': 'opal-hbnf-cart' }, body: makeForm(expectedProjection.hbnf.vibe) });
  assert.equal(match.status, 200); const confirmed = await match.json();
  assert.equal(confirmed.commandApplicationConfirmed, true); assert.equal(confirmed.cartRevision, 51); assert.equal(confirmed.fenceEpoch, 7);
  const confirmCall = rpcCalls.find(x => x.rpc === 'hbnf_cart_matrix_relay_confirm');
  assert.deepEqual(confirmCall.params.p_verified_state, expectedProjection);
  console.log('Deno Edge handler integration PASS: loopback-only, unauthorized request causes zero RPCs, fixed identity challenge, mismatch allows one apply, exact readback confirms revision/fence.');
} finally {
  child.kill('SIGTERM'); await Promise.race([once(child, 'exit'), new Promise(r => setTimeout(r, 3000))]);
  await new Promise(resolve => db.close(resolve)); fs.rmSync(temp, { recursive: true, force: true });
}

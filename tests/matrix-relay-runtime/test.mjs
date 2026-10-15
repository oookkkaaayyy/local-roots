import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
const migrationPaths = [
  '../../staging/coordinated-backend/migrations/20261009190000_hbnf_matrix_relay_confirmation.sql',
  '../../staging/coordinated-backend/migrations/20261011235000_hbnf_matrix_relay_incremental_controls_pin.sql'
].map(path => fileURLToPath(new URL(path, import.meta.url)));
const db = new PGlite();
const controlState = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../../config/HBNF_CONTROL_STATE.json', import.meta.url)), 'utf8'));
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA hbnf_internal;
CREATE TABLE hbnf_internal.cart_desired_state(cart_id text primary key, revision bigint not null, state jsonb not null);
CREATE TABLE hbnf_internal.cart_actuator_fence(cart_id text primary key, epoch bigint not null, release_id text not null, active boolean not null);
CREATE TABLE hbnf_internal.observed(cart_id text, device_id text, online boolean, status text, desired_revision bigint, fence_epoch bigint, release_id text, boot_id text, reported jsonb, observed_at timestamptz);
CREATE FUNCTION public.hbnf_cart_upsert_observed(text,text,boolean,text,bigint,bigint,text,text,jsonb,timestamptz) RETURNS void LANGUAGE sql AS $$ INSERT INTO hbnf_internal.observed VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) $$;
INSERT INTO hbnf_internal.cart_desired_state VALUES('hbnf-cart',51,'{}');
INSERT INTO hbnf_internal.cart_actuator_fence VALUES('hbnf-cart',7,'r6',true);
`);
for (const migrationPath of migrationPaths) await db.exec(fs.readFileSync(migrationPath, 'utf8'));
const expected = { matrixMac: '70:4b:ca:5b:34:5c', candidate: 'hbnf-cart2-phase2-r6-skins-readable-20261014', on: true, hbnf: { candidate: 'hbnf-cart2-phase2-r6-skins-readable-20261014' }, aux:{mac:'8c:94:df:55:c3:4c',ip:'192.168.77.11',bri:38,live:true,lm:'DDP',lip:'192.168.77.10',lor:0,forceMaxBrightness:false} };
const payload = { matrix: {on:true}, aux:{bri:38} };
async function issue(state = expected, rev = 51, fence = 7, candidate = expected.candidate, releaseId = 'r6') {
  return (await db.query(`select public.hbnf_cart_matrix_relay_issue($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10) as id`, ['opal-hbnf-cart','hbnf-cart',rev,fence,releaseId,'70:4b:ca:5b:34:5c',candidate,JSON.stringify(state),JSON.stringify(payload),20])).rows[0].id;
}
const challenge = await issue();
await assert.rejects(issue(expected, 51, 7, 'hbnf-cart2-phase2-r6-incremental-controls-20261011'), /invalid_relay_challenge/, 'stale R6 release must fail closed');
await assert.rejects(issue(expected, 51, 7, 'hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1'), /invalid_relay_challenge/, 'R4 release must fail the R6 candidate pin');
assert.equal((await db.query(`select public.hbnf_cart_matrix_relay_get($1,'opal-hbnf-cart') as value`, [challenge])).rows[0].value.desired_revision, 51);
assert.equal((await db.query(`select public.hbnf_cart_matrix_relay_authorize_apply($1,'opal-hbnf-cart') as ok`, [challenge])).rows[0].ok, true);
assert.equal((await db.query(`select public.hbnf_cart_matrix_relay_authorize_apply($1,'opal-hbnf-cart') as ok`, [challenge])).rows[0].ok, false);
assert.equal((await db.query(`select public.hbnf_cart_matrix_relay_confirm($1,'opal-hbnf-cart',$2::jsonb,$3::jsonb) as ok`, [challenge,JSON.stringify({...expected,on:false}),JSON.stringify({})])).rows[0].ok, false);
assert.equal((await db.query(`select public.hbnf_cart_matrix_relay_confirm($1,'opal-hbnf-cart',$2::jsonb,$3::jsonb) as ok`, [challenge,JSON.stringify(expected),JSON.stringify({deviceUptimeSec:1})])).rows[0].ok, true);
assert.equal((await db.query(`select public.hbnf_cart_matrix_relay_confirm($1,'opal-hbnf-cart',$2::jsonb,$3::jsonb) as ok`, [challenge,JSON.stringify(expected),JSON.stringify({})])).rows[0].ok, false);
assert.equal((await db.query(`select count(*)::int as n from hbnf_internal.observed`)).rows[0].n, 2, 'Matrix and AUX have separate observations');
assert.deepEqual((await db.query(`select device_id from hbnf_internal.observed order by device_id`)).rows.map(x=>x.device_id), ['aux','matrix']);
const stale = await issue(); await db.exec(`update hbnf_internal.cart_desired_state set revision=52 where cart_id='hbnf-cart'`);
assert.equal((await db.query(`select public.hbnf_cart_matrix_relay_get($1,'opal-hbnf-cart') as value`, [stale])).rows[0].value, null);
assert.equal((await db.query(`select public.hbnf_cart_matrix_relay_confirm($1,'opal-hbnf-cart',$2::jsonb,$3::jsonb) as ok`, [stale,JSON.stringify(expected),JSON.stringify({})])).rows[0].ok, false);
assert.equal((await db.query(`select count(*)::int as n from hbnf_internal.observed`)).rows[0].n, 2);
await assert.rejects(issue({...expected,matrixMac:'00:11:22:33:44:55'}), /invalid_relay_challenge/);
const expired = await issue(expected, 52, 7);
await db.exec(`update hbnf_internal.cart_matrix_relay_challenges set expires_at=clock_timestamp()-interval '1 second' where challenge_id='${expired}'`);
assert.equal((await db.query(`select public.hbnf_cart_matrix_relay_get($1,'opal-hbnf-cart') as value`, [expired])).rows[0].value, null);
let denied = false;
try { await db.exec(`set role anon; select public.hbnf_cart_matrix_relay_issue('opal-hbnf-cart','hbnf-cart',52,7,'r6','70:4b:ca:5b:34:5c','${expected.candidate}','{}','{}',20);`); } catch { denied = true; }
finally { await db.exec('reset role'); }
assert.equal(denied, true, 'anon role must not execute challenge RPC');
assert.equal(controlState.live_mutation_authorized, false);
assert.equal(controlState.installed_release, expected.candidate, 'source binding follows the last recorded release, not a live claim');
assert.equal(controlState.installed_firmware_sha256, 'de38221f2f9d7e9a03076185777266dc5cfd3a088b449530531dfcc1f7ed072d');
const closedFence = controlState.coordinated_r6_live_release_authorization.backend_transaction_progress;
assert.equal(closedFence.command_fence_active, false, 'offline work must not activate the actuator fence');
assert.equal(closedFence.opal_relay_active, false, 'offline work must not activate the relay');
await db.query(`update hbnf_internal.cart_actuator_fence set active=false where cart_id='hbnf-cart'`);
await assert.rejects(issue(expected, 51, 7, expected.candidate, 'r6'), /stale_fence_or_state/, 'closed actuator fence rejects otherwise valid command');
console.log('Matrix relay PostgreSQL migration tests PASS: issue/get, stale revision/fence, one-use apply, exact readback, mismatch, replay, expiry, wrong identity, anon execute denied, closed R4 fence rejects failed R6');
await db.close();

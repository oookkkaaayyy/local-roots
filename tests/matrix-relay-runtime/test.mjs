import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
const migrationPath = fileURLToPath(new URL('../../staging/coordinated-backend/migrations/20261009190000_hbnf_matrix_relay_confirmation.sql', import.meta.url));
const db = new PGlite();
const migration = fs.readFileSync(migrationPath, 'utf8');
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
await db.exec(migration);
const expected = { matrixMac: '70:4b:ca:5b:34:5c', candidate: 'hbnf-cart2-phase2-offline-wow-r6-audio-cache-20261010', on: true, hbnf: { candidate: 'hbnf-cart2-phase2-offline-wow-r6-audio-cache-20261010' } };
const payload = { on: true };
async function issue(state = expected, rev = 51, fence = 7, candidate = expected.candidate) {
  return (await db.query(`select public.hbnf_cart_matrix_relay_issue($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10) as id`, ['opal-hbnf-cart','hbnf-cart',rev,fence,'r6','70:4b:ca:5b:34:5c',candidate,JSON.stringify(state),JSON.stringify(payload),20])).rows[0].id;
}
const challenge = await issue();
await assert.rejects(issue(expected, 51, 7, 'hbnf-cart2-phase2-offline-wow-r6-integrated-20261009'), /invalid_relay_challenge/, 'stale R6 release must fail closed');
assert.equal((await db.query(`select public.hbnf_cart_matrix_relay_get($1,'opal-hbnf-cart') as value`, [challenge])).rows[0].value.desired_revision, 51);
assert.equal((await db.query(`select public.hbnf_cart_matrix_relay_authorize_apply($1,'opal-hbnf-cart') as ok`, [challenge])).rows[0].ok, true);
assert.equal((await db.query(`select public.hbnf_cart_matrix_relay_authorize_apply($1,'opal-hbnf-cart') as ok`, [challenge])).rows[0].ok, false);
assert.equal((await db.query(`select public.hbnf_cart_matrix_relay_confirm($1,'opal-hbnf-cart',$2::jsonb,$3::jsonb) as ok`, [challenge,JSON.stringify({...expected,on:false}),JSON.stringify({})])).rows[0].ok, false);
assert.equal((await db.query(`select public.hbnf_cart_matrix_relay_confirm($1,'opal-hbnf-cart',$2::jsonb,$3::jsonb) as ok`, [challenge,JSON.stringify(expected),JSON.stringify({deviceUptimeSec:1})])).rows[0].ok, true);
assert.equal((await db.query(`select public.hbnf_cart_matrix_relay_confirm($1,'opal-hbnf-cart',$2::jsonb,$3::jsonb) as ok`, [challenge,JSON.stringify(expected),JSON.stringify({})])).rows[0].ok, false);
assert.equal((await db.query(`select count(*)::int as n from hbnf_internal.observed`)).rows[0].n, 1);
const stale = await issue(); await db.exec(`update hbnf_internal.cart_desired_state set revision=52 where cart_id='hbnf-cart'`);
assert.equal((await db.query(`select public.hbnf_cart_matrix_relay_get($1,'opal-hbnf-cart') as value`, [stale])).rows[0].value, null);
assert.equal((await db.query(`select public.hbnf_cart_matrix_relay_confirm($1,'opal-hbnf-cart',$2::jsonb,$3::jsonb) as ok`, [stale,JSON.stringify(expected),JSON.stringify({})])).rows[0].ok, false);
assert.equal((await db.query(`select count(*)::int as n from hbnf_internal.observed`)).rows[0].n, 1);
await assert.rejects(issue({...expected,matrixMac:'00:11:22:33:44:55'}), /invalid_relay_challenge/);
const expired = await issue(expected, 52, 7);
await db.exec(`update hbnf_internal.cart_matrix_relay_challenges set expires_at=clock_timestamp()-interval '1 second' where challenge_id='${expired}'`);
assert.equal((await db.query(`select public.hbnf_cart_matrix_relay_get($1,'opal-hbnf-cart') as value`, [expired])).rows[0].value, null);
let denied = false;
try { await db.exec(`set role anon; select public.hbnf_cart_matrix_relay_issue('opal-hbnf-cart','hbnf-cart',52,7,'r6','70:4b:ca:5b:34:5c','${expected.candidate}','{}','{}',20);`); } catch { denied = true; }
finally { await db.exec('reset role'); }
assert.equal(denied, true, 'anon role must not execute challenge RPC');
console.log('Matrix relay PostgreSQL migration tests PASS: issue/get, stale revision/fence, one-use apply, exact readback, mismatch, replay, expiry, wrong identity, anon execute denied');
await db.close();

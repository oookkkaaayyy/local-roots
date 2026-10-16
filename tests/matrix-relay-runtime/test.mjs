import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
const migrationPaths = [
  '../../staging/coordinated-backend/migrations/20261009190000_hbnf_matrix_relay_confirmation.sql',
  '../../staging/coordinated-backend/migrations/20261011235000_hbnf_matrix_relay_incremental_controls_pin.sql',
  '../../staging/coordinated-backend/migrations/20261016192522_hbnf_matrix_relay_confirm_status_constraint_compat.sql',
  '../../staging/coordinated-backend/rollback/20261016192522_hbnf_matrix_relay_confirm_status_constraint_compat.sql',
  '../../staging/coordinated-backend/rollback/20261011235000_hbnf_matrix_relay_incremental_controls_pin.sql'
].map(path => fileURLToPath(new URL(path, import.meta.url)));
const db = new PGlite();
const controlState = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../../config/HBNF_CONTROL_STATE.json', import.meta.url)), 'utf8'));
const legacyState = {vibe:'mellow',selectedVibe:null,vibeMode:'manual',sceneId:'field-mix',paletteId:'ocean',power:'on',devices:{matrix:{enabled:true,brightness:113},aux:{enabled:true,brightness:138}},tuning:{motion:50,audioResponse:36,micSensitivity:255},overlays:[]};
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA hbnf_internal;
CREATE TABLE hbnf_internal.cart_desired_state(cart_id text primary key, revision bigint not null, state jsonb not null);
CREATE TABLE hbnf_internal.cart_actuator_fence(cart_id text primary key, epoch bigint not null, release_id text not null, active boolean not null);
CREATE TABLE hbnf_internal.observed(cart_id text, device_id text, online boolean, status text CHECK (status IN ('online','offline','off','failed','stale')), desired_revision bigint, fence_epoch bigint, release_id text, boot_id text, reported jsonb, observed_at timestamptz);
CREATE FUNCTION public.hbnf_cart_upsert_observed(text,text,boolean,text,bigint,bigint,text,text,jsonb,timestamptz) RETURNS void LANGUAGE sql AS $$ INSERT INTO hbnf_internal.observed VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) $$;
INSERT INTO hbnf_internal.cart_desired_state VALUES('hbnf-cart',51,'${JSON.stringify(legacyState)}');
INSERT INTO hbnf_internal.cart_actuator_fence VALUES('hbnf-cart',7,'r6',false);
`);
for (const migrationPath of migrationPaths.slice(0,2)) await db.exec(fs.readFileSync(migrationPath, 'utf8'));
const observed = {matrixMac:'70:4b:ca:5b:34:5c',candidate:'hbnf-cart2-phase2-r6-skins-readable-20261014',on:true,bri:255,
 segments:[{id:0,on:true,bri:255,fx:142},{id:1,start:512,stop:534,on:true,bri:255,fx:142}],
 hbnf:{schema:'foundation-v1',candidate:'hbnf-cart2-phase2-r6-skins-readable-20261014',scene:0,vibe:5,motion:50,audioResponse:50,matrixBrightness:46,auxBrightness:46,palette:{mode:'legacy'},overlayId:null},
 aux:{mac:'8c:94:df:55:c3:4c',ip:'192.168.77.11',on:true,bri:255,live:true,lm:'DDP',lip:'192.168.77.10',lor:0,forceMaxBrightness:false}};
const wrongMasterBrightness=structuredClone(observed);wrongMasterBrightness.bri=254;
await assert.rejects(db.query(`select public.hbnf_cart_matrix_relay_bootstrap('opal-hbnf-cart','hbnf-cart',51,7,'r6',$1,$2::jsonb)`,[observed.candidate,JSON.stringify(wrongMasterBrightness)]),/bootstrap_readback_identity_or_shape_invalid/,'bootstrap refuses a Matrix global-brightness state the writer would otherwise change');
const malformedSegments=structuredClone(observed);malformedSegments.segments={};
await assert.rejects(db.query(`select public.hbnf_cart_matrix_relay_bootstrap('opal-hbnf-cart','hbnf-cart',51,7,'r6',$1,$2::jsonb)`,[observed.candidate,JSON.stringify(malformedSegments)]),/bootstrap_readback_identity_or_shape_invalid/,'malformed segment shape fails closed without array parsing');
const malformedPalette=structuredClone(observed);malformedPalette.hbnf.palette={mode:'solid',rgb:{r:1,g:2,b:3}};
await assert.rejects(db.query(`select public.hbnf_cart_matrix_relay_bootstrap('opal-hbnf-cart','hbnf-cart',51,7,'r6',$1,$2::jsonb)`,[observed.candidate,JSON.stringify(malformedPalette)]),/bootstrap_palette_invalid/,'malformed palette readback fails closed');
await assert.rejects(db.query(`select public.hbnf_cart_matrix_relay_bootstrap('opal-hbnf-cart','hbnf-cart',50,7,'r6',$1,$2::jsonb)`,[observed.candidate,JSON.stringify(observed)]),/bootstrap_revision_fence_or_release_stale/,'bootstrap is compare-and-swap against the exact desired revision');
const bootstrap=(await db.query(`select public.hbnf_cart_matrix_relay_bootstrap('opal-hbnf-cart','hbnf-cart',51,7,'r6',$1,$2::jsonb) as result`,[observed.candidate,JSON.stringify(observed)])).rows[0].result;
assert.equal(bootstrap.deviceCommandsIssued,false);assert.equal(bootstrap.revision,52);
assert.equal(bootstrap.state.selectedVibe,'auto');assert.equal(bootstrap.state.vibeMode,'music');assert.equal(bootstrap.state.sceneId,'course-flow');
assert.equal(bootstrap.state.paletteId,'legacy');assert.equal(bootstrap.state.devices.matrix.brightness,46);assert.equal(bootstrap.state.devices.matrix.auxTargetBrightness,46);assert.equal(bootstrap.state.devices.aux.brightness,255);
assert.equal(bootstrap.state.tuning.audioResponse,50);assert.equal(bootstrap.state.tuning.micSensitivity,255,'unobservable microphone sensitivity remains unchanged');
assert.equal(bootstrap.state.vibe,'mellow','legacy energy field remains unchanged');
await assert.rejects(db.query(`select public.hbnf_cart_matrix_relay_bootstrap('opal-hbnf-cart','hbnf-cart',51,7,'r6',$1,$2::jsonb)`,[observed.candidate,JSON.stringify(observed)]),/bootstrap_revision_fence_or_release_stale/,'a bootstrap cannot replay against its consumed revision');
await assert.rejects(db.query(`select public.hbnf_cart_matrix_relay_bootstrap('opal-hbnf-cart','hbnf-cart',52,7,'r6',$1,$2::jsonb)`,[observed.candidate,JSON.stringify(observed)]),/bootstrap_already_initialized/,'bootstrap cannot repeat after selectedVibe has been established');
await db.exec(`update hbnf_internal.cart_actuator_fence set active=true where cart_id='hbnf-cart'`);
const expected = observed;
const payload = { matrix: {on:true,HBNF:{matrixBrightness:46,auxBrightness:46}}, aux:{on:true,bri:255} };
async function issue(state = expected, rev = 52, fence = 7, candidate = expected.candidate, releaseId = 'r6') {
  return (await db.query(`select public.hbnf_cart_matrix_relay_issue($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10) as id`, ['opal-hbnf-cart','hbnf-cart',rev,fence,releaseId,'70:4b:ca:5b:34:5c',candidate,JSON.stringify(state),JSON.stringify(payload),20])).rows[0].id;
}
const challenge = await issue();
await assert.rejects(issue({...expected,aux:{...expected.aux,mac:undefined}}),/invalid_relay_challenge/,'missing AUX identity cannot pass SQL challenge issuance');
await assert.rejects(db.query(`select public.hbnf_cart_matrix_relay_issue('opal-hbnf-cart','hbnf-cart',52,7,'r6','70:4b:ca:5b:34:5c',$1,$2::jsonb,$3::jsonb,null)`,[expected.candidate,JSON.stringify(expected),JSON.stringify(payload)]),/invalid_relay_challenge/,'null challenge lifetime cannot bypass the bounded TTL gate');
await assert.rejects(issue(expected, 51, 7, 'hbnf-cart2-phase2-r6-incremental-controls-20261011'), /invalid_relay_challenge/, 'stale R6 release must fail closed');
await assert.rejects(issue(expected, 51, 7, 'hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1'), /invalid_relay_challenge/, 'R4 release must fail the R6 candidate pin');
assert.equal((await db.query(`select public.hbnf_cart_matrix_relay_get($1,'opal-hbnf-cart') as value`, [challenge])).rows[0].value.desired_revision, 52);
assert.equal((await db.query(`select public.hbnf_cart_matrix_relay_authorize_apply($1,'opal-hbnf-cart') as ok`, [challenge])).rows[0].ok, true);
assert.equal((await db.query(`select public.hbnf_cart_matrix_relay_authorize_apply($1,'opal-hbnf-cart') as ok`, [challenge])).rows[0].ok, false);
assert.equal((await db.query(`select public.hbnf_cart_matrix_relay_confirm($1,'opal-hbnf-cart',$2::jsonb,$3::jsonb) as ok`, [challenge,JSON.stringify({...expected,on:false}),JSON.stringify({})])).rows[0].ok, false);
await assert.rejects(db.query(`select public.hbnf_cart_matrix_relay_confirm($1,'opal-hbnf-cart',$2::jsonb,$3::jsonb) as ok`, [challenge,JSON.stringify(expected),JSON.stringify({deviceUptimeSec:1})]),/observed_status_check/,'reproduces production CHECK rejection of ddp_receiver_confirmed before the compatibility migration');
await db.exec(fs.readFileSync(migrationPaths[2], 'utf8'));
assert.equal((await db.query(`select public.hbnf_cart_matrix_relay_confirm($1,'opal-hbnf-cart',$2::jsonb,$3::jsonb) as ok`, [challenge,JSON.stringify(expected),JSON.stringify({deviceUptimeSec:1})])).rows[0].ok, true);
assert.equal((await db.query(`select public.hbnf_cart_matrix_relay_confirm($1,'opal-hbnf-cart',$2::jsonb,$3::jsonb) as ok`, [challenge,JSON.stringify(expected),JSON.stringify({})])).rows[0].ok, false);
assert.equal((await db.query(`select count(*)::int as n from hbnf_internal.observed`)).rows[0].n, 2, 'Matrix and AUX have separate observations');
assert.deepEqual((await db.query(`select device_id from hbnf_internal.observed order by device_id`)).rows.map(x=>x.device_id), ['aux','matrix']);
const auxObservation=(await db.query(`select status,reported from hbnf_internal.observed where device_id='aux'`)).rows[0];
assert.equal(auxObservation.status,'online');
assert.equal(auxObservation.reported.on,'true');
assert.equal(auxObservation.reported.brightness,'255');
assert.equal(auxObservation.reported.ddpReceiverConfirmed,true,'DDP receiver confirmation remains explicit in structured readback');
assert.equal(auxObservation.reported.physicalOutputConfirmed,false,'DDP state acknowledgement is not physical illumination proof');
const stale = await issue(); await db.exec(`update hbnf_internal.cart_desired_state set revision=53 where cart_id='hbnf-cart'`);
assert.equal((await db.query(`select public.hbnf_cart_matrix_relay_get($1,'opal-hbnf-cart') as value`, [stale])).rows[0].value, null);
assert.equal((await db.query(`select public.hbnf_cart_matrix_relay_confirm($1,'opal-hbnf-cart',$2::jsonb,$3::jsonb) as ok`, [stale,JSON.stringify(expected),JSON.stringify({})])).rows[0].ok, false);
assert.equal((await db.query(`select count(*)::int as n from hbnf_internal.observed`)).rows[0].n, 2);
await assert.rejects(issue({...expected,matrixMac:'00:11:22:33:44:55'},53), /invalid_relay_challenge/);
const expired = await issue(expected, 53, 7);
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
await assert.rejects(issue(expected, 53, 7, expected.candidate, 'r6'), /stale_fence_or_state/, 'closed actuator fence rejects otherwise valid command');
await db.exec(fs.readFileSync(migrationPaths[3], 'utf8'));
assert.match((await db.query(`select pg_get_functiondef('public.hbnf_cart_matrix_relay_confirm(uuid,text,jsonb,jsonb)'::regprocedure) as body`)).rows[0].body,/ddp_receiver_confirmed/,'compensating migration restores the exact previous confirmation behavior');
await db.exec(fs.readFileSync(migrationPaths[4], 'utf8'));
const bootstrapCount=(await db.query(`select count(*)::int as n from pg_proc where proname='hbnf_cart_matrix_relay_bootstrap'`)).rows[0].n;
assert.equal(bootstrapCount,0,'compensating SQL removes the newly added bootstrap RPC');
await db.exec(`update hbnf_internal.cart_actuator_fence set active=true where cart_id='hbnf-cart'`);
const oldCandidate='hbnf-cart2-phase2-offline-wow-r6-integrated-20261009';
const oldExpected={matrixMac:'70:4b:ca:5b:34:5c',candidate:oldCandidate,hbnf:{candidate:oldCandidate}};
const oldChallenge=(await db.query(`select public.hbnf_cart_matrix_relay_issue('opal-hbnf-cart','hbnf-cart',53,7,'r6','70:4b:ca:5b:34:5c',$1,$2::jsonb,'{}'::jsonb,20) as id`,[oldCandidate,JSON.stringify(oldExpected)])).rows[0].id;
assert.ok(oldChallenge,'compensating migration restores the exact captured production v25 candidate pin');
let anonRollbackDenied=false;try{await db.exec(`set role anon; select public.hbnf_cart_matrix_relay_issue('opal-hbnf-cart','hbnf-cart',53,7,'r6','70:4b:ca:5b:34:5c','${oldCandidate}','{}','{}',20);`);}catch{anonRollbackDenied=true;}finally{await db.exec('reset role');}
assert.equal(anonRollbackDenied,true,'rollback keeps relay challenge RPC service-role only');
console.log('Matrix relay PGlite PASS: production AUX status CHECK failure reproduced; compatibility migration records online plus ddpReceiverConfirmed; exact correction rollback restores prior function; 46/255 readback retained; bootstrap issues no device commands; stale revision/fence/identity/replay/expiry denied; per-device readback and v25 rollback boundary preserved');
await db.close();

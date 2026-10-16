import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {buildWledProjection,normalizeReadback,readbackMatches,checkDecision,MATRIX_CANDIDATE,MATRIX_MAC,MATRIX_RECORDED_SHA256,AUX_MAC,AUX_IP} from "../staging/coordinated-backend/hbnf-cart-control/matrix-relay-projection.ts";
import {relayTokenAuthorized} from "../staging/coordinated-backend/hbnf-cart-control/matrix-relay-auth.ts";
const token="0123456789abcdef0123456789abcdef0123456789abcdef";
assert.equal(relayTokenAuthorized("Bearer "+token,token,"opal-hbnf-cart"),true);
assert.equal(relayTokenAuthorized("Bearer "+token.slice(1),token,"opal-hbnf-cart"),false);
assert.equal(relayTokenAuthorized(null,token,"opal-hbnf-cart"),false);
assert.equal(relayTokenAuthorized("Bearer "+token,token,"other-relay"),false);
const context={desired:{state:{power:"on",selectedVibe:"groove",sceneId:"field-mix",paletteId:"solid-12ABEF",devices:{matrix:{enabled:true,brightness:44,auxTargetBrightness:46},aux:{enabled:true,brightness:38}},tuning:{motion:61,audioResponse:73,micSensitivity:210},overlays:[{id:"owner-text-1",kind:"text",priority:9,expiresAt:100000,payload:{text:"Tonight",color:"#F0C080",fontIndex:4}}]}}};
const built=await buildWledProjection(context,51,7,1000);
assert.equal(built.wledPayload.matrix.on,true);assert.equal(built.wledPayload.matrix.seg[1].start,512);assert.equal(built.wledPayload.matrix.seg[1].stop,534);
assert.equal(built.wledPayload.matrix.HBNF.auxBrightness,46,"Matrix-stored AUX target is projected independently");
assert.deepEqual(built.wledPayload.aux,{on:true,bri:38},"AUX power and brightness are applied independently through receiver state");
assert.equal(built.expectedState.aux.on,true,"AUX power readback is bound separately from its brightness write");
assert.equal(built.wledPayload.matrix.AudioReactive,undefined,"generic projection preserves audio-reactive device settings");
assert.equal(built.expectedState.hbnf.vibe,1);assert.match(built.expectedState.hbnf.overlayId,/^hbnf-[0-9a-f]{32}$/);
const state={on:true,bri:255,seg:built.expectedState.segments,HBNF:{...built.expectedState.hbnf}};
const info={ip:"192.168.77.10",mac:"704bca5b345c",ver:"0.16.0",leds:{count:534}};
const auxInfo={ip:AUX_IP,mac:AUX_MAC,ver:"0.16.0",leds:{count:22},live:true,lm:"DDP",lip:"192.168.77.10"};
const auxState={on:true,bri:38,lor:0};const auxConfig={if:{live:{maxbri:false}}};
// Preserve and parse the actual read-only Opal preflight capture. It is Foundation R4,
// so the R6-pinned relay must reject it until the authorized R6 install completes.
const captured=JSON.parse(fs.readFileSync("evidence/cart2-matrix-relay-20261009/target-fixtures/matrix-json-si.json","utf8"));
assert.equal(captured.info.mac,"704bca5b345c");
assert.equal(captured.info.leds.count,534);
assert.equal(captured.state.HBNF.candidate,"hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1");
assert.notEqual(captured.state.HBNF.candidate,MATRIX_CANDIDATE,"R4 fixture must not be accepted as R6 identity");
const actual=normalizeReadback(info,state,auxInfo,auxState,auxConfig);
assert.throws(()=>normalizeReadback(info,{...state,seg:[...state.seg,{id:2,on:true,bri:255,fx:0}]},auxInfo,auxState,auxConfig),/readback_shape_invalid/,"unexpected Matrix segments cannot pass state reconciliation");
assert.throws(()=>normalizeReadback(info,{...state,bri:null},auxInfo,auxState,auxConfig),/readback_shape_invalid/,"missing global brightness cannot normalize to zero");
assert.throws(()=>normalizeReadback(info,{...state,HBNF:{...state.HBNF,palette:{mode:"wled"}}},auxInfo,auxState,auxConfig),/palette_readback_invalid/,"missing WLED palette index cannot normalize to index zero");
assert.throws(()=>normalizeReadback(info,{...state,HBNF:{...state.HBNF,vibe:99}},auxInfo,auxState,auxConfig),/hbnf_readback_value_invalid/,"out-of-range runtime values cannot be bootstrapped");
assert.equal(JSON.parse(JSON.stringify(built.wledPayload)).matrix.seg[1].stop,534,"Matrix WLED request JSON serialization round-trip");
assert.equal(JSON.parse(JSON.stringify(built.wledPayload)).aux.bri,38,"AUX WLED request JSON serialization round-trip");
assert.equal(readbackMatches(actual,built.expectedState),true);
assert.equal(checkDecision({expires_at:new Date(9000).toISOString(),expected_state:built.expectedState},actual,1000),"confirm");
assert.equal(checkDecision({expires_at:new Date(9000).toISOString(),expected_state:{...built.expectedState,on:false}},actual,1000),"apply_once");
assert.equal(checkDecision({expires_at:new Date(9000).toISOString(),expected_state:{...built.expectedState,on:false},apply_authorized_at:"now"},actual,1000),"mismatch_after_apply");
assert.equal(checkDecision({expires_at:new Date(999).toISOString(),expected_state:built.expectedState},actual,1000),"stale");
assert.equal(checkDecision({expires_at:new Date(9000).toISOString(),consumed_at:"now",expected_state:built.expectedState},actual,1000),"stale");
assert.throws(()=>normalizeReadback({...info,mac:"001122334455"},state,auxInfo,auxState,auxConfig),/identity/);
assert.throws(()=>normalizeReadback({...info,leds:{count:512}},state,auxInfo,auxState,auxConfig),/topology/);
const changed=structuredClone(context);changed.desired.state.overlays[0].payload.text="Changed";
const second=await buildWledProjection(changed,51,7,1000);
assert.notEqual(second.expectedState.hbnf.overlayId,built.expectedState.hbnf.overlayId);
assert.equal(MATRIX_CANDIDATE,"hbnf-cart2-phase2-r6-skins-readable-20261014");
assert.equal(MATRIX_RECORDED_SHA256,"de38221f2f9d7e9a03076185777266dc5cfd3a088b449530531dfcc1f7ed072d");
const controlState=JSON.parse(fs.readFileSync("config/HBNF_CONTROL_STATE.json","utf8"));
assert.equal(controlState.installed_release,MATRIX_CANDIDATE,"source pin follows the last recorded release only");
assert.equal(controlState.installed_firmware_sha256,MATRIX_RECORDED_SHA256,"source pin follows the last recorded SHA only");
assert.equal(controlState.live_mutation_authorized,false);
assert.equal(MATRIX_MAC,"70:4b:ca:5b:34:5c");
assert.equal(AUX_MAC,"8c:94:df:55:c3:4c");
assert.equal(AUX_IP,"192.168.77.11");

// The first command after the prepared bootstrap must reproduce the fresh
// physical settings exactly; current desired-state brightness is intentionally
// stale in the fixture and must never be treated as a runtime snapshot.
const current={desired:{state:{power:"on",selectedVibe:"auto",vibe:"mellow",vibeMode:"music",sceneId:"course-flow",paletteId:"legacy",
 devices:{matrix:{enabled:true,brightness:46,auxTargetBrightness:46},aux:{enabled:true,brightness:255}},
 tuning:{motion:50,audioResponse:50,micSensitivity:255},overlays:[]}}};
const currentProjection=await buildWledProjection(current,124,2,1000);
const currentState={on:true,bri:255,seg:[{id:0,on:true,bri:255,fx:142},{id:1,start:512,stop:534,on:true,bri:255,fx:142}],
 AudioReactive:{on:true},HBNF:{schema:"foundation-v1",candidate:MATRIX_CANDIDATE,scene:0,vibe:5,motion:50,audioResponse:50,matrixBrightness:46,auxBrightness:46,palette:{mode:"legacy"},overlayId:null}};
const currentAuxInfo={ip:AUX_IP,mac:AUX_MAC,ver:"0.16.0",leds:{count:22},live:true,lm:"DDP",lip:"192.168.77.10"};
const currentActual=normalizeReadback(info,currentState,currentAuxInfo,{on:true,bri:255,lor:0},{if:{live:{maxbri:false}}});
assert.equal(readbackMatches(currentActual,currentProjection.expectedState),true,"revision-checked bootstrap makes the next projection a no-op against the fresh owner settings");
assert.equal(checkDecision({expires_at:new Date(9000).toISOString(),expected_state:currentProjection.expectedState},currentActual,1000),"confirm","first post-bootstrap relay cycle confirms the exact 46/255 state without issuing a write");
assert.equal(currentProjection.wledPayload.matrix.HBNF.auxBrightness,46);
assert.deepEqual(currentProjection.wledPayload.aux,{on:true,bri:255},"bootstrap baseline leaves already-correct AUX state unchanged");
assert.equal(currentProjection.wledPayload.matrix.AudioReactive,undefined,"bootstrap preserves audio-reactive settings");
const matrixOnly=structuredClone(current);matrixOnly.desired.state.devices.matrix.brightness=60;
const matrixProjection=await buildWledProjection(matrixOnly,125,2,1000);
assert.equal(matrixProjection.wledPayload.matrix.HBNF.matrixBrightness,60);assert.equal(matrixProjection.wledPayload.matrix.HBNF.auxBrightness,46);assert.equal(matrixProjection.wledPayload.aux.bri,255,"Matrix-only control cannot alter physical AUX brightness");
const auxOnly=structuredClone(current);auxOnly.desired.state.devices.aux.brightness=200;
const auxProjection=await buildWledProjection(auxOnly,125,2,1000);
assert.equal(auxProjection.wledPayload.matrix.HBNF.auxBrightness,46,"authorized AUX change leaves the Matrix-stored target intact");assert.equal(auxProjection.wledPayload.aux.bri,200,"authorized AUX change applies only to the receiver");
await assert.rejects(buildWledProjection({desired:{state:{...current.desired.state,devices:{...current.desired.state.devices,matrix:{enabled:true,brightness:46}}}}},124,2,1000),/matrix_aux_target_missing/,"projection fails closed before the one-time observed-state bootstrap");
await assert.rejects(buildWledProjection({desired:{state:{...current.desired.state,devices:{...current.desired.state.devices,matrix:{...current.desired.state.devices.matrix,auxTargetBrightness:null}}}}},124,2,1000),/matrix_aux_target_missing/,"a null legacy AUX target cannot silently become zero");
await assert.rejects(buildWledProjection({desired:{state:{...current.desired.state,selectedVibe:null}}},124,2,1000),/unsupported_vibe/,"missing runtime Vibe is not guessed from legacy energy labels");
assert.throws(()=>normalizeReadback(info,state,auxInfo,auxState,{if:{live:{maxbri:true}}}),/force_max_brightness/,
 "realtime receiver max brightness must be proven off before independent AUX control");
assert.throws(()=>normalizeReadback(info,state,{...auxInfo,mac:"001122334455"},auxState,auxConfig),/aux_identity/);
assert.throws(()=>normalizeReadback(info,state,{...auxInfo,lm:""},auxState,auxConfig),/aux_ddp/);
assert.equal(readbackMatches(normalizeReadback(info,state,auxInfo,{...auxState,bri:39},auxConfig),built.expectedState),false,
 "AUX brightness mismatch must prevent combined confirmation");
// Simulate lost response after one authorized write: the same challenge cannot reapply,
// but a fresh challenge can confirm a readback that now matches without resetting an overlay.
const lost={expires_at:new Date(9000).toISOString(),expected_state:{...built.expectedState,on:false}};
assert.equal(checkDecision(lost,actual,1000),"apply_once");
lost.apply_authorized_at="now";
assert.equal(checkDecision(lost,actual,1000),"mismatch_after_apply");
const resumed={expires_at:new Date(9000).toISOString(),expected_state:built.expectedState};
assert.equal(checkDecision(resumed,actual,1000),"confirm");
const priorSql=fs.readFileSync("staging/coordinated-backend/migrations/20261009190000_hbnf_matrix_relay_confirmation.sql","utf8");
assert.ok(priorSql.includes("hbnf-cart2-phase2-offline-wow-r6-audio-cache-20261010"),"historical migration remains unchanged");
const pinMigration=fs.readFileSync("staging/coordinated-backend/migrations/20261011235000_hbnf_matrix_relay_incremental_controls_pin.sql","utf8");
const sql=priorSql+"\n"+pinMigration;
assert.ok(sql.includes(MATRIX_CANDIDATE),"follow-up migration must bind both RPC gates to the last recorded release");
assert.ok(sql.includes(AUX_MAC)&&sql.includes(AUX_IP),"database confirmation must pin the AUX device independently");
assert.ok(sql.includes("'aux',true,case when p_verified_state#>>'{aux,on}'='true' then 'ddp_receiver_confirmed' else 'off' end"),"AUX acknowledgment must reflect read-back power state separately from Matrix state");
assert.ok(sql.includes("'on',p_verified_state#>>'{aux,on}'"),"AUX acknowledgment must include actual receiver power readback");
assert.ok(sql.includes("p_wled_payload#>>'{aux,bri}' is distinct from p_expected_state#>>'{aux,bri}'"),"AUX command payload must match its own desired brightness using null-safe comparison");
assert.ok(sql.includes("'physicalOutputConfirmed',false"),"device readback must not be mislabeled as physical illumination");
for(const marker of ["for update","c.expires_at<=clock_timestamp()","c.consumed_at is not null","p_verified_state is distinct from c.expected_state","d.revision=c.desired_revision","f.epoch=c.fence_epoch","f.active","p_expected_state->>","hbnf_cart_upsert_observed"])assert.ok(sql.includes(marker),"missing SQL gate: "+marker);
const adapter=fs.readFileSync("staging/coordinated-backend/hbnf-matrix-adapter-foundation/index.ts","utf8");
assert.ok(!/mqtt|broker\.emqx|publish\(/i.test(adapter),"legacy writer/public MQTT fallback remains");
assert.ok(adapter.includes("commandApplicationConfirmed:false"));
const relay=fs.readFileSync("staging/coordinated-backend/hbnf-cart-control/matrix-relay.ts","utf8");
assert.ok(relay.includes("HBNF_MATRIX_RELAY_TOKEN"));assert.ok(relay.includes("X-HBNF-Relay-ID"));assert.ok(relay.includes("hbnf_cart_matrix_relay_confirm"));
assert.ok(relay.includes('form.get("op")==="bootstrap"')&&relay.includes('bootstrap_requires_inactive_fence')&&relay.includes('hbnf_cart_matrix_relay_bootstrap'));
const transaction=fs.readFileSync("staging/coordinated-backend/opal/hbnf-matrix-relay-transaction.sh","utf8");
const transactionPath="staging/coordinated-backend/opal/hbnf-matrix-relay-transaction.sh";
const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),"hbnf-relay-transaction-"));
function transactionRun(auxApply="0",verifyAux="0"){
 const marker=path.join(temp,`partial-${auxApply}-${verifyAux}`);
 const run=spawnSync("/bin/sh",["-c",`. '${transactionPath}'; matrix_apply(){ echo matrix_apply; return 0; }; aux_apply(){ echo aux_apply; return ${auxApply}; }; restore_matrix(){ echo restore_matrix; return 0; }; restore_aux(){ echo restore_aux; return 0; }; verify_matrix_restore(){ echo verify_matrix_restore; return 0; }; verify_aux_restore(){ echo verify_aux_restore; return ${verifyAux}; }; if hbnf_apply_pair_or_compensate '${marker}'; then echo result:0; else echo result:$?; fi`],{cwd:root,encoding:"utf8"});
 return {run,marker};
}
const partialRestored=transactionRun("1","0");
assert.equal(partialRestored.run.status,0);assert.match(partialRestored.run.stdout,/matrix_apply[\s\S]*aux_apply[\s\S]*restore_matrix[\s\S]*restore_aux[\s\S]*verify_matrix_restore[\s\S]*verify_aux_restore[\s\S]*result:1/);
assert.equal(fs.existsSync(partialRestored.marker),true,"partial apply enters persistent fail-closed lockout even after compensation verifies");
const partialUnverified=transactionRun("1","1");
assert.match(partialUnverified.run.stdout,/result:2/,"unverified compensation is distinct from restored partial failure");
const pairSuccess=transactionRun("0","0");
assert.match(pairSuccess.run.stdout,/result:0/);assert.doesNotMatch(pairSuccess.run.stdout,/restore_matrix|restore_aux/,"successful paired apply does not trigger rollback");
const rollback=fs.readFileSync("staging/coordinated-backend/rollback/20261011235000_hbnf_matrix_relay_incremental_controls_pin.sql","utf8");
assert.ok(rollback.includes("hbnf-cart2-phase2-offline-wow-r6-integrated-20261009"),"compensation restores captured production v25 pin");
assert.ok(relay.includes("actual.candidate!==MATRIX_CANDIDATE||actual.hbnf.candidate!==MATRIX_CANDIDATE"),"R4 readback must be rejected before apply authorization");
const opal=fs.readFileSync("staging/coordinated-backend/opal/hbnf-matrix-relay","utf8");
assert.ok(!opal.includes("SUPABASE_SERVICE_ROLE_KEY"));assert.ok(opal.includes("704bca5b345c"));assert.ok(opal.includes("functions/v1/hbnf-cart-control"));assert.ok(opal.includes("X-HBNF-Relay-ID"));
assert.ok(opal.includes(MATRIX_CANDIDATE),"Opal snapshot and request must pin the last recorded release and reject a different live identity");
assert.ok(opal.includes(MATRIX_RECORDED_SHA256),"the source binding must preserve the last recorded firmware SHA");
assert.ok(opal.includes("$AUX_URL/json/si")&&opal.includes("$AUX_URL/json/cfg"),"Opal must independently read AUX state and realtime-brightness config");
assert.ok(opal.includes("auxInfo=@$TMP/aux-info.json")&&opal.includes("auxState=@$TMP/aux-state.json"),"the backend must receive separate AUX readback");
assert.ok(opal.includes("$AUX_URL/json/state"),"the existing writer must apply AUX brightness through native WLED receiver state");
assert.ok(!opal.includes("hbnf-cart2-phase2-offline-wow-r6-integrated-20261009"),"stale integrated R6 pin remains in relay");
assert.ok(opal.includes('--config "$TMP/curl-auth.conf"'),"credentials must stay out of curl argv");
assert.ok(opal.includes('LC_ALL=C ls -ldn "$CONF"')&&opal.includes('$1 == "-rw-------"')&&opal.includes('$2 == "1"')&&opal.includes('$3 == "0"')&&opal.includes('$4 == "0"'),"relay secret config must fail closed unless it is a single-link root:root 0600 regular file using target BusyBox ls");
assert.ok(!opal.includes("stat -c"),"relay must not depend on GNU stat absent from target OpenWrt");
assert.ok(opal.includes('[ -f "$CONF" ] && [ ! -L "$CONF" ]'),"relay config must be regular and cannot be a symlink");
assert.ok(opal.includes('apikey: %s'),"Supabase gateway publishable-key header is missing");
assert.ok(opal.includes("if ! snapshot; then sleep 2; continue; fi"),"readback must occur after challenge issuance");
assert.ok(opal.includes('cp "$TMP/info.json" "$TMP/baseline-matrix-info.json"')&&opal.includes('cp "$TMP/build.json" "$TMP/baseline-matrix-build.json"'),"compensation captures Matrix identity and release alongside its original state");
assert.ok(opal.includes("field_equal \"$TMP/baseline-matrix-build.json\" \"$TMP/restore-matrix-build.json\" '@.release_id'")&&opal.includes('"$MATRIX_CANDIDATE" ]'),"Matrix restoration verification must prove the same runtime release identity");
assert.ok(opal.includes('"704bca5b345c" ]'),"Matrix restoration verification must prove the pinned device identity");
assert.ok(opal.includes('if [ "$code" = "200" ]; then log "revision-bound Matrix and AUX state readback confirmed; physical AUX illumination unverified"'),"success requires both device readbacks and must not claim physical light");
assert.ok(opal.includes('[ "$code" = "409" ] && [ "$(jsonfilter -i "$TMP/check.json" -e \'@.status\' 2>/dev/null || true)" = "apply_required" ]'),"409 may trigger one apply only for the explicit apply_required status");
assert.ok(opal.includes('if ! curl -fsS --connect-timeout 3 --max-time 8 --config "$TMP/curl-auth.conf" -H \'Content-Type: application/json\' --data-binary @"$TMP/request.json" "$SUPABASE_RELAY_URL" -o "$TMP/next.json"; then sleep 5; continue; fi'),"next-request transport failures must back off and recover without a Matrix write");
assert.ok(opal.includes('code="$(check_readback 2>/dev/null || printf \'000\')"'),"check transport failures must fail closed as status 000");
assert.ok(opal.includes('sleep 2\ndone'),"worker must return to a fresh challenge after stale/failed reads");
console.log("HBNF Matrix relay protocol: PASS");

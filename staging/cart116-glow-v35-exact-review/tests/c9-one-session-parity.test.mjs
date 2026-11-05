import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
const require=createRequire(import.meta.url);
const {evaluate}=require("../admission/c9-combined-field-readonly-review.cjs");
const manifest=require("../admission/ADMISSION.PENDING.json");
const authority=manifest.dora_c9_paired_owner_release_20261105;
const RELEASE=authority.firmware_source_release;
const networkKeys=["ownerPwaServedOnIpad","oldR6ControlledAfterOwnerStage",
 "newR6BuildAndStateReadback","newR6OwnerDirectFreshAck",
 "backgroundForegroundReconnectNoReplay","lanOnlyLocalControlSucceeded"];
const ownerKeys=["offlineExcellentSpeedVariety","offlineBassMidTrebleResponsive",
 "onlineEquivalentVisualQuality","ownerTextPriorityObserved",
 "motionAudioScenePersistedAfterNormalRestart","wowMaxAll28EffectsPreserved",
 "fx142AndPsMinusOnePreserved","auxDDP22Preserved","uvAsWiredPreserved"];
const state=(n,fps=43)=>({
 state:{ps:-1,AudioReactive:{on:true},
  seg:[{fx:142,start:0,stop:512},{fx:142,start:512,stop:534}],
  HBNF:{candidate:RELEASE,effectId:142,scene:"course-flow",vibe:"auto",motion:50,
   audioResponse:200,matrixBrightness:120,auxBrightness:80,
   variantSignature:"v"+n,timing:{uptimeSec:300+n},
   audio:{bass:3*n,mid:2*n,treble:4*n,volume:5*n}}},
 info:{leds:{count:534,matrix:{w:32,h:16},fps},
  u:{"Audio Source":"PDM digital","UDP Sound Sync":"send"}}
});
function fixture(){
 const sessionRef="synthetic-C9-single-session";
 return {schema:"cart116-c9-one-session-observation-v1",sessionRef,
  matrixPair:{schema:"hbnf-matrix-readonly-pair-v1",expectedRelease:RELEASE,
   offline:{upstreamObserved:"none",samples:[state(1),state(2),state(3)]},
   repeater:{upstreamObserved:"home_repeater",samples:[state(4),state(5),state(6)]}},
  network:{sessionRef,...Object.fromEntries(networkKeys.map(k=>[k,true])),
   wan:{naturalUpstreamLossAndRecoveryObserved:true,kmwanActualReadback:true,
    ipadHttpsForwardingChecked:true,recoveredWithoutManualConnect:true},
   actualOpalServedPostimages:authority.changed_targets.map(t=>({
    target:t.target,sha256:t.candidate_sha256,source:"authenticated_opal_served_readback"}))},
  ownerObservation:{sessionRef,...Object.fromEntries(ownerKeys.map(k=>[k,true])),
   physicalUvOffClaim:false}};
}
test("complete synthetic same-session observations NEVER grant a physical release",()=>{
 const o=evaluate(fixture());
 assert.equal(o.verdict,"READONLY_DIAGNOSTICS_CONSISTENT_NOT_RELEASE_ACCEPTANCE");
 assert.equal(o.matrixStatus,"READ_ONLY_PARITY_CONSISTENT");
 assert.equal(o.releaseAdmitted,false);
 assert.equal(o.deviceInstallationConfirmed,false);
 assert.equal(o.requiredOwnerPaths.length,6);
 assert.match(o.physical,/NOT_INDEPENDENTLY_PROVEN/);
});
test("reconnect stale-command replay reported false is a release-critical mismatch",()=>{
 const f=fixture();f.network.backgroundForegroundReconnectNoReplay=false;
 const o=evaluate(f);assert.equal(o.verdict,"OBSERVED_MISMATCH_NO_RELEASE");
 assert.ok(o.failures.includes("NETWORK_BACKGROUNDFOREGROUNDRECONNECTNOREPLAY_FAILED"));
 assert.match(o.purpose,/ONE_FIELD_SESSION_ONLY/);
});
test("wrong new firmware marker across the two network modes is never accepted",()=>{
 const f=fixture();f.matrixPair.repeater.samples[2].state.HBNF.candidate="wrong-release";
 const o=evaluate(f);assert.equal(o.verdict,"OBSERVED_MISMATCH_NO_RELEASE");
 assert.ok(o.failures.includes("RELEASE_IDENTITY_DRIFT"));
});
test("unexplained low offline Matrix FPS flags diagnostic mismatch",()=>{
 const f=fixture();for(const s of f.matrixPair.offline.samples)s.info.leds.fps=12;
 const o=evaluate(f);assert.ok(o.failures.includes("OFFLINE_FPS_SIGNIFICANTLY_BELOW_REPEATER_DIAGNOSTIC"));
 assert.equal(o.releaseAdmitted,false);
});
test("mismatched actual audio response and settings rejects parity assumption",()=>{
 const f=fixture();f.matrixPair.offline.samples[2].state.HBNF.audioResponse=15;
 const o=evaluate(f);assert.ok(o.failures.includes("EFFECTIVE_TUNING_DRIFT:audioResponse"));
});
test("no naturally verified offline mode means evidence incomplete, not quality PASS",()=>{
 const f=fixture();f.matrixPair.offline.upstreamObserved="not verified";
 f.matrixPair.offline.samples=[];f.network.wan=null;
 const o=evaluate(f);assert.equal(o.verdict,"OBSERVATIONAL_EVIDENCE_INCOMPLETE");
 assert.ok(o.unknown.includes("OFFLINE:NO_CAPTURE"));
 assert.ok(o.unknown.includes("WAN_FAILOVER_NOT_NATURALLY_OBSERVED"));
});
test("wrong postserved SHA is blocked despite a matching source candidate",()=>{
 const f=fixture();f.network.actualOpalServedPostimages[0].sha256="0".repeat(64);
 const o=evaluate(f);assert.equal(o.verdict,"OBSERVED_MISMATCH_NO_RELEASE");
 assert.ok(o.failures.some(x=>x.startsWith("OWNER_POSTIMAGE_SHA_MISMATCH")));
});
test("absent actual Opal postserved bytes and owner observations remain open",()=>{
 const f=fixture();f.network.actualOpalServedPostimages=[];
 delete f.ownerObservation.offlineExcellentSpeedVariety;
 const o=evaluate(f);assert.equal(o.verdict,"OBSERVATIONAL_EVIDENCE_INCOMPLETE");
 assert.ok(o.unknown.includes("SIX_OWNER_POSTSERVED_BYTES_NOT_CAPTURED"));
});
test("do not infer physical UV isolation from software OFF or review flags",()=>{
 const f=fixture();f.ownerObservation.physicalUvOffClaim=true;
 const o=evaluate(f);assert.ok(o.failures.includes("UNSUPPORTED_UV_PHYSICAL_OFF_CLAIM"));
 assert.equal(o.matrix.uv,"NO_PHYSICAL_UV_OFF_INFERENCE_FROM_JSON");
});
test("source parser has no device I/O and single manifest gates remain OFF",()=>{
 const src=readFileSync(new URL("../admission/hbnf-matrix-offline-parity-review.cjs",import.meta.url),"utf8");
 const glue=readFileSync(new URL("../admission/c9-combined-field-readonly-review.cjs",import.meta.url),"utf8");
 assert.match(src,/READ_ONLY_PARITY_CONSISTENT/);
 assert.match(src,/NO_PHYSICAL_UV_OFF_INFERENCE_FROM_JSON/);
 assert.doesNotMatch(src,/\bfetch\(|\bchild_process\b|\bhttps\.request\(/);
 assert.match(glue,/lanOnlyLocalControlSucceeded/);
 assert.match(glue,/backgroundForegroundReconnectNoReplay/);
 assert.equal(manifest.firmware.matrix_flash,false);
 assert.equal(manifest.transaction.source_gate_change_admitted,false);
 assert.equal(manifest.dora_c9_one_session_parity_source_20261105.state,"SOURCE_REVIEW_ONLY");
});

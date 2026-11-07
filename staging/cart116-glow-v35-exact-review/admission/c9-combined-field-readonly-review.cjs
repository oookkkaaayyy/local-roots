"use strict";
/* #116: file-fed, source-only, SINGLE existing field session diagnostic.
   Cannot contact Cart, configure WAN, save state, install or authorize a release. */
const {analyze}=require("./hbnf-matrix-offline-parity-review.cjs");
const manifest=require("./ADMISSION.PENDING.json");
const p=manifest.dora_c9_paired_owner_release_20261105;
const REQUIRED_NETWORK=[
 "ownerPwaServedOnIpad","oldR6ControlledAfterOwnerStage","newR6BuildAndStateReadback",
 "newR6OwnerDirectFreshAck","backgroundForegroundReconnectNoReplay","lanOnlyLocalControlSucceeded"
];
const REQUIRED_OWNER=[
 "offlineExcellentSpeedVariety","offlineBassMidTrebleResponsive","onlineEquivalentVisualQuality",
 "ownerTextPriorityObserved","motionAudioScenePersistedAfterNormalRestart",
 "wowMaxAll28EffectsPreserved","fx142AndPsMinusOnePreserved","auxDDP22Preserved","uvAsWiredPreserved"
];
const isSha=v=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
function evaluate(record){
 const failures=[],unknown=[];
 if(!record||record.schema!=="cart116-c9-one-session-observation-v1")return {
  verdict:"INVALID_INPUT",failures:["SESSION_SCHEMA_UNKNOWN"],unknown:[],
  releaseAdmitted:false,deviceInstallationConfirmed:false,physical:"NOT_PROVEN"
 };
 const id=record.sessionRef;
 if(typeof id!=="string"||!id||id.length>120)unknown.push("ONE_OWNER_SESSION_REFERENCE_MISSING");
 const pair=record.matrixPair;
 if(pair?.sessionRef!==id){
  if(typeof pair?.sessionRef!=="string"||!pair.sessionRef)unknown.push("MATRIX_PAIR_SESSION_REFERENCE_MISSING");
  else failures.push("MATRIX_PAIR_NOT_SAME_OWNER_SESSION");
 }
 const m=analyze(pair);
 if(pair?.expectedRelease!==p.firmware_source_release)failures.push("EXACT_C9_RELEASE_NOT_PINNED");
 failures.push(...(m.fail||[]));
 unknown.push(...(m.open||[]));
 if(m.status==="INVALID_INPUT")failures.push("MATRIX_CAPTURE_INVALID");
 if(m.physical?.startsWith("NOT_VERIFIED")!==true)failures.push("MATRIX_CLASSIFIER_PHYSICAL_GUARD_CHANGED");
 const network=record.network||{};
 if(network.sessionRef!==id)failures.push("NETWORK_NOT_SAME_OWNER_SESSION");
 for(const k of REQUIRED_NETWORK){
  if(network[k]==null)unknown.push("NETWORK_"+k.toUpperCase()+"_NOT_OBSERVED");
  else if(network[k]!==true)failures.push("NETWORK_"+k.toUpperCase()+"_FAILED");
 }
 const files=network.actualOpalServedPostimages;
 if(!Array.isArray(files)||files.length!==p.changed_targets.length){
  unknown.push("SIX_OWNER_POSTSERVED_BYTES_NOT_CAPTURED");
 }else{
  const map=new Map();
  for(const row of files){
   if(!row||typeof row.target!=="string"||map.has(row.target)){failures.push("DUPLICATE_OR_INVALID_OWNER_TARGET");continue;}
   map.set(row.target,row);
  }
  for(const t of p.changed_targets){
   const row=map.get(t.target);
   if(!row)unknown.push("OWNER_POSTIMAGE_NOT_RECORDED:"+t.target);
   else if(!isSha(row.sha256)||row.sha256!==t.candidate_sha256)failures.push("OWNER_POSTIMAGE_SHA_MISMATCH:"+t.target);
   else if(row.source!=="authenticated_opal_served_readback")unknown.push("OWNER_POSTIMAGE_AUTHENTICATED_SOURCE_NOT_RECORDED:"+t.target);
  }
 }
 const owner=record.ownerObservation||{};
 if(owner.sessionRef!==id)unknown.push("OWNER_OBSERVATION_NOT_SAME_SESSION");
 for(const k of REQUIRED_OWNER){
  if(owner[k]==null)unknown.push("OWNER_"+k.toUpperCase()+"_NOT_CHECKED");
  else if(owner[k]!==true)failures.push("OWNER_"+k.toUpperCase()+"_FAILED");
 }
 if(owner.physicalUvOffClaim===true)failures.push("UNSUPPORTED_UV_PHYSICAL_OFF_CLAIM");
 let wanFailover="NOT_OBSERVED";
 const wan=network.wan||{};
 if(wan.naturalUpstreamLossAndRecoveryObserved===true){
  if(wan.kmwanActualReadback===true&&wan.ipadHttpsForwardingChecked===true&&wan.recoveredWithoutManualConnect===true)wanFailover="REPORTED_RECONNECT_CONSISTENT_NOT_PROVIDER_PROVEN";
  else failures.push("WAN_FAILOVER_OBSERVED_BUT_NOT_VERIFIED");
 }else unknown.push("WAN_FAILOVER_NOT_NATURALLY_OBSERVED");
 return {
  verdict:failures.length?"OBSERVED_MISMATCH_NO_RELEASE":unknown.length?"OBSERVATIONAL_EVIDENCE_INCOMPLETE":"READONLY_DIAGNOSTICS_CONSISTENT_NOT_RELEASE_ACCEPTANCE",
  failures,unknown,requiredOwnerPaths:p.changed_targets.map(x=>x.target),
  matrixStatus:m.status,wanFailover,matrix:m,
  releaseAdmitted:false,deviceInstallationConfirmed:false,
  physical:"NOT_INDEPENDENTLY_PROVEN; OWNER OBSERVATION, ORIGINAL INSTALLED BYTE BACKUPS, FULL TWO-PHASE ADMISSION AND SAME-MANIFEST CLOSEOUT REQUIRED",
  purpose:"ONE_FIELD_SESSION_ONLY_NO_DEVICE_READS_NO_WRITES_NO_SECOND_SESSION"
 };
}
module.exports={evaluate};
if(require.main===module){
 const fs=require("node:fs");
 if(process.argv.length!==3){console.error("usage: node <script> <sanitized-one-session-snapshots.json>");process.exitCode=2;}
 else{
  const report=evaluate(JSON.parse(fs.readFileSync(process.argv[2],"utf8")));
  console.log(JSON.stringify(report,null,2));if(report.failures.length)process.exitCode=1;
 }
}

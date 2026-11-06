"use strict";
/*
 * #116 Track C read-only parity classifier. NEVER fetches a device, stores
 * secrets, sends WLED commands, or labels physical quality PASS.
 * Input: sanitized owner/Controls-collected same-show JSON snapshots from one
 * existing field session (not a second session).
 */
const keys=["scene","vibe","motion","audioResponse","matrixBrightness","auxBrightness"];
const audioKeys=["bass","mid","treble","volume"];
const h=(s)=>s&&s.state&&s.state.HBNF||{};
const last=(a)=>a[a.length-1];
const positiveNumber=(v)=>Number.isFinite(Number(v))&&Number(v)>0;
function summarize(run,label,fail,open){
  if(!run||!Array.isArray(run.samples)||!run.samples.length){open.push(label+":NO_CAPTURE");return null;}
  const samples=run.samples;
  const s=last(samples), H=h(s), I=s.info||{}, U=I.u||{};
  if(!s.state||!s.info){open.push(label+":MISSING_STATE_OR_INFO");return null;}
  const values=Object.fromEntries(keys.map(k=>[k,H[k]]));
  const expectedFx=Number(H.effectId);
  if(H.candidate==null)open.push(label+":BUILD_ID_NOT_RECORDED");
  if(expectedFx!==142)fail.push(label+":NATIVE_FX_NOT_142");
  if(!Array.isArray(s.state.seg)||s.state.seg.length<2||s.state.seg[0].fx!==142||s.state.seg[1].fx!==142)fail.push(label+":MATRIX_AUX_FX_MISMATCH");
  const seg=s.state.seg||[], m=I.leds?.matrix;
  if(Number(I.leds?.count)!==534||Number(m?.w)!==32||Number(m?.h)!==16||Number(seg[1]?.start)!==512||Number(seg[1]?.stop)!==534)fail.push(label+":GEOMETRY_DDP22_MISMATCH");
  // Installed original R6 can retain the saved boot preset number in JSON
  // while its native usermod unloads the playlist. This is a read-only
  // ambiguity, NOT proof the playlist is running or that the release passed.
  const originalR6="hbnf-cart2-phase2-r6-skins-readable-20261014";
  if(s.state.ps!==-1){
    if(H.candidate===originalR6 && s.state.ps===60 && expectedFx===142
       && Array.isArray(s.state.seg) && s.state.seg.length>=2
       && s.state.seg[0].fx===142 && s.state.seg[1].fx===142){
      open.push(label+":ORIGINAL_R6_PS60_BOOT_PRESET_NOT_PLAYLIST_PROOF");
    }else fail.push(label+":PRESET_NOT_MINUS_ONE");
  }
  if(Number(H.matrixBrightness)===0)open.push(label+":OWNER_MATRIX_BRIGHTNESS_ZERO_NOT_VISIBLE");
  if(s.state.AudioReactive?.on!==true)open.push(label+":AUDIOREACTIVE_NOT_CONFIRMED_ON");
  const src=U["Audio Source"],sync=U["UDP Sound Sync"];
  const asText=(v)=>Array.isArray(v)?v.join(" "):typeof v==="string"?v:null;
  const audioSource=asText(src),audioSync=asText(sync);
  if(audioSource==null)open.push(label+":AUDIO_SOURCE_NOT_EXPOSED");
  if(audioSync==null)open.push(label+":AUDIO_SYNC_MODE_NOT_EXPOSED");
  const audioSamples=samples.map(o=>h(o).audio).filter(a=>a&&audioKeys.every(k=>Number.isFinite(Number(a[k]))));
  if(audioSamples.length<3)open.push(label+":INSUFFICIENT_AUDIO_SAMPLES");
  const audioRanges={};
  for(const k of audioKeys)audioRanges[k]=audioSamples.length?Math.max(...audioSamples.map(a=>Number(a[k])))-Math.min(...audioSamples.map(a=>Number(a[k]))):null;
  const signatures=new Set(samples.map(o=>h(o).variantSignature).filter(v=>v!=null));
  const uptimeSamples=samples.map(o=>Number(h(o).timing?.uptimeSec)).filter(Number.isFinite);
  const dwell=Number(H.variantDwellSeconds);
  if(signatures.size<2){
    if(uptimeSamples.length>=2 && Number.isFinite(dwell) && dwell>0
       && uptimeSamples[uptimeSamples.length-1]-uptimeSamples[0]<dwell)
      open.push(label+":CAPTURE_SHORTER_THAN_NATIVE_VARIANT_DWELL");
    else open.push(label+":NATIVE_VARIANT_ROTATION_NOT_OBSERVED_IN_WINDOW");
  }
  const fps=samples.map(o=>Number(o.info?.leds?.fps)).filter(Number.isFinite).sort((a,b)=>a-b);
  const medianFps=fps.length?fps[Math.floor(fps.length/2)]:null;
  if(medianFps===null)open.push(label+":NO_FPS");
  const uptime=samples.map(o=>Number(h(o).timing?.uptimeSec)).filter(Number.isFinite);
  if(uptime.length>=2&&uptime.some((v,i)=>i>0&&v<uptime[i-1]))fail.push(label+":UPTIME_RESET_DETECTED");
  return {mode:run.upstreamObserved,release:H.candidate,values,audioSource,audioSync,audioRanges,signatures:signatures.size,medianFps,uptime:uptime.length?uptime[uptime.length-1]:null};
}
function analyze(pair){
  const fail=[],open=[];
  if(!pair||pair.schema!=="hbnf-matrix-readonly-pair-v1")return {status:"INVALID_INPUT",fail:["SCHEMA_INVALID"],open:[],physical:"NOT_VERIFIED"};
  const o=summarize(pair.offline,"OFFLINE",fail,open),b=summarize(pair.repeater,"REPEATER",fail,open);
  if(pair.offline?.upstreamObserved!=="none")open.push("OFFLINE_UPSTREAM_ABSENCE_NOT_ATTESTED");
  if(pair.repeater?.upstreamObserved!=="home_repeater")open.push("REPEATER_UPSTREAM_NOT_ATTESTED");
  if(o&&b){
    if(o.release!==b.release)fail.push("RELEASE_IDENTITY_DRIFT");
    if(pair.expectedRelease&&(o.release!==pair.expectedRelease||b.release!==pair.expectedRelease))fail.push("NOT_EXPECTED_CANDIDATE");
    for(const k of keys)if(o.values[k]!==b.values[k])fail.push("EFFECTIVE_TUNING_DRIFT:"+k);
    if(o.audioSource!==null&&b.audioSource!==null&&o.audioSource!==b.audioSource)fail.push("AUDIO_SOURCE_CHANGED");
    if(o.audioSync!==null&&b.audioSync!==null&&o.audioSync!==b.audioSync)fail.push("AUDIO_SYNC_MODE_CHANGED");
    if(o.medianFps!==null&&b.medianFps!==null&&b.medianFps>0&&o.medianFps<b.medianFps*.7)fail.push("OFFLINE_FPS_SIGNIFICANTLY_BELOW_REPEATER_DIAGNOSTIC");
    for(const k of ["bass","mid","treble"]){
      if(o.audioRanges[k]===0&&positiveNumber(b.audioRanges[k]))open.push("OFFLINE_"+k.toUpperCase()+"_FLAT_VS_REPEATER");
    }
  }
  // Never call this perceptual acceptance, even when source metrics appear equal.
  return {status:fail.length?"SOURCE_OR_CONFIGURATION_MISMATCH":open.length?"READ_ONLY_EVIDENCE_INCOMPLETE":"READ_ONLY_PARITY_CONSISTENT",
    fail,open,offline:o,repeater:b,
    physical:"NOT_VERIFIED; OWNER-VISIBLE OFFLINE EXCELLENCE AND SAME-SESSION A/B STILL REQUIRED",
    uv:"NO_PHYSICAL_UV_OFF_INFERENCE_FROM_JSON",isolation:"NO_DEVICE_WRITE_NO_WAN_CHANGE"};
}
module.exports={analyze};
if(typeof require!=="undefined"&&require.main===module){
  const fs=require("fs");
  if(process.argv.length!==3){console.error("usage: node <script> <sanitized-paired-snapshots.json>");process.exitCode=2;}
  else { const report=analyze(JSON.parse(fs.readFileSync(process.argv[2],"utf8"))); console.log(JSON.stringify(report,null,2));if(report.fail.length)process.exitCode=1; }
}

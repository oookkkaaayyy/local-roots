// REVIEW_ONLY native overlay v1 protocol for the authenticated v35 Opal relay.
// No generic WLED projection, device I/O, score mutations, or admission switch.
import { proposeNativeOverlayOnly, inspectAux22DdpWithOffPwm } from './matrix-overlay-safe-review.mjs';

export const GLOW_V1_OPS = ['overlay_v1_next','overlay_v1_authorize','overlay_v1_ack','overlay_v1_restored'];
const bad = (error, status=409) => ({status,body:{error}});
const asJson = (body,status=200) => ({status,body});
const int = x => Number.isSafeInteger(x);
const mac = x => String(x??'').toLowerCase().replaceAll(':','');
const hbnfKeys = ['candidate','schema','effectId','scene','vibe','energy','variation',
  'motion','audioResponse','matrixBrightness','auxBrightness','palette'];
const segKeys = ['id','start','stop','fx','on','bri','pal'];
const picked = (source,keys) => Object.fromEntries(keys.filter(k=>Object.hasOwn(source??{},k)).map(k=>[k,source[k]]));
export function captureOverlayProfile(snapshot) {
  const {info,state,build,auxInfo,auxState,auxConfig}=snapshot??{};
  if (!info||!state||!build||!auxInfo||!auxState||!auxConfig||
    !Array.isArray(state.seg)||!Array.isArray(auxState.seg)||!state.HBNF||
    !int(state.bri)||!int(auxState.bri)||!int(info.leds?.count)||!int(auxInfo.leds?.count))
      throw Error('paired_overlay_readback_incomplete');
  const ddp=inspectAux22DdpWithOffPwm({auxInfo,auxState,auxConfig});
  if(!ddp.compatible) throw Error(ddp.reason);
  const profile = {
    matrix:{mac:mac(info.mac),version:String(info.ver??''),leds:info.leds.count,
      buildRelease:build.release_id,global:picked(state,['on','ps','bri']),
      audioReactive:state.AudioReactive??null,
      segments:state.seg.map(s=>picked(s,segKeys)),
      hbnf:picked(state.HBNF,hbnfKeys)},
    aux:{mac:mac(auxInfo.mac),ip:auxInfo.ip,leds:auxInfo.leds.count,
      ddp:picked(auxInfo,['live','lm','lip']),
      global:picked(auxState,['on','bri','lor']),
      segments:auxState.seg.map(s=>picked(s,segKeys)),
      forceMaxBrightness:auxConfig?.if?.live?.maxbri,
      buses:auxConfig.hw.led.ins.map(x=>picked(x,['start','len','pin','type'])),
      ddpRgbPixels:ddp.ddpRgbPixels,pwmOffPins:ddp.pwmOffPins}
  };
  return profile;
}
const hex = bytes => Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
async function digestText(value) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));
}
export async function overlayPreimageHash(snapshot) {
  return digestText(JSON.stringify(captureOverlayProfile(snapshot)));
}
function activeGlow(context,now) {
  const state=context?.desired?.state, rev=context?.desired?.revision, fence=context?.fence;
  if (!state||state.power!=='on'||!int(rev)||!fence?.active||!int(fence.epoch)||
      typeof fence.release_id!=='string'||!Array.isArray(state.overlays)) throw Error('cart_context_not_admitted');
  const active=state.overlays.filter(x=>Number(x?.expiresAt)>now);
  const glows=active.filter(x=>x?.kind==='scoreboard'&&x?.priority===20&&x?.payload?.label==='GLOW');
  if(glows.length!==1||active.some(x=>x!==glows[0]&&Number(x?.priority)>=20))throw Error('owner_priority_or_glow_source_unavailable');
  const raw=glows[0], entries=raw?.payload?.entries;
  if(typeof raw.id!=='string'||!/^glow-[a-zA-Z0-9-]{10,100}$/.test(raw.id)||
     !Array.isArray(entries)||entries.length<1||entries.length>12||
     entries.some(e=>typeof e!=='string'||e.length<1||e.length>48||/[\x00-\x1f\x7f]/.test(e)))
     throw Error('canonical_glow_payload_invalid');
  const ttlMs=Math.min(20000,Math.round(Number(raw.expiresAt)-now));
  if(ttlMs<1000)throw Error('glow_window_expired');
  return {canonicalId:raw.id,revision:rev,fence,ttlMs,entries};
}
export async function proposeCanonicalOverlay(context,snapshot,now) {
  const intent=activeGlow(context,now);
  const content={kind:'scoreboard',ttlMs:intent.ttlMs,label:'GLOW',entries:intent.entries};
  const id='hbnf-'+(await digestText(JSON.stringify({rev:intent.revision,fence:intent.fence.epoch,sourceId:intent.canonicalId,entries:intent.entries}))).slice(0,32);
  const proposal=proposeNativeOverlayOnly({matrixInfo:snapshot.info,matrixState:snapshot.state,
    matrixBuild:snapshot.build,auxInfo:snapshot.auxInfo,auxState:snapshot.auxState,auxConfig:snapshot.auxConfig,
    ownerPriorityClear:true,overlay:{id,...content}});
  if(!proposal.eligible)throw Error(proposal.reason);
  if(snapshot.auxConfig?.if?.live?.maxbri!==false)throw Error('aux_receiver_brightness_override');
  return {intent,proposal,preimageHash:await overlayPreimageHash(snapshot)};
}
async function rpc(db,name,args) {
  const r=await db.rpc(name,args);if(r?.error)throw Error('overlay_database_rejected');return r?.data;
}
const fields = ['info','state','build','auxInfo','auxState','auxConfig'];
export async function readPairedForm(form) {
  if(!form||typeof form.get!=='function')throw Error('paired_form_missing');
  const snapshot={};
  for(const k of fields){const file=form.get(k);
    if(!file||typeof file.text!=='function'||!int(file.size)||file.size>100000||file.size<2)
      throw Error('paired_form_invalid');
    snapshot[k]=JSON.parse(await file.text());
  }
  return snapshot;
}
export async function runOverlayV1({operation,form,db,relayId,admitted=false,now=Date.now()}) {
  // Hard-wired caller-side false in v35 review index. Never accept a request flag.
  if(admitted!==true)return bad('native_overlay_v1_not_admitted',503);
  if(!GLOW_V1_OPS.includes(operation)||form?.get('relayId')!==relayId||relayId!=='opal-hbnf-cart')
    return bad('invalid_overlay_v1_request',400);
  let snapshot, context, desired;
  try {
    snapshot=await readPairedForm(form);
    const raw=await rpc(db,'hbnf_cart_get_context',{p_cart_id:'hbnf-cart'});
    context=raw;
    if(operation==='overlay_v1_next'||operation==='overlay_v1_authorize') desired=activeGlow(context,now);
  } catch(e){return bad(e.message||'overlay_preflight_unavailable',422);}
  const id=String(form.get('challengeId')??'');
  if(operation!=='overlay_v1_next'&&!/^[0-9a-f-]{36}$/i.test(id))return bad('invalid_overlay_challenge',400);
  if(operation==='overlay_v1_next') {
    let target;
    try{target=await proposeCanonicalOverlay(context,snapshot,now);}catch(e){return bad(e.message,422);}
    let challenge;
    try {challenge=await rpc(db,'hbnf_cart_glow_overlay_v1_issue',{
      p_relay_id:relayId,p_desired_revision:target.intent.revision,
      p_fence_epoch:target.intent.fence.epoch,p_release_id:target.intent.fence.release_id,
      p_canonical_overlay_id:target.intent.canonicalId,
      p_native_overlay_id:target.proposal.expectedOverlayId,
      p_ttl_ms:target.intent.ttlMs,p_preimage_sha256:target.preimageHash});}
    catch {return bad('overlay_challenge_issue_rejected',409);}
    if(typeof challenge!=='string'||!/^[0-9a-f-]{36}$/i.test(challenge))return bad('overlay_challenge_issue_invalid',503);
    return asJson({protocol:'hbnf-native-glow-overlay-v1',challengeId:challenge,
      overlayId:target.proposal.expectedOverlayId,
      matrixPayload:target.proposal.payload,
      expiresInSeconds:20,applyAuthorized:false,
      physicalDisplayConfirmed:false});
  }
  if(operation==='overlay_v1_authorize') {
    let target;
    try{target=await proposeCanonicalOverlay(context,snapshot,now);}catch(e){return bad(e.message,422);}
    if(form.get('overlayId')!==target.proposal.expectedOverlayId)return bad('overlay_id_or_revision_changed',409);
    let allowed;
    try {allowed=await rpc(db,'hbnf_cart_glow_overlay_v1_authorize',{
      p_relay_id:relayId,p_challenge_id:id,p_native_overlay_id:target.proposal.expectedOverlayId,
      p_preimage_sha256:target.preimageHash});}
    catch{return bad('overlay_apply_authorization_unavailable',503);}
    if(allowed!==true)return bad('overlay_apply_not_authorized',409);
    return asJson({protocol:'hbnf-native-glow-overlay-v1',status:'apply_once',
      matrixPayload:target.proposal.payload,overlayId:target.proposal.expectedOverlayId,
      auxWriteRequired:false,physicalDisplayConfirmed:false});
  }
  let profile;
  try{profile=await overlayPreimageHash(snapshot);}catch(e){return bad(e.message,422);}
  if(operation==='overlay_v1_ack') {
    const nativeId=String(snapshot.state?.HBNF?.overlayId??'');
    if(!/^hbnf-[a-f0-9]{32}$/.test(nativeId))return bad('overlay_id_not_acknowledged',409);
    let ok;
    try{ok=await rpc(db,'hbnf_cart_glow_overlay_v1_ack',{
       p_relay_id:relayId,p_challenge_id:id,p_native_overlay_id:nativeId,
       p_preimage_sha256:profile});}
    catch{return bad('overlay_ack_database_unavailable',503);}
    if(ok!==true)return bad('overlay_ack_not_confirmed',409);
    return asJson({protocol:'hbnf-native-glow-overlay-v1',status:'json_ack_only',
      matrixOverlayIdConfirmed:true,auxStateUnchanged:true,physicalDisplayConfirmed:false});
  }
  if(snapshot.state?.HBNF?.overlayId!=null)return bad('overlay_not_restored',409);
  let ok;
  try{ok=await rpc(db,'hbnf_cart_glow_overlay_v1_restored',{
    p_relay_id:relayId,p_challenge_id:id,p_preimage_sha256:profile,p_observed_overlay_id:null});}
  catch{return bad('overlay_restore_database_unavailable',503);}
  if(ok!==true)return bad('overlay_restore_not_confirmed',409);
  return asJson({protocol:'hbnf-native-glow-overlay-v1',status:'json_restored_only',
    matrixOriginalProfileConfirmed:true,auxStateUnchanged:true,physicalRestorationConfirmed:false});
}

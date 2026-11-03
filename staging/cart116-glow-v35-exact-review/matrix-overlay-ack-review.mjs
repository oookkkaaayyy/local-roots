/**
 * Track C review-only acceptance assertions against Controls Track A v35 review.
 * NO WLED/Opal/Supabase network access, command transport or release admission.
 * R6 firmware reference: 00e6552.../firmware/phase2/integration-r6-f89-compact-font/
 * usermod/usermod_hbnf_foundation_v1.cpp (overlay parsing, brightness, segment owner).
 */
export const REVIEW_CONTROL_HEAD='1f38a99240d77077ad5fd772aea83aaf41164357';
export const MATRIX_R6='hbnf-cart2-phase2-r6-skins-readable-20261014';
const MATRIX_MAC='704bca5b345c', AUX_MAC='8c94df55c34c', MATRIX_IP='192.168.77.10';
const mac=x=>String(x??'').toLowerCase().replaceAll(':','');
const num=x=>Number.isInteger(x);
const copy=x=>JSON.parse(JSON.stringify(x));
const fail=reason=>({pass:false,reviewOnly:true,mutationAuthorized:false,reason});
const success=(phase,data={})=>({pass:true,phase,reviewOnly:true,mutationAuthorized:false,...data});

// Limit comparison to stable configuration: do NOT compare naturally changing
// audio levels, fps, effect animation signature or background counters.
function matrixCore(state){
  const h=state.HBNF;
  return {
    on:state.on,bri:state.bri,ps:state.ps,
    seg:state.seg.map(s=>({id:s.id,start:s.start,stop:s.stop,fx:s.fx,on:s.on,bri:s.bri,
      pal:s.pal??null,sx:s.sx??null,ix:s.ix??null})),
    hbnf:{schema:h.schema,candidate:h.candidate,effectId:h.effectId,
      scene:h.scene,vibe:h.vibe,motion:h.motion,audioResponse:h.audioResponse,
      matrixBrightness:h.matrixBrightness,auxBrightness:h.auxBrightness,
      palette:h.palette??null,energy:h.energy??null,variation:h.variation??null}
  };
}
function auxCore(info,state,config,mapping){
  return {mac:mac(info.mac),ip:info.ip,leds:info.leds.count,live:info.live,
    lm:info.lm,lip:info.lip,on:state.on,bri:state.bri,lor:state.lor,
    seg:state.seg.map(s=>({id:s.id,start:s.start,stop:s.stop,fx:s.fx,on:s.on,bri:s.bri})),
    forceMaxBrightness:config?.if?.live?.maxbri,
    ddpPhysicalPixels:mapping?.ddpPhysicalPixels,configuredPixels:mapping?.configuredPixels,
    reservedPixels:mapping?.reservedPixels,ddpEvidenceSha256:mapping?.evidenceSha256};
}
export function captureReviewPreimage(read){
  const {matrixInfo:mi,matrixBuild:mb,matrixState:ms,auxInfo:ai,auxState:as,
    auxConfig:ac,auxMapping:am,cart:ctx}=read??{};
  if(mac(mi?.mac)!==MATRIX_MAC||mac(ai?.mac)!==AUX_MAC||
     Number(mi?.leds?.count)!==534||Number(ai?.leds?.count)!==24||ai?.ip!=='192.168.77.11')
    return fail('identity_or_configured_count_mismatch');
  if(!String(mi.ver??'').startsWith('16.0.1')||mb?.release_id!==MATRIX_R6||
     ms?.HBNF?.candidate!==MATRIX_R6||ms?.HBNF?.schema!=='foundation-v1')
    return fail('installed_r6_identity_unproven');
  if(ms?.on!==true||ms?.ps!==60||ms?.bri!==255||!num(ms?.HBNF?.effectId)||
     !num(ms?.HBNF?.audioResponse)||!num(ms?.HBNF?.motion)||
     !num(ms?.HBNF?.matrixBrightness)||!num(ms?.HBNF?.auxBrightness)||
     !Array.isArray(ms?.seg)||ms.seg.length!==2||
     ms.seg.some((s,i)=>s.id!==i||s.start!==(i===0?0:512)||s.stop!==(i===0?512:534)||
        s.fx!==ms.HBNF.effectId||s.on!==true||s.bri!==255))
    return fail('wow60_native_effect_or_brightness_unproven');
  if(ms?.HBNF?.overlayId!=null)return fail('preexisting_overlay_not_clear');
  // The current AUX reports 24 configured LEDs and 3 segments. That alone
  // DOES NOT prove that exactly 22 physical underglow pixels receive DDP.
  if(!Array.isArray(as?.seg)||as.seg.length!==3||ai?.live!==true||ai?.lm!=='DDP'||
     ai?.lip!==MATRIX_IP||as?.lor!==0||ac?.if?.live?.maxbri!==false)
    return fail('aux_ddp_runtime_unproven');
  if(am?.source!=='authenticated-aux-config-plus-ddp-readback'||
     !/^[0-9a-f]{64}$/i.test(String(am.evidenceSha256??''))||
     am.configuredPixels!==24||am.ddpPhysicalPixels!==22||am.reservedPixels!==2||
     am.uvOutputsOff!==true)
    return fail('aux_24_configured_22_active_mapping_unproven');
  if(!num(ctx?.revision)||ctx.revision<0||!num(ctx?.fenceEpoch)||ctx.fenceEpoch<0||
     ctx.ownerPriorityClear!==true)return fail('canonical_owner_revision_fence_unproven');
  return success('PREIMAGE_STRUCTURALLY_QUALIFIED_NOT_DEVICE_ACCEPTED',{
    preimage:{matrixIdentity:{mac:mac(mi.mac),ver:mi.ver,count:mi.leds.count,releaseId:mb.release_id},
      matrix:matrixCore(ms),aux:auxCore(ai,as,ac,am),
      revision:ctx.revision,fenceEpoch:ctx.fenceEpoch,
      overlayId:null,sourceEvidenceSha256:am.evidenceSha256},
    caveat:'Owner/device/Mapping input authenticity must be independently verified by Controls.'
  });
}
export function proposeOverlayOnly(review,overlay){
  if(review?.pass!==true||!review?.preimage)return fail('missing_qualified_preimage');
  if(overlay?.kind!=='scoreboard'||overlay?.label!=='GLOW'||
     !/^hbnf-[0-9a-f]{32}$/.test(String(overlay?.id??''))||
     !num(overlay?.ttlMs)||overlay.ttlMs<250||overlay.ttlMs>30000||
     !Array.isArray(overlay?.entries)||overlay.entries.length<1||overlay.entries.length>12||
     overlay.entries.some(x=>typeof x!=='string'||!x.trim()||x.length>63))
    return fail('invalid_glow_overlay');
  return success('PROPOSED_ONLY_NO_APPLY',{
    payload:{HBNF:{overlay:copy(overlay)}},overlayId:overlay.id,
    note:'No WLED state/seg/fx/ps/bri or AUX write. Not wired to existing Opal paired sender.'
  });
}
function sameCore(pre,read){
  if(!read?.matrixState?.HBNF||!Array.isArray(read.matrixState.seg)||
     !read?.matrixInfo||!read?.matrixBuild||
     mac(read.matrixInfo.mac)!==pre.matrixIdentity.mac||
     read.matrixInfo.ver!==pre.matrixIdentity.ver||
     read.matrixInfo.leds?.count!==pre.matrixIdentity.count||
     read.matrixBuild.release_id!==pre.matrixIdentity.releaseId||
     !read?.auxInfo||!read?.auxState||!Array.isArray(read.auxState.seg)||!read?.auxConfig)return false;
  return JSON.stringify(pre.matrix)===JSON.stringify(matrixCore(read.matrixState))&&
    JSON.stringify(pre.aux)===JSON.stringify(auxCore(read.auxInfo,read.auxState,read.auxConfig,read.auxMapping));
}
/**
 * Pure readback/ACK evaluation. Never converts timeout into an apply request.
 * Caller must separately prove RPC nonce consumption and provider-side auth.
 */
export function inspectOverlayLifecycle({review,readback,challenge,phase,now,owner}={}){
  if(review?.pass!==true||!review.preimage)return fail('preimage_not_qualified');
  const pre=review.preimage;
  if(!challenge||!/^[0-9a-f-]{36}$/i.test(String(challenge.id??''))||
     !/^hbnf-[0-9a-f]{32}$/.test(String(challenge.overlayId??''))||
     !num(challenge.createdAt)||!num(challenge.expiresAt)||
     challenge.expiresAt<=challenge.createdAt||
     !num(challenge.overlayExpiresAt)||challenge.overlayExpiresAt<=challenge.createdAt||
     !num(now))return fail('invalid_challenge');
  if(challenge.revision!==pre.revision||challenge.fenceEpoch!==pre.fenceEpoch||
     challenge.oneUse!==true)return fail('stale_or_unfenced_challenge');
  if(phase==='reconnect'||phase==='timeout')return success('REOBSERVE_ONLY_NEVER_RETRY',{
    commandsIssued:0,priorChallengeExpired:now>=challenge.expiresAt,
    retryPermitted:false,overlayClearPermitted:false});
  if(!readback?.matrixState||!sameCore(pre,readback))return fail('effect_audio_brightness_preset_or_aux_drift');
  const observedId=readback.matrixState.HBNF.overlayId??null;
  if(phase==='ack'){
    if(now>=challenge.expiresAt||now>=challenge.overlayExpiresAt||
       challenge.applies!==1||challenge.applyAuthorized!==true||
       owner?.higherPriorityActive!==false)return fail('stale_duplicate_or_owner_preempted');
    if(observedId!==challenge.overlayId)return fail('overlay_id_not_acknowledged');
    return success('OVERLAY_ID_READBACK_ONLY',{
      observedOverlayId:observedId,deviceVisualAccepted:false,providerNonceConsumed:false,
      restoresPreimageUnproven:true});
  }
  if(phase==='owner_preempt'){
    if(owner?.higherPriorityActive!==true||
       !/^hbnf-[0-9a-f]{32}$/.test(String(owner.overlayId??''))||
       observedId!==owner.overlayId)return fail('owner_preemption_unverified');
    return success('OWNER_ID_PREEMPTION_READBACK_ONLY',{
      noGlowReplayRequired:true,deviceVisualAccepted:false});
  }
  if(phase==='expiry_restore'){
    if(now<challenge.overlayExpiresAt||observedId!==null||
       owner?.higherPriorityActive===true)return fail('expiry_or_prior_visual_not_restored');
    return success('CORE_RESTORED_BY_READBACK_ONLY',{
      preset:pre.matrix.ps,effectId:pre.matrix.hbnf.effectId,
      matrixBrightness:pre.matrix.hbnf.matrixBrightness,
      auxBrightness:pre.matrix.hbnf.auxBrightness,
      physicalVisualAccepted:false,energyVariationMotionPhysicallyAccepted:false});
  }
  return fail('unsupported_phase');
}

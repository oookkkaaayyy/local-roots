/**
 * Readback-only review seam for the future authenticated GLOW relay.
 * No challenge issuer, network sender, database writer, or admission switch.
 * Runtime/physical verification and a native overlay-specific SQL+Opal protocol
 * are mandatory before any one-use apply could be enabled.
 */
import { proposeNativeOverlayOnly } from './matrix-overlay-safe-review.mjs';

const blocked = reason => ({ eligible: false, reviewOnly: true, mutationAuthorized: false, reason });
const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const number = value => Number.isSafeInteger(value);

// Dynamic telemetry is intentionally omitted, while every enumerated lighting
// setting is preserved. New runtime control fields require contract review.
function matrixProfile(state) {
  const h = state && state.HBNF;
  if (!h || !Array.isArray(state.seg) || state.seg.length !== 2) return null;
  const knobs = ['candidate','schema','effectId','scene','vibe','energy',
    'variation','motion','audioResponse','matrixBrightness','auxBrightness','palette'];
  const control = {};
  for (const k of knobs) if (Object.prototype.hasOwnProperty.call(h, k)) control[k] = clone(h[k]);
  return { on: state.on, ps: state.ps, bri: state.bri,
    seg: clone(state.seg.map(s => ({ id:s.id,start:s.start,stop:s.stop,
      fx:s.fx,on:s.on,bri:s.bri,pal:s.pal }))), HBNF:control };
}
function auxProfile(info, state) {
  if (!info || !state || !Array.isArray(state.seg)) return null;
  return { mac:String(info.mac||'').toLowerCase().replaceAll(':',''),
    configured:Number(info.leds?.count), ip:info.ip,
    live:info.live, lm:info.lm, lip:info.lip,
    on:state.on, bri:state.bri, lor:state.lor,
    seg:clone(state.seg.map(s=>({id:s.id,start:s.start,stop:s.stop,
      fx:s.fx,on:s.on,bri:s.bri}))) };
}

export function stageGlowOverlayReadback({ input, capturedAt, now=Date.now() }={}) {
  if (!number(capturedAt) || !number(now) || capturedAt > now || now-capturedAt > 5000)
    return blocked('fresh_authenticated_preimage_required');
  const proposal = proposeNativeOverlayOnly(input);
  if (!proposal.eligible) return proposal;
  const matrix = matrixProfile(input.matrixState), aux=auxProfile(input.auxInfo,input.auxState);
  if (!matrix || !aux) return blocked('paired_preimage_incomplete');
  return { eligible:true, reviewOnly:true, mutationAuthorized:false,
    reason:'overlay_ack_and_recovery_source_only', payload:proposal.payload,
    expectedOverlayId:proposal.expectedOverlayId, capturedAt,
    expiresAt:now+input.overlay.ttlMs,
    preimage:{matrix,aux} };
}

export function checkGlowOverlayReadback({ticket,matrixState,auxInfo,auxState,
  ownerPriorityClear,now=Date.now(),phase}={}) {
  if (!ticket || ticket.eligible!==true || ticket.reviewOnly!==true ||
      ticket.mutationAuthorized!==false || !number(now) ||
      !number(ticket.capturedAt) || !number(ticket.expiresAt) ||
      now<ticket.capturedAt || !['apply_ack','restore'].includes(phase))
    return blocked('untrusted_or_incomplete_review_ticket');
  if (ownerPriorityClear !== true) return blocked('owner_priority_changed');
  const matrix=matrixProfile(matrixState), aux=auxProfile(auxInfo,auxState);
  if (!matrix || !aux || !same(matrix,ticket.preimage.matrix) ||
      !same(aux,ticket.preimage.aux)) return blocked('preimage_profile_or_aux_changed');
  if (phase==='apply_ack') {
    if (now >= ticket.expiresAt) return blocked('overlay_challenge_ttl_elapsed');
    if (matrixState.HBNF.overlayId!==ticket.expectedOverlayId)
      return blocked('overlay_id_not_acknowledged');
    return { eligible:true, reviewOnly:true, mutationAuthorized:false,
      jsonOverlayIdConfirmed:true, physicalDisplayConfirmed:false,
      reason:'source_readback_only_not_native_or_visual_acceptance' };
  }
  if (now < ticket.expiresAt) return blocked('restore_ttl_not_elapsed');
  if (matrixState.HBNF.overlayId != null) return blocked('overlay_not_restored');
  return { eligible:true, reviewOnly:true, mutationAuthorized:false,
    jsonRestorationConfirmed:true, physicalRestorationConfirmed:false,
    reason:'source_readback_only_not_native_or_visual_acceptance' };
}

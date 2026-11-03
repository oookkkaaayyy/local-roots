// REVIEW_ONLY protection for the existing authenticated Cart Opal relay.
// Prevent the deployed v35 full-state fx142/brightness/AUX projection from
// replacing installed WOW MAX 60 when a canonical GLOW intent is present.
// Track C must separately admit a preimage-verified overlay-only transaction.
const ERROR='glow_full_state_projection_not_admitted';
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function hasGlowIntent(context){
  const state=context?.desired?.state;
  const a=Array.isArray(state?.overlays)?state.overlays:[];
  return a.some(o=>obj(o)&&o.kind==='scoreboard'&&o?.payload?.label==='GLOW')||
    (obj(state?.glowScoreIntentCursor)&&typeof state.glowScoreIntentCursor.key==='string'&&state.glowScoreIntentCursor.key.startsWith('glow-'));
}
export function hasGlowActuatorPayload(wledPayload){
  const overlay=wledPayload?.matrix?.HBNF?.overlay;
  return obj(overlay)&&overlay.kind==='scoreboard'&&overlay.label==='GLOW';
}
export function enforcePreservedGlowRelay({context,wledPayload}={}){
  if(!hasGlowIntent(context)&&!hasGlowActuatorPayload(wledPayload))return true;
  // This is NOT release authorization. Do not remove the guard without both
  // Matrix/AUX observed preimage and paired overlay-only apply/restore proof.
  throw new Error(ERROR);
}
export const GLOW_PROJECTION_BLOCK_REASON=ERROR;

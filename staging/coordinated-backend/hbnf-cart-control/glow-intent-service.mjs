// Review-only integration for the existing, unmodified HBNF Glow planner and Cart reducer.
// This module owns NO WLED or MQTT transport, NO polling, NO league_state writes.
import { planSavedGlowOverlay } from './hbnf-glow-cart-intent.mjs';

const EVENT_DATE = '2026-11-03';
const ACTION = 'glow_scoreboard_intent';

export function isDedicatedBackend(header, serviceKey) {
  if (!serviceKey || typeof serviceKey !== 'string' || serviceKey.length < 32 || typeof header !== 'string') return false;
  const want = `Bearer ${serviceKey}`;
  let diff = want.length ^ header.length;
  for (let i=0;i<Math.max(want.length, header.length);i++) diff |= (want.charCodeAt(i)||0) ^ (header.charCodeAt(i)||0);
  return diff === 0;
}

export async function commandUuid(key) {
  const input = new TextEncoder().encode(`hbnf-cart-glow-v1|${key}`);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
  hash[6] = (hash[6] & 15) | 0x80; // RFC 9562 UUIDv8, SHA-256-derived opaque id
  hash[8] = (hash[8] & 63) | 0x80;
  const h=Array.from(hash.slice(0,16),b=>b.toString(16).padStart(2,'0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
}

export async function runGlowIntentAction({body, authorization, serviceKey, deps, now=Date.now()}) {
  // Explicit service-role boundary: do not borrow Owner device tokens, Guest access,
  // public auth sessions, or a generic action=command route.
  if (!isDedicatedBackend(authorization, serviceKey)) return {status:403, body:{error:'backend_service_role_required'}};
  if (!body || typeof body !== 'object' || Array.isArray(body) || body.action !== ACTION ||
      Object.keys(body).some(k=>!['action','weekDate'].includes(k)) ||
      body.weekDate !== EVENT_DATE) return {status:400,body:{error:'invalid_glow_intent_request'}};

  let source, cart;
  try {
    source = await deps.source(body.weekDate);
    cart = await deps.cart();
  } catch { return {status:503,body:{error:'canonical_source_unavailable'}}; }
  if (!source || !cart || typeof source !== 'object' || !source.state_json || !source.week ||
      typeof source.fingerprint !== 'string' || !/^[0-9a-f]{32}$/.test(source.fingerprint) ||
      typeof source.source_revision !== 'string') {
    return {status:503,body:{error:'canonical_source_invalid'}};
  }
  const state = source.state_json;
  if (state?.glow?.activeWeek !== body.weekDate ||
      state?.glow?.weeks?.[body.weekDate] === undefined) {
    return {status:409,body:{error:'active_week_changed'}};
  }
  // Existing v35 chooseLive() is injected by its own index.ts; no rewritten selector.
  let live;
  try { live=deps.chooseLive(state); }
  catch { return {status:422,body:{error:'glow_selector_failed'}}; }
  const rawWeek = state.glow.weeks[body.weekDate];
  if (rawWeek.date !== undefined && rawWeek.date !== body.weekDate) return {status:409,body:{error:'week_date_mismatch'}};
  const week = { ...rawWeek, date:body.weekDate }; // date comes from the authoritative DB map key
  const plan = planSavedGlowOverlay({
    liveStatus:{live,updated_at:source.source_revision},
    week,
    binding:{eventDate:source.event_date,eventId:source.event_id,
      windowStart:source.window_start,windowEnd:source.window_end,
      persistedActiveWeek:state.glow.activeWeek,
      verifiedLeagueRevision:source.source_revision},
    cartContext:cart, at:now,
    priorDispatch:cart?.desired?.state?.glowScoreIntentCursor
  });
  if (plan.kind !== 'canonical_command_candidate') {
    return {status:409,body:{error:'glow_not_eligible',reason:plan.reason}};
  }
  if (plan.type !== 'OVERLAY_START' || plan.payload.priority !== 20 ||
      plan.payload.kind !== 'scoreboard' || plan.payload.data?.label !== 'GLOW') {
    return {status:422,body:{error:'unsupported_glow_plan'}};
  }
  let commandId, nextState;
  try {
    commandId = await commandUuid(plan.key);
    // This is the *deployed v35 canonical reducer*, injected by index.ts.
    nextState = deps.reduceCartCommand(cart.desired.state, plan.type, plan.payload, commandId, plan.expectedRevision);
  } catch { return {status:422,body:{error:'canonical_reducer_unavailable'}}; }
  if (!nextState) return {status:422,body:{error:'canonical_reducer_rejected'}};
  nextState.glowScoreIntentCursor = { key:plan.key, sourceRevision:plan.source.leagueRevision };

  let result;
  try {
    result = await deps.commit({
      p_week_date:plan.source.weekDate,
      p_source_revision:plan.source.leagueRevision,
      p_fingerprint:source.fingerprint,
      p_signature:plan.source.signature,
      p_cart_revision:plan.expectedRevision,
      p_fence_epoch:plan.requiredFence.epoch,
      p_release_id:plan.requiredFence.releaseId,
      p_command_id:commandId,
      p_intent_key:plan.key,
      p_next_state:nextState,
    });
  } catch { return {status:409,body:{error:'canonical_commit_unavailable_or_stale'}}; }
  if (!result || !['COMMITTED','DUPLICATE'].includes(result.status) ||
      !Number.isSafeInteger(Number(result.desired_revision))) return {status:409,body:{error:'canonical_glow_commit_rejected'}};
  return {status:202,body:{status:result.status, desiredRevision:Number(result.desired_revision),
    sourceRevision:plan.source.leagueRevision, scoreFingerprint:source.fingerprint,
    relayStatus:'PENDING_OPAL_PULL',deviceReadback:'NOT_CHECKED',visibleScoreboard:'NOT_CHECKED',
    physicalOwnerPrecedence:'NOT_CHECKED',installedMatrixParity:'NOT_CHECKED'}};
}

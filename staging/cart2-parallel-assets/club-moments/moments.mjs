/**
 * HBNF Cart S1/B5.03: read-only authoritative Skins -> bounded Matrix moment intents.
 * Pure functions. Does not poll Supabase, mutate scorecards, enqueue cloud commands,
 * contact devices, or install anything. Feed *two* confirmed authoritative snapshots
 * from the existing skins_score_state read API, not raw user-submitted scores.
 *
 * Reuse the deployed OVERLAY_START text contract only after the active guest/cart
 * transport is qualified. An HTTP 202 is not a physical Matrix acknowledgement.
 */
const SECTIONS = Object.freeze(['front', 'back']);
const MAX_FRESH_MS = 120_000;
const MAX_AUTO_TEXT = 31; // actual text field allows 63; shorter is more legible at 32x16

function goodTime(value) {
  if (typeof value !== 'string' || !/\d{4}-\d\d-\d\dT/.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}
function cleanName(value) {
  // The live league format may contain team pairs "A / B". Display ASCII-safe,
  // without control characters or syntax that could confuse the 32x16 font.
  const text = String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9 .&/_'-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > 17 ? text.slice(0, 16).replace(/\s+$/, '') + '~' : text;
}
function simpleHash(text) {
  // Two independent noncryptographic accumulators: stable compact display IDs.
  // IDs are only for dedupe, not for authentication or authorization.
  let a = 2166136261, b = 2654435761;
  for (const ch of String(text)) {
    const c = ch.charCodeAt(0);
    a = Math.imul(a ^ c, 16777619);
    b = Math.imul(b ^ c, 2246822519);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
function validSectionCards(value) { return Array.isArray(value) && value.every(x => x && typeof x === 'object' && Array.isArray(x.holes)); }
function makeMoment(kind, roundDate, section, cardId, hole, winnerId, name, observedAt) {
  const person = cleanName(name);
  if (!person) return null;
  const key = JSON.stringify([kind, roundDate, section, cardId, hole, winnerId]);
  const id = `club-${simpleHash(key)}`;
  const rawText = kind === 'ace' ? `ACE! ${person}` : kind === 'tiebreaker'
    ? `${person} WINS TIEBREAK` : `${person} WINS H${hole}`;
  const text = rawText.slice(0, MAX_AUTO_TEXT);
  return {
    id, kind, roundDate, section, cardId, hole, winnerId: String(winnerId),
    text, priority: 40, ttlMs: kind === 'ace' ? 7500 : 5500,
    color: kind === 'ace' ? '#FFD066' : '#B9FF72', fontIndex: 4,
    observedAt
  };
}
/**
 * Detect *new* awards only. First observation, changed dates, clock regressions,
 * bulk imports and corrections never trigger celebrations. Seen IDs may be supplied
 * from a durable acknowledged-event cursor; we do not mutate it.
 */
export function detectClubMoments(previous, current, { now, seenIds = [] } = {}) {
  if (!previous || !current || !Number.isFinite(now) || now < 0) return [];
  if (typeof previous.round_date !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(current.round_date)
      || previous.round_date !== current.round_date) return [];
  const oldTime = goodTime(previous.updated_at), newTime = goodTime(current.updated_at);
  if (oldTime === null || newTime === null || newTime <= oldTime || newTime > now + 30_000
    || now - newTime > MAX_FRESH_MS) return [];
  if (!previous.sections || !current.sections || !previous.ace || !current.ace) return [];
  const delivered = new Set(Array.isArray(seenIds) ? seenIds : []);
  const moments = [];
  for (const section of SECTIONS) {
    const beforeCards = previous.sections[section], afterCards = current.sections[section];
    if (!validSectionCards(beforeCards) || !validSectionCards(afterCards)) return [];
    const before = new Map(beforeCards.map(card => [String(card.id), card]));
    for (const card of afterCards) {
      const old = before.get(String(card.id));
      if (!old || !Array.isArray(card.participants)) continue; // newly added card: no celebration
      const allowed = new Set(card.participants.map(p => String(p.id)));
      const oldHoles = new Map(old.holes.map(h => [Number(h.hole), h]));
      for (const hole of card.holes) {
        const n = Number(hole.hole), prior = oldHoles.get(n);
        if (!prior || !Number.isInteger(n) || n < (section === 'front' ? 1 : 10)
          || n > (section === 'front' ? 9 : 18)) continue;
        const winner = String(hole.winner_id || '');
        if (!prior.winner_id && winner && allowed.has(winner)) {
          const e = makeMoment('hole', current.round_date, section, String(card.id), n,
            winner, hole.winner_name, newTime);
          if (e && !delivered.has(e.id)) moments.push(e);
        }
      }
      const t = card.tiebreaker, pt = old.tiebreaker;
      if (t && pt && !pt.winner_id && t.winner_id && allowed.has(String(t.winner_id))
          && Number.isInteger(Number(t.carry)) && Number(t.carry) > 0) {
        const e = makeMoment('tiebreaker', current.round_date, section, String(card.id), 'tb',
          String(t.winner_id), t.winner_name, newTime);
        if (e && !delivered.has(e.id)) moments.push(e);
      }
    }
    const ace = current.ace[section], oldAce = previous.ace[section];
    if (ace && oldAce && !String(oldAce.winner_name || '').trim()
      && String(ace.winner_name || '').trim()) {
      // Ace winner must appear on current authoritative participant list.
      const name = String(ace.winner_name).trim();
      if (Array.isArray(ace.participants) && ace.participants.some(p => p.name === name)) {
        const e = makeMoment('ace', current.round_date, section, 'ace', '', name, name, newTime);
        if (e && !delivered.has(e.id)) moments.push(e);
      }
    }
  }
  // Bulk score import/replay is not an event to celebrate dozens of times.
  if (moments.length > 3) return [];
  const rank = { ace: 0, tiebreaker: 1, hole: 2 };
  return moments.sort((a, b) => rank[a.kind] - rank[b.kind] || a.id.localeCompare(b.id));
}
/**
 * Build a side-effect-free command *proposal* only when the current runtime is
 * explicitly qualified and idle. The host must still authorize, send and observe
 * device readback. Never mark a moment delivered merely because an API returned 2xx.
 */
export function planClubMomentOverlay(moment, gate) {
  if (!moment || !/^(ace|hole|tiebreaker)$/.test(String(moment.kind))
    || !/^club-[0-9a-f]{16}$/.test(String(moment.id))
    || typeof moment.text !== 'string' || !moment.text.length || moment.text.length > MAX_AUTO_TEXT
    || !/^#[0-9A-F]{6}$/.test(String(moment.color))
    || !Number.isInteger(moment.ttlMs) || moment.ttlMs < 1000 || moment.ttlMs > 30000) return null;
  if (!gate || gate.authoritativeReadConfirmed !== true || gate.cartOnline !== true
    || gate.matrixObservedReady !== true || gate.ownerAllowsMoments !== true
    || gate.guestCloudPathQualified !== true || gate.gameActive !== false
    || gate.ownerTextActive !== false || !Number.isFinite(gate.now)
    || !Array.isArray(gate.activeOverlays) || !Array.isArray(gate.acknowledgedIds)) return null;
  if (gate.acknowledgedIds.includes(moment.id)) return null;
  if (gate.activeOverlays.some(x => x && Number(x.expiresAt) > gate.now)) return null;
  if (!Number.isFinite(moment.observedAt) || gate.now - moment.observedAt > MAX_FRESH_MS
    || moment.observedAt > gate.now + 30_000) return null;
  return {
    type: 'OVERLAY_START',
    payload: { overlayId: moment.id, kind: 'text', priority: 40,
      ttlMs: moment.ttlMs, data: { text: moment.text, color: moment.color, fontIndex: 4 } }
  };
}

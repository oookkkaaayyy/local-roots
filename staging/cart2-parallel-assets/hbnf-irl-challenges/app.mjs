/**
 * HBNF IRL putting-games — browser-only prototype.
 * Uses existing deterministic engine; no API/device/scoring calls.
 * Saved state is local to this browser, never a canonical HBNF scorecard.
 */
import {
  createPuttingGame, currentPuttingChallenge, recordPuttingAttempt,
  puttingStandings, restorePuttingGame
} from './engine.mjs';

export const GAME_KEY = 'hbnf-cart-irl-games-v1';
const MAX_SESSION_CHARS = 8192;
const MIN_TAP_GAP_MS = 600;
function ensure(ok, reason) { if (!ok) throw Error(reason); }
function duplicate(value) { return JSON.parse(JSON.stringify(value)); }
function validSession(value) {
  ensure(value && value.schema === 1 && value.game, 'invalid session');
  const game = restorePuttingGame(value.game);
  let undo = null;
  if (value.undo != null) {
    undo = restorePuttingGame(value.undo);
    ensure(undo.mode === game.mode && JSON.stringify(undo.players) === JSON.stringify(game.players), 'undo belongs to another game');
    ensure(undo.revision + 1 === game.revision && undo.done === false, 'invalid undo revision');
  }
  return { schema: 1, game, undo };
}

export function startSession(options) { return validSession({schema:1, game:createPuttingGame(options), undo:null}); }
export function commitAttempt(session, expectedRevision, made) {
  const before = validSession(session);
  const after = recordPuttingAttempt(before.game, {expectedRevision, made});
  return validSession({schema:1, game:after, undo:before.game});
}
export function undoAttempt(session) {
  const current = validSession(session);
  ensure(current.undo !== null, 'no attempt to undo');
  return validSession({schema:1, game:current.undo, undo:null});
}
export function readSession(storage) {
  if (!storage) return null;
  let str;
  try { str = storage.getItem(GAME_KEY); } catch (_) { return null; }
  if (!str || str.length > MAX_SESSION_CHARS) return null;
  try { return validSession(JSON.parse(str)); } catch (_) { return null; }
}
export function writeSession(storage, session) {
  if (!storage) return false;
  const json = JSON.stringify(validSession(session));
  ensure(json.length <= MAX_SESSION_CHARS, 'session too large');
  try { storage.setItem(GAME_KEY, json); return true; } catch (_) { return false; }
}
export function clearSession(storage) {
  if (!storage) return false;
  try { storage.removeItem(GAME_KEY); return true; } catch (_) { return false; }
}
export function gameView(session) {
  const s = validSession(session), g = s.game;
  return {
    mode: g.mode, revision: g.revision, done: g.done,
    round: g.round + (g.done ? 0 : 1), maxRounds: g.maxRounds,
    turn: g.playerIndex + 1, playersCount: g.players.length,
    challenge: currentPuttingChallenge(g),
    standings: puttingStandings(g), canUndo: !!s.undo
  };
}

// Keep the tested game/session logic usable in Node without a DOM.
if (typeof document !== 'undefined') {
  const $ = id => document.getElementById(id);
  const el = {
    setup:$('setup'), game:$('game'), mode:$('mode'), people:$('players'),
    rounds:$('rounds'), start:$('start'), error:$('error'), prompt:$('prompt'),
    round:$('roundLabel'), status:$('status'), table:$('leaderboard'),
    made:$('made'), missed:$('missed'), undo:$('undo'), reset:$('reset'),
    resume:$('resume'), restore:$('restore'), note:$('storageNote'),
    finish:$('finish'), summary:$('summary'), banner:$('banner')
  };
  let storage = null;
  try { storage = window.localStorage; } catch (_) { /* private mode */ }
  let session = readSession(storage), saved = session, lastTapAt = -Infinity;
  function showError(message) { el.error.textContent = message || ''; }
  function setRoundDefault() { el.rounds.value = el.mode.value === 'ladder' ? '12' : '10'; }
  function persist() {
    const ok = session ? writeSession(storage, session) : clearSession(storage);
    el.note.textContent = ok ? 'Saved on this phone only (not HBNF scoring).' :
      'Local storage unavailable: this game will not survive a reload.';
    if (ok) saved = session;
  }
  function render() {
    el.setup.hidden = !!session;
    el.game.hidden = !session;
    el.resume.hidden = !saved || !!session;
    el.restore.hidden = !session;
    if (!session) return;
    const v = gameView(session);
    const title = v.mode === 'ladder' ? 'Pressure Ladder' : 'Putting Gauntlet';
    el.banner.textContent = title;
    el.round.textContent = `Round ${v.round} of ${v.maxRounds} · Player ${v.turn} of ${v.playersCount}`;
    el.prompt.textContent = v.done ? 'GAME COMPLETE' : v.challenge.prompt;
    el.status.textContent = v.done ? 'All turns completed. Final standings below.' :
      `Next: ${v.challenge.player} · ${v.challenge.feet} ft · ${v.challenge.stance.toLowerCase()}`;
    el.made.disabled = el.missed.disabled = v.done;
    el.undo.disabled = !v.canUndo;
    el.finish.hidden = !v.done;
    // DOM replaceChildren arrived in Safari 14; support the iOS 12 Cart iPad.
    while (el.table.firstChild) el.table.removeChild(el.table.firstChild);
    for (const r of v.standings) {
      const tr = document.createElement('tr');
      for (const part of [r.name, String(r.makes) + '/' + String(r.attempts),
        v.mode === 'ladder' ? String(r.rung) + '/6' : '—']) {
        const cell = document.createElement('td'); cell.textContent = part; tr.appendChild(cell);
      }
      el.table.appendChild(tr);
    }
    const first = v.standings[0];
    const winners = v.standings.filter(s => v.mode === 'ladder'
      ? s.rung === first.rung && s.makes === first.makes
      : s.makes === first.makes);
    el.summary.textContent = v.done ? `Winner: ${winners.map(s => s.name).join(', ')}` : '';
  }
  el.mode.addEventListener('change', setRoundDefault);
  el.start.addEventListener('click', () => {
    try {
      const players = el.people.value.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
      session = startSession({mode:el.mode.value, players, maxRounds:Number(el.rounds.value)});
      lastTapAt = -Infinity; showError(''); persist(); render();
    } catch (err) { showError(err.message); }
  });
  function score(made) {
    if (!session || session.game.done) return;
    const now = Date.now();
    if (now - lastTapAt < MIN_TAP_GAP_MS) return;
    try {
      session = commitAttempt(session, session.game.revision, made);
      lastTapAt = now; persist(); render();
    } catch (err) { showError(err.message); }
  }
  el.made.addEventListener('click', () => score(true));
  el.missed.addEventListener('click', () => score(false));
  el.undo.addEventListener('click', () => {
    if (!session || Date.now() - lastTapAt < MIN_TAP_GAP_MS) return;
    try { session = undoAttempt(session); lastTapAt = Date.now(); persist(); render(); }
    catch (err) { showError(err.message); }
  });
  el.reset.addEventListener('click', () => {
    if (!window.confirm('End this game and clear saved progress?')) return;
    session = null; saved = null; lastTapAt = -Infinity; clearSession(storage);
    showError(''); render();
  });
  el.resume.addEventListener('click', () => { session = saved; lastTapAt = -Infinity; render(); });
  el.restore.addEventListener('click', () => { session = null; render(); });
  window.addEventListener('storage', e => {
    if (e.key !== GAME_KEY) return;
    // A different tab changed the game; stop local mutations until user reloads.
    if (session) { el.made.disabled = true; el.missed.disabled = true; el.undo.disabled = true;
      el.status.textContent = 'Game changed in another tab. Reload this page to continue safely.'; }
    else { saved = readSession(storage); render(); }
  });
  setRoundDefault(); render();
  if (!session) el.note.textContent = 'Your game is saved on this phone only; it does not affect HBNF scores or Cart lights.';
}

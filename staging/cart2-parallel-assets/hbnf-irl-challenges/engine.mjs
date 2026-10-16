/**
 * HBNF IRL putting-game challenge engine. Isolated, deterministic and side-effect-free.
 * No scoring-site mutation, cloud access, timer, firmware, WLED or gamepad dependency.
 * Candidate modes: Putting Gauntlet and Pressure Ladder (B5.02).
 * The returned prompt is bounded for the existing 63-character Matrix text overlay.
 */
const DISTANCES = Object.freeze([10, 15, 20, 25, 30, 35]);
const STANCES = Object.freeze(['NORMAL', 'STRADDLE', 'STAGGER']);
const MODES = Object.freeze(['gauntlet', 'ladder']);
const MAX_PLAYERS = 12;

function integer(x) { return typeof x === 'number' && Number.isSafeInteger(x); }
function requireValid(ok, message) { if (!ok) throw new Error(message); }
function copy(v) { return JSON.parse(JSON.stringify(v)); }
function validateNames(names) {
  requireValid(Array.isArray(names) && names.length >= 1 && names.length <= MAX_PLAYERS, 'players must be 1 to 12');
  const result = names.map(n => String(n).trim().toUpperCase());
  for (const n of result) requireValid(/^[A-Z0-9 _-]{1,12}$/.test(n), 'player names must be 1-12 safe characters');
  requireValid(new Set(result).size === result.length, 'duplicate player names');
  return result;
}
function validateGame(s) {
  requireValid(s && s.version === 1 && MODES.includes(s.mode), 'invalid game');
  const names = validateNames(s.players);
  requireValid(integer(s.seed) && s.seed >= 0 && s.seed <= 9999, 'invalid seed');
  requireValid(integer(s.maxRounds) && s.maxRounds >= 1 && s.maxRounds <= 24, 'invalid rounds');
  requireValid(integer(s.round) && s.round >= 0 && s.round <= s.maxRounds, 'invalid round');
  requireValid(integer(s.playerIndex) && s.playerIndex >= 0 && s.playerIndex < names.length, 'invalid player index');
  requireValid(integer(s.revision) && s.revision >= 0 && s.revision <= 1000000, 'invalid revision');
  requireValid(typeof s.done === 'boolean', 'invalid completion state');
  requireValid(Array.isArray(s.makes) && Array.isArray(s.attempts) && Array.isArray(s.rungs), 'invalid results');
  for (const list of [s.makes, s.attempts, s.rungs]) {
    requireValid(list.length === names.length && list.every(v => integer(v) && v >= 0 && v <= 100), 'invalid player progress');
  }
  s.attempts.forEach((attempts,i) => {
    requireValid(s.makes[i] <= attempts && s.rungs[i] <= DISTANCES.length, 'invalid result totals');
  });
  requireValid(s.done === (s.round >= s.maxRounds || s.finished === true), 'invalid finish marker');
}
export function createPuttingGame({ mode, players, seed = 0, maxRounds } = {}) {
  requireValid(MODES.includes(mode), 'unsupported putting mode');
  const names = validateNames(players);
  requireValid(integer(seed) && seed >= 0 && seed <= 9999, 'invalid seed');
  const rounds = maxRounds === undefined ? (mode === 'gauntlet' ? 10 : 12) : maxRounds;
  requireValid(integer(rounds) && rounds >= 1 && rounds <= 24, 'round count must be 1-24');
  return { version: 1, mode, players: names, seed, maxRounds: rounds,
    round: 0, playerIndex: 0, revision: 0, done: false, finished: false,
    attempts: names.map(() => 0), makes: names.map(() => 0), rungs: names.map(() => 0) };
}
export function currentPuttingChallenge(state) {
  validateGame(state);
  if (state.done) return null;
  const name = state.players[state.playerIndex];
  const stance = STANCES[(state.seed + state.round) % STANCES.length];
  const feet = state.mode === 'gauntlet'
    ? DISTANCES[state.round % DISTANCES.length]
    : DISTANCES[Math.min(state.rungs[state.playerIndex], DISTANCES.length-1)];
  const prompt = `${name} ${feet}FT ${stance} R${state.round + 1}`;
  requireValid(prompt.length <= 63, 'Matrix prompt too long');
  return { revision: state.revision, player: name, playerIndex: state.playerIndex,
    round: state.round + 1, feet, stance, prompt, maxChars: 63 };
}
/** Advance only if the UI supplies the revision it rendered; prevents double-tap effects. */
export function recordPuttingAttempt(state, { expectedRevision, made } = {}) {
  validateGame(state);
  requireValid(!state.done, 'game already finished');
  requireValid(integer(expectedRevision) && expectedRevision === state.revision, 'stale or duplicate result');
  requireValid(typeof made === 'boolean', 'result must be make or miss');
  const n = copy(state), i = n.playerIndex;
  n.attempts[i]++;
  if (made) {
    n.makes[i]++;
    if (n.mode === 'ladder') n.rungs[i] = Math.min(DISTANCES.length, n.rungs[i]+1);
  }
  n.revision++;
  if (i + 1 < n.players.length) n.playerIndex++;
  else {
    n.playerIndex = 0;
    n.round++;
    // Ladder ends after every player receives the same number of turns,
    // including the last turn in which anyone finishes the 35ft rung.
    n.finished = n.mode === 'ladder' && n.rungs.some(v => v >= DISTANCES.length);
    n.done = n.finished || n.round >= n.maxRounds;
  }
  validateGame(n);
  return n;
}
export function puttingStandings(state) {
  validateGame(state);
  return state.players.map((name, i) => ({name, attempts: state.attempts[i], makes: state.makes[i], rung: state.rungs[i]}))
    .sort((a,b) => (state.mode === 'ladder' ? b.rung-a.rung : b.makes-a.makes)
      || (b.makes-a.makes) || (a.attempts-b.attempts) || a.name.localeCompare(b.name));
}
export function restorePuttingGame(value) {
  const state = typeof value === 'string' ? JSON.parse(value) : copy(value);
  validateGame(state);
  return state;
}

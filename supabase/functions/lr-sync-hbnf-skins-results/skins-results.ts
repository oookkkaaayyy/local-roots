type Json = Record<string, any>;

type PlayerRow = { id: string; name: string; players: string[] };
type CardCalc = {
  rows: PlayerRow[];
  totals: Record<string, number>;
  holes: { winner: string | null; carry: number }[];
  tiebreaker: { winner: string | null; carry: number };
};

export type SkinsResult = { place: number; name: string; skins: number; payout: number; net: number };
const SKINS_ENTRY_FEE = 10;

function lines(value: unknown) { return String(value ?? '').split(/\r?\n/).map((value) => value.trim()).filter(Boolean); }
function uniqueNames(values: unknown[]) {
  const seen = new Set<string>(); const out: string[] = [];
  for (const value of values) { const name = String(value ?? '').trim(); const key = name.toLowerCase(); if (name && !seen.has(key)) { seen.add(key); out.push(name); } }
  return out;
}
function rowsForCard(card: Json, type: 'front' | 'back'): PlayerRow[] {
  const cardId = String(card?.id || 'card_1');
  if (type === 'front') return lines(card?.playersText).map((name, index) => ({ id: `${cardId}_p_${index}`, name, players: [name] }));
  return lines(card?.teamsText).map((line, index) => { const players = uniqueNames(line.split('/')); return { id: `${cardId}_team_${index}`, name: players.length ? players.join(' / ') : line, players: players.length ? players : [line] }; });
}
function resolveWinner(raw: unknown, rows: PlayerRow[], cardId: string, type: 'front' | 'back') {
  const value = String(raw ?? '').trim(); if (!value) return null;
  const byId = rows.find((row) => row.id === value); if (byId) return byId;
  const byName = rows.find((row) => row.name === value); if (byName) return byName;
  if (type === 'front') return rows.find((row) => row.players[0] === value) ?? null;
  const legacy = /^team_(\d+)$/.exec(value); return legacy ? rows.find((row) => row.id === `${cardId}_team_${legacy[1]}`) ?? null : null;
}
function calcCard(card: Json, type: 'front' | 'back', startHole: number): CardCalc {
  const rows = rowsForCard(card, type); const cardId = String(card?.id || 'card_1'); const playerCount = rows.reduce((sum, row) => sum + Math.max(row.players.length, 1), 0);
  const totals: Record<string, number> = {}; rows.forEach((row) => { totals[row.id] = 0; }); const holes: { winner: string | null; carry: number }[] = []; let carry = 1;
  for (let i = 0; i < 9; i += 1) { const key = String(startHole + i); const row = resolveWinner(card?.winners?.[key], rows, cardId, type); if (row) { totals[row.id] = (totals[row.id] || 0) + carry * Math.max(playerCount - Math.max(row.players.length, 1), 0); holes.push({ winner: row.id, carry }); carry = 1; } else { holes.push({ winner: null, carry }); carry += 1; } }
  const tbRow = resolveWinner(card?.winners?.tb, rows, cardId, type); const tiebreaker = tbRow && carry > 1 ? { winner: tbRow.id, carry: carry - 1 } : { winner: null, carry: carry - 1 };
  if (tbRow && carry > 1) totals[tbRow.id] = (totals[tbRow.id] || 0) + (carry - 1) * Math.max(playerCount - Math.max(tbRow.players.length, 1), 0);
  return { rows, totals, holes, tiebreaker };
}
function skinCounts(card: CardCalc) {
  const out: Record<string, number> = {}; for (const hole of card.holes) if (hole.winner) out[hole.winner] = (out[hole.winner] || 0) + Math.max(Number(hole.carry) || 1, 1);
  if (card.tiebreaker.winner && card.tiebreaker.carry > 0) out[card.tiebreaker.winner] = (out[card.tiebreaker.winner] || 0) + card.tiebreaker.carry; return out;
}
export function skinsTopResults(week: Json): SkinsResult[] {
  const front = (Array.isArray(week?.front?.cards) ? week.front.cards : []).map((card: Json) => calcCard(card, 'front', 1));
  const back = (Array.isArray(week?.back?.cards) ? week.back.cards : []).map((card: Json) => calcCard(card, 'back', 10));
  const players = new Map<string, { name: string; skins: number; payout: number; buyIn: number; net: number }>();
  const player = (value: unknown) => { const name = String(value ?? '').trim(); if (!name) return null; const key = name.toLowerCase(); if (!players.has(key)) players.set(key, { name, skins: 0, payout: 0, buyIn: 0, net: 0 }); return players.get(key)!; };
  for (const card of front) {
    for (const row of card.rows) { const record = player(row.name); if (record) record.buyIn += SKINS_ENTRY_FEE; }
    for (const [id, count] of Object.entries(skinCounts(card))) { const row = card.rows.find((candidate) => candidate.id === id); const record = row ? player(row.name) : null; if (record) record.skins += Number(count) || 0; }
    for (const [id, payout] of Object.entries(card.totals)) { const row = card.rows.find((candidate) => candidate.id === id); const record = row ? player(row.name) : null; if (record) record.payout += Number(payout) || 0; }
  }
  for (const card of back) {
    for (const row of card.rows) for (const name of uniqueNames(row.players)) { const record = player(name); if (record) record.buyIn += SKINS_ENTRY_FEE; }
    for (const [id, count] of Object.entries(skinCounts(card))) { const row = card.rows.find((candidate) => candidate.id === id); if (row) for (const name of uniqueNames(row.players)) { const record = player(name); if (record) record.skins += Number(count) || 0; } }
    for (const [id, payout] of Object.entries(card.totals)) { const row = card.rows.find((candidate) => candidate.id === id); if (!row) continue; const names = uniqueNames(row.players); const share = names.length ? (Number(payout) || 0) / names.length : 0; for (const name of names) { const record = player(name); if (record) record.payout += share; } }
  }
  for (const record of players.values()) record.net = record.payout - record.buyIn;
  return Array.from(players.values()).filter((record) => record.skins > 0 || record.payout > 0 || record.net > 0).sort((a, b) => b.skins - a.skins || b.net - a.net || b.payout - a.payout || a.name.localeCompare(b.name)).slice(0, 3).map((record, index) => ({ place: index + 1, name: record.name, skins: record.skins, payout: record.payout, net: record.net }));
}

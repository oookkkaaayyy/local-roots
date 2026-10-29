/**
 * Prepare an event-scoped UDisc update for the existing Glow week contract.
 * This module is pure: it does not write to Supabase, call UDisc, or touch the DOM.
 */
const text = value => String(value ?? '').trim();
const norm = value => text(value).normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const clone = value => JSON.parse(JSON.stringify(value));

function mappedName(value, aliases) {
  const source = text(value);
  const key = norm(source);
  const match = Object.entries(aliases || {}).find(([alias]) => norm(alias) === key);
  return text(match?.[1]) || source;
}

function pairKey(names) {
  return names.map(norm).filter(Boolean).sort().join('\u0000');
}

function contentForSignature(proposal) {
  const rows = proposal.destination.week.players.map((player, index) => {
    const evidence = proposal.sourceProvenance.rowEvidence[index] || {};
    return {
      partner1: player.partner1,
      partner2: player.partner2,
      scores: player.scores,
      rank: evidence.sourceRank,
      rawRank: evidence.sourceRankRaw,
      relativeScore: evidence.relativeScore,
      strokeTotal: evidence.strokeTotal,
      sourceRow: evidence.sourceRow,
    };
  });
  return JSON.stringify({eventId:proposal.event.eventId,weekDate:proposal.event.weekDate,rows});
}

async function fingerprint(proposal) {
  const bytes = new TextEncoder().encode(contentForSignature(proposal));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function cardEntryName(entry, aliases) {
  return [mappedName(entry?.partner1, aliases), mappedName(entry?.partner2, aliases)].filter(Boolean);
}

/**
 * Produce a replacement for only the selected Glow week after validating the
 * event/proposal, preserving the current card structure and retaining source
 * ranks and corrections in `week.udiscSync`. The caller must still persist the
 * result with an atomic compare-and-swap transaction.
 */
export async function prepareGlowWeekSync(currentWeek, proposal, options = {}) {
  if (!proposal || proposal.schema !== 'hbnf.glow.proposed-week.v1' || proposal.disposition !== 'PROPOSED_ONLY_NOT_DELIVERED') {
    throw Error('Expected a read-only Glow proposal.');
  }
  if ((proposal.issues?.duplicateCanonicalTeamRows || 0) > 0) throw Error('The proposal reuses a canonical Glow team identity.');
  const proposedWeek = proposal.destination?.week;
  const eventId = text(proposal.event?.eventId);
  const weekDate = text(proposal.event?.weekDate);
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(weekDate) || proposedWeek?.date !== weekDate) throw Error('The proposal event date is invalid.');
  if (!eventId || proposedWeek?.activeWeek !== weekDate) throw Error('The proposal event identity is invalid.');
  if (currentWeek && currentWeek.date && currentWeek.date !== weekDate) throw Error('The selected Glow week does not match the UDisc event date.');

  const incoming = proposedWeek.players;
  const provenanceRows = proposal.sourceProvenance?.rowEvidence;
  if (!Array.isArray(incoming) || !incoming.length || !Array.isArray(provenanceRows) || provenanceRows.length !== incoming.length) {
    throw Error('The proposal team and provenance rows do not align.');
  }
  for (const [index, player] of incoming.entries()) {
    if ((!text(player.partner1) && !text(player.partner2)) || !Array.isArray(player.scores) || player.scores.length !== 18) {
      throw Error(`Proposal row ${index + 1} must have at least one name and exactly 18 scores.`);
    }
    if (player.scores.some(score => score !== '' && !/^\d{1,2}$/.test(String(score)))) throw Error(`Proposal row ${index + 1} contains an invalid hole score.`);
  }

  const base = currentWeek ? clone(currentWeek) : {
    date: weekDate,
    activeWeek: weekDate,
    cards: [{id:'C1', finalized:false, players:[]}],
    players: [],
    scoresLocked:false,
  };
  base.date = weekDate;
  if (base.scoresLocked) throw Error('This Glow week is locked.');
  if (!Array.isArray(base.cards)) base.cards = [];
  if (!Array.isArray(base.players)) base.players = [];
  if (base.cards.some(card => card.finalized)) throw Error('A Glow card is finalized; the event update was stopped.');
  if (!base.cards.length) base.cards.push({id:'C1',finalized:false,players:[]});

  const aliases = options.aliases || {};
  const signature = await fingerprint(proposal);
  const prior = base.udiscSync;
  if (prior?.eventId === eventId && prior?.latest?.signature === signature) {
    return Object.freeze({changed:false,reason:'same_snapshot',week:currentWeek,signature});
  }

  const entries = new Map();
  const existingPlayers = new Map(base.players.map(player => [text(player.id), player]));
  const priorImportedRows = new Map((Array.isArray(prior?.latest?.rows) ? prior.latest.rows : [])
    .map(row => [text(row.glowTeamId), row]));
  for (const card of base.cards) {
    for (const entry of card.players || []) {
      const id = text(entry?.id);
      if (!id) throw Error('Glow contains a card entry without an ID.');
      if (entries.has(id)) throw Error('Glow contains a duplicate card-entry ID.');
      const names = cardEntryName(entry, aliases);
      entries.set(id, {card, entry, names, key:pairKey(names)});
    }
  }
  const used = new Set();
  const sourcePairs = new Set();
  const incomingRecords = [];
  const newTeams = [];

  for (let index = 0; index < incoming.length; index++) {
    const player = incoming[index];
    const evidence = provenanceRows[index];
    const names = [mappedName(player.partner1, aliases), mappedName(player.partner2, aliases)];
    const key = pairKey(names);
    if (sourcePairs.has(key)) throw Error('UDisc contains a duplicate team identity.');
    sourcePairs.add(key);
    const exact = [...entries.entries()].filter(([id, item]) => item.key === key && !used.has(id));
    let id = '';
    let match = null;
    if (exact.length > 1) throw Error('The Glow team identity is ambiguous.');
    if (exact.length === 1) { [id, match] = exact[0]; }
    else {
      const sourceNames = new Set(names.map(norm).filter(Boolean));
      const overlaps = [...entries.entries()].filter(([candidateId, item]) => !used.has(candidateId) && item.names.some(name => sourceNames.has(norm(name))));
      if (overlaps.length > 1) throw Error('A changed UDisc partnership matches multiple Glow teams.');
      if (overlaps.length === 1) [id, match] = overlaps[0];
    }
    if (id) used.add(id);
    else {
      id = `UDISC_${weekDate.replaceAll('-', '')}_${String(index+1).padStart(2,'0')}`;
      if (entries.has(id) || newTeams.some(item => item.id === id)) throw Error('A generated Glow team ID collides with an existing entry.');
      newTeams.push({id,names,sourceIndex:index});
    }
    incomingRecords.push({id, player, names, evidence, sourceIndex:index, match});
  }

  if (newTeams.length && base.cards.every(card => card.finalized)) throw Error('No editable Glow card is available for a new team.');
  const editableTarget = base.cards.find(card => !card.finalized) || base.cards[0];
  for (const team of newTeams) {
    editableTarget.players.push({id:team.id,partner1:team.names[0],partner2:team.names[1]});
    entries.set(team.id,{card:editableTarget,entry:editableTarget.players.at(-1),names:team.names,key:pairKey(team.names)});
  }

  const updates = new Map();
  const manualOverrides = [];
  const acceptedScoresById = new Map();
  for (const record of incomingRecords) {
    const item = entries.get(record.id);
    if (!item || item.card.finalized) throw Error('A source row maps to a finalized or missing Glow team.');
    item.entry.partner1 = record.names[0];
    item.entry.partner2 = record.names[1];
    const priorPlayer = existingPlayers.get(record.id) || {};
    const priorImported = priorImportedRows.get(record.id);
    const priorImportedScores = Array.isArray(priorImported?.acceptedHoleScores)
      ? priorImported.acceptedHoleScores
      : (Array.isArray(priorImported?.holeScores) ? priorImported.holeScores : null);
    const acceptedScores = [];
    const scores = Array.from({length:18}, (_, hole) => {
      const current = text(priorPlayer.scores?.[hole]);
      const incomingScore = text(record.player.scores[hole]);
      const previousSource = priorImportedScores ? text(priorImportedScores[hole]) : '';
      // Partial XLSX snapshots are additive: a blank source cell never erases
      // a score already present in Glow.
      if (!incomingScore) { acceptedScores.push(previousSource); return current; }
      if (!current || current === incomingScore) { acceptedScores.push(incomingScore); return incomingScore; }
      // Only an exact match to the last imported source value is eligible for
      // an automated correction. Existing/legacy values without that evidence
      // are treated as manual and kept until the owner resolves the conflict.
      if (priorImportedScores && current === previousSource) { acceptedScores.push(incomingScore); return incomingScore; }
      manualOverrides.push({glowTeamId:record.id,hole:hole+1,keptScore:current,sourceScore:incomingScore});
      acceptedScores.push(previousSource);
      return current;
    });
    acceptedScoresById.set(record.id, acceptedScores);
    updates.set(record.id, {
      ...priorPlayer,
      id:record.id,
      name:[record.names[0],record.names[1]].filter(Boolean).join(' / '),
      partner1:record.names[0],
      partner2:record.names[1],
      cardId:item.card.id,
      scores,
      removed:false,
    });
  }
  for (const team of newTeams) {
    const item=entries.get(team.id), record=incomingRecords[team.sourceIndex];
    updates.set(team.id,{id:team.id,name:team.names.join(' / '),partner1:team.names[0],partner2:team.names[1],cardId:item.card.id,scores:record.player.scores.map(score=>String(score??'')),removed:false});
  }
  const cardIds = new Set(base.cards.flatMap(card => (card.players || []).map(entry => text(entry.id))));
  const players = [];
  const seen = new Set();
  for (const card of base.cards) for (const entry of card.players || []) {
    const id=text(entry.id);
    if (!text(entry.partner1) && !text(entry.partner2)) continue;
    if (!cardIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    players.push(updates.get(id) || existingPlayers.get(id) || {
      id,name:[text(entry.partner1),text(entry.partner2)].filter(Boolean).join(' / '),partner1:text(entry.partner1),partner2:text(entry.partner2),cardId:card.id,scores:Array(18).fill(''),removed:false,
    });
  }
  base.players = players;

  const latest = {
    signature,
    observedAt:proposal.event.observedAtLocal || null,
    sourceUpdatedAt:proposal.event.sourceUpdatedAt || null,
    rowOrderPreserved:true,
    rows:incomingRecords.map(record => ({
      sourceRow:record.evidence.sourceRow,
      sourceTeam:record.evidence.sourceTeam,
      sourceRank:record.evidence.sourceRank,
      sourceRankRaw:record.evidence.sourceRankRaw,
      division:record.evidence.division,
      relativeScore:record.evidence.relativeScore,
      strokeTotal:record.evidence.strokeTotal,
      holeStrokesTotal:record.evidence.holeStrokesTotal,
      holeScores:[...record.player.scores],
      acceptedHoleScores:acceptedScoresById.get(record.id) || [...record.player.scores],
      glowTeamId:record.id,
    })),
    manualOverrides,
  };
  const priorHistory = Array.isArray(prior?.history) ? prior.history : [];
  const history = prior?.latest ? [...priorHistory, prior.latest].slice(-20) : priorHistory.slice(-20);
  base.udiscSync = {source:'UDisc event XLSX export',eventId,weekDate,lastUpdatedAt:latest.observedAt,latest,history};
  return Object.freeze({changed:true,reason:prior?.latest?'snapshot_changed':'first_snapshot',week:base,signature});
}

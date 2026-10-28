/** Offline UDisc-to-Glow name review and destination-shaped proposal builder. */
const text = value => String(value ?? '').trim();
const norm = value => text(value).normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function validateIdentityEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) throw Error('Load a private identity-evidence JSON object.');
  if (!evidence.aliases || typeof evidence.aliases !== 'object' || Array.isArray(evidence.aliases)) throw Error('Identity evidence needs an aliases object from Glow state.');
  const aliases = {};
  for (const [alias, canonical] of Object.entries(evidence.aliases)) {
    if (text(alias) && text(canonical)) aliases[text(alias)] = text(canonical);
  }
  const historicalNames = [...new Set((Array.isArray(evidence.historicalNames) ? evidence.historicalNames : []).map(text).filter(name => name && !/^fixture\b/i.test(name)))];
  const tagEvidence = (Array.isArray(evidence.tagEvidence) ? evidence.tagEvidence : []).filter(row => text(row?.playerName)).map(row => ({
    playerName: text(row.playerName), eventType: text(row.eventType),
    // player_key is deliberately discarded: it is name-derived tag data, not a person identity.
  }));
  const candidates = [...new Set([...Object.values(aliases), ...historicalNames])].sort((a, b) => a.localeCompare(b));
  return Object.freeze({ aliases: Object.freeze(aliases), historicalNames: Object.freeze(historicalNames), tagEvidence: Object.freeze(tagEvidence), candidates: Object.freeze(candidates), provenance: evidence.provenance || {} });
}

export function memberKey(member) {
  const username = norm(member?.username);
  return username ? `udisc:${username}` : `name:${norm(member?.name)}`;
}

function aliasCandidatesFor(name, evidence) {
  const sourceKey = norm(name);
  return [...new Set(Object.entries(evidence.aliases).filter(([alias]) => norm(alias) === sourceKey).map(([, canonical]) => canonical))];
}

function historyCandidatesFor(name, evidence) {
  const sourceKey = norm(name);
  return [...new Set(evidence.historicalNames.filter(candidate => norm(candidate) === sourceKey))];
}

/** Build one crosswalk row per UDisc handle; display names never auto-confirm identity. */
export function buildReviewedCrosswalk(model, evidenceInput, decisions = {}) {
  const evidence = evidenceInput?.candidates ? evidenceInput : validateIdentityEvidence(evidenceInput);
  const observations = new Map();
  for (const snapshot of model?.snapshots || []) for (const row of snapshot.rows || []) {
    row.members.forEach((name, index) => {
      const member = { name: text(name), username: row.memberAlignment ? text(row.usernames?.[index]) : '' };
      const key = memberKey(member);
      if (!observations.has(key)) observations.set(key, { key, username: member.username, names: new Set(), observations: [] });
      const item = observations.get(key);
      if (member.name) item.names.add(member.name);
      item.observations.push({ sourceRow: row.sourceRow, sourceTeam: row.sourceTeam, sourceRank: row.sourceRank, eventId: snapshot.eventId });
    });
  }
  const crosswalk = [...observations.values()].map(item => {
    const names = [...item.names];
    const aliasCandidates = [...new Set(names.flatMap(name => aliasCandidatesFor(name, evidence)))];
    const historyCandidates = [...new Set(names.flatMap(name => historyCandidatesFor(name, evidence)))];
    const tagNameEvidence = evidence.tagEvidence.filter(tag => names.some(name => norm(tag.playerName) === norm(name)));
    const evidenceCandidates = [...new Set([...aliasCandidates, ...historyCandidates])];
    const firstNameOnly = names.some(name => name.split(/[\s_]+/).filter(Boolean).length === 1);
    const conflict = evidenceCandidates.length > 1;
    const decision = decisions[item.key];
    let status, suggestedCanonicalNames = evidenceCandidates, canonicalName = null, matchMethod = null;
    if (decision?.canonicalName) {
      const chosen = evidence.candidates.find(candidate => norm(candidate) === norm(decision.canonicalName));
      if (!chosen) throw Error(`Review decision for ${item.username || names[0]} selects a name outside the supplied Glow evidence.`);
      status = 'reviewed'; canonicalName = chosen; matchMethod = 'explicit_owner_review';
    } else if (conflict) status = 'conflict';
    else if (evidenceCandidates.length) status = firstNameOnly ? 'first_name_review' : 'suggested_review';
    else if (tagNameEvidence.length) status = 'tag_only_review';
    else status = 'unmatched';
    const evidenceKinds = [];
    if (aliasCandidates.length) evidenceKinds.push('exact_playerAliases_key');
    if (historyCandidates.length) evidenceKinds.push('exact_historical_Glow_partner_name');
    if (tagNameEvidence.length) evidenceKinds.push('exact_historical_tag_display_name_only');
    if (firstNameOnly) evidenceKinds.push('first_name_only_never_auto_confirmed');
    return Object.freeze({ key: item.key, username: item.username, sourceNames: Object.freeze(names), status, canonicalName, suggestedCanonicalNames: Object.freeze(suggestedCanonicalNames), aliasCandidates: Object.freeze(aliasCandidates), historyCandidates: Object.freeze(historyCandidates), tagNameEvidence: Object.freeze(tagNameEvidence.map(t => ({ playerName: t.playerName, eventType: t.eventType }))), evidenceKinds: Object.freeze(evidenceKinds), observations: Object.freeze(item.observations) });
  });
  return Object.freeze(crosswalk);
}

export function buildGlowProposal(model, evidenceInput, decisions = {}) {
  const snapshot = model?.snapshots?.at(-1);
  if (!snapshot) throw Error('Load a UDisc snapshot before proposing a Glow week.');
  const evidence = evidenceInput?.candidates ? evidenceInput : validateIdentityEvidence(evidenceInput);
  const crosswalk = buildReviewedCrosswalk(model, evidence, decisions);
  const byKey = new Map(crosswalk.map(item => [item.key, item]));
  const canonicalRowUse = new Map();
  snapshot.rows.forEach((row, rowIndex) => row.members.forEach((name, memberIndex) => {
    const key = memberKey({ name, username: row.memberAlignment ? row.usernames?.[memberIndex] : '' });
    const canonical = byKey.get(key)?.canonicalName;
    if (!canonical) return;
    if (!canonicalRowUse.has(norm(canonical))) canonicalRowUse.set(norm(canonical), new Set());
    canonicalRowUse.get(norm(canonical)).add(rowIndex);
  }));
  const duplicateCanonicalRows = new Set([...canonicalRowUse.values()].filter(rows => rows.size > 1).flatMap(rows => [...rows]));
  const proposalPlayers = snapshot.rows.map((row, index) => {
    const memberMappings = row.members.map((name, memberIndex) => {
      const key = memberKey({ name, username: row.memberAlignment ? row.usernames?.[memberIndex] : '' });
      const mapping = row.memberAlignment ? byKey.get(key) : null;
      const status = mapping?.status || (row.memberAlignment ? 'unmatched' : 'conflict');
      return { ...(mapping || { key, status, canonicalName: null, suggestedCanonicalNames: [], evidenceKinds: row.memberAlignment ? [] : ['member_username_count_mismatch'], username: text(row.usernames?.[memberIndex]), sourceNames: [name] }), destinationName: mapping?.canonicalName || text(name), destinationNameSource: mapping?.canonicalName ? 'reviewed_glow_name' : 'preserved_udisc_name' };
    });
    const partner1 = memberMappings[0]?.destinationName || '';
    const partner2 = memberMappings[1]?.destinationName || '';
    const preservedNames = memberMappings.filter(item => item.destinationNameSource === 'preserved_udisc_name');
    const holesComplete = Boolean(row.holesComplete);
    const issues = preservedNames.map(item => 'identity_name_preserved_as_supplied:' + (item.sourceNames?.[0] || item.username || 'unknown'));
    if (!row.memberAlignment) issues.push('source_name_username_member_count_mismatch');
    if (!holesComplete) issues.push(`incomplete_holes:${row.holesCompleted}/18`);
    if (duplicateCanonicalRows.has(index)) issues.push('canonical_name_reused_across_event_teams');
    const proposalId = `PROPOSED_${String(index + 1).padStart(2, '0')}`;
    const entry = Object.freeze({
      id: proposalId,
      name: partner1 && partner2 ? `${partner1} / ${partner2}` : partner1 || partner2,
      partner1,
      partner2,
      cardId: 'C1',
      scores: Object.freeze(row.scores.map(score => score == null ? '' : String(score))),
      removed: false
    });
    return Object.freeze({
      destinationEntry: entry,
      source: Object.freeze({ sourceRow: row.sourceRow, sourceTeam: row.sourceTeam, sourceRank: row.sourceRank, sourceRankRaw: row.sourceRankRaw, division: row.division, relativeScore: row.relativeScore, strokeTotal: row.strokeTotal, holeStrokesTotal: row.holeStrokesTotal, holeScores: Object.freeze([...row.scores]), holesCompleted: row.holesCompleted, holesComplete, memberMappings: Object.freeze(memberMappings), issues: Object.freeze(issues) })
    });
  });
  const identityIssues = crosswalk.filter(item => item.status !== 'reviewed').map(item => ({ sourceNames: item.sourceNames, username: item.username, status: item.status, suggestedCanonicalNames: item.suggestedCanonicalNames, evidenceKinds: item.evidenceKinds, disposition: 'preserved_source_name_for_later_review' }));
  const incompleteRows = proposalPlayers.filter(item => !item.source.holesComplete).length;
  const unresolvedEntryCount = proposalPlayers.filter(item => item.source.memberMappings.some(member => !member.destinationName) || item.source.issues.includes('canonical_name_reused_across_event_teams')).length;
  const proposedPlayers = proposalPlayers.map(item => item.destinationEntry);
  const snapshotHistory = (model.snapshots || []).map((item, historyIndex) => Object.freeze({
    localImportNumber: item.localImportNumber || historyIndex + 1,
    eventId: item.eventId,
    observedAtLocal: item.observedAtLocal,
    sourceUpdatedAt: item.sourceUpdatedAt,
    freshness: item.freshness || 'upstream_freshness_unknown',
    contentSignature: item.contentSignature,
    rowCount: item.rows.length,
    rows: Object.freeze(item.rows.map(row => Object.freeze({ sourceRow: row.sourceRow, sourceTeam: row.sourceTeam, sourceRank: row.sourceRank, sourceRankRaw: row.sourceRankRaw, usernames: Object.freeze([...row.usernames]), relativeScore: row.relativeScore, strokeTotal: row.strokeTotal, holeScores: Object.freeze([...row.scores]), holesCompleted: row.holesCompleted, holesComplete: row.holesComplete })))
  }));
  const correctionDiffs = [];
  for (let i = 1; i < snapshotHistory.length; i++) {
    const before = snapshotHistory[i - 1], after = snapshotHistory[i];
    const rowCount = Math.max(before.rows.length, after.rows.length);
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
      const oldRow = before.rows[rowIndex], newRow = after.rows[rowIndex];
      if (!oldRow || !newRow) { correctionDiffs.push(Object.freeze({ fromImport: before.localImportNumber, toImport: after.localImportNumber, sourceRow: newRow?.sourceRow ?? oldRow?.sourceRow ?? rowIndex + 2, changedFields: Object.freeze({ row: [oldRow ? 'present' : 'absent', newRow ? 'present' : 'absent'] }) })); continue; }
      const changedFields = {};
      for (const field of ['sourceTeam', 'sourceRank', 'sourceRankRaw', 'usernames', 'relativeScore', 'strokeTotal', 'holeScores', 'holesCompleted', 'holesComplete']) if (JSON.stringify(oldRow[field]) !== JSON.stringify(newRow[field])) changedFields[field] = [oldRow[field], newRow[field]];
      if (Object.keys(changedFields).length) correctionDiffs.push(Object.freeze({ fromImport: before.localImportNumber, toImport: after.localImportNumber, sourceRow: newRow.sourceRow, changedFields: Object.freeze(changedFields) }));
    }
  }
  const week = Object.freeze({
    date: snapshot.eventId,
    activeWeek: snapshot.eventId,
    cards: Object.freeze([Object.freeze({ id: 'C1', finalized: false, players: Object.freeze(proposedPlayers) })]),
    players: Object.freeze(proposedPlayers),
    scoresLocked: false
  });
  return Object.freeze({
    schema: 'hbnf.glow.proposed-week.v1',
    disposition: 'PROPOSED_ONLY_NOT_DELIVERED',
    writeTarget: null,
    event: Object.freeze({ eventId: snapshot.eventId, weekDate: snapshot.eventId, observedAtLocal: snapshot.observedAtLocal, sourceUpdatedAt: snapshot.sourceUpdatedAt, sourceFreshness: snapshot.freshness || 'upstream_freshness_unknown', localImportNumber: snapshot.localImportNumber, contentSignature: snapshot.contentSignature }),
    destination: Object.freeze({ contract: 'Glow week: cards[].players[] and players[] entries with id,name,partner1,partner2,cardId,scores[18],removed', week }),
    sourceProvenance: Object.freeze({ source: 'local UDisc XLSX/CSV snapshot', rowOrderPreserved: true, snapshotHistory: Object.freeze(snapshotHistory), correctionDiffs: Object.freeze(correctionDiffs), udiscRanksPreserved: proposalPlayers.map(item => ({ sourceRow: item.source.sourceRow, rank: item.source.sourceRank, rawRank: item.source.sourceRankRaw, division: item.source.division })), relativeVsStrokeScores: proposalPlayers.map(item => ({ sourceRow: item.source.sourceRow, relativeScore: item.source.relativeScore, strokeTotal: item.source.strokeTotal, holeStrokesTotal: item.source.holeStrokesTotal })), rowEvidence: Object.freeze(proposalPlayers.map(item => item.source)) }),
    identityReview: Object.freeze({ required: false, decisionDeferred: true, reviewedCrosswalk: crosswalk, unresolved: Object.freeze(identityIssues) }),
    issues: Object.freeze({ unresolvedIdentityCount: identityIssues.length, preservedSourceNameCount: proposalPlayers.reduce((n, item) => n + item.source.memberMappings.filter(member => member.destinationNameSource === 'preserved_udisc_name').length, 0), rowsWithUnresolvedIdentity: unresolvedEntryCount, incompleteRoundRows: incompleteRows, duplicateCanonicalTeamRows: proposalPlayers.filter(item => item.source.issues.includes('canonical_name_reused_across_event_teams')).length }),
    readyForSeparateHumanIntegrationReview: incompleteRows === 0 && unresolvedEntryCount === 0
  });
}

export function renderGlowReconciliation(container, model, evidenceInput, decisions, onResolve) {
  const evidence = evidenceInput?.candidates ? evidenceInput : validateIdentityEvidence(evidenceInput);
  const crosswalk = buildReviewedCrosswalk(model, evidence, decisions);
  const table = document.createElement('table');
  const head = table.createTHead().insertRow();
  for (const label of ['Decision', 'UDisc name(s)', 'UDisc username', 'Glow name suggestion(s)', 'Evidence']) { const th = document.createElement('th'); th.textContent = label; head.append(th); }
  const body = table.createTBody();
  for (const member of crosswalk) {
    const tr = body.insertRow();
    const status = tr.insertCell(); status.textContent = member.status; status.className = member.status;
    const names = tr.insertCell(); names.textContent = member.sourceNames.join(' · ');
    const username = tr.insertCell(); username.textContent = member.username || '—';
    const choice = tr.insertCell();
    const select = document.createElement('select'); select.setAttribute('aria-label', `Review Glow name for ${member.username || member.sourceNames.join(', ')}`);
    const blank = document.createElement('option'); blank.value = ''; blank.textContent = member.canonicalName || 'Keep UDisc name as-is: ' + member.sourceNames.join(' / ') + (member.suggestedCanonicalNames.length ? ' (optional Glow name: ' + member.suggestedCanonicalNames.join(' / ') + ')' : ''); select.append(blank);
    for (const candidate of evidence.candidates) { const option = document.createElement('option'); option.value = candidate; option.textContent = candidate; select.append(option); }
    select.value = decisions[member.key]?.canonicalName || '';
    select.addEventListener('change', () => onResolve(member, select.value)); choice.append(select);
    const proof = tr.insertCell(); proof.textContent = member.evidenceKinds.join(', ') || 'No exact first-party evidence';
  }
  container.replaceChildren(table);
  return crosswalk;
}

export function renderDestinationProposal(container, proposal) {
  const table = document.createElement('table');
  table.className = 'scorecard-table destination-score-table';
  const head = table.createTHead().insertRow();
  head.className = 'scorecard-head';
  for (const label of ['UDisc rank', 'Team', ...Array.from({length: 18}, (_, i) => String(i + 1)), 'Total', 'To par']) {
    const th = document.createElement('th'); th.textContent = label;
    if (label === 'UDisc rank') th.className = 'rank-cell';
    if (label === 'Team') th.className = 'sticky-col';
    if (/^\d+$/.test(label)) th.className = 'sheet-hole';
    head.append(th);
  }
  const body = table.createTBody();
  for (const item of proposal.destination.week.players.map((entry, i) => ({ entry, source: proposal.sourceProvenance.rowEvidence[i] }))) {
    const tr = body.insertRow();
    tr.className = 'scorecard-row';
    const team = [item.entry.partner1, item.entry.partner2].filter(Boolean).join(' / ') || item.source.sourceTeam || 'Team name unavailable';
    const relative = item.source.relativeScore == null ? '—' : (item.source.relativeScore > 0 ? `+${item.source.relativeScore}` : String(item.source.relativeScore));
    const values = [item.source.sourceRank, team, ...item.entry.scores, item.source.strokeTotal ?? '—', relative];
    values.forEach((value, index) => {
      const td = tr.insertCell(); td.textContent = String(value);
      if (index === 0) td.className = 'rank-cell';
      if (index === 1) td.className = 'sticky-col player-name-cell';
      if (index >= 2 && index < 20) td.className = 'score-entry-cell';
      if (index >= 20) td.className = 'total-cell';
    });
  }
  const wrap = document.createElement('div'); wrap.className = 'scorecard-wrap'; wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', 'Proposed Glow round scorecard'); wrap.tabIndex = 0; wrap.append(table); container.replaceChildren(wrap);
}

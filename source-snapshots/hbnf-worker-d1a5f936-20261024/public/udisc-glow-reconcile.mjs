/** Source-agnostic, in-memory UDisc identity reconciliation and proposal builder. */
const text = value => String(value ?? '').trim();
const key = value => text(value).normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function checkedRoster(roster) {
  if (!Array.isArray(roster)) throw Error('Load a roster JSON array before reconciling.');
  const ids = new Set();
  const normalized = roster.map((person, index) => {
    const id = text(person?.playerId);
    const displayName = text(person?.displayName);
    if (!id || !displayName) throw Error(`Roster entry ${index + 1} needs playerId and displayName.`);
    if (ids.has(id)) throw Error(`Roster contains duplicate playerId ${id}.`);
    ids.add(id);
    const udiscUsernames = (Array.isArray(person.udiscUsernames) ? person.udiscUsernames : [])
      .map(text).filter(Boolean);
    return Object.freeze({
      playerId: id,
      displayName,
      udiscUsernames: Object.freeze(udiscUsernames),
      aliases: Object.freeze((Array.isArray(person.aliases) ? person.aliases : []).map(text).filter(Boolean))
    });
  });
  return Object.freeze(normalized);
}

const sourceKey = member => key(member.username) ? `username:${key(member.username)}` : `name:${key(member.name)}`;

function reconcileMember(member, roster, decisions = {}) {
  const nameKey = key(member.name);
  const usernameKey = key(member.username);
  const usernameMatches = usernameKey ? roster.filter(person => person.udiscUsernames.some(value => key(value) === usernameKey)) : [];
  const nameMatches = nameKey ? roster.filter(person => key(person.displayName) === nameKey || person.aliases.some(alias => key(alias) === nameKey)) : [];
  const distinct = list => [...new Map(list.map(person => [person.playerId, person])).values()];
  const userHits = distinct(usernameMatches);
  const nameHits = distinct(nameMatches);
  const candidateIds = distinct([...userHits, ...nameHits]).map(person => person.playerId);
  const decision = decisions[sourceKey(member)];

  if (decision) {
    const chosen = roster.find(person => person.playerId === decision.playerId);
    if (!chosen) throw Error(`Manual resolution for ${member.name || member.username} refers to an unknown playerId.`);
    return {
      ...member, status: 'confirmed', playerId: chosen.playerId, displayName: chosen.displayName,
      method: 'explicit_review', candidateIds, evidence: { usernameMatches: userHits.map(p => p.playerId), nameMatches: nameHits.map(p => p.playerId) },
      issue: (userHits.length && !userHits.some(p => p.playerId === chosen.playerId)) || (nameHits.length && !nameHits.some(p => p.playerId === chosen.playerId)) ? 'manual_resolution_overrode_conflicting_identifiers' : null
    };
  }

  if (userHits.length > 1 || (userHits.length === 1 && nameHits.length > 0 && !nameHits.some(p => p.playerId === userHits[0].playerId))) {
    return { ...member, status: 'conflict', playerId: null, displayName: null, method: null, candidateIds, issue: 'identifier_evidence_disagrees' };
  }
  if (userHits.length === 1) {
    return { ...member, status: 'confirmed', playerId: userHits[0].playerId, displayName: userHits[0].displayName, method: 'exact_udisc_username', candidateIds, issue: null };
  }
  if (candidateIds.length) {
    return { ...member, status: 'ambiguous', playerId: null, displayName: null, method: null, candidateIds, issue: 'name_match_requires_explicit_review' };
  }
  return { ...member, status: 'unmatched', playerId: null, displayName: null, method: null, candidateIds: [], issue: 'no_roster_match' };
}

export function reconcileSnapshot(model, rosterInput, decisions = {}) {
  const roster = checkedRoster(rosterInput);
  const snapshot = model?.snapshots?.at(-1);
  if (!snapshot) throw Error('Load a UDisc snapshot before reconciling.');
  const teams = snapshot.rows.map(row => {
    if (!row.memberAlignment) {
      const members = row.members.map((name, index) => ({ name, username: '', sourceIndex: index }));
      const reconciled = members.map(member => ({ ...reconcileMember(member, roster, decisions), status: 'conflict', playerId: null, issue: 'member_username_count_mismatch' }));
      return { sourceRow: row.sourceRow, division: row.division, sourceRank: row.sourceRank, sourceRankRaw: row.sourceRankRaw, sourceTeam: row.sourceTeam, members: reconciled, teamId: null, relativeScore: row.relativeScore, strokeTotal: row.strokeTotal, scores: [...row.scores], holesCompleted: row.holesCompleted, holesComplete: row.holesComplete, issues: ['member_username_count_mismatch'] };
    }
    const members = row.members.map((name, index) => reconcileMember({ name, username: row.usernames[index] || '', sourceIndex: index }, roster, decisions));
    const ids = members.every(person => person.playerId) ? members.map(person => person.playerId) : null;
    const teamId = ids ? `hbnf-team:${[...ids].sort().map(encodeURIComponent).join('+')}` : null;
    const issues = members.filter(person => person.issue).map(person => person.issue);
    if (!row.holesComplete) issues.push('incomplete_round');
    return { sourceRow: row.sourceRow, division: row.division, sourceRank: row.sourceRank, sourceRankRaw: row.sourceRankRaw, sourceTeam: row.sourceTeam, members, teamId, relativeScore: row.relativeScore, strokeTotal: row.strokeTotal, scores: [...row.scores], holesCompleted: row.holesCompleted, holesComplete: row.holesComplete, issues: [...new Set(issues)] };
  });
  const assignments = new Map();
  teams.forEach((team, teamIndex) => team.members.forEach((member, memberIndex) => {
    if (!member.playerId) return;
    const refs = assignments.get(member.playerId) || [];
    refs.push({ teamIndex, memberIndex }); assignments.set(member.playerId, refs);
  }));
  for (const refs of assignments.values()) {
    if (refs.length < 2) continue;
    for (const { teamIndex, memberIndex } of refs) {
      const team = teams[teamIndex], member = team.members[memberIndex];
      team.members[memberIndex] = { ...member, status: 'conflict', playerId: null, displayName: null, method: null, issue: 'canonical_identity_collision' };
      team.teamId = null; team.issues = [...new Set([...team.issues, 'canonical_identity_collision'])];
    }
  }
  return Object.freeze({ eventId: snapshot.eventId, snapshot, teams: Object.freeze(teams) });
}

export function buildProposedPayload(reconciliation) {
  const { eventId, snapshot, teams } = reconciliation;
  const unresolvedIssues = teams.flatMap(team => team.issues.map(code => ({ sourceRow: team.sourceRow, code })));
  return Object.freeze({
    schema: 'hbnf.glow.score-delivery-proposal.v1',
    disposition: 'PROPOSED_ONLY_NOT_DELIVERED',
    event: { eventId, source: 'UDisc local export', observedAtLocal: snapshot.observedAtLocal, sourceUpdatedAt: snapshot.sourceUpdatedAt, sourceFreshness: snapshot.freshness || 'upstream_freshness_unknown', localImportNumber: snapshot.localImportNumber, contentSignature: snapshot.contentSignature },
    teams: teams.map(team => ({
      sourceRow: team.sourceRow, division: team.division, teamId: team.teamId,
      sourceTeam: team.sourceTeam, sourceRank: team.sourceRank, sourceRankRaw: team.sourceRankRaw,
      players: team.members.map(member => ({ sourceName: member.name, sourceUsername: member.username, playerId: member.playerId, displayName: member.displayName, matchStatus: member.status, matchMethod: member.method, candidateIds: member.candidateIds, issue: member.issue })),
      relativeScore: team.relativeScore, strokeTotal: team.strokeTotal, holeScores: team.scores,
      holesCompleted: team.holesCompleted, holesComplete: team.holesComplete, issues: team.issues
    })),
    unresolvedIssues,
    readyForHumanReview: unresolvedIssues.length === 0,
    writeTarget: null
  });
}

export function memberSourceKey(name, username = '') {
  return sourceKey({ name, username });
}

export function renderReconciliation(container, reconciliation, rosterInput, decisions, onResolve) {
  const roster = checkedRoster(rosterInput);
  const table = document.createElement('table');
  const head = table.createTHead().insertRow();
  for (const label of ['UDisc rank', 'UDisc team', 'Source player / username', 'HBNF identity decision', 'To par', 'Strokes', 'Holes']) {
    const th = document.createElement('th'); th.textContent = label; head.append(th);
  }
  const body = table.createTBody();
  for (const team of reconciliation.teams) for (const member of team.members) {
    const tr = body.insertRow();
    for (const value of [team.sourceRank, team.sourceTeam, `${member.name}${member.username ? ` / @${member.username}` : ''}`]) {
      const td = tr.insertCell(); td.textContent = value;
    }
    const decisionCell = tr.insertCell();
    const select = document.createElement('select');
    select.setAttribute('aria-label', `Resolve ${member.name || member.username}`);
    const initial = document.createElement('option');
    initial.value = ''; initial.textContent = `${member.status}${member.candidateIds.length ? ` · ${member.candidateIds.join(', ')}` : ''}`;
    select.append(initial);
    for (const person of roster) {
      const option = document.createElement('option'); option.value = person.playerId; option.textContent = `${person.displayName} [${person.playerId}]`;
    }
    const chosen = decisions[memberSourceKey(member.name, member.username)]?.playerId;
    select.value = chosen || '';
    select.addEventListener('change', () => onResolve(member, select.value));
    decisionCell.append(select);
    const statusCell = tr.insertCell(); statusCell.textContent = team.relativeScore ?? '—';
    const strokesCell = tr.insertCell(); strokesCell.textContent = team.strokeTotal ?? '—';
    const holesCell = tr.insertCell(); holesCell.textContent = `${team.holesCompleted}/18`;
  }
  container.replaceChildren(table);
}

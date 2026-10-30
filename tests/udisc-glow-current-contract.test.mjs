import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parseUdiscAoA, publishSnapshot} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/public/udisc-glow-preview.mjs';
import {buildGlowProposal} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/public/udisc-glow-reconcile.mjs';

const dates = ['2026-03-03', '2026-04-18', '2026-05-23', '2026-06-20'];
const sourcePath = process.env.HBNF_GLOW_HTML;

test('proposal teams pass through the current Glow player builder without confirming an import', {skip: !sourcePath && 'Set HBNF_GLOW_HTML to an independently captured current Glow HTML file.'}, async () => {
  const html = await readFile(sourcePath, 'utf8');
  for (const name of ['canonicalGlowName', 'buildPlayersFromCards', 'previewQuickUdiscImport', 'confirmQuickUdiscImport']) {
    assert.ok(html.includes(name), `current Glow source is missing ${name}`);
  }
  assert.match(html, /id="glowSaveStatus" role="status" aria-live="polite"/);
  assert.match(html, /id="udiscFreshness" role="status" aria-live="polite"/);
  assert.match(html, /glow-save-sync\.mjs/);
  assert.match(html, /rpc\('hbnf_save_league_state_v1',\{p_expected_updated_at:expectedUpdatedAt,p_state_json:root\}\)/);
  assert.doesNotMatch(html, /\.upsert\(\{id:1,state_json/);
  assert.match(html, /function confirmQuickUdiscImport\(\)/);
  const helpersStart = html.indexOf('const teamParts=');
  const helpersEnd = html.indexOf('const GLOW_ENTRY_FEE', helpersStart);
  const builderStart = html.indexOf('function buildPlayersFromCards(w){');
  const builderEnd = html.indexOf('function addLatePlayer', builderStart);
  assert.ok(helpersStart >= 0 && helpersEnd > helpersStart && builderStart > helpersEnd && builderEnd > builderStart,
    'could not isolate the current Glow team-name and player-builder functions');

  // Execute only the pure naming/build helpers in an isolated context. Never call
  // previewQuickUdiscImport or the destructive confirmQuickUdiscImport function.
  const sandbox = {canonicalGlowName: name => String(name ?? '').trim(), Array, Object, String};
  vm.runInNewContext(
    `${html.slice(helpersStart, helpersEnd)}\n${html.slice(builderStart, builderEnd)}\nthis.buildPlayersFromCards=buildPlayersFromCards;`,
    sandbox,
  );

  let teamCount = 0;
  for (const date of dates) {
    const fixture = JSON.parse(await readFile(new URL(`./fixtures/authentic-udisc/${date}.json`, import.meta.url), 'utf8'));
    const rows = [
      ['division', 'position', 'position_raw', 'name', 'event_relative_score', 'event_total_score', 'usernames', ...Array.from({length: 18}, (_, i) => `hole_${i + 1}`)],
      ...fixture.rows.map(row => [row.division, row.position, row.position_raw, row.name, row.event_relative_score, row.event_total_score, row.usernames, ...Array.from({length: 18}, (_, i) => row[`hole_${i + 1}`])]),
    ];
    const model = publishSnapshot(null, parseUdiscAoA(rows, {eventId: date, observedAtLocal: `${date}T12:00:00Z`})).model;
    const proposal = buildGlowProposal(model, {aliases: {}, historicalNames: [], tagEvidence: []});
    const week = proposal.destination.week;
    const actualWeek = {...week, cards: [{id: 'C1', players: week.players}]};
    sandbox.buildPlayersFromCards(actualWeek);

    assert.equal(actualWeek.players.length, fixture.teamCount, `${date}: team count`);
    for (let i = 0; i < actualWeek.players.length; i++) {
      const actual = actualWeek.players[i];
      const proposed = week.players[i];
      assert.deepEqual(Object.keys(actual).sort(), ['cardId', 'id', 'name', 'partner1', 'partner2', 'removed', 'scores'].sort());
      assert.equal(actual.id, proposed.id);
      assert.equal(actual.partner1, proposed.partner1);
      assert.equal(actual.partner2, proposed.partner2);
      assert.equal(actual.scores.length, 18);
      assert.deepEqual(Array.from(actual.scores), proposed.scores);
    }
    teamCount += actualWeek.players.length;
  }
  assert.equal(teamCount, 25);
});

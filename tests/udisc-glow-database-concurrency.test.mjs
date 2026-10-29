import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const migrationUrl = new URL('../supabase/migrations/20261029200450_hbnf_glow_atomic_week_sync.sql', import.meta.url);
const revisionMigrationUrl = new URL('../supabase/migrations/20261029203741_hbnf_league_state_server_revision_guard.sql', import.meta.url);
const weekDate = '2026-04-18';
const revisionA = '2099-01-01T00:00:00.000000Z';

const originalWeek = () => ({
  date: weekDate,
  scoresLocked: false,
  cards: [{id:'card-1',finalized:false,players:['Test Player A','Test Player B']}],
  players: [{id:'team-1',partner1:'Test Player A',partner2:'Test Player B',scores:Array(18).fill('3')}],
  scorecardText:{holePars:{1:'3'},holeNotes:{1:'wind'}},
  payouts:{first:20},
  acePot:{amount:5},
  tags:{heldBy:'Test Player A'},
  standings:{prior:{points:4}},
  udiscSync:{latest:{observedAt:'2026-04-18T16:00:00Z',signature:'old-signature'},status:{state:'fresh',lastSuccessAt:'2026-04-18T16:00:00Z'}},
});

async function database(initialRevision = revisionA) {
  const pg = new PGlite();
  await pg.exec('create role anon; create role authenticated; create role service_role; create table public.league_state (id integer primary key,state_json jsonb not null,updated_at timestamptz not null);');
  const glow = {
    activeWeek:weekDate,
    weeks:{[weekDate]:originalWeek(),'2026-04-11':{date:'2026-04-11',players:[{id:'history-team'}]}},
    playerAliases:{'Test Player A':'Test Player A'},
  };
  const root = {glow,skins:{activeWeek:'2026-04-18',weeks:{'2026-04-18':{score:7}}},bagTags:{rounds:['preserve']}};
  await pg.query('insert into public.league_state(id,state_json,updated_at) values (1,$1::jsonb,$2::timestamptz)',[JSON.stringify(root),initialRevision]);
  await pg.exec(await readFile(migrationUrl,'utf8'));
  await pg.exec(await readFile(revisionMigrationUrl,'utf8'));
  return {pg,root};
}

test('UDisc atomic update advances browser CAS revision and preserves the pending stale draft', async () => {
  const {pg,root} = await database();
  try {
    const readA = await pg.query('select state_json,updated_at::text as updated_at from public.league_state where id=1');
    const draft = structuredClone(readA.rows[0].state_json);
    draft.glow.weeks[weekDate].players[0].scores[0] = '99';

    const expected = structuredClone(root.glow.weeks[weekDate]);
    const replacement = structuredClone(expected);
    replacement.players[0].scores[0] = '2';
    replacement.udiscSync.latest = {observedAt:'2026-04-18T17:00:00Z',signature:'udisc-verified-signature'};
    replacement.udiscSync.status = {state:'fresh',lastAttemptAt:'2026-04-18T17:00:00Z',lastSuccessAt:'2026-04-18T17:00:00Z',errorCode:null};
    const apply = await pg.query(
      'select public.hbnf_apply_udisc_glow_week($1,$2::jsonb,$3::jsonb,$4::jsonb) as result',
      [weekDate,JSON.stringify(expected),JSON.stringify(replacement),JSON.stringify(weekDate)],
    );
    assert.equal(apply.rows[0].result.applied,true);

    const readB = await pg.query('select state_json,updated_at::text as updated_at,updated_at > $1::timestamptz as newer from public.league_state where id=1',[readA.rows[0].updated_at]);
    const revisionB = readB.rows[0].updated_at;
    assert.equal(readB.rows[0].newer,true,'future-skewed old revision advances by at least one microsecond');

    const staleWrite = await pg.query(
      'update public.league_state set state_json=$1::jsonb,updated_at=clock_timestamp() where id=1 and updated_at=$2::timestamptz returning id',
      [JSON.stringify(draft),readA.rows[0].updated_at],
    );
    assert.equal(staleWrite.rows.length,0);

    const independentRead = await pg.query('select state_json,updated_at::text as updated_at from public.league_state where id=1');
    const savedRoot = independentRead.rows[0].state_json;
    assert.equal(savedRoot.glow.weeks[weekDate].players[0].scores[0],'2');
    assert.equal(savedRoot.glow.weeks[weekDate].udiscSync.latest.signature,'udisc-verified-signature');
    assert.deepEqual(savedRoot.skins,root.skins);
    assert.deepEqual(savedRoot.bagTags,root.bagTags);
    assert.equal(savedRoot.glow.weeks['2026-04-11'].players[0].id,'history-team');
    assert.deepEqual(savedRoot.glow.weeks[weekDate].cards,expected.cards);
    assert.deepEqual(savedRoot.glow.weeks[weekDate].scorecardText,expected.scorecardText);
    assert.deepEqual(savedRoot.glow.weeks[weekDate].payouts,expected.payouts);
    assert.deepEqual(savedRoot.glow.weeks[weekDate].acePot,expected.acePot);
    assert.deepEqual(savedRoot.glow.weeks[weekDate].tags,expected.tags);
    assert.deepEqual(savedRoot.glow.weeks[weekDate].standings,expected.standings);
    assert.equal(draft.glow.weeks[weekDate].players[0].scores[0],'99','the rejected browser edit remains recoverable locally');

    const persistedWeek = savedRoot.glow.weeks[weekDate];
    const replay = await pg.query(
      'select public.hbnf_apply_udisc_glow_week($1,$2::jsonb,$3::jsonb,$4::jsonb) as result',
      [weekDate,JSON.stringify(persistedWeek),JSON.stringify(persistedWeek),JSON.stringify(weekDate)],
    );
    assert.equal(replay.rows[0].result.unchanged,true);
    const afterReplay = await pg.query('select updated_at::text as updated_at from public.league_state where id=1');
    assert.equal(afterReplay.rows[0].updated_at,revisionB,'idempotent replay does not churn the revision');

    const acl = await pg.query("select has_function_privilege('anon','public.hbnf_apply_udisc_glow_week(text,jsonb,jsonb,jsonb)','EXECUTE') as anon_can_call, has_function_privilege('authenticated','public.hbnf_apply_udisc_glow_week(text,jsonb,jsonb,jsonb)','EXECUTE') as auth_can_call, has_function_privilege('service_role','public.hbnf_apply_udisc_glow_week(text,jsonb,jsonb,jsonb)','EXECUTE') as service_can_call");
    assert.deepEqual(acl.rows[0],{anon_can_call:false,auth_can_call:false,service_can_call:true});
  } finally {
    await pg.close();
  }
});

test('failure status advances the same revision and locked or absent weeks stay unchanged', async () => {
  const {pg,root} = await database();
  try {
    const before = await pg.query('select state_json,updated_at::text as updated_at from public.league_state where id=1');
    const status = await pg.query(
      'select public.hbnf_record_udisc_glow_sync_status($1,$2,$3::timestamptz,$4) as result',
      [weekDate,weekDate,'2026-04-18T18:00:00Z','SOURCE_UNAVAILABLE'],
    );
    assert.equal(status.rows[0].result.recorded,true);
    const after = await pg.query('select state_json,updated_at::text as updated_at,updated_at > $1::timestamptz as newer from public.league_state where id=1',[before.rows[0].updated_at]);
    assert.equal(after.rows[0].newer,true);
    assert.equal(after.rows[0].state_json.glow.weeks[weekDate].udiscSync.status.errorCode,'SOURCE_UNAVAILABLE');
    assert.equal(after.rows[0].state_json.glow.weeks[weekDate].players[0].scores[0],'3');
    assert.deepEqual(after.rows[0].state_json.skins,root.skins);

    const missing = await pg.query(
      'select public.hbnf_record_udisc_glow_sync_status($1,$2,$3::timestamptz,$4) as result',
      ['2026-04-25','2026-04-25','2026-04-25T18:00:00Z','SYNC_FAILED'],
    );
    assert.equal(missing.rows[0].result.reason,'active_week_changed');
    await pg.query("update public.league_state set state_json=jsonb_set(state_json,'{glow,activeWeek}',to_jsonb($1::text)) where id=1",['2026-04-25']);
    const missingActive = await pg.query(
      'select public.hbnf_record_udisc_glow_sync_status($1,$2,$3::timestamptz,$4) as result',
      ['2026-04-25','2026-04-25','2026-04-25T18:00:00Z','SYNC_FAILED'],
    );
    assert.equal(missingActive.rows[0].result.reason,'week_not_initialized');
    await pg.query("update public.league_state set state_json=jsonb_set(state_json,'{glow,activeWeek}',to_jsonb($1::text)) where id=1",[weekDate]);

    let current = structuredClone(after.rows[0].state_json);
    current.glow.activeWeek = weekDate;
    let locked = structuredClone(current.glow.weeks[weekDate]);
    locked.scoresLocked = true;
    await pg.query('update public.league_state set state_json=jsonb_set(state_json,$1::text[], $2::jsonb) where id=1',[['glow','weeks',weekDate],JSON.stringify(locked)]);
    current.glow.weeks[weekDate] = locked;
    const lockedResult = await pg.query(
      'select public.hbnf_apply_udisc_glow_week($1,$2::jsonb,$3::jsonb,$4::jsonb) as result',
      [weekDate,JSON.stringify(locked),JSON.stringify({...locked,players:[]}),JSON.stringify(weekDate)],
    );
    assert.equal(lockedResult.rows[0].result.reason,'week_locked');

    const finalized = structuredClone(current.glow.weeks[weekDate]);
    finalized.scoresLocked = false;
    finalized.cards[0].finalized = true;
    await pg.query('update public.league_state set state_json=jsonb_set(state_json,$1::text[], $2::jsonb) where id=1',[['glow','weeks',weekDate],JSON.stringify(finalized)]);
    current.glow.weeks[weekDate] = finalized;
    const finalizedResult = await pg.query(
      'select public.hbnf_apply_udisc_glow_week($1,$2::jsonb,$3::jsonb,$4::jsonb) as result',
      [weekDate,JSON.stringify(finalized),JSON.stringify({...finalized,players:[]}),JSON.stringify(weekDate)],
    );
    assert.equal(finalizedResult.rows[0].result.reason,'week_locked');

    const expectedRevision = (await pg.query('select updated_at::text as updated_at from public.league_state where id=1')).rows[0].updated_at;
    const finalRead = await pg.query('select state_json,updated_at::text as updated_at from public.league_state where id=1');
    assert.equal(finalRead.rows[0].updated_at,expectedRevision);
    assert.deepEqual(finalRead.rows[0].state_json,current);
  } finally {
    await pg.close();
  }
});


test('browser device clocks cannot move or reuse the server revision', async () => {
  const {pg}=await database('2026-10-29T00:00:00.000000Z');
  try {
    const before=(await pg.query('select updated_at from public.league_state where id=1')).rows[0].updated_at;
    const futureClientClock='2099-01-01T00:00:00.000000Z';
    await pg.query('update public.league_state set state_json=state_json || $1::jsonb,updated_at=$2::timestamptz where id=1',[JSON.stringify({admin:{edit:1}}),futureClientClock]);
    const first=(await pg.query('select updated_at::text as updated_at,extract(epoch from updated_at)>extract(epoch from $1::timestamptz) as advanced from public.league_state where id=1',[before])).rows[0];
    assert.equal(first.advanced,true);
    assert.ok(Date.parse(first.updated_at) < Date.parse('2100-01-01T00:00:00Z'),'the server must ignore a device clock years in the future');
    const olderClientClock='1990-01-01T00:00:00.000000Z';
    await pg.query('update public.league_state set state_json=state_json || $1::jsonb,updated_at=$2::timestamptz where id=1',[JSON.stringify({glow:{manual:true}}),olderClientClock]);
    const second=(await pg.query('select updated_at::text as updated_at,updated_at > $1::timestamptz as advanced from public.league_state where id=1',[first.updated_at])).rows[0];
    assert.equal(second.advanced,true,'older device clock cannot make an acknowledged revision reusable');
    assert.ok(second.advanced,'older device clock cannot leave the previous acknowledged revision reusable');
  } finally { await pg.close(); }
});

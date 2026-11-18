'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const snapshotDir = path.resolve(__dirname, '..');
const htmlPath = path.join(snapshotDir, 'public/skins.html');
const html = fs.readFileSync(htmlPath, 'utf8');

function loadSync(source = html) {
  const scripts = [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
  const main = scripts.find((script) => script.includes('function makeSyncHelpers(ctx)'));
  assert.ok(main, 'sync implementation missing');
  const start = main.indexOf('function hbnfSyncClone(obj)');
  const end = main.indexOf('\nconst qs=', start);
  assert.ok(start >= 0 && end > start, 'could not isolate sync helpers');
  const status = { textContent: '' };
  const listeners = new Map();
  const sandbox = {
    document: { querySelector: () => status },
    window: {
      addEventListener: (name, fn) => listeners.set(name, fn),
      removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
    },
    console: { log: console.log, error() {} },
    saveLocal: () => true,
    renderAll: () => {},
    setTimeout,
    clearTimeout,
    Date,
    JSON,
    Object,
    Array,
    Set,
    Number,
    String,
    Math,
    Promise,
  };
  vm.createContext(sandbox);
  vm.runInContext(`${main.slice(start, end)};this.__sync={hbnfSyncHash,makeSyncHelpers};`, sandbox);
  return { ...sandbox.__sync, sandbox, status, listeners };
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function makeDatabaseClient(database, mode = 'ack') {
  let updateCalls = 0;
  return {
    get updateCalls() { return updateCalls; },
    from(table) {
      assert.equal(table, 'league_state');
      return {
        select() {
          return { eq(_key, id) { assert.equal(id, 1); return { single: async () => ({ data: { state_json: clone(database.state_json), updated_at: database.updated_at }, error: null }) }; } };
        },
        update(payload) {
          updateCalls++;
          const filters = [];
          const query = {
            eq(key, value) { filters.push([key, value]); return query; },
            select() {
              assert.ok(filters.some(([key, value]) => key === 'id' && value === 1));
              const expectedRevision = filters.find(([key]) => key === 'updated_at')?.[1];
              if (mode === 'conflict' && updateCalls === 1) {
                database.state_json.skins = { weeks: { '2026-10-27': { cloud: true } }, activeWeek: '2026-10-27' };
                database.updated_at = 'revision-cloud-won';
              }
              if (expectedRevision !== database.updated_at) return Promise.resolve({ data: [], error: null });
              database.state_json = clone(payload.state_json);
              database.updated_at = `revision-${updateCalls + 1}`;
              if (mode === 'lost-ack' && updateCalls === 1) return Promise.resolve({ data: null, error: new Error('response lost after server commit') });
              return Promise.resolve({ data: [{ id: 1 }], error: null });
            },
          };
          return query;
        },
      };
    },
  };
}

async function runPush(mode) {
  const { hbnfSyncHash, makeSyncHelpers, sandbox, status } = loadSync();
  const database = {
    state_json: {
      skins: { weeks: { '2026-10-20': { score: 'before' } }, activeWeek: '2026-10-20' },
      bagTags: { players: [{ name: 'Andrew', tag: 2 }, { name: 'Fox', tag: 5 }], lastManualSaveAt: '2026-10-20T20:00:00Z' },
      __backups: [{ id: 'history-1', createdAt: '2026-10-20T20:00:00Z' }],
      stats: { lifetimeSkins: { Andrew: 18 }, aceBalances: { Andrew: 0 } },
      glow: { weeks: { '2026-10-18': { finalized: true } } },
    },
    updated_at: 'revision-1',
  };
  const baseline = clone(database.state_json);
  const client = makeDatabaseClient(database, mode);
  const localState = { ...clone(baseline.skins), localEdit: 'accepted only after ack' };
  const ctx = {
    branch: 'skins', state: localState, rootState: clone(baseline), supabaseClient: client,
    syncBaselineReady: true, lastRemoteRootHash: hbnfSyncHash(baseline),
    lastRemoteBranchHash: hbnfSyncHash(baseline.skins), localDirty: true,
    localDraftStored: true, syncDeclined: false, remoteConflictPending: false,
    syncing: false, pendingPush: false,
  };
  sandbox.saveLocal = () => {
    if (mode === 'local-failure') { ctx.localDraftStored = false; return false; }
    return true;
  };
  Object.assign(ctx, makeSyncHelpers(ctx));
  ctx.pushRoot = ctx.pushRoot.bind(ctx);
  await ctx.pushRoot();
  return { ctx, database, client, status, baseline, localState };
}

async function runReconnect() {
  const { hbnfSyncHash, makeSyncHelpers, sandbox, status, listeners } = loadSync();
  let online = false;
  const original = { weeks: { '2026-10-20': { score: 'before' } }, activeWeek: '2026-10-20' };
  const database = {
    state_json: { skins: clone(original), bagTags: { players: [{ name: 'Andrew', tag: 2 }] }, stats: { lifetimeSkins: 18 } },
    updated_at: 'revision-1',
  };
  const client = {
    from() {
      return {
        select() { return { eq() { return { single: async () => online
          ? ({ data: { state_json: clone(database.state_json), updated_at: database.updated_at }, error: null })
          : ({ data: null, error: new Error('offline') }) }; } }; },
        update(payload) {
          const filters = [];
          const query = {
            eq(key, value) { filters.push([key, value]); return query; },
            select() {
              if (!online || !filters.some(([key, value]) => key === 'updated_at' && value === database.updated_at)) return Promise.resolve({ data: [], error: null });
              database.state_json = clone(payload.state_json);
              database.updated_at = 'revision-2';
              return Promise.resolve({ data: [{ id: 1 }], error: null });
            },
          };
          return query;
        },
      };
    },
    channel() { return { on() { return this; }, subscribe(handler) { handler('SUBSCRIBED'); return this; } }; },
  };
  sandbox.window.supabase = { createClient: () => client };
  sandbox.getConfiguredSupabase = () => ({ SUPABASE_URL: 'https://mock.invalid', SUPABASE_ANON_KEY: 'test-only' });
  const ctx = {
    branch: 'skins', state: clone(original), rootState: {}, supabaseClient: null,
    localDirty: false, localEditedBeforeBaseline: false, syncBaselineReady: false,
    remoteConflictPending: false, normalize: (value) => value,
    startupBranchHash: hbnfSyncHash(original),
  };
  Object.assign(ctx, makeSyncHelpers(ctx));
  ctx.pushRoot = ctx.pushRoot.bind(ctx);
  await ctx.initSync();
  assert.equal(ctx.syncBaselineReady, false, 'initial offline read must not create a cloud baseline');
  assert.equal(typeof listeners.get('online'), 'function', 'online retry listener must be installed');
  ctx.state.localEdit = 'saved on reconnect';
  ctx.localDirty = true;
  ctx.localEditedBeforeBaseline = true;
  online = true;
  listeners.get('online')();
  for (let i = 0; i < 20 && ctx.localDirty; i++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(database.state_json.skins.localEdit, 'saved on reconnect', 'reconnect must persist the kept offline edit');
  assert.equal(ctx.localDirty, false, 'dirty state clears only after the mocked provider returns the updated row');
  assert.equal(status.textContent, 'Saved to cloud');
  assert.deepEqual(database.state_json.bagTags, { players: [{ name: 'Andrew', tag: 2 }] });
  assert.deepEqual(database.state_json.stats, { lifetimeSkins: 18 });
}

async function runReload() {
  const { hbnfSyncHash, makeSyncHelpers, sandbox, status } = loadSync();
  const database = {
    state_json: {
      skins: { weeks: { '2026-10-24': { front: { winners: { 8: 'Mason' } } } }, activeWeek: '2026-10-24' },
      bagTags: { players: [{ name: 'Andrew', tag: 2 }] },
      stats: { lifetimeSkins: { Mason: 8 }, aceBalances: { Mason: 0 } },
      __backups: [{ id: 'before-reload' }],
    },
    updated_at: 'revision-reopen',
  };
  const client = makeDatabaseClient(database);
  client.channel = () => ({ on() { return this; }, subscribe(handler) { handler('SUBSCRIBED'); return this; } });
  sandbox.window.supabase = { createClient: () => client };
  sandbox.getConfiguredSupabase = () => ({ SUPABASE_URL: 'https://mock.invalid', SUPABASE_ANON_KEY: 'test-only' });
  const ctx = {
    branch: 'skins', state: { weeks: {}, activeWeek: null }, rootState: {}, supabaseClient: null,
    localDirty: false, localEditedBeforeBaseline: false, syncBaselineReady: false,
    remoteConflictPending: false, normalize: (value) => value,
  };
  Object.assign(ctx, makeSyncHelpers(ctx));
  ctx.pushRoot = ctx.pushRoot.bind(ctx);
  await ctx.initSync();
  assert.equal(ctx.syncBaselineReady, true);
  assert.deepEqual(ctx.state.weeks['2026-10-24'], { front: { winners: { 8: 'Mason' } } }, 'reopened client hydrates the acknowledged scorecard');
  assert.deepEqual(ctx.rootState.bagTags, { players: [{ name: 'Andrew', tag: 2 }] });
  assert.deepEqual(ctx.rootState.stats, { lifetimeSkins: { Mason: 8 }, aceBalances: { Mason: 0 } });
  assert.deepEqual(ctx.rootState.__backups, [{ id: 'before-reload' }]);
  assert.equal(status.textContent, 'Saved to cloud');
}

function runDeletion() {
  const marker = "qs('#deleteWeek').addEventListener('click',async()=>{";
  const start = html.indexOf(marker);
  const end = html.indexOf('});async function finalizeSelectedWeek()', start);
  assert.ok(start >= 0 && end > start, 'supported delete-week handler missing');
  const body = html.slice(start + marker.length, end);
  const tags = [
    { round_date: '2026-10-13', event_type: 'skins', id: 'target-entry' },
    { round_date: '2026-10-06', event_type: 'skins', id: 'historical-entry' },
    { round_date: '2026-10-13', event_type: 'glow', id: 'other-event' },
  ];
  const cleanupCalls = [];
  const ctx = {
    state: {
      activeWeek: '2026-10-13',
      weeks: {
        '2026-10-13': { finalized: false, front: { cards: [{ playersText: 'A' }] } },
        '2026-10-20': { finalized: false, front: { cards: [{ playersText: '' }] } },
      },
    },
    rootState: {
      bagTags: { players: [{ name: 'Andrew', tag: 2 }, { name: 'Fox', tag: 5 }] },
      stats: { lifetimeSkins: 18 },
      __backups: [{ id: 'historical-backup' }],
    },
    supabaseClient: {
      from(table) {
        return { delete() {
          const filters = [];
          const query = {
            eq(key, value) { filters.push([key, value]); return query; },
            then(resolve) {
              cleanupCalls.push({ table, filters: clone(filters) });
              const date = filters.find(([key]) => key === 'round_date')?.[1];
              const type = filters.find(([key]) => key === 'event_type')?.[1];
              for (let i = tags.length - 1; i >= 0; i--) if (tags[i].round_date === date && tags[i].event_type === type) tags.splice(i, 1);
              resolve({ error: null });
            },
          };
          return query;
        } };
      },
    },
  };
  let beforeSnapshot;
  let pushed = 0;
  let selectedPage = '';
  let status = '';
  const dateList = (weeks, deleted) => Object.keys(weeks).filter((key) => !deleted[key]).sort();
  const handler = new Function('ctx','confirm','fmtDate','dateList','hbnfWeekDataScore','hbnfSnapshot','hbnfSetSyncStatus','push','setPage',`return async()=>{${body}}`)(
    ctx, () => true, (key) => key, dateList, () => 1,
    () => { beforeSnapshot = clone(ctx.state.weeks); },
    (value) => { status = value; }, () => { pushed++; }, (page) => { selectedPage = page; },
  );
  return handler().then(() => {
    assert.ok(beforeSnapshot['2026-10-13'], 'recovery snapshot must precede deletion');
    assert.equal(ctx.state.weeks['2026-10-13'], undefined);
    assert.ok(ctx.state.weeks['2026-10-20'], 'other scorecard remains');
    assert.equal(ctx.state.deletedWeeks['2026-10-13'] !== undefined, true, 'delete tombstone is retained for sync');
    assert.equal(ctx.state.activeWeek, '2026-10-20');
    assert.equal(pushed, 1);
    assert.equal(selectedPage, 'setup');
    assert.deepEqual(ctx.rootState.bagTags, { players: [{ name: 'Andrew', tag: 2 }, { name: 'Fox', tag: 5 }] });
    assert.deepEqual(ctx.rootState.stats, { lifetimeSkins: 18 });
    assert.deepEqual(ctx.rootState.__backups, [{ id: 'historical-backup' }]);
    assert.deepEqual(cleanupCalls.map(({ table }) => table), ['hbnf_round_tag_entries', 'hbnf_round_available_tags']);
    assert.ok(cleanupCalls.every(({ filters }) => JSON.stringify(filters) === JSON.stringify([['round_date','2026-10-13'],['event_type','skins']])));
    assert.deepEqual(tags.map(({ id }) => id).sort(), ['historical-entry','other-event']);
    assert.equal(status, 'Cloud sync connected');
  });
}

(async () => {
  const acknowledged = await runPush('ack');
  assert.equal(acknowledged.status.textContent, 'Saved to cloud');
  assert.equal(acknowledged.ctx.localDirty, false);
  assert.deepEqual(acknowledged.database.state_json.bagTags, acknowledged.baseline.bagTags);
  assert.deepEqual(acknowledged.database.state_json.__backups, acknowledged.baseline.__backups);
  assert.deepEqual(acknowledged.database.state_json.stats, acknowledged.baseline.stats);
  assert.deepEqual(acknowledged.database.state_json.glow, acknowledged.baseline.glow);
  assert.equal(acknowledged.client.updateCalls, 1);

  const localFailure = await runPush('local-failure');
  assert.equal(localFailure.ctx.localDraftStored, false);
  assert.equal(localFailure.client.updateCalls, 1, 'server save still proceeds when localStorage fails');
  assert.equal(localFailure.status.textContent, 'Saved to cloud', 'cloud status reflects the provider acknowledgment despite localStorage failure');

  const conflict = await runPush('conflict');
  assert.equal(conflict.ctx.remoteConflictPending, true);
  assert.match(conflict.status.textContent, /^Conflict/);
  assert.equal(conflict.ctx.state.localEdit, 'accepted only after ack', 'local edit remains available after conflict');
  assert.equal(conflict.database.state_json.skins.localEdit, undefined, 'stale conditional write must not overwrite newer cloud state');

  const lostAck = await runPush('lost-ack');
  assert.match(lostAck.status.textContent, /Save failed/);
  assert.equal(lostAck.ctx.localDirty, true);
  await lostAck.ctx.pushRoot();
  assert.equal(lostAck.status.textContent, 'Saved to cloud', 'retry after a lost response must confirm an already-applied edit');
  assert.equal(lostAck.ctx.localDirty, false);
  assert.equal(lostAck.client.updateCalls, 1, 'idempotent retry must not write the same edit twice');

  await runReconnect();
  await runReload();
  await runDeletion();
  console.log(JSON.stringify({ result: 'PASS', cases: ['server-row acknowledgment before Saved status','server save continues when localStorage fails','conditional revision conflict retains local edit','lost-ack retry recognizes already-applied row without duplicate write','offline edit is saved after browser online event with confirmed acknowledgment','reopen hydrates acknowledged score and preserves root data','scorecard deletion scopes date/event cleanup and preserves other scorecards, tag custody, stats, and backup history'], provider: 'mocked Supabase interface only', production: 'not contacted or changed' }, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });

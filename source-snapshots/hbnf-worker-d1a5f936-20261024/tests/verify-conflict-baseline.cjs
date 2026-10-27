'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const vm = require('node:vm');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const baseDir = __dirname;
function loadSync(sourcePath, options = {}) {
  const html = fs.readFileSync(sourcePath, 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  const main = scripts.find(s => s.includes('function makeSyncHelpers(ctx)'));
  assert.ok(main, `sync implementation missing in ${sourcePath}`);
  const start = main.indexOf('function hbnfSyncClone(obj)');
  const end = main.indexOf('\nconst qs=', start);
  assert.ok(start >= 0 && end > start, 'could not isolate sync helpers');
  const status = { textContent: '' };
  const sandbox = {
    document: { querySelector: () => status },
    window: options.window || {},
    getConfiguredSupabase: options.getConfiguredSupabase || (() => null),
    saveLocal: () => true,
    renderAll: () => {},
    console,
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
  return { ...sandbox.__sync, sandbox, status };
}

async function runPull(sourcePath) {
  const { hbnfSyncHash, makeSyncHelpers } = loadSync(sourcePath);
  // This legacy-shaped remote branch is intentionally changed by an in-place normalizer,
  // matching the production failure mode (normalization inserts canonical defaults).
  const rawBranch = { weeks: { '2026-10-20': { finalized: false } }, activeWeek: '2026-10-20' };
  const rawRoot = { skins: rawBranch, bagTags: { marker: 'other-root-data' } };
  const rawBranchText = JSON.stringify(rawBranch);
  const rawRootText = JSON.stringify(rawRoot);
  const database = { state_json: JSON.parse(rawRootText), updated_at: 'revision-1', updates: 0 };
  const ctx = {
    branch: 'skins',
    state: { weeks: {}, activeWeek: null },
    rootState: {},
    localDirty: false,
    localEditedBeforeBaseline: false,
    syncBaselineReady: false,
    remoteConflictPending: false,
    normalize(input) {
      input.weeks['2026-10-27'] = { finalized: false, front: { cards: [] }, back: { cards: [] } };
      input.normalizedMarker = true;
      return input;
    },
    supabaseClient: {
      from() {
        return {
          select() {
            return { eq() { return { single: async () => ({ data: { state_json: JSON.parse(JSON.stringify(database.state_json)), updated_at: database.updated_at }, error: null }) }; } };
          },
          update(payload) {
            const filters = [];
            const query = {
              eq(key, value) { filters.push([key, value]); return query; },
              select() {
                const idOK = filters.some(([key, value]) => key === 'id' && value === 1);
                const revisionOK = filters.some(([key, value]) => key === 'updated_at' && value === database.updated_at);
                if (!idOK || !revisionOK) return Promise.resolve({ data: [], error: null });
                database.state_json = JSON.parse(JSON.stringify(payload.state_json));
                database.updated_at = 'revision-2';
                database.updates++;
                return Promise.resolve({ data: [{ id: 1 }], error: null });
              },
            };
            return query;
          },
        };
      },
    },
  };
  const sync = makeSyncHelpers(ctx);
  await sync.pullRoot();
  const storedBaselineIsRaw = ctx.lastRemoteBranchHash === rawBranchText;
  const rootBaselineIsRaw = ctx.lastRemoteRootHash === rawRootText;
  const remoteBranchStayedRaw = JSON.stringify(database.state_json.skins) === rawBranchText;
  const stateWasNormalized = ctx.state.normalizedMarker === true;
  ctx.localDirty = true;
  ctx.state.localEdit = 'temporary fixture';
  await sync.pushRoot();
  return { hbnfSyncHash, ctx, database, storedBaselineIsRaw, rootBaselineIsRaw, remoteBranchStayedRaw, stateWasNormalized };
}

async function runRealtime(sourcePath) {
  let realtimeHandler = null;
  let subscriptionHandler = null;
  let localSaves = 0;
  let renders = 0;
  const initialRoot = { skins: { weeks: {}, activeWeek: null }, bagTags: { keep: 'other-root-data' } };
  const realtimeClient = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                single: async () => ({ data: { state_json: JSON.parse(JSON.stringify(initialRoot)), updated_at: 'revision-1' }, error: null }),
              };
            },
          };
        },
      };
    },
    channel() {
      return {
        on(event, filter, handler) { assert.equal(event, 'postgres_changes'); assert.equal(filter.table, 'league_state'); realtimeHandler = handler; return this; },
        subscribe(handler) { subscriptionHandler = handler; handler('SUBSCRIBED'); return this; },
      };
    },
  };
  const { makeSyncHelpers, sandbox, status } = loadSync(sourcePath, {
    window: {
      supabase: { createClient: () => realtimeClient },
      addEventListener() {},
      removeEventListener() {},
    },
    getConfiguredSupabase: () => ({ SUPABASE_URL: 'https://mock.invalid', SUPABASE_ANON_KEY: 'mock-key' }),
  });
  sandbox.saveLocal = () => { localSaves++; return true; };
  sandbox.renderAll = () => { renders++; };
  const ctx = {
    branch: 'skins',
    state: { weeks: {}, activeWeek: null },
    rootState: {},
    localDirty: false,
    localEditedBeforeBaseline: false,
    syncBaselineReady: false,
    remoteConflictPending: false,
    normalize(input) {
      // Mimic the production legacy-shape normalizer: fill defaults by mutating its input.
      for (const week of Object.values(input.weeks || {})) {
        week.front ||= { cards: [], aceWinner: '' };
        week.back ||= { cards: [], aceWinner: '' };
        week.tagExchangeExceptions ||= {};
      }
      input.weeks ||= {};
      input.weeks['2026-10-27'] ||= { finalized: false, front: { cards: [] }, back: { cards: [] } };
      input.normalizedMarker = true;
      return input;
    },
  };
  const sync = makeSyncHelpers(ctx);
  await sync.initSync();
  assert.equal(typeof realtimeHandler, 'function', 'initSync must register the Realtime callback');
  assert.equal(typeof subscriptionHandler, 'function', 'initSync must establish the mocked channel subscription');

  // A valid older row shape that lacks modern defaults exercises the mutating normalizer.
  const rawIncoming = {
    skins: { weeks: { '2026-10-20': { finalized: false, front: { cards: [{ winners: { 8: 'mason' } }] } } }, activeWeek: '2026-10-20' },
    bagTags: { keep: 'other-root-data' },
  };
  const rawRootText = JSON.stringify(rawIncoming);
  const rawBranchText = JSON.stringify(rawIncoming.skins);
  const payload = { new: { state_json: rawIncoming, updated_at: 'revision-2' } };
  const savesBeforeRealtime = localSaves;
  const rendersBeforeRealtime = renders;
  realtimeHandler(payload);

  return {
    ctx, status,
    payloadUnchanged: JSON.stringify(payload.new.state_json) === rawRootText,
    rootHashIsRaw: ctx.lastRemoteRootHash === rawRootText,
    branchHashIsRaw: ctx.lastRemoteBranchHash === rawBranchText,
    rootStateIsDetached: ctx.rootState !== payload.new.state_json && ctx.rootState.skins !== payload.new.state_json.skins,
    normalizedLocalWeek: !!(ctx.state.weeks['2026-10-20'].back && ctx.state.weeks['2026-10-20'].tagExchangeExceptions),
    visibleUpdateRendered: renders - rendersBeforeRealtime === 1,
    localDraftSaved: localSaves - savesBeforeRealtime === 1,
    localWeekSelected: ctx.state.activeWeek === '2026-10-20',
    remoteConflictPending: ctx.remoteConflictPending,
  };
}

(async () => {
  const snapshotPath = 'source-snapshots/hbnf-worker-d1a5f936-20261024/public/skins.html';
  const production = path.join(os.tmpdir(), `hbnf-skins-baseline-${process.pid}.html`);
  fs.writeFileSync(production, execFileSync('git', ['show', `4289e37e8d0b2864cb17451c5267dfab87a63a1d:${snapshotPath}`]));
  const candidate = path.join(baseDir, '../public/skins.html');
  const productionBytes = fs.readFileSync(production);
  assert.equal(crypto.createHash('sha256').update(productionBytes).digest('hex'), '514c3269de04a738a34a5b316cd728c93a76f48f3c4cc37f0f2c5bf1fdfd3287', 'test must remain bound to the exact live page baseline');
  const productionScripts = [...productionBytes.toString('utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  const productionMainScript = productionScripts.find(s => s.includes('function makeSyncHelpers(ctx)'));
  assert.ok(productionMainScript, 'live scoring script missing from exact baseline');
  assert.equal(crypto.createHash('sha256').update(productionMainScript).digest('hex'), '2cebd6fdb966af81bf58280772ef29e887ccb069a4859926d041b749f1f31fa7', 'test must remain bound to the exact live scoring script');
  const before = await runPull(production);
  assert.equal(before.storedBaselineIsRaw, false, 'production baseline should reproduce the mutated-baseline defect');
  assert.equal(before.rootBaselineIsRaw, false, 'production baseline should reproduce mutated root baseline');
  assert.equal(before.remoteBranchStayedRaw, true, 'the mock database must remain unchanged while each read returns an isolated payload');
  assert.equal(before.stateWasNormalized, true, 'normalization should be exercised');
  assert.equal(before.database.updates, 0, 'production baseline must reproduce conflict before the update');
  assert.equal(before.ctx.remoteConflictPending, true, 'production baseline must surface the false conflict');

  const after = await runPull(candidate);
  assert.equal(after.storedBaselineIsRaw, true, 'candidate must retain the raw remote branch as concurrency baseline');
  assert.equal(after.rootBaselineIsRaw, true, 'candidate must retain the raw root baseline');
  assert.equal(after.remoteBranchStayedRaw, true, 'candidate must not mutate the fetched remote payload');
  assert.equal(after.stateWasNormalized, true, 'candidate must still normalize the working copy');
  assert.equal(after.database.updates, 1, 'candidate must pass compare-before-save and send exactly one mocked update');
  assert.equal(after.ctx.remoteConflictPending, false, 'candidate must not raise a false conflict');

  const baselineRealtime = await runRealtime(production);
  assert.equal(baselineRealtime.payloadUnchanged, false, 'baseline Realtime callback should reproduce in-place mutation of the provider payload');
  const candidateRealtime = await runRealtime(candidate);
  assert.equal(candidateRealtime.payloadUnchanged, true, 'candidate Realtime callback must not mutate the provider payload');
  assert.equal(candidateRealtime.rootHashIsRaw, true, 'candidate Realtime callback must retain the raw root hash');
  assert.equal(candidateRealtime.branchHashIsRaw, true, 'candidate Realtime callback must retain the raw branch hash');
  assert.equal(candidateRealtime.rootStateIsDetached, true, 'candidate Realtime callback must detach the stored root from the provider payload');
  assert.equal(candidateRealtime.normalizedLocalWeek, true, 'candidate must normalize a separate local working copy');
  assert.equal(candidateRealtime.visibleUpdateRendered, true, 'candidate must render one visible update');
  assert.equal(candidateRealtime.localDraftSaved, true, 'candidate must save the local draft after Realtime update');
  assert.equal(candidateRealtime.localWeekSelected, true, 'candidate must apply the incoming active week');
  assert.equal(candidateRealtime.remoteConflictPending, false, 'clean Realtime update must not create a conflict');
  fs.rmSync(production, {force:true});
  console.log(JSON.stringify({result:'PASS',productionReproduces:{baselineUsesNormalizedBranch:!before.storedBaselineIsRaw,conflictBeforeUpdate:before.ctx.remoteConflictPending,realtimeMutatesPayload:!baselineRealtime.payloadUnchanged},candidate:{rawBranchBaseline:after.storedBaselineIsRaw,rawRootBaseline:after.rootBaselineIsRaw,normalizedWorkingCopy:after.stateWasNormalized,mockedUpdateCount:after.database.updates,noFalseConflict:!after.ctx.remoteConflictPending,realtimePayloadUnchanged:candidateRealtime.payloadUnchanged,realtimeRawRootHash:candidateRealtime.rootHashIsRaw,realtimeRawBranchHash:candidateRealtime.branchHashIsRaw,detachedRootState:candidateRealtime.rootStateIsDetached,normalizedLocalWeek:candidateRealtime.normalizedLocalWeek,visibleUpdateRendered:candidateRealtime.visibleUpdateRendered,localDraftSaved:candidateRealtime.localDraftSaved,noRealtimeConflict:!candidateRealtime.remoteConflictPending},network:'none',realDatabase:'not connected or changed'},null,2));
})().catch(error => { console.error(error); process.exitCode = 1; });

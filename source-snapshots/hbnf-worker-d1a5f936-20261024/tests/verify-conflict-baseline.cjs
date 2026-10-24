'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const vm = require('node:vm');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const baseDir = __dirname;
function loadSync(sourcePath) {
  const html = fs.readFileSync(sourcePath, 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  const main = scripts.find(s => s.includes('function makeSyncHelpers(ctx)'));
  assert.ok(main, `sync implementation missing in ${sourcePath}`);
  const start = main.indexOf('function hbnfSyncClone(obj)');
  const end = main.indexOf('\nconst qs=', start);
  assert.ok(start >= 0 && end > start, 'could not isolate sync helpers');
  const sandbox = {
    document: { querySelector: () => ({ set textContent(_) {} }) },
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
  return sandbox.__sync;
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
  fs.rmSync(production, {force:true});
  console.log(JSON.stringify({result:'PASS',productionReproduces:{baselineUsesNormalizedBranch:!before.storedBaselineIsRaw,conflictBeforeUpdate:before.ctx.remoteConflictPending},candidate:{rawBranchBaseline:after.storedBaselineIsRaw,rawRootBaseline:after.rootBaselineIsRaw,normalizedWorkingCopy:after.stateWasNormalized,mockedUpdateCount:after.database.updates,noFalseConflict:!after.ctx.remoteConflictPending},network:'none',realDatabase:'not connected or changed'},null,2));
})().catch(error => { console.error(error); process.exitCode = 1; });

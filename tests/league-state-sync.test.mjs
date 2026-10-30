import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/hbnf-league-state-sync.js', import.meta.url), 'utf8');
function makeSync() {
  const window = { crypto: webcrypto, TextEncoder };
  vm.runInNewContext(source, { window, TextEncoder, Uint8Array, Set, Object, Array, JSON, Date, Number, Math, Error, String, Promise });
  return window.HBNFLeagueStateSync;
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function fakeClient(initial, hooks = {}) {
  let row = { id: 1, state_json: clone(initial), updated_at: '2026-10-29T08:00:00.000Z' };
  let reads = 0, writes = 0;
  const client = {
    from(table) {
      assert.equal(table, 'league_state');
      return { select() { return { eq() { return { single: async () => { reads++; if (hooks.beforeRead) await hooks.beforeRead({ reads, get: () => clone(row), set: value => { row = clone(value); } }); return (hooks.readError || hooks.readErrorAt === reads) ? { data: null, error: { message: hooks.readErrorMessage || 'offline' } } : { data: clone(row), error: null }; } }; } }; } };
    },
    async rpc(name, args) {
      assert.equal(name, 'hbnf_save_league_state_v1');
      writes++;
      if (hooks.beforeWrite) await hooks.beforeWrite({ get: () => clone(row), set: value => { row = clone(value); } });
      if (hooks.writeError) return { data: null, error: { message: 'denied' } };
      if (args.p_expected_updated_at !== row.updated_at) return { data: [], error: null };
      row = { id: 1, state_json: clone(args.p_state_json), updated_at: hooks.serverRevisionAtAck || new Date(Date.parse(row.updated_at) + 1).toISOString() };
      if (hooks.badAck) return { data: [{ ...clone(row), state_json: { corrupted: true } }], error: null };
      return { data: [clone(row)], error: null };
    },
  };
  return { client, get: () => clone(row), set: value => { row = clone(value); }, counts: () => ({ reads, writes }) };
}
const initialRoot = () => ({ skins: { weeks: { '2099-01-06': { front: { winners: { 1: 'Mason' } } } } }, glow: { weeks: {} }, admin: { backups: [] }, random: { weeks: {} }, skills: { weeks: {} }, bagTags: { players: [] }, __backups: [] });

test('all four page writers preserve an acknowledged Skins winner while saving their own branch', async t => {
  const sync = makeSync();
  for (const branch of ['glow', 'admin', 'random', 'skills']) {
    await t.test(branch, async () => {
      const server = fakeClient(initialRoot());
      const baseline = await sync.read(server.client), draft = clone(baseline.root);
      draft[branch] = { saved: `${branch}-edit` };
      const changed = server.get(); changed.state_json.skins.weeks['2099-01-06'].front.winners[2] = 'Andrew'; changed.updated_at = '2026-10-29T08:00:01.000Z'; server.set(changed);
      const ack = await sync.save(server.client, baseline, draft);
      assert.equal(ack.root.skins.weeks['2099-01-06'].front.winners[1], 'Mason');
      assert.equal(ack.root.skins.weeks['2099-01-06'].front.winners[2], 'Andrew');
      assert.equal(ack.root[branch].saved, `${branch}-edit`);
    });
  }
});

test('conditional retry rereads a concurrent Skins winner before saving another writer', async () => {
  const sync = makeSync(), root = initialRoot(); let injected = false;
  const server = fakeClient(root, { beforeWrite: async ({ get, set }) => {
    if (injected) return;
    injected = true;
    const row = get(); row.state_json.skins.weeks['2099-01-06'].front.winners[9] = 'Tony'; row.updated_at = '2026-10-29T08:00:02.000Z'; set(row);
  } });
  const baseline = await sync.read(server.client), draft = clone(baseline.root); draft.random = { round: 'next' };
  const ack = await sync.save(server.client, baseline, draft);
  assert.equal(ack.root.skins.weeks['2099-01-06'].front.winners[1], 'Mason');
  assert.equal(ack.root.skins.weeks['2099-01-06'].front.winners[9], 'Tony');
  assert.equal(ack.root.random.round, 'next');
  assert.ok(server.counts().writes >= 2, 'one stale CAS is rejected before retry');
});

test('same-key conflict rejects the save and keeps the caller draft intact', async () => {
  const sync = makeSync(), server = fakeClient(initialRoot()), baseline = await sync.read(server.client);
  const draft = clone(baseline.root); draft.skins.weeks['2099-01-06'].front.winners[1] = 'Mason local edit';
  const remote = server.get(); remote.state_json.skins.weeks['2099-01-06'].front.winners[1] = 'Jason remote edit';
  remote.updated_at = '2026-10-29T08:00:01.000Z';
  server.set(remote);
  await assert.rejects(sync.save(server.client, baseline, draft), { name: 'HbnfSyncConflictError' });
  assert.equal(draft.skins.weeks['2099-01-06'].front.winners[1], 'Mason local edit');
});

test('offline read failure, write denial, stale read, and mismatched acknowledgment fail closed', async t => {
  const sync = makeSync(), baselineRoot = initialRoot(), draft = clone(baselineRoot); draft.skills.score = 10;
  await t.test('offline', async () => {
    const server = fakeClient(baselineRoot, { readError: true });
    const baseline = await sync.snapshot(baselineRoot, '2026-10-29T08:00:00.000Z');
    await assert.rejects(sync.save(server.client, baseline, draft), /Cloud read failed/);
    assert.equal(server.counts().writes, 0);
  });
  await t.test('denied write', async () => {
    const server = fakeClient(baselineRoot, { writeError: true }), baseline = await sync.read(server.client);
    await assert.rejects(sync.save(server.client, baseline, draft), /Cloud save failed/);
  });
  await t.test('stale read', async () => {
    const server = fakeClient(baselineRoot), baseline = await sync.snapshot(baselineRoot, '2026-10-29T08:00:02.000Z');
    await assert.rejects(sync.save(server.client, baseline, draft), /stale revision/);
  });
  await t.test('bad acknowledgment', async () => {
    const server = fakeClient(baselineRoot, { badAck: true }), baseline = await sync.read(server.client);
    await assert.rejects(sync.save(server.client, baseline, draft), /acknowledgment did not match/);
  });
});

test('cold reopen reloads compact baseline hashes and replays an offline writer edit without losing Skins', async () => {
  const sync = makeSync(), storage = new Map();
  const localStorage = { setItem: (k,v) => storage.set(k,v), getItem: k => storage.get(k) || null };
  const server = fakeClient(initialRoot()), first = await sync.read(server.client);
  sync.cacheBaseline(localStorage, 'random:base', first);
  const local = clone(first.root); local.random.weeks['2099-01-06'] = { roster: 'offline draft' };
  const reopenedRemote = server.get(); reopenedRemote.state_json.skins.weeks['2099-01-06'].front.winners[5] = 'Mason';
  reopenedRemote.updated_at = '2026-10-29T08:00:01.000Z';
  server.set(reopenedRemote);
  const reopened = await sync.read(server.client);
  const prepared = await sync.prepare(server.client, localStorage, 'random:base', local, 'random', true, reopened);
  assert.equal(prepared.pending, true);
  const ack = await sync.save(server.client, prepared.baseline, prepared.root);
  assert.equal(ack.root.random.weeks['2099-01-06'].roster, 'offline draft');
  assert.equal(ack.root.skins.weeks['2099-01-06'].front.winners[5], 'Mason');
});

test('Admin restore can restore unchanged cloud state and rejects a restore that would erase a newer Skins score', async () => {
  const sync = makeSync(), server = fakeClient(initialRoot()), baseline = await sync.read(server.client);
  const olderSnapshot = clone(baseline.root); olderSnapshot.skins.weeks['2099-01-06'].front.winners[2] = 'Andrew';
  const restoreAck = await sync.save(server.client, baseline, olderSnapshot, { forceKeys: Object.keys(baseline.keyHashes) });
  assert.equal(restoreAck.root.skins.weeks['2099-01-06'].front.winners[2], 'Andrew');
  const nextBaseline = restoreAck, restoreDraft = clone(olderSnapshot);
  const newer = server.get(); newer.state_json.skins.weeks['2099-01-06'].front.winners[2] = 'Tony'; newer.updated_at = '2026-10-29T08:00:03.000Z';
  newer.updated_at = new Date(Date.now() + 10000).toISOString(); server.set(newer);
  await assert.rejects(sync.save(server.client, nextBaseline, restoreDraft, { forceKeys: Object.keys(nextBaseline.keyHashes) }), { name: 'HbnfSyncConflictError' });
});

test('save requires an independent GET after a verified conditional UPDATE ACK', async () => {
  const sync = makeSync(), storage = new Map();
  const localStorage = { setItem:(k,v)=>storage.set(k,v), getItem:k=>storage.get(k)||null, removeItem:k=>storage.delete(k) };
  const server = fakeClient(initialRoot()), baseline = await sync.read(server.client), draft = clone(baseline.root);
  draft.glow.weeks['2099-01-06'] = { cards: [{ id:'new' }] };
  const callbacks = { retainDraft:(root,base)=>sync.retainPendingDraft(localStorage,'pending',root,base), clearPending:()=>sync.clearPendingDraft(localStorage,'pending') };
  const saved = await sync.save(server.client, baseline, draft, callbacks);
  assert.equal(server.counts().reads, 3, 'baseline, pre-write CAS read, then separate confirmation GET');
  assert.equal(saved.root.glow.weeks['2099-01-06'].cards[0].id, 'new');
  assert.equal(localStorage.getItem('pending'), null);
});

test('successful ACK followed by HTTP 522 retains draft; retry recognizes accepted state without duplicate UPDATE', async () => {
  const sync = makeSync(), storage = new Map();
  const localStorage = { setItem:(k,v)=>storage.set(k,v), getItem:k=>storage.get(k)||null, removeItem:k=>storage.delete(k) };
  const server = fakeClient(initialRoot(), { readErrorAt:3, readErrorMessage:'HTTP 522 timeout' });
  const baseline = await sync.read(server.client), draft = clone(baseline.root); draft.random.weeks['2099-01-06'] = { roster:'offline recovery' };
  const opts = { retainDraft:(root,base)=>sync.retainPendingDraft(localStorage,'pending',root,base), clearPending:()=>sync.clearPendingDraft(localStorage,'pending') };
  await assert.rejects(sync.save(server.client,baseline,draft,opts), /HTTP 522/);
  assert.ok(sync.loadPendingDraft(localStorage,'pending'));
  assert.equal(server.counts().writes,1);
  const pending=sync.loadPendingDraft(localStorage,'pending');
  const retried=await sync.save(server.client,baseline,pending.root,opts);
  assert.equal(server.counts().writes,1,'latest read recognizes accepted write; no duplicate UPDATE');
  assert.equal(retried.root.random.weeks['2099-01-06'].roster,'offline recovery');
  assert.equal(localStorage.getItem('pending'),null);
});

test('divergent confirmation conflicts on same field and preserves concurrent disjoint edits', async () => {
  const sync=makeSync(); let injected=false;
  const server=fakeClient(initialRoot(),{beforeRead:async ({reads,get,set})=>{
    if(reads!==3||injected)return;injected=true;
    const row=get();row.state_json.skins.weeks['2099-01-06'].front.winners[8]='Andrew';row.updated_at=new Date(Date.parse(row.updated_at)+1).toISOString();set(row);
  }});
  const baseline=await sync.read(server.client),draft=clone(baseline.root);draft.random.weeks['2099-01-06']={roster:'saved'};
  const ack=await sync.save(server.client,baseline,draft);
  assert.equal(ack.root.random.weeks['2099-01-06'].roster,'saved');
  assert.equal(ack.root.skins.weeks['2099-01-06'].front.winners[8],'Andrew');

  let sameKeyInjected=false;
  const conflictServer=fakeClient(initialRoot(),{beforeRead:async ({reads,get,set})=>{
    if(reads!==3||sameKeyInjected)return;sameKeyInjected=true;
    const row=get();row.state_json.random={remote:'other device'};row.updated_at=new Date(Date.parse(row.updated_at)+1).toISOString();set(row);
  }});
  const base2=await sync.read(conflictServer.client),draft2=clone(base2.root);draft2.random={local:'intended'};
  await assert.rejects(sync.save(conflictServer.client,base2,draft2),{name:'HbnfSyncConflictError'});
  assert.equal(conflictServer.get().state_json.random.remote,'other device');
});

test('pending marker storage failure blocks write; marker cleanup failure remains unconfirmed', async () => {
  const sync=makeSync(),server=fakeClient(initialRoot()),baseline=await sync.read(server.client),draft=clone(baseline.root);draft.skills.score=42;
  await assert.rejects(sync.save(server.client,baseline,draft,{retainDraft:()=>false}),{name:'HbnfSyncStorageError'});
  assert.equal(server.counts().writes,0);
  const server2=fakeClient(initialRoot()),base2=await sync.read(server2.client),draft2=clone(base2.root);draft2.skills.score=43;
  await assert.rejects(sync.save(server2.client,base2,draft2,{retainDraft:()=>true,clearPending:()=>false}),{name:'HbnfSyncStorageError'});
  assert.equal(server2.counts().writes,1,'cloud accepted the edit, but caller must remain pending until recovery marker cleanup');
});


test('server-derived monotonic revision is accepted when it replaces a skewed client timestamp', async () => {
  const sync=makeSync(),server=fakeClient(initialRoot(),{serverRevisionAtAck:'2026-10-29T08:00:00.000001Z'});
  const baseline=await sync.read(server.client),draft=clone(baseline.root);draft.glow.weeks['2099-01-06']={cards:[{id:'clock-skew'}]};
  const originalNow=Date.now;
  Date.now=()=>Date.parse('2099-01-01T00:00:00.000Z');
  try {
    const saved=await sync.save(server.client,baseline,draft);
    assert.equal(saved.revision,'2026-10-29T08:00:00.000001Z');
    assert.equal(saved.root.glow.weeks['2099-01-06'].cards[0].id,'clock-skew');
  } finally { Date.now=originalNow; }
});

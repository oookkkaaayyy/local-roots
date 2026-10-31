import test from 'node:test';
import assert from 'node:assert/strict';
import {createGlowSaveCoordinator} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/public/glow-save-sync.mjs';

class Storage {
  values = new Map();
  fail = false;
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { if (this.fail) throw Error('quota'); this.values.set(key, value); }
  removeItem(key) { if (this.fail) throw Error('quota'); this.values.delete(key); }
}
const state = n => ({weeks:{'2026-04-18':{players:[{id:'T1',scores:[String(n)]}]}}});
function fakeServer(initial = state(1)) {
  let root = {glow:initial,skins:{week:{scores:[4]}}};
  let updatedAt = 'r1';
  let writes = 0, reads = 0;
  return {
    get stats() { return {writes,reads}; },
    async readCurrent() { reads++; return {root:structuredClone(root),updatedAt}; },
    async compareAndSwap(expected, next) {
      if (expected !== updatedAt) return {rows:[]};
      root = structuredClone(next); updatedAt = `r${++writes+1}`;
      return {rows:[{id:1,state_json:structuredClone(root),updated_at:updatedAt}]};
    },
    concurrent(next) { root = {glow:structuredClone(next),skins:{week:{scores:[9]}}}; updatedAt = `r${Number(updatedAt.slice(1))+1}`; },
    unrelated(next) { root = {...root,...structuredClone(next)}; updatedAt = `r${Number(updatedAt.slice(1))+1}`; },
    get root() { return root; },
  };
}

test('Glow save reports saved only after CAS and an independent server readback', async () => {
  const storage = new Storage(), statuses = [], server = fakeServer();
  const coordinator = createGlowSaveCoordinator({storage,onStatus:s=>statuses.push(s)});
  coordinator.queue(state(2),'r1');
  const result = await coordinator.flush(server);
  assert.equal(result.status,'saved');
  assert.equal(coordinator.hasPending,false);
  assert.equal(server.stats.writes,1);
  assert.ok(server.stats.reads>=2);
  assert.equal(server.root.skins.week.scores[0],4);
  assert.equal(statuses.at(-1),'saved');
});

test('cold reopen restores an unsent edit and retries without losing unrelated root data', async () => {
  const storage = new Storage(), statuses = [], server = fakeServer();
  createGlowSaveCoordinator({storage}).queue(state(7),'r1');
  const reopened = createGlowSaveCoordinator({storage,onStatus:s=>statuses.push(s)});
  assert.equal(reopened.pending.branchState.weeks['2026-04-18'].players[0].scores[0],'7');
  assert.equal((await reopened.flush(server)).status,'saved');
  assert.equal(server.root.glow.weeks['2026-04-18'].players[0].scores[0],'7');
  assert.equal(server.root.skins.week.scores[0],4);
  assert.equal(statuses.at(-1),'saved');
});

test('revision conflict performs no write and preserves the local draft', async () => {
  const storage = new Storage(), statuses = [], server = fakeServer();
  const coordinator = createGlowSaveCoordinator({storage,onStatus:s=>statuses.push(s)});
  coordinator.queue(state(2),'r1');
  server.concurrent(state(3));
  assert.equal((await coordinator.flush(server)).status,'conflict');
  assert.equal(coordinator.hasPending,true);
  assert.equal(server.stats.writes,0);
  assert.equal(coordinator.pending.branchState.weeks['2026-04-18'].players[0].scores[0],'2');
  assert.equal(statuses.at(-1),'conflict');
});

test('concurrent Skins changes are preserved while a Glow-only draft rebases safely',async()=>{
  const storage=new Storage(),server=fakeServer(),coordinator=createGlowSaveCoordinator({storage});
  coordinator.queue(state(2),'r1',state(1));
  server.unrelated({skins:{week:{scores:[10]},newField:'preserve'}});
  assert.equal((await coordinator.flush(server)).status,'saved');
  assert.equal(server.root.glow.weeks['2026-04-18'].players[0].scores[0],'2');
  assert.deepEqual(server.root.skins,{week:{scores:[10]},newField:'preserve'});
});

test('failed readback retains pending draft and does not claim saved', async () => {
  const storage = new Storage(), statuses = [], server = fakeServer();
  const coordinator = createGlowSaveCoordinator({storage,onStatus:s=>statuses.push(s)});
  coordinator.queue(state(2),'r1');
  let calls=0;
  const result=await coordinator.flush({
    readCurrent:async()=>{calls++;if(calls===1)return server.readCurrent();throw Error('offline after write')},
    compareAndSwap:server.compareAndSwap,
  });
  assert.equal(result.status,'failed');
  assert.equal(coordinator.hasPending,true);
  assert.notEqual(statuses.at(-1),'saved');
});

test('device storage failure is reported and prevents any server write', async () => {
  const storage = new Storage(), statuses = [], server = fakeServer();
  const coordinator = createGlowSaveCoordinator({storage,onStatus:s=>statuses.push(s)});
  storage.fail=true;
  assert.throws(()=>coordinator.queue(state(2),'r1'));
  assert.equal(server.stats.writes,0);
  assert.equal(statuses.at(-1),'local-failure');
});

test('edits arriving during a save remain queued against the acknowledged revision', async () => {
  const storage = new Storage(), statuses = [], server = fakeServer();
  const coordinator = createGlowSaveCoordinator({storage,onStatus:s=>statuses.push(s)});
  coordinator.queue(state(2),'r1');
  const result = await coordinator.flush({
    readCurrent:server.readCurrent,
    compareAndSwap:async (revision, root)=>{coordinator.queue(state(5),revision);return server.compareAndSwap(revision,root)},
  });
  assert.equal(result.status,'pending');
  assert.equal(coordinator.pending.baseUpdatedAt,'r2');
  assert.equal(coordinator.pending.branchState.weeks['2026-04-18'].players[0].scores[0],'5');
  assert.equal((await coordinator.flush(server)).status,'saved');
  assert.equal(server.root.glow.weeks['2026-04-18'].players[0].scores[0],'5');
});


test('a timed-out CAS with unchanged server branch is a failed save, not a false conflict', async () => {
  const storage = new Storage(), statuses = [], server = fakeServer();
  const coordinator = createGlowSaveCoordinator({storage,onStatus:s=>statuses.push(s)});
  coordinator.queue(state(2),'r1',state(1));
  let writes=0;
  const result=await coordinator.flush({
    readCurrent:server.readCurrent,
    compareAndSwap:async()=>{writes++;return {error:{code:'57014',message:'statement timeout'}}},
  });
  assert.equal(writes,2);
  assert.equal(result.status,'failed');
  assert.equal(statuses.at(-1),'failed');
  assert.equal(coordinator.hasPending,true);
  assert.deepEqual(coordinator.pending.branchState,state(2));
  assert.equal(coordinator.pending.baseBranchState.weeks['2026-04-18'].players[0].scores[0],'1');
  assert.equal(server.stats.writes,0);
  assert.notEqual(statuses.at(-1),'saved');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createGlowSaveCoordinator} from '../public/glow-save-sync.mjs';

function storage({failRemove = false} = {}) {
  const values=new Map();
  return {values,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>{if(failRemove)throw new Error('storage write failed');values.delete(k)}};
}

test('newly queued Glow edit during in-flight identical remote read stays pending and schedules a second flush',async()=>{
  const local=storage(), statuses=[];
  const coordinator=createGlowSaveCoordinator({storage:local,onStatus:s=>statuses.push(s)});
  const remote={root:{glow:{score:1},skins:{week:'protected'}},updatedAt:'rev-2'};
  coordinator.queue({score:1},'rev-1',{score:0});
  const result=await coordinator.flush({readCurrent:async()=>{
    coordinator.queue({score:2},'rev-1',{score:0});
    return remote;
  },compareAndSwap:async()=>{throw new Error('must not write')}});
  assert.equal(result.status,'pending','a new draft must trigger a follow-up save');
  assert.equal(coordinator.hasPending,true);
  assert.equal(coordinator.pending.branchState.score,2);
  assert.equal(coordinator.pending.baseUpdatedAt,'rev-2');
  assert.deepEqual(coordinator.pending.baseBranchState,{score:1});
  assert.equal(statuses.at(-1),'pending');
});

test('a successful remote save cannot be presented Saved when removal of local draft fails',async()=>{
  const local=storage({failRemove:true}),statuses=[];
  const coordinator=createGlowSaveCoordinator({storage:local,onStatus:s=>statuses.push(s)});
  coordinator.queue({score:1},'rev-1',{score:0});
  const result=await coordinator.flush({readCurrent:async()=>({root:{glow:{score:1}},updatedAt:'rev-2'}),compareAndSwap:async()=>{throw new Error('must not write')}});
  assert.equal(result.status,'local-failure');
  assert.equal(coordinator.hasPending,true);
  assert.equal(statuses.at(-1),'local-failure');
});

test('a newer edit queued during successful CAS is saved on the next flush without replacing Skins',async()=>{
  const local=storage(), statuses=[];
  const coordinator=createGlowSaveCoordinator({storage:local,onStatus:s=>statuses.push(s)});
  let remote={root:{glow:{score:0},skins:{winner:'Mason'}},updatedAt:'rev-1'};
  let writes=0;
  const readCurrent=async()=>structuredClone(remote);
  const compareAndSwap=async(expected,root)=>{
    assert.equal(expected,remote.updatedAt);
    assert.equal(root.skins.winner,'Mason');
    writes++;
    if(writes===1)coordinator.queue({score:2},'rev-1',{score:0});
    remote={root:structuredClone(root),updatedAt:`rev-${writes+1}`};
    return {rows:[{id:1}]};
  };
  coordinator.queue({score:1},'rev-1',{score:0});
  const first=await coordinator.flush({readCurrent,compareAndSwap});
  assert.equal(first.status,'pending');
  assert.equal(coordinator.pending.branchState.score,2);
  assert.equal(remote.root.glow.score,1);
  assert.equal(coordinator.pending.baseUpdatedAt,'rev-2');
  const second=await coordinator.flush({readCurrent,compareAndSwap});
  assert.equal(second.status,'saved');
  assert.equal(coordinator.hasPending,false);
  assert.equal(writes,2);
  assert.equal(remote.root.glow.score,2);
  assert.equal(remote.root.skins.winner,'Mason');
  assert.equal(statuses.at(-1),'saved');
});

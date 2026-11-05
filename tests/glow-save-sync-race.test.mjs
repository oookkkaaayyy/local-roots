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


test('actual Glow coordinator confirms independent save and cold reopen without losing Skins, financials, tags or history',async()=>{
  const s=storage(), statuses=[], coordinator=createGlowSaveCoordinator({storage:s,onStatus:status=>statuses.push(status)});
  const original={
    glow:{activeWeek:'2026-11-03',weeks:{'2026-11-03':{players:[{id:'team-1',scores:['','','']}] }},payouts:{first:20},acePots:{main:500,reserve:200}},
    skins:{weeks:{'2026-11-03':{front:{winners:{'1':'Mason'}}}}},
    bagTags:{manual:{Mason:2}},admin:{backups:[{revision:'historical-before-round'}]},history:{olderWeek:'intact'}
  };
  let remote={root:structuredClone(original),updatedAt:'rev-10'}, writes=0, reads=0;
  const draft=structuredClone(original.glow);
  draft.weeks['2026-11-03'].players[0].scores[0]='3';
  coordinator.queue(draft,remote.updatedAt,original.glow);
  const readCurrent=async()=>{reads++;return structuredClone(remote)};
  const compareAndSwap=async(revision,root)=>{
    assert.equal(revision,remote.updatedAt);
    assert.deepEqual(root.skins,original.skins);
    assert.deepEqual(root.admin,original.admin);
    assert.deepEqual(root.history,original.history);
    writes++;
    remote={root:structuredClone(root),updatedAt:'rev-11'};
    return {rows:[{id:1,updated_at:remote.updatedAt}]};
  };
  const result=await coordinator.flush({readCurrent,compareAndSwap});
  assert.equal(result.status,'saved');
  assert.equal(writes,1);
  assert(reads>=2,'a returned row alone must not be treated as independent confirmation');
  assert.equal(coordinator.hasPending,false);
  assert.equal(remote.root.glow.weeks['2026-11-03'].players[0].scores[0],'3');
  assert.deepEqual(remote.root.glow.acePots,original.glow.acePots);
  assert.deepEqual(remote.root.glow.payouts,original.glow.payouts);
  for(const branch of ['skins','bagTags','admin','history']) assert.deepEqual(remote.root[branch],original[branch]);
  assert.equal(createGlowSaveCoordinator({storage:s}).hasPending,false,'cold reopen must show only provider-confirmed state');
  assert.equal(statuses.at(-1),'saved');
});

test('actual Glow coordinator refuses a stale second-device overwrite and keeps its offline score for reopen',async()=>{
  const s=storage(),coordinator=createGlowSaveCoordinator({storage:s});
  const baseGlow={activeWeek:'2026-11-03',weeks:{'2026-11-03':{scores:{hole1:'3'}}},payouts:{first:20},acePots:{main:500}};
  const draft=structuredClone(baseGlow);
  draft.weeks['2026-11-03'].scores.hole2='4';
  coordinator.queue(draft,'rev-10',baseGlow);
  const serverGlow=structuredClone(baseGlow);
  serverGlow.weeks['2026-11-03'].scores.hole1='5'; // newer accepted score on another device
  let writes=0;
  const current={root:{glow:serverGlow,skins:{winner:'Mason'},admin:{backups:['old']},history:{older:true}},updatedAt:'rev-11'};
  const result=await coordinator.flush({
    readCurrent:async()=>structuredClone(current),
    compareAndSwap:async()=>{writes++;return{rows:[]}}
  });
  assert.equal(result.status,'conflict');
  assert.equal(writes,0,'a changed Glow branch must not trigger an unsafe full-root retry');
  assert.deepEqual(current.root.glow,serverGlow);
  assert.equal(coordinator.pending.branchState.weeks['2026-11-03'].scores.hole2,'4');
  assert.equal(createGlowSaveCoordinator({storage:s}).pending.branchState.weeks['2026-11-03'].scores.hole2,'4');
});

// New bounded P0 safety regression: a zero-row/failed CAS acknowledgement may
// be ambiguous. A single flush must reconcile independently, keep the local
// draft, and never issue a second write merely because the first reply failed.
// A later separate flush can make a new fenced attempt after a fresh GET.
test('unacknowledged Glow CAS cannot be replayed within one flush; draft survives cold restart',async()=>{
  const s=storage(),statuses=[], coordinator=createGlowSaveCoordinator({storage:s,onStatus:x=>statuses.push(x)});
  let remote={root:{glow:{hole1:''},skins:{winner:'Mason'},bagTags:{manual:{Jason:6}},__backups:[{id:'old'}]},updatedAt:'rev-1'};
  const readCurrent=async()=>structuredClone(remote);
  const draft={hole1:'3'};
  coordinator.queue(draft,'rev-1',remote.root.glow);
  let writes=0;
  const first=await coordinator.flush({readCurrent,compareAndSwap:async()=>{
    writes++;
    return {rows:[]}; // ambiguous zero-row acknowledgment; server remained unchanged
  }});
  assert.equal(first.status,'conflict');
  assert.equal(writes,1,'no automatic second CAS in the ambiguous save invocation');
  assert.equal(statuses.at(-1),'conflict');
  assert.deepEqual(coordinator.pending.branchState,draft);
  assert.deepEqual(remote.root.skins,{winner:'Mason'});
  const reopened=createGlowSaveCoordinator({storage:s});
  assert.equal(reopened.hasPending,true);
  assert.deepEqual(reopened.pending.branchState,draft);
  const second=await reopened.flush({readCurrent,compareAndSwap:async(rev,root)=>{
    writes++;
    assert.equal(rev,'rev-1');
    assert.deepEqual(root.skins,{winner:'Mason'});
    assert.deepEqual(root.bagTags,{manual:{Jason:6}});
    assert.deepEqual(root.__backups,[{id:'old'}]);
    remote={root:structuredClone(root),updatedAt:'rev-2'};
    return {rows:[{id:1,updated_at:'rev-2'}]};
  }});
  assert.equal(second.status,'saved');
  assert.equal(writes,2,'only a separate flush with a new preflight may attempt CAS');
  assert.equal(reopened.hasPending,false);
  assert.deepEqual(remote.root.glow,draft);
});

test('ambiguous Glow CAS error already committed is verified by independent GET without replay',async()=>{
  const s=storage(),coordinator=createGlowSaveCoordinator({storage:s});
  let remote={root:{glow:{hole1:''},skins:{history:'unchanged'}},updatedAt:'rev-1'},writes=0,reads=0;
  coordinator.queue({hole1:'4'},'rev-1',remote.root.glow);
  const result=await coordinator.flush({
    readCurrent:async()=>{reads++;return structuredClone(remote)},
    compareAndSwap:async(revision,root)=>{
      writes++;
      assert.equal(revision,'rev-1');
      remote={root:structuredClone(root),updatedAt:'rev-2'};
      return {error:{message:'HTTP 504 after commit'},rows:[]};
    }
  });
  assert.equal(writes,1);
  assert.equal(reads,2,'server saved state must be verified by independent readback');
  assert.equal(result.status,'saved');
  assert.equal(coordinator.hasPending,false);
  assert.deepEqual(remote.root.skins,{history:'unchanged'});
});

test('ambiguous transport error with unchanged cloud state stops after one CAS and keeps recovery draft',async()=>{
  const s=storage(),coordinator=createGlowSaveCoordinator({storage:s});
  let remote={root:{glow:{scores:['']},skins:{weekly:'intact'}},updatedAt:'rev-7'},writes=0,reads=0;
  coordinator.queue({scores:['2']},remote.updatedAt,remote.root.glow);
  const first=await coordinator.flush({
    readCurrent:async()=>{reads++;return structuredClone(remote)},
    compareAndSwap:async()=>{writes++;return {error:{message:'HTTP 522 after unknown outcome'}};}
  });
  assert.equal(writes,1);
  assert.equal(reads,2,'one baseline preflight and one post-failure readback');
  assert.equal(first.status,'conflict');
  assert.equal(coordinator.hasPending,true);
  assert.deepEqual(createGlowSaveCoordinator({storage:s}).pending.branchState,{scores:['2']});
  assert.deepEqual(remote.root.skins,{weekly:'intact'});
});

test('thrown Glow transport after server commit reconciles by independent GET, never replays and clears only confirmed draft',async()=>{
  const s=storage(), statuses=[], coordinator=createGlowSaveCoordinator({storage:s,onStatus:x=>statuses.push(x)});
  let remote={root:{glow:{hole1:''},skins:{winner:'Mason'},bagTags:{Jason:1},history:{saved:true}},updatedAt:'rev-20'};
  const initial=structuredClone(remote.root);
  let writes=0,reads=0;
  coordinator.queue({hole1:'3'},'rev-20',initial.glow);
  const result=await coordinator.flush({
    readCurrent:async()=>{reads++;return structuredClone(remote)},
    compareAndSwap:async(revision,root)=>{
      writes++;
      assert.equal(revision,'rev-20');
      remote={root:structuredClone(root),updatedAt:'rev-21'};
      throw new Error('synthetic network disconnect after committed write');
    }
  });
  assert.equal(result.status,'saved');
  assert.equal(writes,1,'a thrown acknowledgement must never trigger a second CAS');
  assert.equal(reads,2,'an independent GET must reconcile a thrown save');
  assert.equal(coordinator.hasPending,false);
  assert.equal(createGlowSaveCoordinator({storage:s}).hasPending,false);
  for(const key of ['skins','bagTags','history'])assert.deepEqual(remote.root[key],initial[key]);
  assert.equal(remote.root.glow.hole1,'3');
  assert.equal(statuses.at(-1),'saved');
});

test('thrown Glow transport with unchanged server reports conflict and keeps reopenable draft without replay',async()=>{
  const s=storage(),coordinator=createGlowSaveCoordinator({storage:s});
  const remote={root:{glow:{hole1:''},skins:{winner:'Mason'}},updatedAt:'rev-30'};
  coordinator.queue({hole1:'4'},'rev-30',remote.root.glow);
  let writes=0,reads=0;
  const result=await coordinator.flush({
    readCurrent:async()=>{reads++;return structuredClone(remote)},
    compareAndSwap:async()=>{writes++;throw new Error('synthetic rejected fetch')}
  });
  assert.equal(result.status,'conflict');
  assert.equal(writes,1);
  assert.equal(reads,2);
  assert.deepEqual(coordinator.pending.branchState,{hole1:'4'});
  assert.deepEqual(createGlowSaveCoordinator({storage:s}).pending.branchState,{hole1:'4'});
  assert.equal(remote.root.glow.hole1,'');
});

test('thrown Glow transport and unavailable independent read fails without clearing or replaying draft',async()=>{
  const s=storage(),coordinator=createGlowSaveCoordinator({storage:s});
  coordinator.queue({hole1:'5'},'rev-40',{hole1:''});
  let reads=0,writes=0;
  const result=await coordinator.flush({
    readCurrent:async()=>{
      reads++;
      if(reads===1)return{root:{glow:{hole1:''},skins:{history:true}},updatedAt:'rev-40'};
      throw new Error('synthetic readback offline');
    },
    compareAndSwap:async()=>{writes++;throw new Error('synthetic timeout')}
  });
  assert.equal(result.status,'failed');
  assert.equal(writes,1);
  assert.equal(reads,2);
  assert.equal(coordinator.hasPending,true);
  assert.equal(createGlowSaveCoordinator({storage:s}).pending.branchState.hole1,'5');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createGlowSaveCoordinator} from '../public/glow-save-sync.mjs';

const pendingKey='hbnf-glow-unsent-draft-v1';
const makeStorage = () => { const m=new Map();return{getItem:k=>m.get(k)||null,setItem:(k,v)=>{m.set(k,v)},removeItem:k=>m.delete(k),m}; };
function actualPageFunctions(source,storage){
 const start=source.indexOf("const ctx={branch:'glow'");const end=source.indexOf('ctx.saveLocal=saveLocal;',start)+'ctx.saveLocal=saveLocal;'.length;
 assert(start>0&&end>start);
 const statuses=[];const context={localStorage:storage,normalize:x=>x,hbnfMaybeAutoSnapshot:()=>{},setGlowSaveStatus:s=>statuses.push(s),JSON,Promise,console};vm.createContext(context);
 vm.runInContext(source.slice(start,end)+';globalThis.__ctx=ctx;globalThis.__saveLocal=saveLocal;',context);
 const match=source.match(/ctx\.saveCoordinator=createGlowSaveCoordinator\(\{storage:localStorage,onStatus:setGlowSaveStatus\}\);[\s\S]*?if\(ctx\.saveCoordinator\.hasPending\)/);
 assert(match,'actual initSync coordinator binding must be present');
 function initialize(){ context.createGlowSaveCoordinator=createGlowSaveCoordinator; vm.runInContext(match[0].slice(0,-'if(ctx.saveCoordinator.hasPending)'.length),context); }
 return {ctx:context.__ctx,saveLocal:context.__saveLocal,initialize,statuses};
}
for(const name of ['active']){
 test(name+' records a score edited before async coordinator creation as durable pending',async()=>{
   const html=await readFile(new URL('../public/glow.html',import.meta.url),'utf8');const store=makeStorage();const pg=actualPageFunctions(html,store);
   pg.ctx.state={activeWeek:'2026-11-03',weeks:{'2026-11-03':{scores:{hole1:'Mason'}}}};
   pg.saveLocal();pg.initialize();
   assert.equal(pg.ctx.saveCoordinator.hasPending,true,'early score must be recoverable and never silently overwritten');
   assert.equal(pg.ctx.saveCoordinator.pending.branchState.weeks['2026-11-03'].scores.hole1,'Mason');
   let writes=0;
   const attempted=await pg.ctx.saveCoordinator.flush({readCurrent:async()=>({root:{glow:{activeWeek:'2026-11-03',weeks:{'2026-11-03':{scores:{}}}}},updatedAt:'revision-remote'}),compareAndSwap:async()=>{writes++;throw Error('should not blindly write')}});
   assert.equal(attempted.status,'conflict'); assert.equal(writes,0);assert.equal(pg.ctx.saveCoordinator.hasPending,true);
   const cold=createGlowSaveCoordinator({storage:store});assert.equal(cold.pending.branchState.weeks['2026-11-03'].scores.hole1,'Mason');
 });
 test(name+' records a score while coordinator exists but server baseline is still initializing',async()=>{
   const html=await readFile(new URL('../public/glow.html',import.meta.url),'utf8');const store=makeStorage();const pg=actualPageFunctions(html,store);
   pg.initialize();pg.ctx.state={activeWeek:'2026-11-03',weeks:{'2026-11-03':{scores:{hole2:'Tony'}}}};
   assert.equal(pg.ctx.syncReady,false);
   pg.saveLocal();assert.equal(pg.ctx.saveCoordinator.hasPending,true);
   assert.equal(JSON.parse(store.getItem(pendingKey)).branchState.weeks['2026-11-03'].scores.hole2,'Tony');
 });
}

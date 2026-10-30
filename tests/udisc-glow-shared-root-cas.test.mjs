import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {saveLeagueBranchCAS,saveLeagueRootCAS,recoverLeagueDraft,mergeLeagueValue,mergeLeagueTree} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/public/league-state-cas.mjs';
const copy=x=>JSON.parse(JSON.stringify(x));
class MemoryStorage { #m=new Map(); getItem(k){return this.#m.get(k)||null} setItem(k,v){this.#m.set(k,v)} removeItem(k){this.#m.delete(k)} }
test('Random and Skills retain detached server baselines while normalizing editable drafts',()=>{const here=path.dirname(fileURLToPath(import.meta.url));for(const page of ['random.html','skills.html']){const source=readFileSync(path.join(here,'../source-snapshots/hbnf-worker-d1a5f936-20261024/public',page),'utf8');assert.match(source,/const cloneSyncValue=value=>value==null\?value:JSON\.parse\(JSON\.stringify\(value\)\)/,`${page} sync helper must define its own detached clone function`);assert.match(source,/ctx\.baselineBranch=cloneSyncValue\(ctx\.rootState\[ctx\.branch\]\|\|null\)/,`${page} must detach the server baseline`);assert.match(source,/ctx\.state=ctx\.normalize\(cloneSyncValue\(ctx\.rootState\[ctx\.branch\]\|\|null\)\)/,`${page} must normalize a detached editable state`);assert.match(source,/ctx\.baselineBranch=cloneSyncValue\(ctx\.rootState\[ctx\.branch\]\)/,`${page} must keep acknowledged baseline separate from edited state`)}});
test("shared-write status is announced accessibly across affected HBNF pages",()=>{const here=path.dirname(fileURLToPath(import.meta.url));for(const page of ["admin.html","random.html","skills.html","skins.html"]){const source=readFileSync(path.join(here,"../source-snapshots/hbnf-worker-d1a5f936-20261024/public",page),"utf8");assert.match(source,/<span[^>]*id=\"syncStatus\"[^>]*role=\"status\"[^>]*aria-live=\"polite\"/,`${page} must announce sync status changes to assistive technology`)}});
function clientFor(db,{raceBeforeUpdate}={}) { return {from(table){assert.equal(table,'league_state');const q={select(){return q},eq(){return q},single:async()=>({data:{id:1,state_json:copy(db.root),updated_at:db.revision},error:null})};return q},async rpc(name,args){assert.equal(name,'hbnf_save_league_state_v1');if(raceBeforeUpdate){raceBeforeUpdate();raceBeforeUpdate=null}if(args.p_expected_updated_at!==db.revision)return{data:[],error:null};db.root=copy(args.p_state_json);db.revision=`server-${Number(db.revision.split('-')[1]||1)+1}`;return{data:[{id:1,state_json:copy(db.root),updated_at:db.revision}],error:null}}} }
test('branch writer preserves other feature changes and waits for an independent GET before clearing draft',async()=>{const db={root:{glow:{value:1},skins:{value:1}},revision:'server-1'};const storage=new MemoryStorage();let gotStatus='';const result=await saveLeagueBranchCAS({client:clientFor(db),branch:'glow',branchState:{value:2},baselineBranch:{value:1},storage,storageKey:'pending',onStatus:x=>gotStatus=x});assert.equal(result.status,'saved');assert.deepEqual(db.root,{glow:{value:2},skins:{value:1}});assert.equal(storage.getItem('pending'),null);assert.equal(gotStatus,'Saved and verified')});
test('branch writer keeps stale same-branch edit locally and does not overwrite remote',async()=>{const db={root:{glow:{score:3}},revision:'server-2'};const storage=new MemoryStorage();const result=await saveLeagueBranchCAS({client:clientFor(db),branch:'glow',branchState:{score:2},baselineBranch:{score:1},storage,storageKey:'pending'});assert.equal(result.status,'conflict');assert.deepEqual(db.root.glow,{score:3});assert.deepEqual(recoverLeagueDraft(storage,'pending').branchState,{score:2})});
test('branch writer treats PostgreSQL JSON key reordering as equal before merging normalized edits',async()=>{const baseline={activeWeek:'2099-01-06',weeks:{'2099-01-06':{format:'doubles',teamSetup:'random',playersText:'',manualTeamsText:'',flexPlayer:'',teams:[],simultaneousCount:4,entryFee:10,payoutPercent:20,scoresLocked:false,tournament:null}}};const remote={weeks:{'2099-01-06':{tournament:null,scoresLocked:false,payoutPercent:20,entryFee:10,simultaneousCount:4,teams:[],flexPlayer:'',manualTeamsText:'',playersText:'',teamSetup:'random',format:'doubles'}},activeWeek:'2099-01-06'};const edited={weeks:{'2099-01-06':{...baseline.weeks['2099-01-06'],playersText:'QA player'}},activeWeek:'2099-01-06'};const db={root:{glow:{weeks:{}} ,random:remote},revision:'server-8'};const result=await saveLeagueBranchCAS({client:clientFor(db),branch:'random',branchState:edited,baselineBranch:baseline,storage:new MemoryStorage(),storageKey:'random'});assert.equal(result.status,'saved');assert.equal(db.root.random.weeks['2099-01-06'].playersText,'QA player')});
test('root writer merges independent admin and feature edits while preserving backups',async()=>{const base={glow:{n:1},skins:{n:1},__backups:[{id:'old',createdAt:'2020'}]};const db={root:{glow:{n:1},skins:{n:2},__backups:[{id:'new',createdAt:'2021'}]},revision:'server-3'};const local={glow:{n:2},skins:{n:1},__backups:[{id:'old',createdAt:'2020'}]};const result=await saveLeagueRootCAS({client:clientFor(db),rootState:local,baselineRoot:base,storage:new MemoryStorage(),storageKey:'admin'});assert.equal(result.status,'saved');assert.deepEqual(db.root.glow,{n:2});assert.deepEqual(db.root.skins,{n:2});assert.deepEqual(db.root.__backups.map(x=>x.id).sort(),['new','old'])});
test('root writer rejects overlap and retains the full restore draft',async()=>{const base={glow:{n:1},skins:{n:1}};const db={root:{glow:{n:3},skins:{n:1}},revision:'server-4'};const storage=new MemoryStorage();const result=await saveLeagueRootCAS({client:clientFor(db),rootState:{glow:{n:2},skins:{n:1}},baselineRoot:base,storage,storageKey:'restore'});assert.equal(result.status,'conflict');assert.deepEqual(db.root.glow,{n:3});assert.deepEqual(recoverLeagueDraft(storage,'restore').rootState.glow,{n:2})});
test('root writer retries after a competing commit using a fresh server revision',async()=>{const db={root:{glow:{n:1},skins:{n:1}},revision:'server-1'};let raced=false;const result=await saveLeagueRootCAS({client:clientFor(db,{raceBeforeUpdate(){if(raced)return;raced=true;db.root.skins={n:2};db.revision='server-2'}}),rootState:{glow:{n:2},skins:{n:1}},baselineRoot:{glow:{n:1},skins:{n:1}},storage:new MemoryStorage(),storageKey:'retry'});assert.equal(result.status,'saved');assert.deepEqual(db.root,{glow:{n:2},skins:{n:2}})});

test('an older in-flight acknowledgement cannot erase a newer saved device draft',async()=>{const db={root:{glow:{n:1}},revision:'server-1'};const storage=new MemoryStorage();const client=clientFor(db,{raceBeforeUpdate(){storage.setItem('pending',JSON.stringify({branch:'glow',branchState:{n:3},baselineBranch:{n:1}}))}});const result=await saveLeagueBranchCAS({client,branch:'glow',branchState:{n:2},baselineBranch:{n:1},storage,storageKey:'pending'});assert.equal(result.status,'saved');assert.deepEqual(db.root.glow,{n:2});assert.deepEqual(recoverLeagueDraft(storage,'pending').branchState,{n:3})});

test('Skins bag-tag state uses a three-way conflict check instead of device-clock ordering',()=>{const base={updated_at:'2026-01-01',tags:{A:1}},local={updated_at:'2099-01-01',tags:{A:2}},remote={updated_at:'2026-01-02',tags:{A:3}};assert.deepEqual(mergeLeagueValue(base,local,base),{status:'merged',value:local});assert.deepEqual(mergeLeagueValue(base,base,remote),{status:'merged',value:remote});assert.equal(mergeLeagueValue(base,local,remote).status,'conflict')});
test('offline Skins recovery merges disjoint score edits and rejects overlapping score edits',()=>{const base={weeks:{w:{front:{cards:[{id:'card-1',winners:{'1':'Ada'}}]}}}};const local=copy(base);local.weeks.w.front.cards[0].winners['2']='Ben';const remote=copy(base);remote.weeks.w.front.cards[0].winners['3']='Cy';const merged=mergeLeagueTree(base,local,remote);assert.equal(merged.status,'merged');assert.deepEqual(merged.value.weeks.w.front.cards[0].winners,{'1':'Ada','2':'Ben','3':'Cy'});const competing=copy(base);competing.weeks.w.front.cards[0].winners['2']='Cy';assert.equal(mergeLeagueTree(base,local,competing).status,'conflict')});

test('Admin stale backup copy cannot replace updated server record with same ID',async()=>{
  const oldBackup={id:'x',createdAt:'2026-10-29',content:'old'};
  const newBackup={...oldBackup,content:'new'};
  const base={glow:{score:1},__backups:[oldBackup]};
  const db={root:{glow:{score:1},__backups:[newBackup]},revision:'server-5'};
  const result=await saveLeagueRootCAS({client:clientFor(db),rootState:base,baselineRoot:base,storage:new MemoryStorage(),storageKey:'admin'});
  assert.equal(result.status,'saved');
  assert.deepEqual(db.root.__backups,[newBackup]);
});

test('Admin overlapping backup edits conflict without losing local recovery draft',async()=>{
  const oldBackup={id:'x',createdAt:'2026-10-29',content:'base'};
  const base={glow:{score:1},__backups:[oldBackup]};
  const db={root:{glow:{score:1},__backups:[{...oldBackup,content:'remote'}]},revision:'server-6'};
  const local={glow:{score:1},__backups:[{...oldBackup,content:'local'}]};
  const storage=new MemoryStorage();
  const result=await saveLeagueRootCAS({client:clientFor(db),rootState:local,baselineRoot:base,storage,storageKey:'admin'});
  assert.equal(result.status,'conflict');
  assert.deepEqual(result.conflicts,['__backups:x']);
  assert.equal(db.root.__backups[0].content,'remote');
  assert.equal(recoverLeagueDraft(storage,'admin').rootState.__backups[0].content,'local');
});

test('Admin history displays authoritative cloud entry when a cached local ID collides',()=>{
  const html=readFileSync(new URL('../source-snapshots/hbnf-worker-d1a5f936-20261024/public/admin.html',import.meta.url),'utf8');
  const source=html.match(/^function readHistory\(\)\{[^\n]+$/m)?.[0];
  assert.ok(source,'Admin history function must be found in installed-source snapshot');
  const local=[{id:'x',createdAt:'2026-10-29T20:00:00Z',label:'older local'},
    {id:'local-only',createdAt:'2026-10-29T19:00:00Z',label:'offline backup'}];
  const cloud=[{id:'x',createdAt:'2026-10-29T20:00:00Z',label:'current server'},
    {id:'cloud-only',createdAt:'2026-10-29T18:00:00Z',label:'server backup'}];
  const readHistory=runInNewContext(source+'; readHistory',{readJSON:()=>local,HISTORY_KEY:'history',rootState:{__backups:cloud}});
  const result=readHistory();
  assert.equal(result.find(x=>x.id==='x').label,'current server');
  assert.deepEqual([...result].map(x=>x.id).sort(),['cloud-only','local-only','x']);
});

test('Admin root save rejects backup readback mismatch instead of falsely saying saved',async()=>{
  const real={root:{glow:{score:1},__backups:[{id:'x',createdAt:'2026-10-29',label:'one'}]},revision:'server-1'};
  let interfered=false;
  const db=new Proxy(real,{get(target,key){
    if(key==='root'&&target.revision==='server-2'&&!interfered){
      interfered=true;
      target.root.__backups=[{id:'x',createdAt:'2026-10-29',label:'server changed after write'}];
    }
    return target[key];
  }});
  const storage=new MemoryStorage();
  const baseline=copy(real.root), next=copy(real.root);
  next.glow.score=2;
  const result=await saveLeagueRootCAS({client:clientFor(db),rootState:next,baselineRoot:baseline,storage,storageKey:'admin'});
  assert.equal(result.status,'failed');
  assert.equal(recoverLeagueDraft(storage,'admin').rootState.glow.score,2);
  assert.equal(real.root.__backups[0].label,'server changed after write');
});

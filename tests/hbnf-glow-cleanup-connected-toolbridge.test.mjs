import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHbnfCleanupConnectedBridge} from '../scripts/hbnf-glow-cleanup-connected-toolbridge.mjs';
import {buildCleanupCandidate,canonicalJson,canonicalBytes,
  createHbnfGlowCleanupGate,createHbnfGlowCleanupStorage,
  createHbnfGlowCleanupLedger,createSupabaseGlowCleanupProvider}
  from '../scripts/hbnf-glow-week-cleanup.mjs';

const digest=(alg,v)=>createHash(alg).update(v).digest('hex');
const md5=v=>digest('md5',typeof v==='string'?v:canonicalJson(v));
const sha=v=>digest('sha256',v);
const SOURCE='67f766f118c8bda550d190c9718cb018907c9f2c';
const ID='hbnf-glow-cleanup-bridge-synthetic-20261102';
const BASE='2026-11-01 22:33:40.372437+00';
const AFTER='2026-11-02 23:00:01.123456+00';
const RESTORED='2026-11-02 23:00:02.123457+00';
const FOLDER='1mZWMyzLIKnSjBTP82-EfGOqktld17X84';
const BRANCH='feature/udisc-glow-standings-prototype';
function root(){
 const names=['Test Player A','Test Player B','Test Player C','Test Player D'];
 const teams=[
  {id:'T1',partner1:names[0],partner2:names[1]},
  {id:'T2',partner1:names[2],partner2:names[1]},
  {id:'T3',partner1:'Andrew',partner2:names[3]}];
 const players=[
  {id:'P1',name:names[0],scores:['3','4','2'],partner1:names[0],partner2:names[1]},
  {id:'P2',name:names[2],scores:['4','3','2'],partner1:names[2],partner2:names[1]},
  {id:'P3',name:'Andrew',scores:['3','4','2'],partner1:'Andrew',partner2:names[3]}];
 return {glow:{activeWeek:'2026-11-03',
   weeks:{'2026-11-03':{cards:[{id:'C1',players:teams,finalized:false}],players,scoresLocked:false},
   '2026-10-28':{cards:[],players:[{name:'Prior'}]}},
   playerAliases:Object.fromEntries(names.map(n=>[n,n]))},
   skins:{permanent:'untouched'},bagTags:{players:[],manual:{}},__backups:[{id:'keep'}]};
}
function operation(s){
 const week=s.glow.weeks['2026-11-03'];
 const keys=Object.keys(s.glow.playerAliases).sort();
 const clean=structuredClone(s);
 clean.glow.weeks['2026-11-03'].cards=[];
 clean.glow.weeks['2026-11-03'].players=[];
 for(const key of keys)delete clean.glow.playerAliases[key];
 return {
  expectedCounts:{cards:1,teams:3,playerRows:3,enteredScores:9,testAliases:4},
  testAliasKeysMd5:md5(keys.join('\n')),
  rehearsalPayloadSha256:sha(canonicalJson({cards:week.cards,players:week.players})),
  cleanedStateSha256:sha(canonicalJson(clean)),
  cleanedStateMd5:md5(clean)
 };
}
function bounded(rows){
 const id='synthetic-fixture';
 return JSON.stringify({result:'<untrusted-data-'+id+'>\n'+JSON.stringify(rows)+'\n</untrusted-data-'+id+'>'});
}
async function kit({faultCloseout=false,changeBeforeWrite=false,concurrentCloseout=false}={}){
 const start=root(),op=operation(start),snapshot=canonicalBytes({id:1,updated_at:BASE,state_json:start});
 // The cleanup source compares PostgreSQL state_json JSONB with provider-produced
 // md5(state_json::text). Synthetic normalization deliberately uses canonicalJson
 // on both saved and hashed state; native PG was separately qualified already.
 let state=structuredClone(start),revision=BASE,sequence=0,sqlWrites=0,queryCount=0;
 let queueFingerprint=md5(state),queueRev=revision,closeoutCalls=0;
 const drive=new Map([['snapshot-private', {name:'snapshot-private',bytes:snapshot}]]);
 const claims=new Map(),refs=new Map(),temp=[];
 const folder=await mkdtemp(path.join(os.tmpdir(),'hbnf-synthetic-bridge-'));
 const counters={supabase:0,driveRead:0,driveWrite:0,claims:0,sqlWrites:0};
 let next=1,canWrite=true;
 const readback=()=>{
  const week=state.glow.weeks['2026-11-03'];
  const aliases=Object.keys(state.glow.playerAliases).filter(k=>/test player/i.test(k)).sort();
  return {projectId:'phcpbvuqibyarpfrftgx',row:{
    id:1,updatedAt:revision,rowFingerprint:'a'.repeat(32),stateJsonMd5:md5(state),
    activeWeek:state.glow.activeWeek,cards:week.cards.length,
    teams:week.cards.flatMap(c=>c.players||[]).length,
    playerRows:week.players.length,enteredScores:week.players.reduce((a,p)=>a+p.scores.filter(v=>v!=='').length,0),
    testAliases:aliases.length,testAliasKeysMd5:md5(aliases.join('\n')),scoresLocked:false
   },matrix:{queueFingerprint,queueStateUpdatedAt:queueRev,autoLive:false,
     cinematicEventCount:27},tagProjectionMatches:true};
 };
 const connected={
  async supabaseExecuteSql({project_id,query}){
   counters.supabase++;assert.equal(project_id,'phcpbvuqibyarpfrftgx');
   queryCount++;
   if(query.startsWith('select jsonb_build_object('))
     return {text:bounded([{readback:readback()}])};
   if(query.startsWith('select md5(')){
    const m=query.match(/\$hbnf_([a-f0-9]{20})\$([\s\S]*?)\$hbnf_\1\$/);
    if(!m)throw Error('bad synthetic SQL literal');
    return {text:bounded([{stateJsonMd5:md5(JSON.parse(m[2]))}])};
   }
   if(query.startsWith('DO $hbnf_cleanup_guard$')){
    if(changeBeforeWrite&&canWrite){canWrite=false;
       revision=AFTER;state.skins={permanent:'concurrent-edit'};
       queueFingerprint=md5(state);queueRev=revision;
    }
    if(revision!==BASE && revision!==AFTER)throw Error('unknown synthetic revision');
    const m=query.match(/\$hbnf_([a-f0-9]{20})\$([\s\S]*?)\$hbnf_\1\$/);
    const timestamp=query.match(/hbnf_save_league_state_v1\('([^']+)'::timestamptz/);
    if(!m||!timestamp)throw Error('synthetic guarded CAS malformed');
    if(new Date(timestamp[1]).getTime()!==new Date(revision).getTime()||
      timestamp[1]!==revision)throw Error('hbnf_cleanup_cas_conflict');
    state=JSON.parse(m[2]);revision=sqlWrites===0?AFTER:RESTORED;sqlWrites++;
    counters.sqlWrites++;
    queueFingerprint=md5(state);queueRev=revision;
    return {text:bounded([])};
   }
   throw Error('unrecognized query '+query.slice(0,55));
  },
  async githubCreateFile(args){
    if(claims.has(args.path))throw Error('422 already exists');
    next++;
    const commit=String(next).padStart(40,'0');
    claims.set(args.path,{commit,content:args.content});counters.claims++;
    return {result:{commit_sha:commit}};
  },
  async githubFetchFile(args){
    const c=claims.get(args.path);
    if(c?.commit!==args.ref)throw Error('wrong immutable claim ref');
    return {result:{encoding:'base64',content:Buffer.from(c.content).toString('base64')}};
  },
  async driveSearch(){
    return {result:{results:[...drive].map(([id,x])=>({id,name:x.name}))}};
  },
  async driveFetch({url}){
    counters.driveRead++;
    const id=url.match(/\/d\/([^/]+)\/view/)?.[1];
    const v=drive.get(id);if(!v)throw Error('missing Drive fixture');
    return {result:{b64_string:v.bytes.toString('base64')}};
  },
  async driveUploadFile(args){
    counters.driveWrite++;
    if(faultCloseout&&args.file_name.endsWith('.closeout.json')){
      closeoutCalls++;
      if(concurrentCloseout){
        state.skins={permanent:'newer-concurrent-state'};
        revision='2026-11-02 23:00:01.123457+00';
        queueFingerprint=md5(state);queueRev=revision;
      }
      throw Error('synthetic closeout storage fault');
    }
    const data=refs.get(args.file_uri);
    if(!data)throw Error('unmaterialized connector ref');
    const id='drive-fixture-'+(++next);
    drive.set(id,{name:args.file_name,bytes:Buffer.from(data)});
    return {result:{id}};
  }
 };
 const bridge=createHbnfCleanupConnectedBridge({
  connected,mode:'SYNTHETIC',
  resolveFileUri:async({localPath,sha256,bytes})=>{
    const b=await readFile(localPath);
    assert.equal(sha(b),sha256);assert.equal(b.length,bytes);
    const file_uri='synthetic-test-ref-'+(++next);
    refs.set(file_uri,Buffer.from(b));
    return {file_uri,bytes,sha256,providerMaterialized:true};
  }
 });
 let nextFrame=1;
 const call=async(method,args)=>(await bridge.dispatch({id:nextFrame++,type:'tool',method,args})).result;
 const provider=createSupabaseGlowCleanupProvider({
   executeSql:args=>call('mcp__codex_apps__supabase_execute_sql',args)
 });
 const store=createHbnfGlowCleanupStorage({
  writeLocal:async(name,bytes)=>{
    const p=path.join(folder,name);
    await writeFile(p,bytes,{flag:'wx'});temp.push(p);return p;
  },
  cleanupLocal:async()=>{},
  uploadFile:args=>call('mcp__codex_apps__google_drive_upload_file',args),
  fetchFile:id=>call('mcp__codex_apps__google_drive_fetch',
    {url:'https://drive.google.com/file/d/'+id+'/view',download_raw_file:true,include_base64:true}),
  listFiles:async args=>{
   const r=await call('mcp__codex_apps__google_drive_search',
     {query:'HBNF Glow cleanup evidence',topn:100,
      special_filter_query_str:"'"+FOLDER+"' in parents and trashed = false"});
   return {structuredContent:{files:r.structuredContent.results.map(x=>({id:x.id,title:x.title}))}};
  }
 });
 const ledger=createHbnfGlowCleanupLedger({
  releaseId:ID,branch:BRANCH,
  createFile:args=>call('mcp__codex_apps__github_create_file',args),
  fetchFile:args=>call('mcp__codex_apps__github_fetch_file',args)
 });
 const gate=createHbnfGlowCleanupGate({provider,storage:store,ledger,
  sourceCommit:SOURCE,clock:()=> '2026-11-02T23:00:00.000Z'});
 const manifest={
  format:'hbnf-glow-week-cleanup-v1',releaseId:ID,phase:'PENDING',oneTime:true,
  sourceCommit:SOURCE,
  ownerAuthorization:{confirmed:true,evidence:'SYNTHETIC ONLY NOT REAL APPROVAL',
   scope:'remove only the verified rehearsal rows and aliases from the Nov 3 Glow week'},
  target:{projectId:'phcpbvuqibyarpfrftgx',table:'public.league_state',
    rowId:1,weekDate:'2026-11-03'},
  baseline:{updatedAt:BASE,rowFingerprint:'a'.repeat(32),stateJsonMd5:md5(start),
   testAliasKeysMd5:op.testAliasKeysMd5,matrixAutoLive:false,
   queueFingerprint:md5(start),queueStateUpdatedAt:BASE,
   cinematicEventCount:27,tagProjectionMatches:true},
  backup:{driveFileId:'snapshot-private',bytes:snapshot.length,sha256:sha(snapshot),
    downloadBackVerified:true},
  operation:op,
  claims:Object.fromEntries(['admission','execution','restore'].map(k=>[
    k,'release-claims/'+ID+'.'+k+'-claim.json']))
 };
 return {bridge,gate,provider,store,ledger,manifest,counts:counters,drive,claims,
  get state(){return structuredClone(state)},get revision(){return revision},
  get sqlWrites(){return sqlWrites},
  drift(){state.skins.permanent='concurrent';revision='2026-11-02 23:00:00.000999+00';
    queueFingerprint=md5(state);queueRev=revision;},
  async close(){await rm(folder,{recursive:true,force:true})}
 };
}
test('REVIEW_ONLY bridge closes provider schema mismatch, rejects unknown methods, SQL mutation and unmaterialized Drive uploads',async()=>{
 let touched=0;
 const b=createHbnfCleanupConnectedBridge({connected:{
   supabaseExecuteSql:async()=>{touched++;return {text:bounded([{stateJsonMd5:'a'.repeat(32)}])}}
 }});
 const reply=await b.dispatch({id:1,type:'tool',
  method:'mcp__codex_apps__supabase_execute_sql',
  args:{project_id:'phcpbvuqibyarpfrftgx',query:'select 1'}});
 assert.equal(reply.id,1);
 assert.equal(reply.result.content[0].type,'text');
 assert.match(reply.result.content[0].text,/untrusted-data-/);
 await assert.rejects(b.dispatch({id:2,type:'tool',
  method:'mcp__codex_apps__supabase_execute_sql',
  args:{project_id:'phcpbvuqibyarpfrftgx',query:'DO $hbnf_cleanup_guard$ BEGIN END $hbnf_cleanup_guard$'}}),/noncanonical|admission/);
 await assert.rejects(b.dispatch({id:3,type:'tool',method:'unrecognized_tool',args:{}}),/unknown runner/);
 await assert.rejects(b.dispatch({id:4,type:'tool',method:'mcp__codex_apps__google_drive_upload_file',
  args:{file_uri:'/tmp/receipt.json',file_name:'valid-test-file.json',
    mime_type:'application/json',parent_folder_id:FOLDER}}),/materializer/);
 assert.equal(touched,1);
});
test('synthetic connected bridge completes exact manifest→Drive download-back→one-use claims→prechange CAS→queue readback→closeout',async()=>{
 const k=await kit();
 try{
  const a=await k.gate.admit({manifest:k.manifest,manifestBytes:canonicalBytes(k.manifest)});
  assert.equal(a.status,'ADMISSION_PASS');
  assert.ok(a.manifestDriveId&&a.decisionDriveId);
  assert.equal(k.claims.size,1);
  assert.equal(k.sqlWrites,0);
  const closed=await k.gate.execute(a);
  assert.equal(closed.status,'CLEANUP_PASS');
  assert.equal(k.claims.size,2);
  assert.equal(k.sqlWrites,1);
  assert.equal(k.state.glow.weeks['2026-11-03'].players.length,0);
  assert.equal(k.state.skins.permanent,'untouched');
  const bytes=await k.store.download(closed.receiptDriveId);
  assert.equal(sha(bytes),closed.receiptSha256);
  assert.equal(closed.receipt.matrix.queueFingerprint,k.manifest.operation.cleanedStateMd5);
  await assert.rejects(k.gate.execute(a),/already|consumed/);
  assert.equal(k.sqlWrites,1);
  console.log('BRIDGE_FULL_CHAIN=PASS synthetic snapshot→manifest→download-back→claim→prechange CAS→queue/tags→durable closeout');
 }finally{await k.close()}
});
test('synthetic failure after acknowledged CAS conditionally restores exact backup; no concurrent edits overwritten',async()=>{
 const k=await kit({faultCloseout:true});
 try{
  const a=await k.gate.admit({manifest:k.manifest,manifestBytes:canonicalBytes(k.manifest)});
  await assert.rejects(k.gate.execute(a),/RESTORED_BASELINE/);
  assert.equal(k.sqlWrites,2);
  assert.equal(k.state.glow.weeks['2026-11-03'].players.length,3);
  assert.equal(k.state.skins.permanent,'untouched');
  assert.equal(k.claims.size,3);
  assert.ok([...k.drive.values()].some(x=>x.name.endsWith('.failure.json')));
 }finally{await k.close()}
});
test('synthetic mutation-boundary drift aborts before write; durable failure receipt preserves newer data',async()=>{
 const k=await kit();
 try{
  const a=await k.gate.admit({manifest:k.manifest,manifestBytes:canonicalBytes(k.manifest)});
  k.drift();
  await assert.rejects(k.gate.execute(a),/ABORTED_BEFORE_WRITE/);
  assert.equal(k.sqlWrites,0);
  assert.equal(k.state.skins.permanent,'concurrent');
  assert.equal(k.claims.size,2);
  assert.ok([...k.drive.values()].some(x=>x.name.endsWith('.failure.json')));
 }finally{await k.close()}
});
test('synthetic concurrent modification after CAS aborts rollback without overwriting new state',async()=>{
 const k=await kit({faultCloseout:true,concurrentCloseout:true});
 try{
  const a=await k.gate.admit({manifest:k.manifest,manifestBytes:canonicalBytes(k.manifest)});
  await assert.rejects(k.gate.execute(a),/PRESERVED_CONCURRENT_OR_UNEXPECTED_STATE/);
  assert.equal(k.sqlWrites,1);
  assert.equal(k.state.skins.permanent,'newer-concurrent-state');
  assert.equal(k.claims.size,2);
  assert.ok([...k.drive.values()].some(x=>x.name.endsWith('.failure.json')));
 }finally{await k.close()}
});

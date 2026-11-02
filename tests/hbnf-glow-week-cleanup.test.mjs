import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  HBNF_GLOW_CLEANUP, buildCleanupCandidate, canonicalBytes, canonicalJson,
  createHbnfGlowCleanupGate, createHbnfGlowCleanupLedger, createSupabaseGlowCleanupProvider,
} from '../scripts/hbnf-glow-week-cleanup.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const md5 = value => createHash('md5').update(value).digest('hex');
const clone = value => structuredClone(value);
const iso = '2026-11-01T22:33:40.372437+00:00';
const snapDate = '2026-11-01 22:33:40.372437+00';

function fixtureState() {
  const testPlayers = ['Test Player A', 'Test Player B', 'Test Player C', 'Test Player D'];
  const teams = [
    {id:'T1',partner1:testPlayers[0],partner2:testPlayers[1]},
    {id:'T2',partner1:testPlayers[2],partner2:testPlayers[1]},
    {id:'T3',partner1:'Andrew',partner2:testPlayers[3]},
  ];
  const players = [
    {id:'P1',name:testPlayers[0],cardId:'C1',scores:['3','4','2'],partner1:testPlayers[0],partner2:testPlayers[1],removed:false},
    {id:'P2',name:testPlayers[2],cardId:'C1',scores:['4','3','2'],partner1:testPlayers[2],partner2:testPlayers[1],removed:false},
    {id:'P3',name:'Andrew',cardId:'C1',scores:['3','4','2'],partner1:'Andrew',partner2:testPlayers[3],removed:false},
  ];
  return {
    glow:{
      activeWeek:'2026-11-03',
      weeks:{
        '2026-10-28':{cards:[],players:[{id:'H1',scores:['3']}],scoresLocked:true,scorecardText:{holeNotes:['history']}},
        '2026-11-03':{cards:[{id:'C1',players:teams,finalized:false}],players,scoresLocked:false,entryFee:5,aceWinner:'',payoutPercent:100,scorecardText:{holePars:[3,3],holeNotes:['keep']},tiebreakerWinner:'',tagExchangeExceptions:{}},
      },
      playerAliases:{'Test Player A':'Test Player A','Test Player B':'Test Player B','Test Player C':'Test Player C','Test Player D':'Test Player D','Carlos':'Carlos'},
      trophyHistory:[{week:'2026-10-28',winner:'historical'}],layoutTemplates:{main:{holes:18}},
    },
    skins:{week:{scores:[2,3],history:[{date:'2026-10-28'}]}},
    bagTags:{players:[{tag:7,name:'Historical'}],manual:{Historical:7}},
    __backups:[{id:'prior-backup',created_at:'2026-10-28'}],
  };
}

function counts(root) {
  const week=root.glow.weeks['2026-11-03'], teams=week.cards.flatMap(c=>c.players||[]);
  return {cards:week.cards.length,teams:teams.length,playerRows:week.players.length,enteredScores:week.players.reduce((n,p)=>n+p.scores.filter(x=>x!==null&&x!=='').length,0),testAliases:Object.keys(root.glow.playerAliases).filter(k=>/test player/i.test(k)||/test player/i.test(root.glow.playerAliases[k])).length};
}

function createFixture() {
  const state=fixtureState();
  const aliases=Object.keys(state.glow.playerAliases).filter(k=>/test player/i.test(k)||/test player/i.test(state.glow.playerAliases[k])).sort();
  const week=state.glow.weeks['2026-11-03'];
  const op={expectedCounts:counts(state),testAliasKeysMd5:md5(aliases.join('\n')),rehearsalPayloadSha256:sha(Buffer.from(canonicalJson({cards:week.cards,players:week.players})))};
  const cleaned=clone(state);cleaned.glow.weeks['2026-11-03'].cards=[];cleaned.glow.weeks['2026-11-03'].players=[];for(const k of aliases)delete cleaned.glow.playerAliases[k];
  op.cleanedStateSha256=sha(Buffer.from(canonicalJson(cleaned)));
  op.cleanedStateMd5=md5(JSON.stringify(cleaned));
  const snapshot=Buffer.from(JSON.stringify({id:1,updated_at:snapDate,state_json:state}));
  const baseline={updatedAt:iso,rowFingerprint:md5(JSON.stringify({id:1,updated_at:iso,state_json:state})),stateJsonMd5:md5(JSON.stringify(state)),testAliasKeysMd5:op.testAliasKeysMd5,matrixAutoLive:false,queueFingerprint:md5(JSON.stringify(state)),queueStateUpdatedAt:iso,cinematicEventCount:27,tagProjectionMatches:true};
  const manifest={
    format:HBNF_GLOW_CLEANUP.format,releaseId:'hbnf-glow-week-cleanup-test-20261102',phase:'PENDING',oneTime:true,
    sourceCommit:'a'.repeat(40),
    ownerAuthorization:{confirmed:true,evidence:'explicit in-scope owner instruction',scope:'remove only the verified rehearsal rows and aliases from the Nov 3 Glow week'},
    target:{projectId:HBNF_GLOW_CLEANUP.projectId,table:HBNF_GLOW_CLEANUP.table,rowId:1,weekDate:HBNF_GLOW_CLEANUP.weekDate},
    baseline,backup:{driveFileId:'snapshot-drive-id',bytes:snapshot.length,sha256:sha(snapshot),downloadBackVerified:true},
    operation:op,claims:{admission:'release-claims/hbnf-glow-week-cleanup-test-20261102.admission-claim.json',execution:'release-claims/hbnf-glow-week-cleanup-test-20261102.execution-claim.json',restore:'release-claims/hbnf-glow-week-cleanup-test-20261102.restore-claim.json'},
  };
  return {state,cleaned,snapshot,manifest,manifestBytes:canonicalBytes(manifest)};
}

function fakeProvider(initial) {
  let root=clone(initial.state), revision=iso, writes=0, failReadOnce=false, afterWriteHook=null;
  const calc=()=>{
    const c=counts(root), stateJsonMd5=md5(JSON.stringify(root));
    const aliasKeys=Object.keys(root.glow.playerAliases).filter(k=>/test player/i.test(k)||/test player/i.test(root.glow.playerAliases[k])).sort();
    return {projectId:HBNF_GLOW_CLEANUP.projectId,row:{id:1,updatedAt:revision,rowFingerprint:md5(JSON.stringify({id:1,updated_at:revision,state_json:root})),stateJsonMd5,activeWeek:root.glow.activeWeek,cards:c.cards,teams:c.teams,playerRows:c.playerRows,enteredScores:c.enteredScores,testAliases:c.testAliases,testAliasKeysMd5:md5(aliasKeys.join('\n')),scoresLocked:root.glow.weeks['2026-11-03'].scoresLocked},matrix:{queueFingerprint:stateJsonMd5,queueStateUpdatedAt:revision,autoLive:false,cinematicEventCount:27},tagProjectionMatches:true};
  };
  return {
    get root(){return root;},get writes(){return writes;},
    async read(){if(failReadOnce){failReadOnce=false;throw new Error('simulated readback interruption');}return calc();},
    async hashState(state){return md5(JSON.stringify(state));},
    async compareAndSwap(expected,next){if(expected!==revision)return{saved:false};writes++;root=clone(next);revision=`2026-11-02T00:00:0${writes}.000001+00:00`;const hook=afterWriteHook;afterWriteHook=null;if(hook)await hook(this);return{saved:true,updatedAt:revision};},
    failNextRead(){failReadOnce=true;},
    setAfterWriteHook(fn){afterWriteHook=fn;},
    mutateUnrelated(){root.skins.week.scores.push(99);revision='2026-11-02T00:01:00.000001+00:00';},
  };
}

function fakeStorage(snapshot) {
  const files=new Map([['snapshot-drive-id',Buffer.from(snapshot)]]);let next=1;
  return {files,async putOnce(name,bytes){const id=`drive-${next++}`;files.set(id,Buffer.from(bytes));return{id};},async download(id){const b=files.get(id);if(!b)throw new Error('Drive file missing');return Buffer.from(b);}};
}
function fakeLedger() {
  const used=new Map();let next=1;
  const claim=kind=>async (_key,bytes)=>{if(used.has(kind))return{created:false};const id=`github-${kind}-${next++}`;used.set(kind,{id,bytes:Buffer.from(bytes)});return{created:true,id};};
  const read=kind=>async id=>{const v=used.get(kind);if(v?.id!==id)throw new Error('claim ref missing');return Buffer.from(v.bytes);};
  return {used,claimAdmission:claim('admission'),readAdmission:read('admission'),claimExecution:claim('execution'),readExecution:read('execution'),claimRestore:claim('restore'),readRestore:read('restore')};
}
function gateFor(f,provider=fakeProvider(f),storage=fakeStorage(f.snapshot),ledger=fakeLedger()) {
  return {gate:createHbnfGlowCleanupGate({provider,storage,ledger,sourceCommit:f.manifest.sourceCommit,clock:()=>iso}),provider,storage,ledger};
}

test('cleanup candidate removes only the exact test week rows and test aliases',()=>{
  const f=createFixture();
  const plan=buildCleanupCandidate(f.state,f.manifest.operation);
  assert.deepEqual(counts(plan.stateJson),{cards:0,teams:0,playerRows:0,enteredScores:0,testAliases:0});
  assert.deepEqual(plan.stateJson.skins,f.state.skins);
  assert.deepEqual(plan.stateJson.bagTags,f.state.bagTags);
  assert.deepEqual(plan.stateJson.__backups,f.state.__backups);
  assert.deepEqual(plan.stateJson.glow.weeks['2026-10-28'],f.state.glow.weeks['2026-10-28']);
  assert.deepEqual(plan.stateJson.glow.weeks['2026-11-03'].scorecardText,f.state.glow.weeks['2026-11-03'].scorecardText);
  assert.equal(plan.stateJson.glow.activeWeek,'2026-11-03');
});

test('cleanup refuses a real identity, locked/finalized week, or changed payload',()=>{
  const f=createFixture(), bad=clone(f.state);
  bad.glow.weeks['2026-11-03'].players[0].partner1='Carlos';
  assert.throws(()=>buildCleanupCandidate(bad,f.manifest.operation),/test-player identity|payload/);
  const locked=clone(f.state);locked.glow.weeks['2026-11-03'].scoresLocked=true;
  assert.throws(()=>buildCleanupCandidate(locked,f.manifest.operation),/locked/);
  const finalized=clone(f.state);finalized.glow.weeks['2026-11-03'].cards[0].finalized=true;
  assert.throws(()=>buildCleanupCandidate(finalized,f.manifest.operation),/finalized/);
});

test('admission requires exact backup download, fresh revision, and explicit scope; admission makes no write',async()=>{
  const f=createFixture(),{gate,provider,storage,ledger}=gateFor(f);
  const admission=await gate.admit({manifest:f.manifest,manifestBytes:f.manifestBytes});
  assert.equal(admission.status,'ADMISSION_PASS');
  assert.equal(provider.writes,0);
  assert.equal(storage.files.has(admission.manifestDriveId),true);
  assert.equal(storage.files.has(admission.decisionDriveId),true);
  assert.equal(ledger.used.has('admission'),true);
});

test('admission fails closed on backup byte mismatch, missing owner evidence, or stale target',async()=>{
  const f=createFixture(), provider=fakeProvider(f),storage=fakeStorage(f.snapshot),ledger=fakeLedger();
  storage.files.set('snapshot-drive-id',Buffer.from('tampered'));
  const gate=createHbnfGlowCleanupGate({provider,storage,ledger,sourceCommit:f.manifest.sourceCommit});
  await assert.rejects(gate.admit({manifest:f.manifest,manifestBytes:f.manifestBytes}),/snapshot bytes\/hash mismatch/);
  assert.equal(provider.writes,0);
  const f2=createFixture();f2.manifest.ownerAuthorization.confirmed=false;f2.manifestBytes=canonicalBytes(f2.manifest);
  const gate2=gateFor(f2).gate;
  await assert.rejects(gate2.admit({manifest:f2.manifest,manifestBytes:f2.manifestBytes}),/authorization/);
  const f3=createFixture(),p3=fakeProvider(f3);p3.mutateUnrelated();
  await assert.rejects(gateFor(f3,p3).gate.admit({manifest:f3.manifest,manifestBytes:f3.manifestBytes}),/baseline differs/);
});

test('successful cleanup uses one CAS and verifies server state, Matrix queue, tags, and durable closeout',async()=>{
  const f=createFixture(),{gate,provider,storage}=gateFor(f);
  const admitted=await gate.admit({manifest:f.manifest,manifestBytes:f.manifestBytes});
  const result=await gate.execute(admitted);
  assert.equal(result.status,'CLEANUP_PASS');
  assert.equal(provider.writes,1);
  assert.deepEqual(counts(provider.root),{cards:0,teams:0,playerRows:0,enteredScores:0,testAliases:0});
  assert.equal(result.receipt.matrix.queueFingerprint,result.receipt.cleanup.stateJsonMd5);
  assert.equal(result.receipt.matrix.autoLive,false);
  assert.equal(result.receipt.tagProjectionMatches,true);
  assert.deepEqual(storage.files.get(result.receiptDriveId),result.receiptBytes);
});

test('execution replay is rejected before a second CAS',async()=>{
  const f=createFixture(),{gate,provider}=gateFor(f),admitted=await gate.admit({manifest:f.manifest,manifestBytes:f.manifestBytes});
  await gate.execute(admitted);
  await assert.rejects(gate.execute(admitted),/already consumed/);
  assert.equal(provider.writes,1);
});

test('a boundary revision change aborts without a score cleanup write',async()=>{
  const f=createFixture(),p=fakeProvider(f),{gate}=gateFor(f,p),admitted=await gate.admit({manifest:f.manifest,manifestBytes:f.manifestBytes});
  p.mutateUnrelated();
  await assert.rejects(gate.execute(admitted),/did not pass/);
  assert.equal(p.writes,0);
  assert.equal(p.root.skins.week.scores.at(-1),99);
});

test('post-write interruption restores only by a fresh CAS from the exact cleanup state',async()=>{
  const f=createFixture(),p=fakeProvider(f),{gate,ledger}=gateFor(f,p),admitted=await gate.admit({manifest:f.manifest,manifestBytes:f.manifestBytes});
  p.setAfterWriteHook(async self=>self.failNextRead());
  await assert.rejects(gate.execute(admitted),/RESTORED_BASELINE/);
  assert.equal(p.writes,2);
  assert.deepEqual(counts(p.root),counts(f.state));
  assert.deepEqual(p.root.skins,f.state.skins);
  assert.equal(ledger.used.has('restore'),true);
});

test('recovery never overwrites a concurrent edit after the cleanup CAS',async()=>{
  const f=createFixture(),p=fakeProvider(f),{gate,ledger,storage}=gateFor(f,p),admitted=await gate.admit({manifest:f.manifest,manifestBytes:f.manifestBytes});
  p.setAfterWriteHook(async self=>self.mutateUnrelated());
  await assert.rejects(gate.execute(admitted),/PRESERVED_CONCURRENT_OR_UNEXPECTED_STATE/);
  assert.equal(p.writes,1);
  assert.equal(p.root.skins.week.scores.at(-1),99);
  assert.equal(ledger.used.has('restore'),false);
  assert.equal(storage.files.size,4); // snapshot + manifest + decision + durable failure receipt
});

test('Supabase adapter reads side effects and writes only through guarded league-state CAS',async()=>{
  const calls=[];
  const result=(rows)=>({content:[{type:'text',text:JSON.stringify({result:`<untrusted-data-test>\n${JSON.stringify(rows)}\n</untrusted-data-test>`})}]});
  let reads=0;
  const provider=createSupabaseGlowCleanupProvider({executeSql:async arg=>{calls.push(arg);if(arg.query.startsWith('select jsonb_build_object')){reads++;return result([{readback:{projectId:HBNF_GLOW_CLEANUP.projectId,row:{id:1,updatedAt:reads===1?iso:'2026-11-02T00:00:01.000001+00:00',stateJsonMd5:'a'.repeat(32)},matrix:{},tagProjectionMatches:true}}]);}if(arg.query.includes('md5('))return result([{stateJsonMd5:'a'.repeat(32)}]);if(arg.query.startsWith('DO '))return result([]);throw new Error('unexpected SQL');}});
  const read=await provider.read();assert.equal(read.projectId,HBNF_GLOW_CLEANUP.projectId);
  await provider.hashState({ok:true});
  const saved=await provider.compareAndSwap(iso,{glow:{activeWeek:'2026-11-03'}});
  assert.equal(saved.saved,true);
  const doSql=calls.find(x=>x.query.startsWith('DO ')).query;
  assert.match(doSql,/LOCK TABLE public\.hbnf_current_tag_entries IN SHARE MODE/);
  assert.match(doSql,/hbnf_matrix_control_state[\s\S]*FOR SHARE/);
  assert.match(doSql,/hbnf_save_league_state_v1/);
  assert.doesNotMatch(doSql,/\bUPDATE\s+public\.league_state\b/i);
});

test('GitHub claims use three distinct atomic paths and reject replay',async()=>{
  const files=new Map(),paths=[];
  const createFile=async({path,content})=>{
    paths.push(path);
    if(files.has(path))return{isError:true,content:[{type:'text',text:'422 already exists'}]};
    const commit_sha=String(files.size+1).padStart(40,'0');
    files.set(path,{commit_sha,content:Buffer.from(content).toString('base64')});
    return{structuredContent:{commit_sha}};
  };
  const fetchFile=async({path,ref})=>{
    const file=files.get(path);
    assert.ok(file&&ref===file.commit_sha);
    return{structuredContent:{content:file.content}};
  };
  const ledger=createHbnfGlowCleanupLedger({createFile,fetchFile,releaseId:'cleanup-ledger-test'});
  const claim=Buffer.from('immutable claim');
  for(const kind of ['Admission','Execution','Restore']){
    const create=ledger[`claim${kind}`],read=ledger[`read${kind}`];
    const result=await create({kind:kind.toLowerCase(),key:`${kind}-key`},claim);
    assert.equal(result.created,true);
    assert.deepEqual(await read(result.id),claim);
    assert.equal((await create({kind:kind.toLowerCase(),key:`${kind}-key`},claim)).created,false);
  }
  assert.deepEqual(paths,[
    'release-claims/cleanup-ledger-test.admission-claim.json',
    'release-claims/cleanup-ledger-test.admission-claim.json',
    'release-claims/cleanup-ledger-test.execution-claim.json',
    'release-claims/cleanup-ledger-test.execution-claim.json',
    'release-claims/cleanup-ledger-test.restore-claim.json',
    'release-claims/cleanup-ledger-test.restore-claim.json',
  ]);
});

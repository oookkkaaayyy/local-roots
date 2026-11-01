import test from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED_STAGES } from '../scripts/hbnf-parent-release/parent-gate.mjs';
import { digest, executeMockableSaga, persistCloseout, providerBoundPreflight, validateTransaction } from '../scripts/hbnf-parent-release/driver.mjs';
import { MemoryJournal } from '../scripts/hbnf-parent-release/journal.mjs';
import { DriveEvidenceJournal, FileJournal } from '../scripts/hbnf-parent-release/journal.mjs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAuthenticatedReadAdapters } from '../scripts/hbnf-parent-release/providers.mjs';

const targetIds = ['supabase-schema','edge-tag-editor','edge-tags-live','edge-watch-score','cloudflare-worker'];
const workerBaselineVersion = '48ffa87e-3c83-46d0-a6ca-db7bf0b064e6';
const olderWorkerVersion = '08633e43-dbaa-4421-a072-5af56f75d4b7';
const initial = Object.fromEntries(targetIds.map(id => [id, { id, revision: 0 }]));
const makeTx = () => {
  const states = structuredClone(initial);
  const targets = targetIds.map(id => ({ id, provider: id.startsWith('edge-') ? 'Supabase' : id === 'cloudflare-worker' ? 'Cloudflare' : 'Supabase', target: id, baselineIdentity: digest(states[id]), baselineSha256: digest(states[id]), rollback: { driveFileId: `rollback-${id}`, sha256: 'a'.repeat(64), bytes: 1, downloadBackVerified: true, ...(id === 'cloudflare-worker' ? { providerVersionId: workerBaselineVersion } : {}) }, ...(id === 'cloudflare-worker' ? { baselineProviderVersionId: workerBaselineVersion } : {}) }));
  const operations = REQUIRED_STAGES.map(([id, targetId], index) => {
    const beforeState = structuredClone(states[targetId]);
    const afterState = { ...beforeState, revision: beforeState.revision + 1, applied: id };
    states[targetId] = afterState;
    return { id, targetId, applyRoute: `apply:${id}`, readbackRoute: `read:${id}`, candidate: { sha256: ('' + (index + 1)).repeat(64).slice(0,64), bytes: 10, path: `candidate-${id}`, driveFileId:`candidate-drive-${id}` }, restore: { route: `restore:${id}`, sha256: 'b'.repeat(64), bytes: 9, path: `restore-${id}`, driveFileId:`restore-drive-${id}`, effect: id === 'db-revoke-old-writes' ? 'restore-legacy-grants' : 'restore-prior-stage' }, expectedBefore: digest(beforeState), expectedAfter: digest(afterState), expectedRestored: digest(beforeState), beforeState, afterState };
  });
  const parentContract = {
    schemaVersion: 1, releaseId: 'hbnf-p0-test-release', sourceCommit: 'bb998b8f3e4023463298e9944661aa47435f87c4',
    targets: targets.map(t => ({ ...t, baselineReadbackSha256: t.baselineSha256, restoreRoute: 'restore', postRestoreReadback: 'read' })),
    operations: operations.map(o => ({ id: o.id, targetId: o.targetId, applyRoute: o.applyRoute, restoreRoute: o.restore.route, readbackRoute: o.readbackRoute, artifact: { sha256:o.candidate.sha256,bytes:o.candidate.bytes,path:o.candidate.path }, restoreArtifact:{sha256:o.restore.sha256,bytes:o.restore.bytes,path:o.restore.path}, expectedBefore:'before',expectedAfter:'after' })),
    quiesce: { required: true, oldClientDisposition: 'REVIEW_ONLY_PENDING_OWNER_DISPOSITION' },
    edgeWatchScoreReadback: { baselineVersion:14, staleWriteCompatible:true, evidenceSha256:'c'.repeat(64) }, sameManifestCloseoutRoute:'drive-downloadback'
  };
  const tx = { schemaVersion:1, transactionId:'hbnf-p0-test-transaction-20261030', sourceCommit:'bb998b8f3e4023463298e9944661aa47435f87c4', mode:'review-only', liveExecutionEnabled:false, evidenceFolderId:'private-test-folder', sourceAttestation:{driveFileId:'attestation',sha256:'d'.repeat(64),bytes:50,downloadBackVerified:true}, targets, operations, rollbackOrder:operations.slice().reverse().map(o=>o.id), acceptanceCriteria:[{id:'readback',description:'independent provider readback',expected:'exact identity',method:'authenticated GET'}], parentContract };
  return tx;
};
const fakeProvider = (tx, fault = {}) => {
  const states = Object.fromEntries(tx.targets.map(t => [t.id, structuredClone(initial[t.id])]));
  let applyCount = 0, readCount = 0;
  const calls = [];
  return { states, calls, adapter: {
    testOnly:true,
    async readTarget(id) { readCount++; if ((fault.staleFirstRead && readCount===1) || fault.staleOnRead===readCount) states[id]={id,revision:99}; return structuredClone(states[id]); },
    async apply(op) { calls.push(`apply:${op.id}`); applyCount++; if (fault.failApply===op.id) return {acknowledged:false}; states[op.targetId]=structuredClone(op.afterState); return {acknowledged:fault.loseAck===op.id?false:true}; },
    async restore(op) { calls.push(`restore:${op.id}`); if(fault.failRestore===op.id)return {acknowledged:false}; states[op.targetId]=structuredClone(op.beforeState); return {acknowledged:true}; }
  }};
};

test('successful mocked sequencing is ordered, independently read back, and never admitted', async()=>{
  const tx=makeTx(); assert.deepEqual(validateTransaction(tx),[]);
  const p=fakeProvider(tx), journal=new MemoryJournal();
  const out=await executeMockableSaga(tx,p.adapter,journal);
  assert.equal(out.status,'MOCKED_COMPLETE_NOT_ADMITTED');
  assert.deepEqual(p.calls,tx.operations.map(o=>`apply:${o.id}`));
  assert.deepEqual(journal.events.filter(e=>e.event==='OBSERVED_APPLIED').map(e=>e.stage),tx.operations.map(o=>o.id));
});

test('stale provider identity aborts before the first mutation',async()=>{
  const tx=makeTx(),p=fakeProvider(tx,{staleFirstRead:true});
  const out=await executeMockableSaga(tx,p.adapter,new MemoryJournal());
  assert.equal(out.status,'STALE_TARGET_ABORT'); assert.equal(p.calls.length,0);
});

test('stale identity after partial install rolls back only while exact restoration remains possible',async()=>{
  const tx=makeTx(),p=fakeProvider(tx,{staleOnRead:5});
  const out=await executeMockableSaga(tx,p.adapter,new MemoryJournal());
  assert.equal(out.status,'MANUAL_RECOVERY_REQUIRED');
  assert(p.calls.includes('apply:db-revision')); assert(p.calls.includes('apply:db-rpc-expand'));
  assert(!p.calls.includes('apply:db-tag-revision'));
});

test('lost final acknowledgement restores permissions before the Worker',async()=>{
  const tx=makeTx(),p=fakeProvider(tx,{loseAck:'db-revoke-old-writes'});
  const out=await executeMockableSaga(tx,p.adapter,new MemoryJournal());
  assert.equal(out.status,'MOCKED_ABORT_RESTORED_NOT_ADMITTED');
  const restores=p.calls.filter(x=>x.startsWith('restore:'));
  assert.equal(restores[0],'restore:db-revoke-old-writes'); assert.equal(restores[1],'restore:worker-vnext');
});

test('partial installation is reversed and returns all states to their original baselines',async()=>{
  const tx=makeTx(),p=fakeProvider(tx,{failApply:'edge-tag-editor'});
  const out=await executeMockableSaga(tx,p.adapter,new MemoryJournal());
  assert.equal(out.status,'MOCKED_ABORT_RESTORED_NOT_ADMITTED');
  assert.deepEqual(p.states,initial);
  assert.deepEqual(p.calls.filter(x=>x.startsWith('restore:')),['restore:db-tag-revision','restore:db-rpc-expand','restore:db-revision']);
});

test('rollback failure stops with manual recovery required',async()=>{
  const tx=makeTx(),p=fakeProvider(tx,{failApply:'edge-tag-editor',failRestore:'db-rpc-expand'});
  const out=await executeMockableSaga(tx,p.adapter,new MemoryJournal());
  assert.equal(out.status,'MANUAL_RECOVERY_REQUIRED'); assert.match(out.reason,/rollback failed/);
});

test('transaction replay is rejected by the one-time journal claim',async()=>{
  const tx=makeTx(),p=fakeProvider(tx),j=new MemoryJournal();
  assert.equal((await executeMockableSaga(tx,p.adapter,j)).status,'MOCKED_COMPLETE_NOT_ADMITTED');
  assert.equal((await executeMockableSaga(tx,p.adapter,j)).status,'REPLAY_REJECTED');
});

test('durable journals verify every event and reject a second claim',async()=>{
  const id=`journal-test-${Date.now()}`, folder=await mkdtemp(join(tmpdir(),'hbnf-journal-'));
  const fileJournal=new FileJournal(folder,id); await fileJournal.claim(id,'e'.repeat(64)); await fileJournal.append({event:'STEP'});
  await assert.rejects(()=>new FileJournal(folder,id).claim(id,'e'.repeat(64)));
  await fileJournal.close();
  const stored=[]; const store={async persistAndDownloadBack(name,bytes){const b=Buffer.from(bytes);stored.push({name,b});return {downloadBackVerified:true,sha256:digest(b)}}};
  const driveJournal=new DriveEvidenceJournal({evidenceStore:store,folderId:'private-folder',transactionId:id});
  await assert.rejects(()=>driveJournal.claim(id,'f'.repeat(64)),/ATOMIC_DURABLE_SINGLE_USE_LOCK_UNAVAILABLE/);
  const guarded=new DriveEvidenceJournal({evidenceStore:store,folderId:'private-folder',transactionId:id+'-guarded',claimOnce:async()=>{}});
  await guarded.claim(id+'-guarded','f'.repeat(64)); await guarded.append({event:'STEP'});
  assert.equal(stored.length,2); assert.match(stored[1].name,/journal-0001/);
});

test('closeout refuses unadmitted transaction and remains pending even with mock readback',async()=>{
  const store={async persistAndDownloadBack(_n,b){return {downloadBackVerified:true,sha256:digest(b)}}};
  assert.equal((await persistCloseout({admittedManifest:{status:'PENDING'},result:{}},store)).status,'PENDING');
  const out=await persistCloseout({admittedManifest:{status:'ADMITTED',manifestSha256:'a'.repeat(64),releaseId:'test'},result:{manifestSha256:'a'.repeat(64),providerReadbacks:{},acceptance:[{status:'PASS'}]}},store);
  assert.equal(out.status,'CLOSEOUT_PENDING');
});

test('authenticated provider preflight binds five exact targets but remains PENDING',async()=>{
  const tx=makeTx();
  const observed=Object.fromEntries(tx.targets.map(t=>[t.id,initial[t.id]]));
  const store={async readAndVerifyDriveArtifact(a){return {driveFileId:a.driveFileId,sha256:a.sha256,bytes:a.bytes,verified:true}},async persistAndDownloadBack(_n,bytes){return {downloadBackVerified:true,sha256:digest(bytes),id:'drive-id'}}};
  const out=await providerBoundPreflight(tx,{readOnly:true,async readAllTargets(received){assert.equal(received.transactionId,tx.transactionId);assert.equal(received.targets.find(t=>t.id==='cloudflare-worker').rollback.providerVersionId,workerBaselineVersion);return observed}},store);
  assert.equal(out.preflightStatus,'PASS'); assert.equal(out.status,'PENDING'); assert.equal(out.admission,'NOT_ADMITTED');
});

test('artifact hash mismatch fails preflight and cannot admit',async()=>{
  const tx=makeTx(), observed=Object.fromEntries(tx.targets.map(t=>[t.id,initial[t.id]]));
  const store={async readAndVerifyDriveArtifact(a){return {driveFileId:a.driveFileId,sha256:'0'.repeat(64),bytes:a.bytes,verified:false}},async persistAndDownloadBack(_n,b){return {downloadBackVerified:true,sha256:digest(b)}}};
  const out=await providerBoundPreflight(tx,{readOnly:true,async readAllTargets(){return observed}},store);
  assert.equal(out.preflightStatus,'FAIL'); assert.equal(out.admission,'NOT_ADMITTED'); assert(out.manifest.mismatches.some(x=>x.startsWith('artifact:')));
});

test('preflight rejects changed Postgres function definition identities',async()=>{
  const tx=makeTx(), schemaTarget=tx.targets.find(t=>t.id==='supabase-schema');
  const expected={...initial['supabase-schema'],snapshot:{functions:[{name:'hbnf_verify_round_tag_v1',definitionSha256:'a'.repeat(64)}]}};
  schemaTarget.baselineSha256=digest(expected); schemaTarget.baselineIdentity=digest(expected);
  const parentTarget=tx.parentContract.targets.find(t=>t.id==='supabase-schema');
  parentTarget.baselineReadbackSha256=digest(expected); parentTarget.baselineIdentity=digest(expected);
  const observed=Object.fromEntries(tx.targets.map(t=>[t.id,structuredClone(initial[t.id])]));
  observed['supabase-schema']={...initial['supabase-schema'],snapshot:{functions:[{name:'hbnf_verify_round_tag_v1',definitionSha256:'b'.repeat(64)}]}};
  const store={async readAndVerifyDriveArtifact(a){return {driveFileId:a.driveFileId,sha256:a.sha256,bytes:a.bytes,verified:true}},async persistAndDownloadBack(_n,b){return {downloadBackVerified:true,sha256:digest(b)}}};
  const out=await providerBoundPreflight(tx,{readOnly:true,async readAllTargets(){return observed}},store);
  assert.equal(out.preflightStatus,'FAIL');
  assert(out.manifest.mismatches.includes('supabase-schema'));
});

test('provider reads require credentials and mutations are absent from authenticated adapter',async()=>{
  assert.throws(()=>createAuthenticatedReadAdapters({env:{},fetchImpl:async()=>{throw Error('should not fetch')}}),/AUTH_CONFIGURATION_MISSING/);
  const adapter=createAuthenticatedReadAdapters({env:{CLOUDFLARE_API_TOKEN:'x',SUPABASE_ACCESS_TOKEN:'y',GOOGLE_DRIVE_ACCESS_TOKEN:'z'},fetchImpl:async()=>new Response('{}',{status:200})});
  assert.equal(adapter.readOnly,true); assert.equal('apply' in adapter,false); assert.equal('restore' in adapter,false);
  const rejected=await executeMockableSaga(makeTx(),adapter,new MemoryJournal()); assert.equal(rejected.status,'PENDING');
});

test('authenticated provider adapter reads the five exact production target types without mutation endpoints',async()=>{
  const calls=[];
  const functionRows=['hbnf-tag-editor','hbnf-tags-live','hbnf-watch-score'].map((slug,i)=>({slug,status:'ACTIVE',version:[5,4,14][i],ezbr_sha256:`sha-${i}`,verify_jwt:false,updated_at:'2026-10-30T00:00:00Z'}));
  const workerCurrent=workerBaselineVersion, workerRollback=workerBaselineVersion;
  const replies=[
    {result:{deployments:[{id:'dep',versions:[{version_id:workerCurrent,percentage:100}]}]}},
    {result:{items:[{id:workerCurrent,number:348,metadata:{source:'wrangler'}},{id:olderWorkerVersion,number:347,metadata:{source:'wrangler'}},{id:'3b019c24-0288-4c0d-bcc2-46cb6028d0f6',number:343,metadata:{source:'wrangler'}}]}},
    {result:[{pattern:'hbnightflyers.com',script:'hbnf'}]},
    {id:'phcpbvuqibyarpfrftgx',status:'ACTIVE_HEALTHY',region:'us-west-2'},
    functionRows,
    [{snapshot:{league_state:{id:1,sha256:'state'},triggers:[{name:'zzz_hbnf_enforce_league_state_revision',definitionSha256:'trigger-hash'}],functions:[{name:'hbnf_enforce_league_state_revision',definitionSha256:'revision-hash'},{name:'hbnf_save_league_state_v1',definitionSha256:'rpc-hash'},{name:'hbnf_verify_round_tag_v1',definitionSha256:'tag-hash'}],grants:[{grantee:'anon',privilege:'UPDATE'}],policies:[{name:'Public can update league_state',cmd:'UPDATE'}]}}],
  ];
  const adapter=createAuthenticatedReadAdapters({env:{CLOUDFLARE_API_TOKEN:'cf-test',SUPABASE_ACCESS_TOKEN:'sb-test',GOOGLE_DRIVE_ACCESS_TOKEN:'drive-test'},fetchImpl:async(url,init={})=>{calls.push({url,method:init.method||'GET',auth:init.headers?.authorization,body:init.body});return new Response(JSON.stringify(replies[calls.length-1]),{status:200})}});
  const targets=await adapter.readAllTargets(makeTx());
  assert.deepEqual(Object.keys(targets).sort(),targetIds.slice().sort());
  assert.equal(targets['cloudflare-worker'].activeVersionId,workerCurrent);
  assert.equal(targets['cloudflare-worker'].deploymentId,'dep');
  assert(calls.some(c=>c.url.endsWith('/workers/scripts/hbnf/deployments')));
  assert(calls.some(c=>c.url.endsWith('/workers/scripts/hbnf/versions')));
  assert.equal(targets['cloudflare-worker'].versionNumber,348);
  assert.equal(targets['cloudflare-worker'].retainedRollbackVersionId,workerRollback);
  assert.equal(targets['cloudflare-worker'].retainedRollbackVersionNumber,348);
  assert.equal(targets['edge-watch-score'].version,14);
  assert(calls.every(c=>c.auth?.startsWith('Bearer ')));
  const queryCall=calls.find(c=>c.url.includes('/database/query'));
  assert.equal(queryCall.method,'POST'); assert.match(JSON.parse(queryCall.body).query,/^select jsonb_build_object/i);
  assert.match(JSON.parse(queryCall.body).query,/definitionSha256/);
  for(const name of ['hbnf_enforce_league_state_revision','hbnf_save_league_state_v1','hbnf_verify_round_tag_v1']) assert.match(JSON.parse(queryCall.body).query,new RegExp(name));
  assert.deepEqual(targets['supabase-schema'].snapshot.functions.map(f=>f.definitionSha256),['revision-hash','rpc-hash','tag-hash']);
  assert(calls.filter(c=>c.url.includes('workers/')||c.url.includes('/functions')).every(c=>c.method==='GET'));
});

test('provider preflight refuses to guess a rollback version from repository history', async()=>{
  const adapter=createAuthenticatedReadAdapters({env:{CLOUDFLARE_API_TOKEN:'x',SUPABASE_ACCESS_TOKEN:'y',GOOGLE_DRIVE_ACCESS_TOKEN:'z'},fetchImpl:async()=>new Response('{}',{status:200})});
  await assert.rejects(()=>adapter.readAllTargets({targets:[{id:'cloudflare-worker',rollback:{}}]}),/WORKER_ROLLBACK_VERSION_ID_REQUIRED/);
  const tx=makeTx(); delete tx.targets.find(t=>t.id==='cloudflare-worker').rollback.providerVersionId;
  assert(validateTransaction(tx).some(e=>e==='target cloudflare-worker: baseline and rollback binding incomplete'));
});

test('transaction rejects an older Worker rollback than the installed baseline',()=>{
  const tx=makeTx();
  tx.targets.find(t=>t.id==='cloudflare-worker').rollback.providerVersionId=olderWorkerVersion;
  assert(validateTransaction(tx).includes('target cloudflare-worker: baseline and rollback binding incomplete'));
});

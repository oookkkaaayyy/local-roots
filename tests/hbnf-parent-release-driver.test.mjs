import test from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED_STAGES } from '../scripts/hbnf-parent-release/parent-gate.mjs';
import { digest, executeAdmittedCloudflareChildSaga, executeMockableSaga, persistCloseout, providerBoundPreflight, validateCloudflareChildTransaction, validateTransaction } from '../scripts/hbnf-parent-release/driver.mjs';
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
    async readTarget(id) { readCount++; if(fault.failReadAt===readCount)throw new Error('injected provider readback timeout'); if ((fault.staleFirstRead && readCount===1) || fault.staleOnRead===readCount) states[id]={id,revision:99}; return structuredClone(states[id]); },
    async apply(op) { calls.push(`apply:${op.id}`); applyCount++; if (fault.failApply===op.id) return {acknowledged:false}; states[op.targetId]=structuredClone(op.afterState); return {acknowledged:fault.loseAck===op.id?false:true}; },
    async restore(op) { calls.push(`restore:${op.id}`); if(fault.failRestore===op.id)return {acknowledged:false}; states[op.targetId]=structuredClone(op.beforeState); return {acknowledged:true}; }
  }};
};

const makeCloudflareChildTx=()=>{
  const parent=makeTx(),before={id:'cloudflare-worker',accountId:'e3bc6b78f1104fa0c2a01245084594cf',
    service:'hbnf',activeVersionId:workerBaselineVersion,percentage:100,route:'hbnightflyers.com',cron:'* * * * *'};
  const after={...before,activeVersionId:'f0902911-6930-4042-883c-7899098d62d4',deploymentId:'deployment-candidate'};
  const baseline=digest(before);
  return {schemaVersion:1,transactionId:'hbnf-p0-cloudflare-child-20261110',sourceCommit:parent.sourceCommit,
    mode:'review-only',liveExecutionEnabled:false,controllingManifestFileId:'12X06fFmdc5oPGlcq9kprf1hhglbVV7mW',
    controllingManifestSha256:'a'.repeat(64),parentTransactionSha256:digest(parent),parentContract:parent.parentContract,
    targets:[{id:'cloudflare-worker',provider:'Cloudflare',target:'hbnf',baselineIdentity:baseline,baselineSha256:baseline,
      baselineProviderVersionId:workerBaselineVersion,rollback:{driveFileId:'v348-recovery',sha256:'b'.repeat(64),bytes:80000,
        downloadBackVerified:true,providerVersionId:workerBaselineVersion}}],
    operations:[{id:'worker-vnext',targetId:'cloudflare-worker',applyRoute:'cloudflare-deployments-post-100',
      readbackRoute:'cloudflare-deployments-get',expectedBefore:baseline,expectedAfter:digest(after),expectedRestored:baseline,
      candidate:{driveFileId:'1JiWlk5ddlXaPqaruARoGYsBn9fbifLOS',sha256:'e49502c1453b43301b518bbd19cd47be2a76ae7d716377a0b8bdb29e08729e32',bytes:82535,downloadBackVerified:true,
        providerVersionId:'f0902911-6930-4042-883c-7899098d62d4',uploadedVersionAndBindingsVerified:true,runWorkerFirst:true},
      restore:{driveFileId:'v348-recovery',sha256:'b'.repeat(64),bytes:80000,downloadBackVerified:true,
        providerVersionId:workerBaselineVersion,retainedVersionAndBindingsVerified:true,route:'cloudflare-deployments-post-100-v348'}}],
    rollbackOrder:['worker-vnext'],acceptanceCriteria:[{id:'worker-active',description:'v356 active at 100%',method:'authenticated Cloudflare deployment readback',expected:'v356 at 100%'}],
    testStates:{before,after}};
};

test('Cloudflare child validates one exact Worker operation while retaining the full five-target parent contract',()=>{
  const tx=makeCloudflareChildTx();assert.deepEqual(validateCloudflareChildTransaction(tx),[]);
  assert.equal(validateTransaction(makeTx()).length,0);
  for(const mutate of [t=>t.targets.push(structuredClone(t.targets[0])),t=>t.operations.push(structuredClone(t.operations[0])),
    t=>t.operations[0].candidate.providerVersionId='1553524d-c71f-4ad0-9bbf-4c8713df8173',
    t=>t.operations[0].restore.providerVersionId='08633e43-dbaa-4421-a072-5af56f75d4b7',
    t=>t.parentContract.targets.pop()]){
    const bad=makeCloudflareChildTx();mutate(bad);assert(validateCloudflareChildTransaction(bad).length>0);
  }
});

test('Cloudflare child requires exact same-manifest admission before any claim or provider call',async()=>{
  const tx=makeCloudflareChildTx();let touched=0;
  const out=await executeAdmittedCloudflareChildSaga(tx,{authenticated:true,readOnly:false,
    readTarget:async()=>{touched++;},apply:async()=>{touched++;},restore:async()=>{touched++;}},
    {atomicOneTimeClaim:true,durableDownloadBack:true,claim:async()=>{touched++;},append:async()=>{touched++;}},
    {status:'PENDING_NOT_ADMITTED',productionMutationAuthorized:false},{});
  assert.equal(out.status,'NOT_ADMITTED_NO_MUTATION');assert.equal(touched,0);
});

test('admitted Cloudflare child runs one operation and readback; lost deployment acknowledgement restores exact v348',async()=>{
  const tx=makeCloudflareChildTx();let state=structuredClone(tx.testStates.before);const calls=[];
  const adapters={authenticated:true,readOnly:false,async readTarget(){return structuredClone(state);},
    async apply(){calls.push('deploy-v356');state=structuredClone(tx.testStates.after);return {acknowledged:true};},
    async restore(op){calls.push('restore-v348');state=structuredClone(tx.testStates.before);return {acknowledged:true};}};
  const journal=new MemoryJournal();journal.atomicOneTimeClaim=true;journal.durableDownloadBack=true;
  const admission={status:'ADMITTED',productionMutationAuthorized:true,controllingManifestFileId:tx.controllingManifestFileId,
    manifestSha256:tx.controllingManifestSha256,transactionSha256:digest(tx),scope:'cloudflare-worker-only-stage-b',
    targetVersionId:'f0902911-6930-4042-883c-7899098d62d4',trafficPercentage:100,rollbackVersionId:workerBaselineVersion,parentFiveTargetRecoveryVerified:true};
  const verifier={async verifyOwnerApprovalAndManifest(){return true;},async verifyParentFiveTargetRecovery(){return true;}};
  const accepted=await executeAdmittedCloudflareChildSaga(tx,adapters,journal,admission,verifier);
  assert.equal(accepted.status,'PROVIDER_STAGES_APPLIED_PENDING_FIELD_ACCEPTANCE');
  assert.deepEqual(calls,['deploy-v356']);

  const tx2=makeCloudflareChildTx();let state2=structuredClone(tx2.testStates.before);const calls2=[];
  const adapters2={authenticated:true,readOnly:false,async readTarget(){return structuredClone(state2);},
    async apply(){calls2.push('deploy-v356');state2=structuredClone(tx2.testStates.after);return {acknowledged:false};},
    async restore(){calls2.push('restore-v348');state2=structuredClone(tx2.testStates.before);return {acknowledged:true};}};
  const journal2=new MemoryJournal();journal2.atomicOneTimeClaim=true;journal2.durableDownloadBack=true;
  const admission2={...admission,transactionSha256:digest(tx2)};
  const rolled=await executeAdmittedCloudflareChildSaga(tx2,adapters2,journal2,admission2,verifier);
  assert.equal(rolled.status,'PROVIDER_ABORT_RESTORED_PENDING_REACCEPTANCE');
  assert.deepEqual(calls2,['deploy-v356','restore-v348']);assert.deepEqual(state2,tx2.testStates.before);
});

test('successful mocked sequencing is ordered, independently read back, and never admitted', async()=>{
  const tx=makeTx(); assert.deepEqual(validateTransaction(tx),[]);
  const p=fakeProvider(tx), journal=new MemoryJournal();
  const out=await executeMockableSaga(tx,p.adapter,journal);
  assert.equal(out.status,'MOCKED_COMPLETE_NOT_ADMITTED');
  assert.deepEqual(p.calls,tx.operations.map(o=>`apply:${o.id}`));
  assert.deepEqual(journal.events.filter(e=>e.event==='OBSERVED_APPLIED').map(e=>e.stage),tx.operations.map(o=>o.id));
});

test('transaction rejects parent contract source or five-target baseline drift',()=>{
  const sourceMismatch=makeTx();
  sourceMismatch.parentContract.sourceCommit='f'.repeat(40);
  assert(validateTransaction(sourceMismatch).includes('parent contract source commit differs from transaction source'));

  const baselineMismatch=makeTx();
  baselineMismatch.parentContract.targets.find(t=>t.id==='supabase-schema').baselineReadbackSha256='f'.repeat(64);
  assert(validateTransaction(baselineMismatch).includes('parent contract target binding differs:supabase-schema'));

  const rollbackMismatch=structuredClone(makeTx());
  const rollbackTarget=rollbackMismatch.parentContract.targets.find(t=>t.id==='cloudflare-worker');
  rollbackTarget.rollback={...rollbackTarget.rollback,sha256:'f'.repeat(64)};
  assert(validateTransaction(rollbackMismatch).includes('parent contract target binding differs:cloudflare-worker'));

  const extraTarget=makeTx();
  extraTarget.parentContract.targets.push({...extraTarget.parentContract.targets[0],id:'unbound-target'});
  assert(validateTransaction(extraTarget).includes('parent contract must bind the exact five transaction targets'));
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


test('every stage failure aborts and restores only previously acknowledged targets in exact reverse order',async()=>{
  for(let index=0;index<REQUIRED_STAGES.length;index++){
    const stage=REQUIRED_STAGES[index][0],tx=makeTx();
    const p=fakeProvider(tx,{failApply:stage}),journal=new MemoryJournal();
    const out=await executeMockableSaga(tx,p.adapter,journal);
    assert.equal(out.status,'MOCKED_ABORT_RESTORED_NOT_ADMITTED','rejected stage '+stage);
    assert.deepEqual(p.states,initial,'no partial mutable state may remain after '+stage);
    assert.deepEqual(p.calls.filter(x=>x.startsWith('restore:')),
      tx.operations.slice(0,index).reverse().map(o=>'restore:'+o.id),'reverse restore '+stage);
    assert(!journal.events.some(e=>e.event==='MOCK_SEQUENCE_COMPLETE_NOT_ADMITTED'));
  }
});

test('lost acknowledgement at every stage restores its observed mutation and refuses automatic success',async()=>{
  for(let index=0;index<REQUIRED_STAGES.length;index++){
    const stage=REQUIRED_STAGES[index][0],tx=makeTx();
    const p=fakeProvider(tx,{loseAck:stage}),journal=new MemoryJournal();
    const out=await executeMockableSaga(tx,p.adapter,journal);
    assert.equal(out.status,'MOCKED_ABORT_RESTORED_NOT_ADMITTED','lost ack '+stage);
    assert.deepEqual(p.states,initial,'unacknowledged but observed writes must be fully reversed: '+stage);
    assert.deepEqual(p.calls.filter(x=>x.startsWith('restore:')),
      tx.operations.slice(0,index+1).reverse().map(o=>'restore:'+o.id),'restore after observed update '+stage);
    assert(!journal.events.some(e=>e.event==='MOCK_SEQUENCE_COMPLETE_NOT_ADMITTED'));
  }
});

test('missing provider pre-change readback aborts before mutation, or reverses partial work but retains uncertain status',async()=>{
  const tx=makeTx();
  const first=fakeProvider(tx,{failReadAt:1});
  const out1=await executeMockableSaga(tx,first.adapter,new MemoryJournal());
  assert.equal(out1.status,'READBACK_UNAVAILABLE_ABORT_NOT_ADMITTED');
  assert.deepEqual(first.calls,[]);
  assert.deepEqual(first.states,initial);
  const second=fakeProvider(tx,{failReadAt:3}),journal=new MemoryJournal();
  const out2=await executeMockableSaga(tx,second.adapter,journal);
  assert.equal(out2.status,'MANUAL_RECOVERY_REQUIRED','partial provider ambiguity remains manual even if rollback readback succeeds');
  assert.deepEqual(second.states,initial);
  assert.deepEqual(second.calls,['apply:db-revision','restore:db-revision']);
  assert(journal.events.some(e=>e.event==='PRECHANGE_READBACK_UNAVAILABLE'));
  assert(journal.events.some(e=>e.event==='RESTORED+READBACK'));
});

test('same-manifest closeout cannot succeed with wrong manifest, failed acceptance or mismatched durable receipt',async()=>{
  const admitted={status:'ADMITTED',manifestSha256:'a'.repeat(64),releaseId:'test-claim',evidenceFolderId:'private-test'};
  const result={manifestSha256:'a'.repeat(64),providerReadbacks:Object.fromEntries(targetIds.map(id=>[id,initial[id]])),
    acceptance:[{id:'iphone-score-reopen',status:'PASS'},{id:'stale-client',status:'PASS'}]};
  const good={async persistAndDownloadBack(_name,bytes){return{downloadBackVerified:true,sha256:digest(bytes)}}};
  assert.equal((await persistCloseout({admittedManifest:admitted,result:{...result,manifestSha256:'b'.repeat(64)}},good)).status,'PENDING');
  assert.equal((await persistCloseout({admittedManifest:admitted,result:{...result,acceptance:[{status:'FAIL'}]}},good)).status,'PENDING');
  const corrupt={async persistAndDownloadBack(){return{downloadBackVerified:true,sha256:'f'.repeat(64)}}};
  assert.equal((await persistCloseout({admittedManifest:admitted,result},corrupt)).status,'PENDING');
  const unreachable={async persistAndDownloadBack(){throw new Error('drive transport timeout')}};
  assert.equal((await persistCloseout({admittedManifest:admitted,result},unreachable)).status,'PENDING');
});


test('unavailable durable journal at start blocks all simulated provider stages',async()=>{
 const tx=makeTx(),p=fakeProvider(tx),j=new MemoryJournal();
 j.append=async()=>{throw Error('not durable')};
 const out=await executeMockableSaga(tx,p.adapter,j);
 assert.equal(out.status,'JOURNAL_UNAVAILABLE_NOT_ADMITTED');
 assert.deepEqual(p.states,initial);
 assert.deepEqual(p.calls,[]);
});


test('the fifth durable event failing forces conditional reverse order',async()=>{
 const tx=makeTx(),p=fakeProvider(tx),j=new MemoryJournal();
 const append=j.append.bind(j);let sequence=0;
 j.append=async e=>{sequence++;if(sequence===5)throw Error('unavailable');return append(e)};
 const out=await executeMockableSaga(tx,p.adapter,j);
 assert.equal(out.status,'MANUAL_RECOVERY_REQUIRED');
 assert.deepEqual(p.states,initial);
 assert.deepEqual(p.calls.filter(v=>v.startsWith('restore:')),['restore:db-rpc-expand','restore:db-revision']);
});


test('durable event interruption before apply, at completion, or during restore never accepts a release',async()=>{
 for(const [failAt,ackLoss,restores] of [[4,false,1],[16,false,7],[17,true,7]]){
  const tx=makeTx(),p=fakeProvider(tx,ackLoss?{loseAck:'db-revoke-old-writes'}:{}),j=new MemoryJournal();
  const append=j.append.bind(j);let count=0;
  j.append=async e=>{count++;if(count===failAt)throw Error('evidence unavailable');return append(e)};
  const out=await executeMockableSaga(tx,p.adapter,j);
  assert.equal(out.status,'MANUAL_RECOVERY_REQUIRED');
  assert.equal(p.calls.filter(v=>v.startsWith('restore:')).length,restores);
  assert.deepEqual(p.states,initial);
 }
});

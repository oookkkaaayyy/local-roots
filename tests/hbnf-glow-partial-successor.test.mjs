import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {RELEASE} from '../scripts/hbnf-two-target-execution-core.mjs';
import {SUCCESSOR,admitPartialSuccessor,executePartialSuccessor,validateSuccessorBaseline} from '../scripts/hbnf-glow-partial-successor.mjs';

const root=process.env.HBNF_RELEASE_ARTIFACT_DIR;
if(!root)throw Error('Set HBNF_RELEASE_ARTIFACT_DIR to exact private release artifacts');
const bytes=async n=>readFile(path.join(root,n));
const migrationBytes=RELEASE.migrations.map(([name])=>({name,bytes:execFileSync('unzip',['-p',path.join(root,'HBNF-scoring-candidate-7c559.zip'),`database/${name}`],{maxBuffer:1024*1024})}));
const evidence={authority:{manifest:await bytes('HBNF-two-target-admission-7c559-v3-ce4366.json'),parent:await bytes('hbnf-glow-d68334f67026.parent-admission.json'),admissionClaim:await bytes('hbnf-glow-d68334f67026.one-time-claim.json'),decision:await bytes('hbnf-glow-d68334f67026.decision.json'),approval:await bytes('HBNF-glow-d68334f67026-owner-install-authorization-2026-10-30.json'),candidate:await bytes('HBNF-scoring-candidate-7c559.zip'),rollback:await bytes('HBNF-scoring-rollback-v343.zip'),migrationBytes},failureReceipt:await bytes('hbnf-glow-d68334f67026.execution-failed.json'),attemptEvidence:await bytes('HBNF-Glow-install-attempt-2026-10-30.json')};

const now=()=>new Date().toISOString();
const gateSourceCommit='a'.repeat(40);
const cf=()=>({worker:'hbnf',versionId:RELEASE.baseline,percentage:100,rollbackRetained:true,cronRemoved:true,pollingDisabled:true,staticAssetsOnly:true,assetHashUnavailable:true,activeCustomDomain:true,glowRouteCovered:true,capturedUtc:now(),schedules:[],routeOwners:[...SUCCESSOR.cartRoutes],bindings:[]});
const grants={anon:{SELECT:true,INSERT:true,UPDATE:true},authenticated:{SELECT:true,INSERT:true,UPDATE:true}};
const db=(ledger=[{version:SUCCESSOR.migration1.version,name:SUCCESSOR.migration1.name}],added=0)=>({projectId:RELEASE.database,serverTime:now(),rlsEnabled:true,migrationLedger:ledger,functionEvidence:[...SUCCESSOR.functions,...SUCCESSOR.addedFunctions.slice(0,added)].map(x=>({...x})),revisionTriggerPresent:added>0,triggers:[...SUCCESSOR.triggers,...(added?['zzz_hbnf_enforce_league_state_revision']:[])],legacyGrants:structuredClone(grants),stateFingerprint:SUCCESSOR.stateFingerprint});
function fixture({failMigration,driftWorker=false,failCloseout=false}={}){
 const state={ledger:[{version:SUCCESSOR.migration1.version,name:SUCCESSOR.migration1.name}],added:0,worker:RELEASE.baseline,applied:[],deployed:false,restored:false,crons:[],storageWrites:[],files:new Map(),lock:null,readCount:0};
 const storage={async putOnce(name,b){if(failCloseout&&name.endsWith('.closeout.json'))throw Error('Drive closeout unavailable');const id=`drive-${state.files.size+1}`;state.files.set(id,Buffer.from(b));state.storageWrites.push(name);return{id,durable:true};},async download(id){return Buffer.from(state.files.get(id)||[]);}};
 const executionLock={async createExclusive(name,b){if(state.lock)return{created:false};state.lock={name,bytes:Buffer.from(b)};return{created:true,id:'github:feature/ref#'+name};},async read(){return Buffer.from(state.lock?.bytes||[]);}};
 const cloudflare={async read(){state.readCount++;if(driftWorker&&state.applied.length&&state.worker===RELEASE.baseline)return{...cf(),versionId:'drifted-version'};return{...cf(),versionId:state.worker};},async deployExact({zip,sha256,keepPollingDisabled}){assert.equal(sha256,RELEASE.candidate);assert.equal(keepPollingDisabled,true);assert.equal(zip.length,evidence.authority.candidate.length);state.deployed=true;state.worker='11111111-2222-4333-8444-555555555555';return{versionId:state.worker};},async verifyDeployed(){return{passed:true,assetCount:36,externallyRoutedAssetCount:10,assetMapSha256:'a'.repeat(64)};},async restoreV343({versionId,sha256,removeCron}){assert.equal(versionId,RELEASE.baseline);assert.equal(sha256,RELEASE.rollback);assert.equal(removeCron,true);state.worker=RELEASE.baseline;state.crons=[];state.restored=true;},};
 const supabase={async read(){return db(state.ledger,state.added);},async applyExactMigration({name,sha256}){state.applied.push(name);if(failMigration===name)throw Error('migration rejected by provider');assert.equal(sha256,SUCCESSOR.remaining.find(x=>x.name===name).sha256);const row={name:name.replace(/\.sql$/,''),version:state.ledger.at(-1).version==='20261030175907'?'20261030182610':'20261030182611'};state.ledger.push(row);state.added++;},async verifyInstalled(){return{...db(state.ledger,state.added),legacyGrantsPreserved:true,functionsAndTriggerVerified:true};}};
 const readbacks={cloudflare:cf(),supabase:db()};
 return{state,storage,executionLock,providers:{cloudflare,supabase},readbacks};
}
async function admit(f){return admitPartialSuccessor({evidence,readbacks:f.readbacks,storage:f.storage,executionLock:f.executionLock,gateSourceCommit});}

test('exact partial baseline passes; wrong provider version, function or stale read fails closed',()=>{
 assert.equal(validateSuccessorBaseline(fixture().readbacks),true);
 const badLedger=fixture().readbacks;badLedger.supabase.migrationLedger[0].version='20261029200450';assert.throws(()=>validateSuccessorBaseline(badLedger),/ledger/);
 const badFunction=fixture().readbacks;badFunction.supabase.functionEvidence[0].bodyMd5='bad';assert.throws(()=>validateSuccessorBaseline(badFunction),/function/);
 const stale=fixture().readbacks;stale.cloudflare.capturedUtc='2026-10-30T00:00:00.000Z';assert.throws(()=>validateSuccessorBaseline(stale),/stale/);
});

test('new trigger and CAS function hashes are derived from the exact approved migration bodies',()=>{
 const body=(sql,tag)=>{const re=tag==='$$'?/as \$\$(.*?)\$\$;/s:/as \$function\$(.*?)\$function\$/s;const match=sql.toString('utf8').match(re);assert.ok(match);return match[1];};
 const md5=x=>createHash('md5').update(x).digest('hex');
 assert.equal(md5(body(migrationBytes[1].bytes,'$$')),SUCCESSOR.addedFunctions[0].bodyMd5);
 assert.equal(md5(body(migrationBytes[2].bytes,'$function$')),SUCCESSOR.addedFunctions[1].bodyMd5);
});

test('successor admission stores PENDING manifest, PASS decision and one exclusive claim with independent readbacks',async()=>{
 const f=fixture(),a=await admit(f);assert.equal(a.status,'SUCCESSOR_ADMISSION_PASS');
 assert.equal(JSON.parse(a.admission.manifestBytesLocal.toString()).status,'PENDING');
 assert.equal(JSON.parse(a.admission.decisionBytesLocal.toString()).status,'SUCCESSOR_ADMISSION_PASS');
 assert.ok(a.admission.claim.githubRef.includes(SUCCESSOR.claimPath));
 await assert.rejects(()=>admit(f),/replayed|nonexclusive/);
 assert.equal(f.state.lock.name,SUCCESSOR.claimPath);
});

test('execution applies only migrations 2 and 3, records provider versions and preserves league_state',async()=>{
 const f=fixture(),a=await admit(f),r=await executePartialSuccessor({evidence,admission:a.admission,providers:f.providers,storage:f.storage,executionLock:f.executionLock,currentGateSourceCommit:gateSourceCommit});
 assert.equal(r.status,'INSTALLED_CLOSEOUT_PASS');assert.deepEqual(f.state.applied,SUCCESSOR.remaining.map(x=>x.name));
 assert.equal(f.state.deployed,true);assert.equal(r.closeout.supabase.preexistingMigration.reapplied,false);
 assert.deepEqual(r.closeout.supabase.appliedMigrations.map(x=>x.providerVersion),['20261030182610','20261030182611']);
 assert.equal(r.closeout.supabase.stateFingerprint,SUCCESSOR.stateFingerprint);
 assert.ok(r.closeout.manifestSha256===a.admission.manifestSha256);
});

test('a failed remaining migration is durably recorded and never deploys the Worker',async()=>{
 const f=fixture({failMigration:SUCCESSOR.remaining[0].name}),a=await admit(f);
 await assert.rejects(()=>executePartialSuccessor({evidence,admission:a.admission,providers:f.providers,storage:f.storage,executionLock:f.executionLock,currentGateSourceCommit:gateSourceCommit}),/SUCCESSOR FAILED/);
 assert.equal(f.state.deployed,false);assert.deepEqual(f.state.applied,[SUCCESSOR.remaining[0].name]);
 assert.ok(f.state.storageWrites.some(x=>x.includes('.failure-')));
});

test('target drift after SQL aborts deployment and records the actual partial database state',async()=>{
 const f=fixture({driftWorker:true}),a=await admit(f);
 await assert.rejects(()=>executePartialSuccessor({evidence,admission:a.admission,providers:f.providers,storage:f.storage,executionLock:f.executionLock,currentGateSourceCommit:gateSourceCommit}),/SUCCESSOR FAILED/);
 assert.equal(f.state.deployed,false);assert.equal(f.state.applied.length,2);assert.ok(f.state.storageWrites.some(x=>x.includes('.failure-')));
});

test('failed durable closeout restores v343 and explicitly clears Cron',async()=>{
 const f=fixture({failCloseout:true}),a=await admit(f);
 await assert.rejects(()=>executePartialSuccessor({evidence,admission:a.admission,providers:f.providers,storage:f.storage,executionLock:f.executionLock,currentGateSourceCommit:gateSourceCommit}),/SUCCESSOR FAILED/);
 assert.equal(f.state.restored,true);assert.equal(f.state.worker,RELEASE.baseline);assert.deepEqual(f.state.crons,[]);
 assert.ok(f.state.storageWrites.some(x=>x.includes('.failure-')));
});

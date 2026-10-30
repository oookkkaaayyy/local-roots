import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {RELEASE} from '../scripts/hbnf-two-target-execution-core.mjs';
import {SUCCESSOR} from '../scripts/hbnf-glow-partial-successor.mjs';
import {FINAL,admitFinalSuccessor,executeFinalSuccessor,validateFinalBaseline} from '../scripts/hbnf-glow-final-successor.mjs';

const root=process.env.HBNF_RELEASE_ARTIFACT_DIR;if(!root)throw Error('Set HBNF_RELEASE_ARTIFACT_DIR to the exact private release artifacts');
const bytes=n=>readFile(path.join(root,n));
const authority={manifest:await bytes('HBNF-two-target-admission-7c559-v3-ce4366.json'),parent:await bytes('hbnf-glow-d68334f67026.parent-admission.json'),admissionClaim:await bytes('hbnf-glow-d68334f67026.one-time-claim.json'),decision:await bytes('hbnf-glow-d68334f67026.decision.json'),approval:await bytes('HBNF-glow-d68334f67026-owner-install-authorization-2026-10-30.json'),candidate:await bytes('HBNF-scoring-candidate-7c559.zip'),rollback:await bytes('HBNF-scoring-rollback-v343.zip'),migrationBytes:RELEASE.migrations.map(([name])=>({name,bytes:execFileSync('unzip',['-p',path.join(root,'HBNF-scoring-candidate-7c559.zip'),`database/${name}`],{maxBuffer:1024*1024})}))};
const evidence={authority,firstFailure:await bytes('hbnf-glow-d68334f67026.execution-failed.json'),firstAttempt:await bytes('HBNF-Glow-install-attempt-2026-10-30.json'),priorSuccessorManifest:await bytes('prior-successor-manifest.json'),priorSuccessorDecision:await bytes('prior-successor-decision.json'),priorSuccessorClaim:await bytes('prior-successor-claim.json'),priorSuccessorFailure:await bytes('prior-successor-failure.json')};
const now=()=>new Date().toISOString(),gateSourceCommit='b'.repeat(40);
const cf=()=>({worker:'hbnf',versionId:RELEASE.baseline,percentage:100,rollbackRetained:true,cronRemoved:true,pollingDisabled:true,staticAssetsOnly:true,assetHashUnavailable:true,activeCustomDomain:true,glowRouteCovered:true,capturedUtc:now(),schedules:[],routeOwners:[...FINAL.cartRoutes],bindings:[]});
const grants={anon:{SELECT:true,INSERT:true,UPDATE:true},authenticated:{SELECT:true,INSERT:true,UPDATE:true}};
const db=(ledger=[{version:FINAL.first.version,name:FINAL.first.name},{version:FINAL.second.version,name:FINAL.second.name}],final=false)=>({projectId:RELEASE.database,serverTime:now(),rlsEnabled:true,migrationLedger:ledger,functionEvidence:[...FINAL.functions,...(final?[FINAL.finalFunction]:[])].map(f=>({...f})),revisionTriggerPresent:true,triggers:[...FINAL.triggers],legacyGrants:structuredClone(grants),stateFingerprint:FINAL.stateFingerprint});
function fixture({failMigration=false,driftWorker=false,failCloseout=false}={}){
 const s={ledger:[{version:FINAL.first.version,name:FINAL.first.name},{version:FINAL.second.version,name:FINAL.second.name}],worker:RELEASE.baseline,applied:[],final:false,deployed:false,restored:false,files:new Map(),lock:null,crons:[]};
 const storage={async putOnce(name,b){if(failCloseout&&name.endsWith('.closeout.json'))throw Error('remote closeout unavailable');const id=`drive-${s.files.size+1}`;s.files.set(id,Buffer.from(b));return{id,durable:true};},async download(id){return Buffer.from(s.files.get(id)||[]);}};
 const lock={async createExclusive(name,b){if(s.lock)return{created:false};s.lock={name,bytes:Buffer.from(b)};return{created:true,id:`oookkkaaayyy/local-roots@${gateSourceCommit}:`+name};},async read(){return Buffer.from(s.lock?.bytes||[]);}};
 const supabase={async read(){return db(s.ledger,s.final);},async applyExactMigration({name,sha256}){assert.equal(name,FINAL.remaining[0].name);assert.equal(sha256,FINAL.remaining[0].sha256);if(failMigration)throw Error('provider rejected final migration');s.applied.push(name);s.ledger.push({name:name.replace(/\.sql$/,''),version:'20261030190600'});s.final=true;},async verifyInstalled(){return{...db(s.ledger,s.final),legacyGrantsPreserved:true,functionsAndTriggerVerified:true};}};
 const cloudflare={async read(){return{...cf(),versionId:driftWorker&&s.applied.length? 'drifted-version':s.worker};},async deployExact({sha256,keepPollingDisabled}){assert.equal(sha256,RELEASE.candidate);assert.equal(keepPollingDisabled,true);s.deployed=true;s.worker='12345678-1234-4234-9234-123456789abc';return{versionId:s.worker};},async verifyDeployed(){return{passed:true,assetCount:36,externallyRoutedAssetCount:10,assetMapSha256:'a'.repeat(64)};},async restoreV343({versionId,sha256,removeCron}){assert.equal(versionId,RELEASE.baseline);assert.equal(sha256,RELEASE.rollback);assert.equal(removeCron,true);s.worker=RELEASE.baseline;s.crons=[];s.restored=true;}};
 return{state:s,storage,executionLock:lock,providers:{cloudflare,supabase},readbacks:{cloudflare:cf(),supabase:db()}};
}
async function admit(f){return admitFinalSuccessor({evidence,readbacks:f.readbacks,storage:f.storage,executionLock:f.executionLock,gateSourceCommit});}

test('real two-migration partial baseline accepts exact provider versions and service_role default ACL',()=>{
 assert.equal(validateFinalBaseline({cloudflare:cf(),supabase:db()}),true);
 const reversed=db();reversed.migrationLedger=reversed.migrationLedger.map(x=>({name:x.name,version:x.version}));assert.equal(validateFinalBaseline({cloudflare:cf(),supabase:reversed}),true);
 const bad=db();bad.functionEvidence[2].serviceRoleExecute=false;assert.throws(()=>validateFinalBaseline({cloudflare:cf(),supabase:bad}),/function evidence/);
 const wrong=db();wrong.migrationLedger[1].version='20261029203741';assert.throws(()=>validateFinalBaseline({cloudflare:cf(),supabase:wrong}),/ledger/);
 const stale=db();stale.serverTime='2026-10-30T00:00:00Z';assert.throws(()=>validateFinalBaseline({cloudflare:cf(),supabase:stale}),/stale/);
});

test('one-time final admission binds the second partial baseline and downloads all records',async()=>{
 const f=fixture(),a=await admit(f);assert.equal(a.status,'FINAL_SUCCESSOR_ADMISSION_PASS');assert.equal(JSON.parse(a.admission.manifestBytesLocal).status,'PENDING');assert.equal(a.admission.claim.githubRef.includes(FINAL.claimPath),true);await assert.rejects(()=>admit(f),/exclusive|exists/);
});

test('execution applies only migration 3, verifies provider identity and completes same-manifest closeout',async()=>{
 const f=fixture(),a=await admit(f),r=await executeFinalSuccessor({evidence,admission:a.admission,providers:f.providers,storage:f.storage,executionLock:f.executionLock,currentGateSourceCommit:gateSourceCommit});
 assert.equal(r.status,'INSTALLED_CLOSEOUT_PASS');assert.deepEqual(f.state.applied,[FINAL.remaining[0].name]);assert.deepEqual(r.closeout.supabase.appliedMigration,{name:FINAL.remaining[0].name,sha256:FINAL.remaining[0].sha256,providerVersion:'20261030190600',state:'VERIFIED'});assert.equal(f.state.deployed,true);assert.equal(r.closeout.manifestSha256,a.admission.manifestSha256);
});

test('final SQL failure writes a durable failure and never deploys Cloudflare',async()=>{
 const f=fixture({failMigration:true}),a=await admit(f);await assert.rejects(()=>executeFinalSuccessor({evidence,admission:a.admission,providers:f.providers,storage:f.storage,executionLock:f.executionLock,currentGateSourceCommit:gateSourceCommit}),/FINAL SUCCESSOR FAILED/);assert.equal(f.state.deployed,false);assert.ok([...f.state.files.keys()].length>=4);
});

test('target drift after migration blocks deployment and records additive partial state',async()=>{
 const f=fixture({driftWorker:true}),a=await admit(f);await assert.rejects(()=>executeFinalSuccessor({evidence,admission:a.admission,providers:f.providers,storage:f.storage,executionLock:f.executionLock,currentGateSourceCommit:gateSourceCommit}),/FINAL SUCCESSOR FAILED/);assert.equal(f.state.deployed,false);assert.equal(f.state.applied.length,1);
});

test('failed final closeout restores v343 and explicitly clears Cron',async()=>{
 const f=fixture({failCloseout:true}),a=await admit(f);await assert.rejects(()=>executeFinalSuccessor({evidence,admission:a.admission,providers:f.providers,storage:f.storage,executionLock:f.executionLock,currentGateSourceCommit:gateSourceCommit}),/FINAL SUCCESSOR FAILED/);assert.equal(f.state.restored,true);assert.equal(f.state.worker,RELEASE.baseline);assert.deepEqual(f.state.crons,[]);
});

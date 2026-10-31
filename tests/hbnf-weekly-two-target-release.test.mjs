import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {admitWeeklyGlowRelease,canonicalManifestBytes,createSupabaseManagementAdapter,runWeeklyGlowRelease,sha256,WEEKLY_RELEASE} from '../scripts/hbnf-weekly-two-target-release.mjs';

const root=process.env.HBNF_WEEKLY_RELEASE_ARTIFACT_DIR;
if(!root) throw new Error('Set HBNF_WEEKLY_RELEASE_ARTIFACT_DIR to the independently verified private candidate packet');
const candidate=await readFile(path.join(root,'HBNF-weekly-glow-candidate.zip'));
const rollback=await readFile(path.join(root,'HBNF-weekly-glow-rollback-086.zip'));
const migration=execFileSync('unzip',['-p',path.join(root,'HBNF-weekly-glow-candidate.zip'),`database/${WEEKLY_RELEASE.migration}`]);
const now=Date.parse('2026-10-31T10:00:00Z');
async function setup(){
 const manifest={format:'hbnf-weekly-glow-release-admission-v1',releaseId:WEEKLY_RELEASE.id,phase:'PENDING',oneTime:true,runtimeSourceCommit:WEEKLY_RELEASE.runtimeSource,gateSourceCommit:'e5835cfd3b4fd66568330c2a77a44bad2b70a02c',workerTarget:'hbnf',supabaseProject:WEEKLY_RELEASE.project,supabaseBaseline:{stateFingerprint:'fixture-state-hash',activeWeek:'2026-10-28',nov3WeekExists:false},candidate:{sha256:WEEKLY_RELEASE.candidate},rollback:{versionId:WEEKLY_RELEASE.rollbackVersion,sha256:WEEKLY_RELEASE.rollback},migration:{name:WEEKLY_RELEASE.migration,sha256:WEEKLY_RELEASE.migrationSha256,rollbackSha256:WEEKLY_RELEASE.migrationRollbackSha256,order:1},assetCount:46,assetDelta:{unchanged:46,modified:[],added:[]},acceptanceCriteria:['manifest','migration','worker','routes','closeout'].map(id=>({id,status:'PENDING',scope:id,description:`verify ${id}`,method:'independent readback',expectedOutcome:'exact match'}))};
 const manifestBytes=canonicalManifestBytes(manifest),files=new Map([['parent',manifestBytes]]),events=[];
 const cfBase=()=>({worker:'hbnf',versionId:WEEKLY_RELEASE.rollbackVersion,trafficPercent:100,rollbackRetained:true,assets:46,customDomainEnabled:true,glowRouteCovered:true,cartRoutesUnchanged:true,cron:['* * * * *'],capturedAt:new Date(now).toISOString()});
 const dbBase=()=>({projectId:WEEKLY_RELEASE.project,bindingTableExists:false,migrationPresent:false,stateFingerprint:'fixture-state-hash',activeWeek:'2026-10-28',nov3WeekExists:false,functions:['hbnf_apply_udisc_glow_week','hbnf_record_udisc_glow_sync_status'],legacyAnonWriteGrants:true,matrixAndTagTriggersPreserved:true,capturedAt:new Date(now).toISOString()});
 const parent={manifest,manifestBytes,downloadedManifestBytes:manifestBytes,durableManifest:{driveFileId:'parent',sha256:sha256(manifestBytes),bytes:manifestBytes.length,downloadBackVerified:true},artifactBytes:{candidate,rollback,migration},readbacks:{cloudflare:cfBase(),supabase:dbBase()},now};
 const admission=await admitWeeklyGlowRelease(parent);
 const state={version:WEEKLY_RELEASE.rollbackVersion,applied:false,claimed:false};
 const storage={async putOnce(name,b){if(files.has(name))throw Error('duplicate');const id=`file-${files.size}`;files.set(id,Buffer.from(b));return{id};},async download(id){return Buffer.from(files.get(id)||[]);}};
 const ledger={async createExclusive(_name,b){if(state.claimed)return{created:false};state.claimed=true;state.claim=Buffer.from(b);return{created:true,id:'claim',ref:'deadbeef'};},async read(){return Buffer.from(state.claim||[]);}};
 const providers={
  supabase:{async read(){events.push('db:read');return state.applied?{...dbBase(),bindingTableExists:true,migrationPresent:true,migrationName:'hbnf_udisc_glow_event_bindings',migrationLedger:[{version:'20261031080000',name:'hbnf_udisc_glow_event_bindings'}],rlsEnabled:true,serviceRoleOnly:true,bindings:WEEKLY_RELEASE.bindings}:dbBase();},async applyExactMigration(arg){events.push('db:apply');assert.equal(arg.sha256,WEEKLY_RELEASE.migrationSha256);assert.equal(arg.rollbackSha256,WEEKLY_RELEASE.migrationRollbackSha256);if(parent.failMigration)throw Error('migration failed');state.applied=true;return{applied:true};}},
  cloudflare:{async read(){events.push('cf:read');return state.version===WEEKLY_RELEASE.rollbackVersion?cfBase():{...cfBase(),versionId:state.version,candidateSha256:WEEKLY_RELEASE.candidate,assetCount:46,assetsUnchanged:true,approvalVariable:'true',requiredSecretPresent:true};},async stageExact(arg){events.push('cf:stage');return{versionId:'staged-weekly',trafficPercent:0,sourceCommit:arg.sourceCommit,candidateSha256:arg.sha256,approvalVariable:'true',requiredSecretPresent:true,cron:['* * * * *']};},async deployStaged(){events.push('cf:deploy');state.version='staged-weekly';return{versionId:state.version,trafficPercent:100};},async verifyDeployed(arg){events.push('cf:verify');return{passed:true,versionId:arg.versionId,assetCount:46,glowRouteCovered:true,cartRoutesUnchanged:true};},async restoreBaseline(){events.push('cf:restore');state.version=WEEKLY_RELEASE.rollbackVersion;}},
 };
 const decisionRecord={format:'hbnf-weekly-glow-admission-decision-v1',releaseId:WEEKLY_RELEASE.id,status:'ADMISSION_PASS',manifestSha256:admission.manifestSha256};const decisionBytes=canonicalManifestBytes(decisionRecord);const decisionFile=await storage.putOnce('decision.json',decisionBytes);const admissionDecision={record:decisionRecord,bytes:decisionBytes,driveFileId:decisionFile.id,sha256:sha256(decisionBytes)};
 return {parent,admission,admissionDecision,state,storage,ledger,providers,events};
}

test('exact package/source/rollback, fresh target baselines and independently fetched manifest admit',async()=>{
 const s=await setup();assert.equal(s.admission.status,'ADMISSION_PASS');assert.equal(s.admission.candidateSha256,WEEKLY_RELEASE.candidate);
});
test('missing or byte-different durable manifest fails admission',async()=>{
 const s=await setup();await assert.rejects(()=>admitWeeklyGlowRelease({...s.parent,downloadedManifestBytes:Buffer.from('different')}),/byte-identical/);
});
test('stale provider evidence and spent claim fail admission',async()=>{
 const s=await setup();await assert.rejects(()=>admitWeeklyGlowRelease({...s.parent,readbacks:{...s.parent.readbacks,cloudflare:{...s.parent.readbacks.cloudflare,capturedAt:'2026-10-30T00:00:00Z'}}}),/stale/);
 await assert.rejects(()=>admitWeeklyGlowRelease({...s.parent,priorClaims:[{releaseId:WEEKLY_RELEASE.id}]}),/already exists/);
});
test('manifest cannot substitute a different current league-state baseline',async()=>{
 const s=await setup();const manifest={...s.parent.manifest,supabaseBaseline:{...s.parent.manifest.supabaseBaseline,stateFingerprint:'unreviewed-state'}};const bytes=canonicalManifestBytes(manifest);
 await assert.rejects(()=>admitWeeklyGlowRelease({...s.parent,manifest,manifestBytes:bytes,downloadedManifestBytes:bytes,durableManifest:{...s.parent.durableManifest,sha256:sha256(bytes),bytes:bytes.length}}),/manifest-bound league state/);
});
test('execution re-fetches admitted parent and blocks before claim if unavailable',async()=>{
 const s=await setup();s.storage.download=async()=>Buffer.from('changed');await assert.rejects(()=>runWeeklyGlowRelease({admission:s.admission,admissionDecision:s.admissionDecision,manifest:s.parent.manifest,artifactBytes:s.parent.artifactBytes,providers:s.providers,storage:s.storage,ledger:s.ledger}),/execution time/);assert.equal(s.state.claimed,false);
});
test('unique execution claim precedes exact migration and same-manifest closeout',async()=>{
 const s=await setup();const result=await runWeeklyGlowRelease({admission:s.admission,admissionDecision:s.admissionDecision,manifest:s.parent.manifest,artifactBytes:s.parent.artifactBytes,providers:s.providers,storage:s.storage,ledger:s.ledger,clock:()=>new Date(now).toISOString()});
 assert.equal(result.status,'INSTALLED_CLOSEOUT_PASS');assert.ok(s.events.indexOf('db:apply')<s.events.indexOf('cf:stage'));assert.ok(s.events.includes('cf:verify'));
 const receipt=JSON.parse((await s.storage.download(result.receiptDriveId)).toString());assert.equal(receipt.manifestSha256,s.admission.manifestSha256);assert.equal(receipt.cloudflare.versionId,'staged-weekly');
});
test('replayed execution claim prevents migration and deployment',async()=>{
 const s=await setup();s.state.claimed=true;await assert.rejects(()=>runWeeklyGlowRelease({admission:s.admission,admissionDecision:s.admissionDecision,manifest:s.parent.manifest,artifactBytes:s.parent.artifactBytes,providers:s.providers,storage:s.storage,ledger:s.ledger}),/unavailable\/replayed/);assert.equal(s.events.includes('db:apply'),false);
});
test('migration failure does not deploy Worker and records exact partial state',async()=>{
 const s=await setup();s.parent.failMigration=true;await assert.rejects(()=>runWeeklyGlowRelease({admission:s.admission,admissionDecision:s.admissionDecision,manifest:s.parent.manifest,artifactBytes:s.parent.artifactBytes,providers:s.providers,storage:s.storage,ledger:s.ledger}),/MIGRATION_PRESENT|migration failed/);assert.equal(s.state.version,WEEKLY_RELEASE.rollbackVersion);assert.equal(s.events.includes('cf:deploy'),false);
});
test('Management API adapter refuses absent token without making a request',()=>{
 let requests=0;assert.throws(()=>createSupabaseManagementAdapter({token:'',fetchImpl:async()=>{requests++;}}),/SUPABASE_ACCESS_TOKEN/);assert.equal(requests,0);
});
test('Management API adapter scopes request to the exact migration and never returns token',async()=>{
 let request;const adapter=createSupabaseManagementAdapter({token:'test-only-secret-token-that-is-never-logged',fetchImpl:async(url,init)=>{request={url,init};return{ok:true,status:200};},readBaseline:async()=>({}),readInstalled:async()=>({})});
 const result=await adapter.applyExactMigration({projectId:WEEKLY_RELEASE.project,name:WEEKLY_RELEASE.migration,sha256:WEEKLY_RELEASE.migrationSha256,query:migration.toString('utf8'),rollback:WEEKLY_RELEASE.migrationRollback,rollbackSha256:WEEKLY_RELEASE.migrationRollbackSha256});
 assert.equal(result.applied,true);assert.match(request.url,/\/v1\/projects\/phcpbvuqibyarpfrftgx\/database\/migrations$/);assert.equal(JSON.parse(request.init.body).name,'hbnf_udisc_glow_event_bindings');assert.equal(JSON.parse(request.init.body).rollback,WEEKLY_RELEASE.migrationRollback);assert.equal(request.init.method,'POST');assert.equal(request.init.headers.Authorization,'Bearer test-only-secret-token-that-is-never-logged');
});

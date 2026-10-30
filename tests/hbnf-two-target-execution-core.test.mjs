import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {RELEASE,verifyExistingAuthority,runAdmittedHbnfExecution} from '../scripts/hbnf-two-target-execution-core.mjs';

const root=process.env.HBNF_RELEASE_ARTIFACT_DIR;
if(!root) throw new Error('Set HBNF_RELEASE_ARTIFACT_DIR to exact SHA-verified private release evidence; no private fixture is committed');
async function input(){
 const bytes=async name=>readFile(path.join(root,name));
 return {
   manifest:await bytes('HBNF-two-target-admission-7c559-v3-ce4366.json'),
   parent:await bytes('hbnf-glow-d68334f67026.parent-admission.json'),
   admissionClaim:await bytes('hbnf-glow-d68334f67026.one-time-claim.json'),
   decision:await bytes('hbnf-glow-d68334f67026.decision.json'),
   approval:await bytes('HBNF-glow-d68334f67026-owner-install-authorization-2026-10-30.json'),
   candidate:await bytes('HBNF-scoring-candidate-7c559.zip'),
   rollback:await bytes('HBNF-scoring-rollback-v343.zip'),
   migrationBytes:await Promise.all(RELEASE.migrations.map(async ([name])=>({name,bytes:await bytes(`hbnf-two-target-exec-review/fixtures/database/${name}`)}))),
 };
}
const evidence=await input();
function make(overrides={}){
 const state={applied:[],version:RELEASE.baseline,cronRemoved:false,claimed:false,events:[],dataChanged:false};
 const files=new Map();let executionBytes;
 const storage={
   async putOnce(name,bytes){state.events.push(`drive:${name}`);if(overrides.failCloseout&&name.endsWith('.closeout.json'))throw Error('remote Drive down');if(files.has(name))throw Error('Drive duplicate');files.set(name,Buffer.from(bytes));return{id:name,exclusive:true};},
   async download(id){return Buffer.from(files.get(id)||'');},
 };
 const executionLock={
   async createExclusive(name,bytes){state.events.push('claim');if(overrides.replay||state.claimed)return{created:false};state.claimed=true;executionBytes=Buffer.from(bytes);return{created:true,id:name};},
   async read(){return Buffer.from(executionBytes||'');},
 };
 const cloudflare={
   async read(){state.events.push('cloudflare:read');return {worker:'hbnf',versionId:overrides.badBaseline&&state.version===RELEASE.baseline?'not-the-baseline':state.version,percentage:100,rollbackRetained:true,pollingDisabled:true,cronRemoved:state.cronRemoved};},
   async deployExact(){state.events.push('cloudflare:deploy');state.version='11111111-2222-4333-8444-555555555555';if(overrides.failDeploy)throw Error('timeout after Worker mutation');return{versionId:state.version};},
   async restoreV343({removeCron}){state.events.push('cloudflare:restore');assert.equal(removeCron,true);state.version=RELEASE.baseline;state.cronRemoved=true;},
   async verifyDeployed(){state.events.push('cloudflare:verify');if(overrides.failVerify)throw Error('worker assets wrong');},
 };
 const supabase={
   async read(){state.events.push('supabase:read');return{projectId:RELEASE.database,tableExists:true,rlsEnabled:true,migrations:[...state.applied],candidateFunctions:[],triggers:['hbnf_matrix_vnext_capture_after_state_change','hbnf_project_current_tags_into_league_state','trg_hbnf_matrix_sync'],grants:{anon:{SELECT:true,INSERT:true,UPDATE:true},authenticated:{SELECT:true,INSERT:true,UPDATE:true}}};},
   async applyExactMigration({name}){state.events.push(`supabase:apply:${name}`);if(overrides.failMigration===name)throw Error('migration request failed');state.applied.push(name.replace(/\.sql$/,''));},
   async verifyInstalled(){state.events.push('supabase:verify');},
 };
 const options={evidence,providers:{cloudflare,supabase},storage,executionLock,environment:{wranglerLogWriteVerified:!overrides.badDisk,scratchWriteVerified:true},clock:()=> '2026-10-30T12:00:00Z'};
 return{state,files,options};
}
test('immutable supplied parent, claim, decision, owner approval and exact three migrations are bound',()=>{
 assert.equal(verifyExistingAuthority(evidence).candidateSha256,RELEASE.candidate);
});
test('tampered source or candidate fails before any claim/mutation',async()=>{
 const f=make();await assert.rejects(()=>runAdmittedHbnfExecution({...f.options,evidence:{...evidence,candidate:Buffer.concat([evidence.candidate,Buffer.from('x')])}}),/candidate or rollback/);assert.equal(f.state.events.length,0);
});
test('unwritable Mac Wrangler log prevents any claim or provider mutation',async()=>{
 const f=make({badDisk:true});await assert.rejects(()=>runAdmittedHbnfExecution(f.options),/filesystem insufficiently writable/);assert.equal(f.state.events.length,0);
});
test('provider baseline drift prevents claim',async()=>{
 const f=make({badBaseline:true});await assert.rejects(()=>runAdmittedHbnfExecution(f.options),/Cloudflare live baseline/);assert.equal(f.state.claimed,false);
});
test('replayed execution claim fails before production mutation',async()=>{
 const f=make({replay:true});await assert.rejects(()=>runAdmittedHbnfExecution(f.options),/replayed, nonexclusive/);assert.equal(f.state.events.filter(x=>x.includes(':apply:')).length,0);
});
test('exact three migrations, Worker deployment, remote closeout complete',async()=>{
 const f=make();const result=await runAdmittedHbnfExecution(f.options);assert.equal(result.status,'INSTALLED_CLOSEOUT_PASS');assert.equal(f.state.applied.length,3);assert.equal(f.state.version,'11111111-2222-4333-8444-555555555555');assert.ok(f.state.events.indexOf('claim')<f.state.events.findIndex(x=>x.includes(':apply:')));assert.ok(f.files.has(`${RELEASE.id}.closeout.json`));
});
test('DB migration failure persists partial-state receipt and never deploys Worker',async()=>{
 const f=make({failMigration:RELEASE.migrations[1][0]});await assert.rejects(()=>runAdmittedHbnfExecution(f.options),/migration request failed/);assert.equal(f.state.version,RELEASE.baseline);assert.equal(f.state.events.includes('cloudflare:deploy'),false);const result=JSON.parse(f.files.get(`${RELEASE.id}.execution-failed.json`));assert.equal(result.additiveDatabaseMayRemain,true);assert.equal(result.dbMigrationsAttempted,2);
});
test('Worker mutation then timeout restores v343 and removes Cron',async()=>{
 const f=make({failDeploy:true});await assert.rejects(()=>runAdmittedHbnfExecution(f.options),/V343_RESTORED_CRON_REMOVED/);assert.equal(f.state.version,RELEASE.baseline);assert.equal(f.state.cronRemoved,true);
});
test('post-install closeout Drive write failure triggers rollback and persists failure',async()=>{
 const f=make({failCloseout:true});await assert.rejects(()=>runAdmittedHbnfExecution(f.options),/remote Drive down/);assert.equal(f.state.version,RELEASE.baseline);assert.equal(f.state.cronRemoved,true);assert.ok(f.files.has(`${RELEASE.id}.execution-failed.json`));
});

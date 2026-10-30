#!/usr/bin/env node
// Exact-source bridge runner for the one-migration final successor. Connected
// MCP operations are requested over JSONL; credentials never leave providers.
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {RELEASE} from './hbnf-two-target-execution-core.mjs';
import {SUCCESSOR} from './hbnf-glow-partial-successor.mjs';
import {FINAL,admitFinalSuccessor,executeFinalSuccessor,createFinalSupabaseProvider} from './hbnf-glow-final-successor.mjs';
import {createGitHubExecutionLockAdapter,createGoogleDriveEvidenceStore,createWranglerAdapter,createHbnfPublicAssetVerifier,resolvePinnedWrangler,createPinnedWranglerRunner,verifyWritableCapacity} from './hbnf-two-target-provider-adapters.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');const req=new Map();let id=1;
const rl=createInterface({input:process.stdin,crlfDelay:Infinity});rl.on('line',line=>{try{const m=JSON.parse(line),r=req.get(m.id);if(r){req.delete(m.id);r(m.result);}}catch{}});
function tool(method,args){const n=id++;return new Promise((resolve,reject)=>{req.set(n,resolve);process.stdout.write(`${JSON.stringify({type:'tool',id:n,method,args})}\n`);setTimeout(()=>{if(req.has(n)){req.delete(n);reject(Error(`bridge timed out: ${method}`));}},120000);});}
function parseArgs(a){const o={};for(let i=0;i<a.length;i++){if(a[i]==='--execute')o.execute=true;else if(a[i]==='--artifacts')o.artifacts=a[++i];else if(a[i]==='--gate-source')o.gateSource=a[++i];else throw Error('unknown argument');}if(!o.execute||!path.isAbsolute(o.artifacts||'')||!/^[0-9a-f]{40}$/.test(o.gateSource||''))throw Error('usage: --execute --artifacts ABSOLUTE_DIR --gate-source FULL_40_HEX');return o;}
function driveBytes(r){if(typeof r?.structuredContent?.b64_string!=='string')throw Error('Drive response omitted raw bytes');return Buffer.from(r.structuredContent.b64_string,'base64');}
function githubBytes(r){const b=r?.structuredContent?.content;if(typeof b==='string')return Buffer.from(b,'base64');throw Error('GitHub response omitted base64 file bytes');}
function migrations(candidate){return RELEASE.migrations.map(([name])=>({name,bytes:execFileSync('unzip',['-p',candidate,`database/${name}`],{maxBuffer:1024*1024})}));}
async function main(){
 const {artifacts:root,gateSource}=parseArgs(process.argv.slice(2));await verifyWritableCapacity({minimumBytes:64*1024*1024});
 const names={manifest:'HBNF-two-target-admission-7c559-v3-ce4366.json',parent:'hbnf-glow-d68334f67026.parent-admission.json',admissionClaim:'hbnf-glow-d68334f67026.one-time-claim.json',decision:'hbnf-glow-d68334f67026.decision.json',approval:'HBNF-glow-d68334f67026-owner-install-authorization-2026-10-30.json',candidate:'HBNF-scoring-candidate-7c559.zip',rollback:'HBNF-scoring-rollback-v343.zip',firstFailure:'hbnf-glow-d68334f67026.execution-failed.json',firstAttempt:'HBNF-Glow-install-attempt-2026-10-30.json',priorSuccessorManifest:'prior-successor-manifest.json',priorSuccessorDecision:'prior-successor-decision.json',priorSuccessorClaim:'prior-successor-claim.json',priorSuccessorFailure:'prior-successor-failure.json'};
 const local={};for(const[k,n]of Object.entries(names))local[k]=await readFile(path.join(root,n));const authority={manifest:local.manifest,parent:local.parent,admissionClaim:local.admissionClaim,decision:local.decision,approval:local.approval,candidate:local.candidate,rollback:local.rollback,migrationBytes:migrations(path.join(root,names.candidate))};
 const evidence={authority,firstFailure:local.firstFailure,firstAttempt:local.firstAttempt,priorSuccessorManifest:local.priorSuccessorManifest,priorSuccessorDecision:local.priorSuccessorDecision,priorSuccessorClaim:local.priorSuccessorClaim,priorSuccessorFailure:local.priorSuccessorFailure};
 const remote=[['1a0cW5807z8hwYK0_rwz5UHKVFVp4fE-G',local.manifest],['1JsTUYjiqak3CLpvjnlbeHOZ1kGO25hOd',local.parent],['1f6laQOsFy2Fa8ALA_sk_Avok72tRttx8',local.admissionClaim],['129mfnPaVt7HaYgVofV0RyxQGyRgFQmRd',local.decision],['1au6vCaUdEjsc3HSGyQRq2iwNv5qmJnlI',local.approval],[SUCCESSOR.failureDriveId,local.firstFailure],[SUCCESSOR.attemptDriveId,local.firstAttempt],[FINAL.prior.manifestId,local.priorSuccessorManifest],[FINAL.prior.decisionId,local.priorSuccessorDecision],[FINAL.prior.claimId,local.priorSuccessorClaim],[FINAL.prior.failureId,local.priorSuccessorFailure],[SUCCESSOR.priorExecutionClaimId,null]];
 for(const[driveId,expected]of remote){const r=await tool('drive.fetch',{id:driveId,download_raw_file:true,include_base64:true});const b=driveBytes(r);if(expected&&!b.equals(expected))throw Error(`remote authority differs from local evidence: ${driveId}`);if(driveId===SUCCESSOR.priorExecutionClaimId&&sha(b)!==SUCCESSOR.priorExecutionClaimSha256)throw Error('original consumed execution-claim hash mismatch');}
 const github={create_file:a=>tool('github.create_file',a),fetch_file:a=>tool('github.fetch_file',a)};
 const oldClaim=await tool('github.fetch_file',{repository_full_name:'oookkkaaayyy/local-roots',path:SUCCESSOR.claimPath,ref:FINAL.prior.githubClaimCommit,encoding:'base64'});if(!githubBytes(oldClaim).equals(local.priorSuccessorClaim))throw Error('prior successor GitHub claim differs from durable Drive copy');
 const drive={upload_file:a=>tool('drive.upload_file',a),fetch:id=>tool('drive.fetch',{id,download_raw_file:true,include_base64:true})};
 const supabase={execute_sql:a=>tool('supabase.execute_sql',a),apply_migration:a=>tool('supabase.apply_migration',a)};
 const lock=createGitHubExecutionLockAdapter({createFile:github.create_file,fetchFile:github.fetch_file,claimPath:FINAL.claimPath});
 const storage=createGoogleDriveEvidenceStore({uploadFile:drive.upload_file,fetchFile:drive.fetch,writeLocal:async(n,b)=>{const d=await mkdtemp(path.join(tmpdir(),'hbnf-final-'));const f=path.join(d,n.replace(/[^A-Za-z0-9._-]/g,'_'));await writeFile(f,b,{flag:'wx'});return f;},cleanupLocal:async f=>rm(path.dirname(f),{recursive:true,force:true})});
 const db=createFinalSupabaseProvider({executeSql:supabase.execute_sql,applyMigration:supabase.apply_migration});
 const wrangler=await resolvePinnedWrangler(),run=createPinnedWranglerRunner({binary:wrangler}),candidatePath=path.join(root,names.candidate),rollbackPath=path.join(root,names.rollback);
 const cf=createWranglerAdapter({run,candidatePath,rollbackPath,verifyRoutes:createHbnfPublicAssetVerifier({candidatePath,origin:'https://hbnightflyers.com'})});
 const [cloudflare,supabaseBaseline]=await Promise.all([cf.read(),db.read()]);
 const {admission}=await admitFinalSuccessor({evidence,readbacks:{cloudflare,supabase:supabaseBaseline},storage,executionLock:lock,gateSourceCommit:gateSource});
 const outcome=await executeFinalSuccessor({evidence,admission,providers:{cloudflare:cf,supabase:db},storage,executionLock:lock,currentGateSourceCommit:gateSource});
 process.stdout.write(`${JSON.stringify({type:'result',status:outcome.status,successorId:FINAL.id,manifestDriveId:admission.manifestDriveId,manifestSha256:admission.manifestSha256,decisionDriveId:admission.decisionDriveId,decisionSha256:admission.decisionSha256,executionClaimGithubRef:admission.claim.githubRef,executionClaimDriveId:admission.claim.driveId,executionClaimSha256:admission.claim.sha256,closeoutDriveId:outcome.driveId,closeoutSha256:outcome.sha256,closeoutBytes:outcome.bytes,installedWorkerVersion:outcome.closeout.cloudflare.versionId,appliedMigration:outcome.closeout.supabase.appliedMigration})}\n`);
}
main().then(()=>rl.close()).catch(e=>{process.stdout.write(`${JSON.stringify({type:'result',status:'BLOCKED_OR_FAILED',error:e.message})}\n`);process.exitCode=2;rl.close();});

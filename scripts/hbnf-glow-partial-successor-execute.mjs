#!/usr/bin/env node
// Live bridge runner for the narrowly scoped successor. Provider actions are
// requested through JSONL stdin/stdout so the connected MCP tools execute only
// when the tested successor gate asks for them. Never prints credentials.
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {RELEASE} from './hbnf-two-target-execution-core.mjs';
import {SUCCESSOR,admitPartialSuccessor,executePartialSuccessor,createPartialSupabaseProvider} from './hbnf-glow-partial-successor.mjs';
import {createGitHubExecutionLockAdapter,createGoogleDriveEvidenceStore,createWranglerAdapter,createHbnfPublicAssetVerifier,resolvePinnedWrangler,createPinnedWranglerRunner,verifyWritableCapacity} from './hbnf-two-target-provider-adapters.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const requests=new Map();let nextId=1;
const input=createInterface({input:process.stdin,crlfDelay:Infinity});
input.on('line',line=>{try{const m=JSON.parse(line);const resolve=requests.get(m.id);if(resolve){requests.delete(m.id);resolve(m.result);}}catch{}});
function tool(method,args){const id=nextId++;return new Promise((resolve,reject)=>{requests.set(id,resolve);process.stdout.write(`${JSON.stringify({type:'tool',id,method,args})}\n`);setTimeout(()=>{if(requests.has(id)){requests.delete(id);reject(Error(`tool bridge timeout: ${method}`));}},120_000);});}
function usage(){throw Error('usage: node scripts/hbnf-glow-partial-successor-execute.mjs --execute --artifacts ABSOLUTE_DIR --gate-source FULL_40_HEX');}
function parseArgs(argv){const result={};for(let i=0;i<argv.length;i++){if(argv[i]==='--execute')result.execute=true;else if(argv[i]==='--artifacts')result.artifacts=argv[++i];else if(argv[i]==='--gate-source')result.gateSource=argv[++i];else usage();}if(!result.execute||!path.isAbsolute(result.artifacts||'')||!/^[0-9a-f]{40}$/.test(result.gateSource||''))usage();return result;}
function githubResultBytes(r){const b=r?.structuredContent?.content||r?.structuredContent?.content_base64;if(typeof b==='string')return Buffer.from(b,'base64');const t=(r?.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');const m=t.match(/"content"\s*:\s*"([A-Za-z0-9+/=\n]+)"/);if(m)return Buffer.from(m[1].replace(/\n/g,''),'base64');throw Error('GitHub claim bytes absent from provider readback');}
function driveBytes(r){const b=r?.structuredContent?.b64_string;if(typeof b!=='string')throw Error('Drive raw-download bytes absent');return Buffer.from(b,'base64');}
function readMigrations(candidate){return RELEASE.migrations.map(([name])=>({name,bytes:execFileSync('unzip',['-p',candidate,`database/${name}`],{maxBuffer:1024*1024})}));}
async function main(){
 const args=parseArgs(process.argv.slice(2)),root=args.artifacts;
 await verifyWritableCapacity({minimumBytes:64*1024*1024});
 const files={
  manifest:'HBNF-two-target-admission-7c559-v3-ce4366.json',parent:'hbnf-glow-d68334f67026.parent-admission.json',admissionClaim:'hbnf-glow-d68334f67026.one-time-claim.json',decision:'hbnf-glow-d68334f67026.decision.json',approval:'HBNF-glow-d68334f67026-owner-install-authorization-2026-10-30.json',candidate:'HBNF-scoring-candidate-7c559.zip',rollback:'HBNF-scoring-rollback-v343.zip',failureReceipt:'hbnf-glow-d68334f67026.execution-failed.json',attemptEvidence:'HBNF-Glow-install-attempt-2026-10-30.json',
 };
 const local={};for(const [k,n] of Object.entries(files))local[k]=await readFile(path.join(root,n));
 const authority={manifest:local.manifest,parent:local.parent,admissionClaim:local.admissionClaim,decision:local.decision,approval:local.approval,candidate:local.candidate,rollback:local.rollback,migrationBytes:readMigrations(path.join(root,files.candidate))};
 const evidence={authority,failureReceipt:local.failureReceipt,attemptEvidence:local.attemptEvidence};
 const originalRemote=[
  ['1a0cW5807z8hwYK0_rwz5UHKVFVp4fE-G',local.manifest,'original admission manifest'],
  ['1JsTUYjiqak3CLpvjnlbeHOZ1kGO25hOd',local.parent,'original parent admission'],
  ['1f6laQOsFy2Fa8ALA_sk_Avok72tRttx8',local.admissionClaim,'original admission claim'],
  ['129mfnPaVt7HaYgVofV0RyxQGyRgFQmRd',local.decision,'original admission decision'],
  ['1au6vCaUdEjsc3HSGyQRq2iwNv5qmJnlI',local.approval,'owner authorization'],
  [SUCCESSOR.failureDriveId,local.failureReceipt,'prior failure receipt'],
  [SUCCESSOR.attemptDriveId,local.attemptEvidence,'prior attempt evidence'],
  [SUCCESSOR.priorExecutionClaimId,null,'consumed execution claim'],
 ];
 for(const [id,expected,label] of originalRemote){const raw=await tool('drive.fetch',{id,download_raw_file:true,include_base64:true});const actual=driveBytes(raw);if(expected&&!actual.equals(expected))throw Error(`${label} Drive bytes differ from the verified local authority`);if(id===SUCCESSOR.priorExecutionClaimId&&sha(actual)!==SUCCESSOR.priorExecutionClaimSha256)throw Error(`${label} exact hash mismatch`);}
 const github={create_file:a=>tool('github.create_file',a),fetch_file:a=>tool('github.fetch_file',a)};
 const drive={upload_file:a=>tool('drive.upload_file',a),fetch:id=>tool('drive.fetch',{id,download_raw_file:true,include_base64:true})};
 const supabase={execute_sql:a=>tool('supabase.execute_sql',a),apply_migration:a=>tool('supabase.apply_migration',a)};
 const lock=createGitHubExecutionLockAdapter({createFile:github.create_file,fetchFile:github.fetch_file,claimPath:SUCCESSOR.claimPath});
 const store=createGoogleDriveEvidenceStore({uploadFile:drive.upload_file,fetchFile:drive.fetch,writeLocal:async(name,bytes)=>{const dir=await mkdtemp(path.join(tmpdir(),'hbnf-successor-'));const file=path.join(dir,name.replace(/[^A-Za-z0-9._-]/g,'_'));await writeFile(file,bytes,{flag:'wx'});return file;},cleanupLocal:async file=>rm(path.dirname(file),{recursive:true,force:true})});
 const db=createPartialSupabaseProvider({executeSql:supabase.execute_sql,applyMigration:supabase.apply_migration});
 const candidatePath=path.join(root,files.candidate),rollbackPath=path.join(root,files.rollback),wrangler=await resolvePinnedWrangler();
 const run=createPinnedWranglerRunner({binary:wrangler});
 const verifyRoutes=createHbnfPublicAssetVerifier({candidatePath,origin:'https://hbnightflyers.com'});
 const cf=createWranglerAdapter({run,candidatePath,rollbackPath,verifyRoutes});
 const [cloudflare,supabaseBaseline]=await Promise.all([cf.read(),db.read()]);
 const admissionResult=await admitPartialSuccessor({evidence,readbacks:{cloudflare,supabase:supabaseBaseline},storage:store,executionLock:lock,gateSourceCommit:args.gateSource});
 const providers={cloudflare, supabase:db};
 const outcome=await executePartialSuccessor({evidence,admission:admissionResult.admission,providers,storage:store,executionLock:lock,currentGateSourceCommit:args.gateSource});
 process.stdout.write(`${JSON.stringify({type:'result',status:outcome.status,successorId:SUCCESSOR.id,manifestDriveId:admissionResult.admission.manifestDriveId,manifestSha256:admissionResult.admission.manifestSha256,decisionDriveId:admissionResult.admission.decisionDriveId,decisionSha256:admissionResult.admission.decisionSha256,executionClaimGithubRef:admissionResult.admission.claim.githubRef,closeoutDriveId:outcome.driveId,closeoutSha256:outcome.sha256,closeoutBytes:outcome.bytes,installedWorkerVersion:outcome.closeout.cloudflare.versionId,appliedMigrations:outcome.closeout.supabase.appliedMigrations})}\n`);
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{process.stdout.write(`${JSON.stringify({type:'result',status:'BLOCKED_OR_FAILED',error:error.message})}\n`);process.exitCode=2;});

#!/usr/bin/env node
// Tool-bridge runner for the narrowly scoped Nov 3 cleanup gate. The runner
// can prepare/admit read-only; execution additionally requires an explicit
// HBNF_GLOW_CLEANUP_EXECUTE=1 and a durable ADMISSION_PASS.
import {createInterface} from 'node:readline';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHbnfGlowCleanupGate,createHbnfGlowCleanupLedger,createHbnfGlowCleanupStorage,createSupabaseGlowCleanupProvider,canonicalBytes} from './hbnf-glow-week-cleanup.mjs';

const REPO='oookkkaaayyy/local-roots', BRANCH='feature/udisc-glow-standings-prototype';
const DRIVE_FOLDER='1mZWMyzLIKnSjBTP82-EfGOqktld17X84';
const pending=new Map();let nextId=1;
const input=createInterface({input:process.stdin,crlfDelay:Infinity});
input.on('line',line=>{try{const message=JSON.parse(line);const task=pending.get(message.id);if(task){pending.delete(message.id);clearTimeout(task.timer);task.resolve(message.result);}}catch{}});
function tool(method,args){const id=nextId++;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`provider tool timed out: ${method}`));},45_000);pending.set(id,{resolve,reject,timer});process.stdout.write(`${JSON.stringify({type:'tool',id,method,args})}\n`);});}
import {createHash} from 'node:crypto';
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const assert=(condition,message)=>{if(!condition)throw new Error(message);};

function currentSource(){
  const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const branch=execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim();
  const dirty=execFileSync('git',['status','--porcelain=v1','--untracked-files=all'],{encoding:'utf8'}).trim();
  assert(branch===BRANCH,'cleanup runner is not on the existing feature branch');
  assert(!dirty,'cleanup source tree must be clean and committed before admission/execution');
  return commit;
}

function makeAdapters(releaseId){
  const localTemps=new Map();
  const storage=createHbnfGlowCleanupStorage({
    folderId:DRIVE_FOLDER,
    uploadFile:args=>tool('mcp__codex_apps__google_drive_upload_file',args),
    fetchFile:id=>tool('mcp__codex_apps__google_drive_fetch',{url:`https://drive.google.com/file/d/${id}/view`,download_raw_file:true,include_base64:true}),
    listFiles:async({folderId})=>{
      const response=await tool('mcp__codex_apps__google_drive_search',{query:'HBNF Glow cleanup evidence',topn:100,special_filter_query_str:`'${folderId}' in parents and trashed = false`});
      const files=response?.structuredContent?.results;
      if(!Array.isArray(files))return{isError:true,content:[{type:'text',text:'Drive listing omitted files'}]};
      return{structuredContent:{files:files.map(f=>({id:f.id,title:f.title||f.name}))}};
    },
    writeLocal:async(name,bytes)=>{
      const dir=await mkdtemp(path.join(os.tmpdir(),'hbnf-glow-cleanup-'));
      const file=path.join(dir,path.basename(name));
      await writeFile(file,bytes,{flag:'wx',mode:0o600});localTemps.set(file,dir);return file;
    },
    cleanupLocal:async(file)=>{const dir=localTemps.get(file);if(dir){localTemps.delete(file);await rm(dir,{recursive:true,force:true});}},
  });
  const ledger=createHbnfGlowCleanupLedger({
    releaseId,repository:REPO,branch:BRANCH,
    createFile:args=>tool('mcp__codex_apps__github_create_file',args),
    fetchFile:args=>tool('mcp__codex_apps__github_fetch_file',args),
  });
  const cleanupProvider=makeSupabaseProvider();
  return {storage,ledger,provider:cleanupProvider};
}

function makeSupabaseProvider(){
  return createSupabaseGlowCleanupProvider({executeSql:args=>tool('mcp__codex_apps__supabase_execute_sql',args)});
}

async function main(){
  const [mode,inputPath,receiptPath]=process.argv.slice(2);
  assert(['admit','execute'].includes(mode),'usage: node scripts/hbnf-glow-week-cleanup-runner.mjs <admit|execute> <manifest-or-admission.json> [admission-receipt.json]');
  const sourceCommit=currentSource();
  if(mode==='admit'){
    const manifestBytes=await readFile(inputPath);const manifest=JSON.parse(manifestBytes.toString('utf8'));
    const {storage,ledger,provider}=makeAdapters(manifest.releaseId);
    const gate=createHbnfGlowCleanupGate({provider,storage,ledger,sourceCommit});
    const result=await gate.admit({manifest,manifestBytes});
    const receipt={format:'hbnf-glow-week-cleanup-local-admission-reference-v1',releaseId:result.releaseId,manifestDriveId:result.manifestDriveId,manifestSha256:result.manifestSha256,decisionDriveId:result.decisionDriveId,decisionSha256:result.decisionSha256,sourceCommit,createdAt:new Date().toISOString()};
    const out=receiptPath||`${inputPath}.admission-receipt.json`;
    await writeFile(out,canonicalBytes(receipt),{flag:'wx',mode:0o600});
    process.stdout.write(`${JSON.stringify({status:'ADMISSION_PASS',receiptPath:out,releaseId:result.releaseId,manifestDriveId:result.manifestDriveId,manifestSha256:result.manifestSha256,decisionDriveId:result.decisionDriveId,decisionSha256:result.decisionSha256,sourceCommit})}\n`);
    return;
  }
  assert(process.env.HBNF_GLOW_CLEANUP_EXECUTE==='1','set HBNF_GLOW_CLEANUP_EXECUTE=1 only for the exact admitted cleanup execution');
  const local=JSON.parse((await readFile(inputPath,'utf8')));
  assert(local.format==='hbnf-glow-week-cleanup-local-admission-reference-v1'&&local.sourceCommit===sourceCommit,'admission receipt/source mismatch');
  const {storage,ledger,provider}=makeAdapters(local.releaseId);
  const manifestBytes=Buffer.from(await storage.download(local.manifestDriveId));
  assert(await sha256(manifestBytes)===local.manifestSha256,'remote manifest hash differs from local admission receipt');
  const manifest=JSON.parse(manifestBytes.toString('utf8'));
  const decisionBytes=Buffer.from(await storage.download(local.decisionDriveId));
  assert(await sha256(decisionBytes)===local.decisionSha256,'remote decision hash differs from local admission receipt');
  const decision=JSON.parse(decisionBytes.toString('utf8'));
  const admission={status:decision.status,manifest,manifestBytes,manifestSha256:local.manifestSha256,manifestDriveId:local.manifestDriveId,decision,decisionBytes,decisionDriveId:local.decisionDriveId,decisionSha256:local.decisionSha256};
  const gate=createHbnfGlowCleanupGate({provider,storage,ledger,sourceCommit});
  const result=await gate.execute(admission);
  process.stdout.write(`${JSON.stringify({status:result.status,releaseId:result.receipt.releaseId,receiptDriveId:result.receiptDriveId,receiptSha256:result.receiptSha256,receiptBytes:result.receiptBytesLength,sourceCommit})}\n`);
}

main().catch(error=>{process.stderr.write(`REVIEW_ONLY ${String(error?.message||error).slice(0,800)}\n`);process.exitCode=1;});

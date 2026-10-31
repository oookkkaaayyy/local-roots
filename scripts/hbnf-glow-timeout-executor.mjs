#!/usr/bin/env node
// Candidate-specific fail-closed executor for the one-function Glow timeout fix.
// The source/package and the execution-gate commit are independently bound in
// the admission receipt. No Worker, score, or league_state mutation is allowed.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateReleaseReceipt} from './validate-release-receipt.mjs';

export const TIMEOUT_RELEASE=Object.freeze({
  migration:'20261031093828_hbnf_glow_anon_cas_statement_timeout_8s.sql',
  migrationSha256:'227223d8a42ef70ba3bb4c15126ba62dc39cf399f3f601f429a00d6bf71a5c76',
  rollback:'-- Restore the original function-level timeout configuration.\nALTER FUNCTION public.hbnf_save_league_state_v1(timestamptz, jsonb)\n  RESET statement_timeout;\n',
  target:'phcpbvuqibyarpfrftgx',
  anonConfig:'statement_timeout=3s',
  functionTimeout:'statement_timeout=8s',
  triggerNames:['hbnf_matrix_vnext_capture_after_state_change','hbnf_project_current_tags_into_league_state','trg_hbnf_matrix_sync','zzz_hbnf_enforce_league_state_revision'],
});
const sha=b=>createHash('sha256').update(b).digest('hex');
const fail=m=>{throw new Error(m)};
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const normalizedTimestamp=value=>String(value||'').replace(' ','T').replace(/\+00(?::00)?$/,'Z');

export function assertTimeoutBaseline(actual, expected) {
  if(!actual||actual.project!==TIMEOUT_RELEASE.target)fail('Supabase target identity mismatch');
  for(const k of ['stateBytes','stateMd5','activeWeek','nov3Exists','legacyAnonWrites','migrationLedgerCount','targetMigrationPresent'])
    if(actual[k]!==expected[k])fail(`Supabase baseline drift at ${k}`);
  if(normalizedTimestamp(actual.stateUpdatedAt)!==normalizedTimestamp(expected.stateUpdatedAt))fail('Supabase baseline drift at stateUpdatedAt');
  if(!equal(actual.anonConfig,[TIMEOUT_RELEASE.anonConfig]))fail('anonymous role timeout changed');
  if(!equal(actual.functionConfig,['search_path=""']))fail('CAS function baseline configuration changed');
  if(!equal([...actual.triggers].sort(),[...TIMEOUT_RELEASE.triggerNames].sort()))fail('CAS/tag/Matrix trigger set changed');
  if(actual.targetMigrationPresent!==false)fail('timeout migration is already installed; refusing replay');
  if(actual.legacyAnonWrites!==true)fail('legacy scoring grants changed');
  return true;
}

function runGit(args,cwd){return execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
function parseQueryResponse(body){
  if(Array.isArray(body))return body[0]?.readback||body[0];
  if(Array.isArray(body?.result))return body.result[0]?.readback||body.result[0];
  return body?.readback||body;
}

export async function createTimeoutMigrationRoute({token,fetchImpl=fetch,receipt,root,repo,clock=()=>new Date().toISOString()}={}) {
  if(typeof token!=='string'||!token.trim())fail('Supabase Management API credential unavailable');
  if(!receipt||!root||!repo)fail('receipt, recovery root, and exact repository are required');
  const migrationBytes=Buffer.from(await readZipEntry(path.join(root,receipt.package.path),`migration/${TIMEOUT_RELEASE.migration}`));
  if(sha(migrationBytes)!==TIMEOUT_RELEASE.migrationSha256)fail('migration bytes do not match the admitted SQL hash');
  const rollbackBytes=await readFile(path.join(root,receipt.rollback.artifact.path));
  if(!rollbackBytes.equals(Buffer.from(TIMEOUT_RELEASE.rollback)))fail('rollback bytes are not the admitted exact inverse SQL');
  const admission=await validateReleaseReceipt(receipt,root,{phase:'admission'});
  const manifestBytes=await readFile(path.join(root,receipt.admission.path));
  if(sha(manifestBytes)!==admission.admissionManifestSha256)fail('admission manifest hash mismatch');
  const manifestDownload=await readFile(path.join(root,receipt.admission.downloadBack.path));
  if(!manifestDownload.equals(manifestBytes))fail('admission manifest download-back mismatch');

  const gateCommit=runGit(['rev-parse','HEAD'],repo),gateTree=runGit(['rev-parse','HEAD^{tree}'],repo);
  if(runGit(['branch','--show-current'],repo)!=='feature/udisc-glow-standings-prototype'||runGit(['status','--porcelain'],repo)!=='')fail('execution gate source branch is not the clean authorized feature branch');
  const gateHash=sha(await readFile(fileURLToPath(import.meta.url)));
  const gateInput=receipt.build.inputs.find(x=>x.name==='timeout-execution-gate');
  if(!gateInput||gateInput.version!==gateCommit||gateInput.sha256!==gateHash)fail('admission does not bind this exact execution gate source');
  try{runGit(['merge-base','--is-ancestor',receipt.source.commit,gateCommit],repo)}catch{fail('migration source commit is not an ancestor of the execution gate source');}
  const remote=runGit(['ls-remote','origin','refs/heads/feature/udisc-glow-standings-prototype'],repo).split(/\s+/)[0];
  if(remote!==gateCommit)fail('remote feature branch no longer matches the admitted execution gate source');

  async function request(url,init={}){
    const response=await fetchImpl(url,{...init,headers:{Authorization:`Bearer ${token}`,Accept:'application/json','Content-Type':'application/json',...(init.headers||{})}});
    const text=await response.text();let body;try{body=JSON.parse(text)}catch{body={message:text.slice(0,500)}};
    if(!response.ok)fail(`Supabase Management API ${init.method||'GET'} failed HTTP ${response.status}: ${String(body?.message||'').slice(0,300)}`);
    return body;
  }
  async function readProvider(){
    const query=`select jsonb_build_object(
      'project','${TIMEOUT_RELEASE.target}',
      'stateUpdatedAt',(select updated_at::text from public.league_state where id=1),
      'stateBytes',(select octet_length(state_json::text) from public.league_state where id=1),
      'stateMd5',(select md5(state_json::text) from public.league_state where id=1),
      'activeWeek',(select state_json #>> '{glow,activeWeek}' from public.league_state where id=1),
      'nov3Exists',coalesce((select (state_json #> '{glow,weeks}') ? '2026-11-03' from public.league_state where id=1),false),
      'anonConfig',coalesce((select rolconfig from pg_roles where rolname='anon'),'{}'::text[]),
      'functionConfig',(select proconfig from pg_proc where oid='public.hbnf_save_league_state_v1(timestamptz,jsonb)'::regprocedure),
      'functionMd5',(select md5(prosrc) from pg_proc where oid='public.hbnf_save_league_state_v1(timestamptz,jsonb)'::regprocedure),
      'triggers',coalesce((select jsonb_agg(tgname order by tgname) from pg_trigger where tgrelid='public.league_state'::regclass and not tgisinternal),'[]'::jsonb),
      'legacyAnonWrites',has_table_privilege('anon','public.league_state','INSERT') and has_table_privilege('anon','public.league_state','UPDATE'),
      'migrationLedgerCount',(select count(*) from supabase_migrations.schema_migrations),
      'targetMigrationPresent',exists(select 1 from supabase_migrations.schema_migrations where name='20261031093828_hbnf_glow_anon_cas_statement_timeout_8s')
    ) as readback`;
    const [raw,ledger]=await Promise.all([
      request(`https://api.supabase.com/v1/projects/${TIMEOUT_RELEASE.target}/database/query/read-only`,{method:'POST',body:JSON.stringify({query})}),
      request(`https://api.supabase.com/v1/projects/${TIMEOUT_RELEASE.target}/database/migrations`,{method:'GET'}),
    ]);
    const row=parseQueryResponse(raw);if(!row||typeof row!=='object')fail('fresh Supabase query omitted baseline');
    const migrations=Array.isArray(ledger)?ledger:ledger.migrations;
    if(!Array.isArray(migrations))fail('Management API migration ledger is malformed');
    const named=migrations.filter(x=>x.name==='20261031093828_hbnf_glow_anon_cas_statement_timeout_8s');
    row.migrationLedgerCount=migrations.length;row.targetMigrationPresent=named.length===1;
    if(named.length>1)fail('duplicate target migration rows detected');
    return row;
  }
  const readbackPath=path.join(root,'evidence/baseline-readback.json');
  const baselineReadbackBytes=await readFile(readbackPath);
  const baselineReadbackHash=sha(baselineReadbackBytes);
  if(!receipt.baseline.sourceEvidence.includes(baselineReadbackHash))fail('admission does not bind the durable fresh baseline readback hash');
  const baselineReadback=JSON.parse(baselineReadbackBytes);
  const expectedBaseline={...baselineReadback,project:baselineReadback.project,
    stateBytes:baselineReadback.stateBytes,stateMd5:baselineReadback.stateMd5,
    stateUpdatedAt:baselineReadback.stateUpdatedAt,
    triggers:baselineReadback.triggers};
  const snapshotRow=JSON.parse(await readFile(path.join(root,'evidence/league_state_baseline.json'),'utf8'))[0];
  // The retained row snapshot was independently checked against PostgreSQL's
  // JSONB text hash/size; retain that exact comparison in every successor gate.
  if(snapshotRow.id!==1||baselineReadback.stateBytes!==2552524||baselineReadback.stateMd5!=='d94723da1bcc95921c6bf413568ebdb2')fail('fresh provider baseline no longer matches the retained full-row snapshot');
  if(!equal([...expectedBaseline.triggers].sort(),[...TIMEOUT_RELEASE.triggerNames].sort()))fail('durable readback lacks the exact four-trigger baseline');
  if(baselineReadback.functionMd5!=='8bf371de3aff3355071345b59a50397e')fail('durable readback CAS function body hash is not the approved baseline');
  function verifyClaim(){
    const name=`hbnf-execution-${receipt.releaseId}`;
    const ref=`refs/tags/${name}`;
    const hash=runGit(['ls-remote','origin',ref],repo).split(/\s+/)[0];
    if(!hash)fail('unique remote execution claim is missing');
    const localRef=`refs/codex-hbnf-claims/${name}`;
    try{runGit(['fetch','--no-tags','origin',`+${ref}:${localRef}`],repo);}catch{fail('execution claim could not be retrieved independently from GitHub');}
    const content=runGit(['cat-file','-p',localRef],repo);const marker=content.indexOf('\n\n');
    if(marker<0)fail('execution claim tag is malformed');
    let claim;try{claim=JSON.parse(content.slice(marker+2).trim())}catch{fail('execution claim payload is malformed');}
    if(claim.releaseId!==receipt.releaseId||claim.admissionManifestSha256!==admission.admissionManifestSha256||claim.candidateSha256!==admission.packageSha256||claim.rollbackSha256!==admission.rollbackSha256||claim.target!==TIMEOUT_RELEASE.target||claim.gateCommit!==gateCommit)fail('execution claim does not bind this admission, artifacts, target, and gate commit');
    return {tag:name,remoteObject:hash,claim};
  }
  return {
    admissionManifestSha256:admission.admissionManifestSha256,
    async claim(){
      const before=await readProvider();assertTimeoutBaseline(before,expectedBaseline);
      if(before.functionMd5!==receipt.functionBaselineMd5)fail('baseline CAS function body changed');
      const claim={format:'hbnf-glow-timeout-execution-claim-v1',releaseId:receipt.releaseId,admissionManifestSha256:admission.admissionManifestSha256,candidateSha256:admission.packageSha256,rollbackSha256:admission.rollbackSha256,target:TIMEOUT_RELEASE.target,sourceCommit:receipt.source.commit,gateCommit,gateTree,createdAt:clock()};
      const tag=`hbnf-execution-${receipt.releaseId}`;
      try{runGit(['tag','-a',tag,'-m',JSON.stringify(claim)],repo);runGit(['push','origin',`refs/tags/${tag}`],repo);}catch{try{runGit(['tag','-d',tag],repo)}catch{};fail('atomic GitHub execution-claim creation failed or claim already exists; refusing replay');}
      return verifyClaim();
    },
    async execute(){
      const claim=verifyClaim();
      const before=await readProvider();assertTimeoutBaseline(before,expectedBaseline);
      if(before.functionMd5!==receipt.functionBaselineMd5)fail('function body changed immediately before migration');
      let mutationMayHaveRun=false,result,after;
      try{
        mutationMayHaveRun=true;
        result=await request(`https://api.supabase.com/v1/projects/${TIMEOUT_RELEASE.target}/database/migrations`,{method:'POST',body:JSON.stringify({name:TIMEOUT_RELEASE.migration.replace(/\.sql$/,''),query:migrationBytes.toString('utf8'),rollback:rollbackBytes.toString('utf8')})});
        after=await readProvider();
        if(after.targetMigrationPresent!==true||after.migrationLedgerCount!==before.migrationLedgerCount+1)fail('migration ledger did not advance exactly once');
        if(!equal(after.anonConfig,[TIMEOUT_RELEASE.anonConfig])||!Array.isArray(after.functionConfig)||!after.functionConfig.includes(TIMEOUT_RELEASE.functionTimeout))fail('function-local timeout or anon role limit failed readback');
        if(after.functionMd5!==before.functionMd5||!equal([...after.triggers].sort(),[...before.triggers].sort())||after.legacyAnonWrites!==true)fail('CAS body, tags/Matrix/revision triggers, or legacy grants changed');
        if(after.stateMd5!==before.stateMd5||after.stateBytes!==before.stateBytes||normalizedTimestamp(after.stateUpdatedAt)!==normalizedTimestamp(before.stateUpdatedAt))fail('league_state changed during schema-only migration');
      }catch(error){
        if(mutationMayHaveRun){
          let observed;try{observed=await readProvider()}catch(readError){fail(`migration outcome is uncertain; preserve draft and block all further writes: ${error.message}; readback: ${readError.message}`)}
          if(observed.targetMigrationPresent===true&&Array.isArray(observed.functionConfig)&&observed.functionConfig.includes(TIMEOUT_RELEASE.functionTimeout)){
            const restoreName=`hbnf_glow_timeout_recovery_${receipt.releaseId}`;
            await request(`https://api.supabase.com/v1/projects/${TIMEOUT_RELEASE.target}/database/migrations`,{method:'POST',body:JSON.stringify({name:restoreName,query:rollbackBytes.toString('utf8'),rollback:migrationBytes.toString('utf8')})});
            const restored=await readProvider();
            if(Array.isArray(restored.functionConfig)&&restored.functionConfig.includes(TIMEOUT_RELEASE.functionTimeout))fail(`timeout rollback did not restore function config; migration remains installed: ${error.message}`);
            const failure={format:'hbnf-glow-timeout-recovery-v1',releaseId:receipt.releaseId,admissionManifestSha256:admission.admissionManifestSha256,executionClaim:claim,primaryMigrationRecorded:observed.targetMigrationPresent,rollbackMigrationName:restoreName,restoredFunctionConfig:restored.functionConfig,leagueStateMd5:restored.stateMd5,status:'FUNCTION_CONFIG_RESTORED; MIGRATION LEDGER RETAINS BOTH ENTRIES',cause:error.message,recordedAt:clock()};
            await writeFile(path.join(root,`${receipt.releaseId}.failure.json`),`${JSON.stringify(failure,null,2)}\n`,{flag:'wx',mode:0o600});
            fail(`post-migration verification failed; exact function setting rollback was applied and verified. Preserve failure receipt; migration ledger records forward and recovery entries. Cause: ${error.message}`);
          }
        }
        throw error;
      }
      const evidence={format:'hbnf-glow-timeout-install-readback-v1',releaseId:receipt.releaseId,admissionManifestSha256:admission.admissionManifestSha256,executionClaim:claim,sourceCommit:receipt.source.commit,gateCommit,providerResponseStatus:200,providerResponseKeys:Object.keys(result||{}),migrationName:TIMEOUT_RELEASE.migration,installedAt:clock(),before,after,status:'PROVIDER_READBACK_PASS_PENDING_DURABLE_CLOSEOUT'};
      const output=path.join(root,`${receipt.releaseId}.provider-readback.json`);await writeFile(output,`${JSON.stringify(evidence,null,2)}\n`,{flag:'wx',mode:0o600});
      return {output,evidence};
    },
  };
}

function readZipEntry(zip,name){return execFileSync('unzip',['-p',zip,name],{maxBuffer:1024*1024});}
async function main(){
  const [mode,receiptPath,rootArg]=process.argv.slice(2);if(!['--claim','--execute'].includes(mode)||!receiptPath||!rootArg)fail('usage: node scripts/hbnf-glow-timeout-executor.mjs --claim|--execute <receipt.json> <receipt-root>');
  const root=path.resolve(rootArg),receipt=JSON.parse(await readFile(path.resolve(receiptPath),'utf8'));
  const tokenPath=path.join(os.homedir(),'.hbnf-private','supabase-management.pat');const token=(await readFile(tokenPath,'utf8')).trim();
  const route=await createTimeoutMigrationRoute({token,receipt,root,repo:process.cwd()});
  if(mode==='--claim'){const claim=await route.claim();process.stdout.write(`PASS one-time remote execution claim ${claim.tag} ${claim.remoteObject}\n`);return;}
  const result=await route.execute();process.stdout.write(`PASS provider migration and readback; durable closeout required ${path.basename(result.output)}\n`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{process.stderr.write(`FAIL ${e.message}\n`);process.exitCode=1;});

#!/usr/bin/env node
// One-release, fail-closed executor for the demonstrated anonymous PostgREST
// read timeout. It changes only anon's bounded statement_timeout setting.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateReleaseReceipt} from './validate-release-receipt.mjs';

export const READ_TIMEOUT_RELEASE=Object.freeze({
  migration:'20261031101000_hbnf_anon_read_timeout_8s.sql',
  migrationSha256:'214e6468cd3ba5aeaa75eb4721115c0779edf53b3e0de057a923e123deaf897f',
  rollback:"-- Restore the previously verified anonymous role timeout.\nALTER ROLE anon SET statement_timeout = '3s';\nNOTIFY pgrst, 'reload config';\n",
  target:'phcpbvuqibyarpfrftgx',
  previousMigration:'20261031093828_hbnf_glow_anon_cas_statement_timeout_8s',
  anonConfigBefore:'statement_timeout=3s',
  anonConfigAfter:'statement_timeout=8s',
  functionTimeout:'statement_timeout=8s',
  triggers:['hbnf_matrix_vnext_capture_after_state_change','hbnf_project_current_tags_into_league_state','trg_hbnf_matrix_sync','zzz_hbnf_enforce_league_state_revision'],
});
const sha=b=>createHash('sha256').update(b).digest('hex');
const fail=m=>{throw new Error(m)};
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const normTs=x=>String(x||'').replace(' ','T').replace(/\+00(?::00)?$/,'Z');

export function assertReadTimeoutBaseline(actual,expected){
  if(!actual||actual.project!==READ_TIMEOUT_RELEASE.target)fail('Supabase target identity mismatch');
  for(const k of ['stateBytes','stateMd5','activeWeek','nov3Exists','nov3Players','nov3Locked'])
    if(actual[k]!==expected[k])fail(`Supabase baseline drift at ${k}`);
  if(normTs(actual.stateUpdatedAt)!==normTs(expected.stateUpdatedAt))fail('Supabase baseline drift at stateUpdatedAt');
  if(!equal(actual.anonConfig,[READ_TIMEOUT_RELEASE.anonConfigBefore]))fail('anonymous role timeout baseline changed');
  if(!equal([...actual.authenticatorConfig].sort(),[...(expected.authenticatorConfig||[])].sort()))fail('authenticator/global timeout settings changed');
  if(!equal([...actual.functionConfig].sort(),[...(expected.functionConfig||[])].sort()))fail('CAS function configuration changed');
  if(!actual.functionConfig.includes(READ_TIMEOUT_RELEASE.functionTimeout))fail('installed CAS function timeout is not 8s');
  if(actual.functionMd5!==expected.functionMd5)fail('CAS function body changed');
  if(!equal([...actual.triggers].sort(),[...READ_TIMEOUT_RELEASE.triggers].sort()))fail('CAS/tag/Matrix/revision trigger set changed');
  if(actual.triggerDefsMd5!==expected.triggerDefsMd5)fail('tag/Matrix/revision trigger definitions changed');
  if(actual.legacyAnonWrites!==true)fail('legacy anonymous scoring grants changed');
  if(actual.targetMigrationPresent!==false)fail('anonymous read-timeout migration already installed; refusing replay');
  if(actual.previousMigrationPresent!==true||actual.migrationLedgerCount!==85)fail('previous function-timeout migration baseline differs');
  return true;
}

function runGit(args,cwd){return execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
function parseRows(v){if(Array.isArray(v))return v[0]?.readback||v[0];if(Array.isArray(v?.result))return v.result[0]?.readback||v.result[0];return v?.readback||v;}
function readZipEntry(zip,name){return execFileSync('unzip',['-p',zip,name],{maxBuffer:1024*1024});}

export async function createReadTimeoutRoute({token,fetchImpl=fetch,receipt,root,repo,clock=()=>new Date().toISOString()}={}){
  if(typeof token!=='string'||!token.trim())fail('Supabase Management API credential unavailable');
  if(!receipt||!root||!repo)fail('receipt, recovery root, and exact repository are required');
  const migration=Buffer.from(readZipEntry(path.join(root,receipt.package.path),`migration/${READ_TIMEOUT_RELEASE.migration}`));
  if(sha(migration)!==READ_TIMEOUT_RELEASE.migrationSha256)fail('migration bytes do not match the admitted SQL hash');
  const rollback=await readFile(path.join(root,receipt.rollback.artifact.path));
  if(!rollback.equals(Buffer.from(READ_TIMEOUT_RELEASE.rollback)))fail('rollback bytes are not the exact prior anon role setting');
  const validated=await validateReleaseReceipt(receipt,root,{phase:'admission'});
  const manifestBytes=await readFile(path.join(root,receipt.admission.path));
  if(sha(manifestBytes)!==receipt.admission.sha256)fail('admission manifest hash mismatch');
  if(!(await readFile(path.join(root,receipt.admission.downloadBack.path))).equals(manifestBytes))fail('admission manifest remote download-back mismatch');

  const gateCommit=runGit(['rev-parse','HEAD'],repo),gateTree=runGit(['rev-parse','HEAD^{tree}'],repo);
  if(runGit(['branch','--show-current'],repo)!=='feature/udisc-glow-standings-prototype'||runGit(['status','--porcelain'],repo)!=='')fail('execution gate requires clean authorized feature branch');
  const gateHash=sha(await readFile(fileURLToPath(import.meta.url)));
  const gateInput=receipt.build.inputs.find(x=>x.name==='anon-read-timeout-execution-gate');
  if(!gateInput||gateInput.version!==gateCommit||gateInput.sha256!==gateHash)fail('admission does not bind this exact execution gate source');
  try{runGit(['merge-base','--is-ancestor',receipt.source.commit,gateCommit],repo)}catch{fail('migration source is not an ancestor of gate source');}
  const remote=runGit(['ls-remote','origin','refs/heads/feature/udisc-glow-standings-prototype'],repo).split(/\s+/)[0];
  if(remote!==gateCommit)fail('remote branch differs from admitted gate source');

  async function request(url,init={}){
    const response=await fetchImpl(url,{...init,headers:{Authorization:`Bearer ${token}`,Accept:'application/json','Content-Type':'application/json',...(init.headers||{})}});
    const text=await response.text();let body;try{body=JSON.parse(text)}catch{body={message:text.slice(0,400)}};
    if(!response.ok)fail(`Supabase Management API ${init.method||'GET'} failed HTTP ${response.status}: ${String(body?.message||'').slice(0,250)}`);
    return body;
  }
  async function readProvider(){
    const query=`select jsonb_build_object(
      'project','${READ_TIMEOUT_RELEASE.target}',
      'stateUpdatedAt',(select updated_at::text from public.league_state where id=1),
      'stateBytes',(select octet_length(state_json::text) from public.league_state where id=1),
      'stateMd5',(select md5(state_json::text) from public.league_state where id=1),
      'activeWeek',(select state_json #>> '{glow,activeWeek}' from public.league_state where id=1),
      'nov3Exists',coalesce((select (state_json #> '{glow,weeks}') ? '2026-11-03' from public.league_state where id=1),false),
      'nov3Players',coalesce((select jsonb_array_length(state_json #> '{glow,weeks,2026-11-03,players}') from public.league_state where id=1),0),
      'nov3Locked',(select (state_json #>> '{glow,weeks,2026-11-03,scoresLocked}')::boolean from public.league_state where id=1),
      'anonConfig',coalesce((select rolconfig from pg_roles where rolname='anon'),'{}'::text[]),
      'authenticatorConfig',coalesce((select rolconfig from pg_roles where rolname='authenticator'),'{}'::text[]),
      'functionConfig',(select proconfig from pg_proc where oid='public.hbnf_save_league_state_v1(timestamptz,jsonb)'::regprocedure),
      'functionMd5',(select md5(prosrc) from pg_proc where oid='public.hbnf_save_league_state_v1(timestamptz,jsonb)'::regprocedure),
      'triggers',coalesce((select jsonb_agg(tgname order by tgname) from pg_trigger where tgrelid='public.league_state'::regclass and not tgisinternal),'[]'::jsonb),
      'triggerDefsMd5',(select md5(string_agg(pg_get_triggerdef(oid),E'\\n' order by tgname)) from pg_trigger where tgrelid='public.league_state'::regclass and not tgisinternal),
      'legacyAnonWrites',has_table_privilege('anon','public.league_state','INSERT') and has_table_privilege('anon','public.league_state','UPDATE')
    ) as readback`;
    const [raw,ledger]=await Promise.all([
      request(`https://api.supabase.com/v1/projects/${READ_TIMEOUT_RELEASE.target}/database/query/read-only`,{method:'POST',body:JSON.stringify({query})}),
      request(`https://api.supabase.com/v1/projects/${READ_TIMEOUT_RELEASE.target}/database/migrations`,{method:'GET'}),
    ]);
    const row=parseRows(raw);if(!row||typeof row!=='object')fail('provider query omitted baseline');
    const ms=Array.isArray(ledger)?ledger:ledger.migrations;if(!Array.isArray(ms))fail('migration ledger readback malformed');
    const target=ms.filter(m=>m.name===READ_TIMEOUT_RELEASE.migration.replace(/\.sql$/,''));
    const previous=ms.filter(m=>m.name===READ_TIMEOUT_RELEASE.previousMigration);
    if(target.length>1||previous.length!==1)fail('migration ledger has missing previous or duplicate target entry');
    row.migrationLedgerCount=ms.length;row.targetMigrationPresent=target.length===1;row.previousMigrationPresent=previous.length===1;
    return row;
  }
  const baselinePath=path.join(root,'evidence/baseline-readback.json');
  const baselineBytes=await readFile(baselinePath),baselineHash=sha(baselineBytes);
  if(!receipt.baseline.sourceEvidence.includes(baselineHash))fail('admission does not bind fresh baseline readback hash');
  const expected=JSON.parse(baselineBytes);
  const snap=JSON.parse(await readFile(path.join(root,'evidence/league_state_baseline.json'),'utf8'));
  const row=Array.isArray(snap)?snap[0]:snap;
  if(row?.id!==1||expected.stateMd5!==receipt.baseline.identity.match(/state_json_md5=([a-f0-9]+)/)?.[1])fail('provider baseline and retained recovery snapshot do not match');

  function verifyClaim(){
    const tag=`hbnf-execution-${receipt.releaseId}`,ref=`refs/tags/${tag}`;
    const remoteTag=runGit(['ls-remote','origin',ref],repo).split(/\s+/)[0];if(!remoteTag)fail('unique remote execution claim is absent');
    const local=`refs/codex-hbnf-claims/${tag}`;try{runGit(['fetch','--no-tags','origin',`+${ref}:${local}`],repo)}catch{fail('cannot retrieve execution claim independently')}
    const raw=runGit(['cat-file','-p',local],repo),at=raw.indexOf('\n\n');if(at<0)fail('execution claim tag malformed');
    let claim;try{claim=JSON.parse(raw.slice(at+2).trim())}catch{fail('execution claim payload malformed')}
    if(claim.releaseId!==receipt.releaseId||claim.admissionManifestSha256!==validated.admissionManifestSha256||claim.candidateSha256!==receipt.package.sha256||claim.rollbackSha256!==receipt.rollback.artifact.sha256||claim.target!==READ_TIMEOUT_RELEASE.target||claim.gateCommit!==gateCommit)fail('execution claim binding mismatch');
    return {tag,remoteObject:remoteTag,claim};
  }
  return {
    async claim(){
      const before=await readProvider();assertReadTimeoutBaseline(before,expected);
      const claim={format:'hbnf-glow-anon-read-timeout-execution-claim-v1',releaseId:receipt.releaseId,admissionManifestSha256:validated.admissionManifestSha256,candidateSha256:receipt.package.sha256,rollbackSha256:receipt.rollback.artifact.sha256,target:READ_TIMEOUT_RELEASE.target,sourceCommit:receipt.source.commit,gateCommit,gateTree,createdAt:clock()};
      const tag=`hbnf-execution-${receipt.releaseId}`;
      try{runGit(['tag','-a',tag,'-m',JSON.stringify(claim)],repo);runGit(['push','origin',`refs/tags/${tag}`],repo)}catch{try{runGit(['tag','-d',tag],repo)}catch{};fail('atomic one-time GitHub execution claim failed or already exists')}
      return verifyClaim();
    },
    async execute(){
      const claim=verifyClaim();const before=await readProvider();assertReadTimeoutBaseline(before,expected);
      let mayHaveRun=false,after,response;
      try{
        mayHaveRun=true;
        response=await request(`https://api.supabase.com/v1/projects/${READ_TIMEOUT_RELEASE.target}/database/migrations`,{method:'POST',body:JSON.stringify({name:READ_TIMEOUT_RELEASE.migration.replace(/\.sql$/,''),query:migration.toString('utf8'),rollback:rollback.toString('utf8')})});
        after=await readProvider();
        if(!after.targetMigrationPresent||after.migrationLedgerCount!==before.migrationLedgerCount+1)fail('migration ledger did not advance exactly once');
        if(!equal(after.anonConfig,[READ_TIMEOUT_RELEASE.anonConfigAfter]))fail('anon statement_timeout did not become exactly 8s');
        if(!equal([...after.authenticatorConfig].sort(),[...before.authenticatorConfig].sort()))fail('authenticator/global settings changed');
        if(!equal([...after.functionConfig].sort(),[...before.functionConfig].sort())||after.functionMd5!==before.functionMd5)fail('CAS function configuration/body changed unexpectedly');
        if(!equal([...after.triggers].sort(),[...before.triggers].sort())||after.triggerDefsMd5!==before.triggerDefsMd5||after.legacyAnonWrites!==true)fail('trigger definitions or legacy anonymous grants changed');
        if(after.stateMd5!==before.stateMd5||after.stateBytes!==before.stateBytes||normTs(after.stateUpdatedAt)!==normTs(before.stateUpdatedAt))fail('league_state changed during role-setting migration');
      }catch(error){
        if(mayHaveRun){
          let observed;try{observed=await readProvider()}catch(readErr){fail(`role migration outcome uncertain; preserve local draft and block writes: ${error.message}; readback error: ${readErr.message}`)}
          if(observed.targetMigrationPresent&&equal(observed.anonConfig,[READ_TIMEOUT_RELEASE.anonConfigAfter])){
            const recoveryName=`hbnf_glow_anon_read_timeout_recovery_${receipt.releaseId}`;
            await request(`https://api.supabase.com/v1/projects/${READ_TIMEOUT_RELEASE.target}/database/migrations`,{method:'POST',body:JSON.stringify({name:recoveryName,query:rollback.toString('utf8'),rollback:migration.toString('utf8')})});
            const restored=await readProvider();if(!equal(restored.anonConfig,[READ_TIMEOUT_RELEASE.anonConfigBefore]))fail('role-timeout inverse did not restore anon 3s');
            const failure={format:'hbnf-glow-anon-read-timeout-recovery-v1',releaseId:receipt.releaseId,admissionManifestSha256:validated.admissionManifestSha256,executionClaim:claim,forwardMigrationRecorded:observed.targetMigrationPresent,recoveryMigrationName:recoveryName,restoredAnonConfig:restored.anonConfig,leagueStateMd5:restored.stateMd5,status:'ANON ROLE CONFIG RESTORED; BOTH LEDGER ENTRIES RETAINED',cause:error.message,recordedAt:clock()};
            await writeFile(path.join(root,`${receipt.releaseId}.failure.json`),`${JSON.stringify(failure,null,2)}\n`,{flag:'wx',mode:0o600});
            fail(`post-migration verification failed; exact anon timeout rollback applied and verified. Cause: ${error.message}`);
          }
        }
        throw error;
      }
      const evidence={format:'hbnf-glow-anon-read-timeout-install-readback-v1',releaseId:receipt.releaseId,admissionManifestSha256:validated.admissionManifestSha256,executionClaim:claim,sourceCommit:receipt.source.commit,gateCommit,providerResponseStatus:200,providerResponseKeys:Object.keys(response||{}),migrationName:READ_TIMEOUT_RELEASE.migration,installedAt:clock(),before,after,status:'PROVIDER_READBACK_PASS_PENDING_DURABLE_CLOSEOUT'};
      const output=path.join(root,`${receipt.releaseId}.provider-readback.json`);await writeFile(output,`${JSON.stringify(evidence,null,2)}\n`,{flag:'wx',mode:0o600});return{output,evidence};
    },
  };
}

async function main(){
  const [mode,receiptPath,rootArg]=process.argv.slice(2);if(!['--claim','--execute'].includes(mode)||!receiptPath||!rootArg)fail('usage: node scripts/hbnf-glow-anon-read-timeout-executor.mjs --claim|--execute <receipt.json> <receipt-root>');
  const root=path.resolve(rootArg),receipt=JSON.parse(await readFile(path.resolve(receiptPath),'utf8'));
  const token=(await readFile(path.join(os.homedir(),'.hbnf-private','supabase-management.pat'),'utf8')).trim();
  const route=await createReadTimeoutRoute({token,receipt,root,repo:process.cwd()});
  if(mode==='--claim'){const claim=await route.claim();process.stdout.write(`PASS one-time remote execution claim ${claim.tag} ${claim.remoteObject}\n`);return;}
  const result=await route.execute();process.stdout.write(`PASS provider role migration and readback; durable closeout required ${path.basename(result.output)}\n`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{process.stderr.write(`FAIL ${e.message}\n`);process.exitCode=1;});

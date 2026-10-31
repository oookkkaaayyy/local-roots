#!/usr/bin/env node
// Executes the exact, prequalified weekly Glow release through one durable
// admission, a GitHub-unique execution claim, Supabase Management API, and
// pinned Wrangler staged-version deployment. Drive/GitHub tools are bridged
// through JSONL; secrets never cross that bridge.
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
import {execFile as execFileCb,execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,mkdtemp,readFile,rm,stat,open,unlink,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {admitWeeklyGlowRelease,canonicalManifestBytes,createSupabaseManagementAdapter,runWeeklyGlowRelease,sha256,WEEKLY_RELEASE} from './hbnf-weekly-two-target-release.mjs';
import {createGoogleDriveEvidenceStore,createGitHubExecutionLockAdapter,resolvePinnedWrangler,createPinnedWranglerRunner,normalizeCloudflareInjectedHtml,verifyWritableCapacity} from './hbnf-two-target-provider-adapters.mjs';

const execFile=promisify(execFileCb), ACCOUNT=WEEKLY_RELEASE.account;
const ARTIFACTS=process.env.HBNF_WEEKLY_RELEASE_ARTIFACT_DIR||'/Users/andrew/Documents/Codex/restart-checkpoints/hbnf-glow-live-acceptance-20261030/weekly-readiness-candidate-final';
const PAT_FILE=path.join(os.homedir(),'.hbnf-private','supabase-management.pat');
const SERVICE_KEY_FILE=path.join(os.homedir(),'.hbnf-private','legacy-service-role.jwt');
const DRIVE_FOLDER='1mZWMyzLIKnSjBTP82-EfGOqktld17X84';
const DRIVE_FILES={candidate:'1UUDgrd5udbV7ZX0BG-GwSAT6FRLpd69v',rollback:'1PJuaxzp0oLRhcH3R72IKu4rvV2J2x30Q',source:'11L_1CzY0Mz7oofSvqSYnp695DfwszdVh'};
const TOOL_TIMEOUT=30_000;
const pending=new Map();let nextToolId=1;
const input=createInterface({input:process.stdin,crlfDelay:Infinity});
input.on('line',line=>{try{const msg=JSON.parse(line);const p=pending.get(msg.id);if(p){pending.delete(msg.id);clearTimeout(p.timer);p.resolve(msg.result);}}catch{}});
function tool(method,args){const id=nextToolId++;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`provider tool timed out: ${method}`));},TOOL_TIMEOUT);pending.set(id,{resolve,reject,timer});process.stdout.write(`${JSON.stringify({type:'tool',id,method,args})}\n`);});}
const text=r=>typeof r==='string'?r:(r?.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
function resultBytes(r){const b=r?.structuredContent?.b64_string;if(typeof b!=='string')throw new Error('Drive remote download omitted bytes');return Buffer.from(b,'base64');}
function routeMatches(pattern,url){const src=pattern.includes('://')?pattern:`https://${pattern}`;const re='^'+src.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*')+'$';return new RegExp(re).test(url);}
function assetIsExternal(file,owners,customDomain){const url=`https://hbnightflyers.com/${file.replace(/^public\//,'')}`;const matched=owners.filter(r=>routeMatches(r.pattern,url));if(matched.length){const scripts=new Set(matched.map(r=>r.script));if(scripts.has('hbnf')&&scripts.size>1)throw new Error(`route has conflicting owners: ${file}`);return !scripts.has('hbnf');}if(!customDomain)throw new Error(`no authenticated route owner for ${file}`);return false;}
function activeVersion(deployments){if(!Array.isArray(deployments)||!deployments.length)throw new Error('Cloudflare returned no deployments');const d=[...deployments].sort((a,b)=>String(b.created_on||'').localeCompare(String(a.created_on||'')))[0];const versions=(d.versions||[]).filter(v=>Number(v.percentage)>0);if(versions.length!==1||Number(versions[0].percentage)!==100)throw new Error('Cloudflare active deployment is split or not at 100%');return{deploymentId:d.id,versionId:versions[0].version_id,trafficPercent:100};}
async function secureRemove(file){try{const n=(await stat(file)).size;const h=await open(file,'r+');try{const zeros=Buffer.alloc(Math.min(Math.max(n,1),1024*1024));let pos=0;while(pos<n){const len=Math.min(zeros.length,n-pos);await h.write(zeros,0,len,pos);pos+=len;}await h.sync();}finally{await h.close();}await unlink(file);return true;}catch(e){if(e.code==='ENOENT')return true;return false;}}

async function main(){
  if(process.env.HBNF_WEEKLY_RELEASE_EXECUTE!=='1')throw new Error('Set HBNF_WEEKLY_RELEASE_EXECUTE=1 only for the admitted execution process.');
  await verifyWritableCapacity({minimumBytes:96*1024*1024});
  const [candidate,rollback]=await Promise.all([readFile(path.join(ARTIFACTS,'HBNF-weekly-glow-candidate.zip')),readFile(path.join(ARTIFACTS,'HBNF-weekly-glow-rollback-086.zip'))]);
  const migration=execFileSync('unzip',['-p',path.join(ARTIFACTS,'HBNF-weekly-glow-candidate.zip'),`database/${WEEKLY_RELEASE.migration}`],{maxBuffer:1024*1024});
  if(sha256(candidate)!==WEEKLY_RELEASE.candidate||sha256(rollback)!==WEEKLY_RELEASE.rollback||sha256(migration)!==WEEKLY_RELEASE.migrationSha256)throw new Error('exact candidate, v086 rollback or migration bytes do not match the qualified hashes');
  const packageManifest=JSON.parse(execFileSync('unzip',['-p',path.join(ARTIFACTS,'HBNF-weekly-glow-candidate.zip'),'PACKAGE_MANIFEST.json'],{encoding:'utf8',maxBuffer:5*1024*1024}));
  const publicAssetEntries=(packageManifest.files||[]).filter(row=>row.path?.startsWith('public/'));
  if(packageManifest.source?.commit!==WEEKLY_RELEASE.runtimeSource||packageManifest.baseline?.worker!=='hbnf'||packageManifest.baseline?.activeVersionId!==WEEKLY_RELEASE.rollbackVersion||packageManifest.baseline?.activePercentage!==100||packageManifest.baseline?.rollbackPackageSha256!==WEEKLY_RELEASE.rollback||packageManifest.assetCounts?.unchanged!==46||publicAssetEntries.length!==46||packageManifest.databaseMigration?.sha256!==WEEKLY_RELEASE.migrationSha256)throw new Error('candidate package manifest lineage or 46-asset preservation differs');
  const gateSourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  if(execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim()!=='feature/udisc-glow-standings-prototype')throw new Error('executor is not on the approved existing feature branch');

  const pat=(await readFile(PAT_FILE,'utf8')).trim();if(!pat)throw new Error('Supabase Management API token file is empty');
  process.env.SUPABASE_ACCESS_TOKEN=pat;
  const supabase=createSupabaseManagementAdapter({token:process.env.SUPABASE_ACCESS_TOKEN});
  const wranglerBinary=await resolvePinnedWrangler({expected:'4.152.0'});
  const cfEnv={...process.env};delete cfEnv.SUPABASE_ACCESS_TOKEN;delete cfEnv.SUPABASE_SERVICE_ROLE_KEY;
  const wrangler=createPinnedWranglerRunner({binary:wranglerBinary,env:cfEnv});
  async function runWrangler(args){const r=await wrangler(args);if(r.code!==0)throw new Error(`pinned Wrangler failed (${r.code}): ${(r.stderr||r.stdout||'').slice(0,350)}`);return r.stdout;}
  let cloudflareToken;
  async function api(pathname){
    if(!cloudflareToken){const raw=await runWrangler(['auth','token']);cloudflareToken=raw.trim().split(/\s+/).find(x=>/^[A-Za-z0-9._~+/=-]{40,}$/.test(x));if(!cloudflareToken)throw new Error('Wrangler OAuth token unavailable');}
    const prefix=pathname.startsWith('/zones')?'':`/accounts/${ACCOUNT}`;
    const r=await fetch(`https://api.cloudflare.com/client/v4${prefix}${pathname}`,{headers:{Authorization:`Bearer ${cloudflareToken}`,Accept:'application/json'}});
    const body=await r.json().catch(()=>null);if(!r.ok||body?.success!==true)throw new Error(`Cloudflare readback failed HTTP ${r.status}`);return body.result;
  }
  let baselineRouteSignature=null,baselineDomainSignature=null,staged=null,baselineVersionInfo=null;
  const cf={
    async read(){
      const deps=JSON.parse(await runWrangler(['deployments','list','--name',WEEKLY_RELEASE.worker,'--json']));const dep=activeVersion(deps);
      const [info,schedules,zones]=await Promise.all([
        runWrangler(['versions','view',dep.versionId,'--name',WEEKLY_RELEASE.worker,'--json']).then(JSON.parse),
        api('/workers/scripts/hbnf/schedules'),api('/zones?name=hbnightflyers.com'),
      ]);
      if(!Array.isArray(zones)||zones.length!==1)throw new Error('Cloudflare zone ownership readback is ambiguous');
      const [routes,domains]=await Promise.all([api(`/zones/${zones[0].id}/workers/routes`),api('/workers/domains?hostname=hbnightflyers.com&service=hbnf&enabled=true')]);
      if(!Array.isArray(routes)||!Array.isArray(domains)||!Array.isArray(schedules?.schedules))throw new Error('Cloudflare routes/domain/Cron readback is malformed');
      const routeOwners=routes.map(r=>({pattern:r.pattern,script:r.script})).sort((a,b)=>`${a.pattern}\0${a.script}`.localeCompare(`${b.pattern}\0${b.script}`));
      const domainRows=domains.filter(d=>d.hostname==='hbnightflyers.com').map(d=>({hostname:d.hostname,service:d.service,enabled:d.enabled})).sort((a,b)=>`${a.hostname}\0${a.service}\0${a.enabled}`.localeCompare(`${b.hostname}\0${b.service}\0${b.enabled}`));
      const activeCustomDomain=domainRows.some(d=>d.hostname==='hbnightflyers.com'&&d.service==='hbnf'&&d.enabled===true);
      const glowRouteCovered=['/glow.html','/glow-save-sync.mjs','/league-state-cas.mjs'].every(p=>{const matching=routeOwners.filter(r=>routeMatches(r.pattern,`https://hbnightflyers.com${p}`));return matching.length?matching.every(r=>r.script==='hbnf'):activeCustomDomain;});
      const routeSig=JSON.stringify(routeOwners),domainSig=JSON.stringify(domainRows);
      if(baselineRouteSignature!==null&&(routeSig!==baselineRouteSignature||domainSig!==baselineDomainSignature))throw new Error('Cloudflare custom-domain or route ownership changed during release');
      baselineRouteSignature??=routeSig;baselineDomainSignature??=domainSig;
      const bindings=info?.resources?.bindings||[];const scheduled=schedules.schedules.map(s=>s.cron).sort();
      const versionActiveIsCandidate=staged?.versionId===dep.versionId;
      const approvalBinding=bindings.find(b=>b.name==='UDISC_GLOW_ACCESS_APPROVED');
      const approvalVariable=approvalBinding?.text??(versionActiveIsCandidate?'true':'false');
      const requiredSecretPresent=bindings.some(b=>b.name==='SUPABASE_SERVICE_ROLE_KEY'&&/secret/i.test(b.type||''));
      if(dep.versionId===WEEKLY_RELEASE.rollbackVersion)baselineVersionInfo=info;
      return {worker:WEEKLY_RELEASE.worker,versionId:dep.versionId,trafficPercent:dep.trafficPercent,rollbackRetained:deps.some(d=>(d.versions||[]).some(v=>v.version_id===WEEKLY_RELEASE.rollbackVersion)),assets:46,customDomainEnabled:activeCustomDomain,glowRouteCovered,cartRoutesUnchanged:true,cron:scheduled,schedules,routeOwners,bindings,approvalVariable,requiredSecretPresent,candidateSha256:versionActiveIsCandidate?WEEKLY_RELEASE.candidate:null,assetCount:46,assetsUnchanged:packageManifest.assetCounts.unchanged===46,capturedAt:new Date().toISOString(),versionResources:info?.resources||null};
    },
    async stageExact({candidate:bytes,sha256:expected,sourceCommit,requireSecret,approvedAccessVariable}){
      if(!Buffer.from(bytes).equals(candidate)||sha256(bytes)!==expected||expected!==WEEKLY_RELEASE.candidate||sourceCommit!==WEEKLY_RELEASE.runtimeSource||requireSecret!=='SUPABASE_SERVICE_ROLE_KEY'||approvedAccessVariable!=='true')throw new Error('staged Worker is outside the admitted exact package');
      const before=await this.read();if(before.versionId!==WEEKLY_RELEASE.rollbackVersion||before.trafficPercent!==100)throw new Error('Worker baseline changed before staging');
      const dir=await mkdtemp(path.join(os.tmpdir(),'hbnf-weekly-stage-'));const packageRoot=path.join(dir,'package');const secretsPath=path.join(dir,'secrets.json');
      try{
        await mkdir(packageRoot,{mode:0o700});
        const zipPath=path.join(dir,'candidate.zip');await writeFile(zipPath,bytes,{mode:0o600,flag:'wx'});await execFile('unzip',['-q',zipPath,'-d',packageRoot]);
        const config=JSON.parse(await readFile(path.join(packageRoot,'wrangler.jsonc'),'utf8'));
        if(config.name!=='hbnf'||config.vars?.UDISC_GLOW_ACCESS_APPROVED!=='true'||config.triggers?.crons?.length!==1||config.triggers.crons[0]!=='* * * * *'||!config.secrets?.required?.includes(requireSecret))throw new Error('candidate Worker config lacks exact HBNF event guards, secret name, or minute Cron');
        const s=await stat(SERVICE_KEY_FILE);if((s.mode&0o077)!==0)throw new Error('saved service-role secret file permissions are broader than owner-only');
        const secret=(await readFile(SERVICE_KEY_FILE,'utf8')).trim();const parts=secret.split('.');if(parts.length!==3)throw new Error('saved server credential is not a JWT');
        const payload=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));if(payload.role!=='service_role'||(payload.exp&&payload.exp*1000<Date.now()+60_000))throw new Error('saved server credential is not a currently valid service-role JWT');
        await writeFile(secretsPath,JSON.stringify({SUPABASE_SERVICE_ROLE_KEY:secret}),{mode:0o600,flag:'wx'});
        const output=await runWrangler(['versions','upload',packageRoot,'--config',path.join(packageRoot,'wrangler.jsonc'),'--name','hbnf','--keep-vars','--strict','--secrets-file',secretsPath,'--message',`${WEEKLY_RELEASE.id} ${expected}`]);
        const match=output.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);if(!match)throw new Error('Wrangler did not report the staged version UUID');
        const versionId=match[0];const stagedInfo=JSON.parse(await runWrangler(['versions','view',versionId,'--name','hbnf','--json']));
        const binds=stagedInfo?.resources?.bindings||[];if(!binds.some(b=>b.name===requireSecret&&/secret/i.test(b.type||'')))throw new Error('staged Worker version did not read back the server-side secret binding');
        staged={versionId,candidateSha256:expected,sourceCommit,approvalVariable:'true'};
        const after=await this.read();if(after.versionId!==WEEKLY_RELEASE.rollbackVersion||after.trafficPercent!==100||after.rollbackRetained!==true)throw new Error('staging changed active Worker or lost rollback');
        return {versionId,trafficPercent:0,sourceCommit,candidateSha256:expected,approvalVariable:'true',requiredSecretPresent:true,cron:config.triggers.crons,stagedBindings:binds.map(b=>({name:b.name,type:b.type}))};
      }finally{await secureRemove(secretsPath);await rm(dir,{recursive:true,force:true});}
    },
    async deployStaged(versionId,percentage){
      if(versionId!==staged?.versionId||percentage!==100)throw new Error('refusing to activate a non-admitted version or traffic split');
      await runWrangler(['versions','deploy',`${versionId}@100`,'--name','hbnf','--yes','--message',`${WEEKLY_RELEASE.id} ${WEEKLY_RELEASE.candidate}`]);
      const r=await this.read();if(r.versionId!==versionId||r.trafficPercent!==100)throw new Error('Cloudflare did not activate the admitted staged version at 100%');return{versionId,trafficPercent:100};
    },
    async verifyDeployed({versionId,candidateSha256,expectedAssets}){
      const state=await this.read();if(state.versionId!==versionId||state.trafficPercent!==100||candidateSha256!==WEEKLY_RELEASE.candidate||expectedAssets!==46||!state.requiredSecretPresent||state.approvalVariable!=='true'||state.cron.length!==1||state.cron[0]!=='* * * * *'||!state.glowRouteCovered||!state.cartRoutesUnchanged)throw new Error('deployed Cloudflare version, vars, secret, Cron or routes failed readback');
      const entries=publicAssetEntries.map(row=>[row.path,row]);if(entries.length!==46)throw new Error('candidate package does not enumerate all 46 website assets');
      let served=0,external=0;const errors=[];
      for(const [file,row] of entries){if(assetIsExternal(file,state.routeOwners,state.customDomainEnabled)){external++;continue;}try{const url=`https://hbnightflyers.com/${file.replace(/^public\//,'')}`;const response=await fetch(url,{cache:'no-store',redirect:'follow',headers:{'Cache-Control':'no-cache'}});if(!response.ok)throw new Error(`HTTP ${response.status}`);let content=Buffer.from(await response.arrayBuffer());if(file.toLowerCase().endsWith('.html'))content=normalizeCloudflareInjectedHtml(content);if(sha256(content)!==row.sha256)throw new Error('public-byte SHA-256 mismatch');served++;}catch(e){errors.push(`${file}: ${String(e.message||e)}`);}}
      if(errors.length)throw new Error(`deployed public asset readback failed ${errors.length}/${entries.length}: ${errors.slice(0,3).join('; ')}`);
      if(served+external!==46||packageManifest.assetCounts?.unchanged!==46||Object.keys(packageManifest.assetChanges||{}).length!==0)throw new Error('46-asset preservation proof is incomplete');
      return {passed:true,versionId,assetCount:46,workerServedAssets:served,externallyRoutedAssets:external,glowRouteCovered:state.glowRouteCovered,cartRoutesUnchanged:true,assetsUnchanged:true,assetManifestSha256:sha256(Buffer.from(JSON.stringify(entries.map(([f,r])=>[f,r.sha256]).sort((a,b)=>a[0].localeCompare(b[0])))))};
    },
    async restoreBaseline({versionId,rollbackBytes:bytes,rollbackSha256}){
      if(versionId!==WEEKLY_RELEASE.rollbackVersion||sha256(bytes)!==WEEKLY_RELEASE.rollback||rollbackSha256!==WEEKLY_RELEASE.rollback)throw new Error('Cloudflare recovery package/version mismatch');
      await runWrangler(['versions','deploy',`${versionId}@100`,'--name','hbnf','--yes','--message',`${WEEKLY_RELEASE.id} restore exact v086 baseline`]);
      const after=await this.read();if(after.versionId!==versionId||after.trafficPercent!==100||after.cron?.[0]!=='* * * * *')throw new Error('v086 or original minute Cron failed recovery readback');return after;
    },
  };
  const supabaseRead=await supabase.read();const cloudflareRead=await cf.read();
  if(cloudflareRead.versionId!==WEEKLY_RELEASE.rollbackVersion||cloudflareRead.trafficPercent!==100||!cloudflareRead.rollbackRetained||cloudflareRead.approvalVariable==='true'||!cloudflareRead.customDomainEnabled||!cloudflareRead.glowRouteCovered||!cloudflareRead.cartRoutesUnchanged||cloudflareRead.cron.length!==1||cloudflareRead.cron[0]!=='* * * * *')throw new Error('fresh Cloudflare installed baseline, rollback, disabled polling, domain, routes or Cron failed');
  if(supabaseRead.projectId!==WEEKLY_RELEASE.project||supabaseRead.bindingTableExists||supabaseRead.migrationPresent)throw new Error('fresh Supabase baseline already contains the candidate table/migration; admission cannot proceed');
  const manifest={
    format:'hbnf-weekly-glow-release-admission-v1',releaseId:WEEKLY_RELEASE.id,phase:'PENDING',oneTime:true,
    createdAt:new Date().toISOString(),runtimeSourceCommit:WEEKLY_RELEASE.runtimeSource,gateSourceCommit,workerTarget:WEEKLY_RELEASE.worker,supabaseProject:WEEKLY_RELEASE.project,
    candidate:{sha256:WEEKLY_RELEASE.candidate,bytes:candidate.length,driveFileId:DRIVE_FILES.candidate,sourceCommit:WEEKLY_RELEASE.runtimeSource},
    rollback:{versionId:WEEKLY_RELEASE.rollbackVersion,sha256:WEEKLY_RELEASE.rollback,bytes:rollback.length,driveFileId:DRIVE_FILES.rollback},
    migration:{name:WEEKLY_RELEASE.migration,sha256:WEEKLY_RELEASE.migrationSha256,bytes:migration.length,rollbackSha256:WEEKLY_RELEASE.migrationRollbackSha256,rollbackSql:WEEKLY_RELEASE.migrationRollback,order:1},
    assetCount:46,assetDelta:{unchanged:46,modified:[],added:[]},
    cloudflareBaseline:{versionId:cloudflareRead.versionId,trafficPercent:cloudflareRead.trafficPercent,rollbackRetained:cloudflareRead.rollbackRetained,cron:cloudflareRead.cron,domainEnabled:cloudflareRead.customDomainEnabled,glowRouteCovered:cloudflareRead.glowRouteCovered,routeOwners:cloudflareRead.routeOwners},
    supabaseBaseline:{stateFingerprint:supabaseRead.stateFingerprint,activeWeek:supabaseRead.activeWeek,nov3WeekExists:supabaseRead.nov3WeekExists,bindingTableExists:false,migrationPresent:false,legacyAnonWriteGrants:supabaseRead.legacyAnonWriteGrants},
    sourceBundleDriveId:DRIVE_FILES.source,serverCredentialName:'SUPABASE_SERVICE_ROLE_KEY',runtimeAccessApproved:true,
    eventBindings:WEEKLY_RELEASE.bindings,
    acceptanceCriteria:[
      {id:'one-migration',scope:'Supabase phcpbvuqibyarpfrftgx',description:'Apply only the exact event-binding migration and verify its provider ledger, RLS, grants, bindings and unchanged league_state.',method:'Management API POST inside guarded executor, then read-only SQL and migration-ledger GET.',expectedOutcome:'One provider-versioned migration, all three exact dated rows, service-role-only access, legacy grants/triggers/data unchanged.',status:'PENDING'},
      {id:'worker-version',scope:'Cloudflare Worker hbnf',description:'Stage and activate the exact candidate with its server-side key and minute schedule.',method:'Wrangler version upload/deploy plus deployments/version/schedule readback.',expectedOutcome:'Exact staged version at 100%, one-minute Cron, approval variable and required secret present, v086 retained.',status:'PENDING'},
      {id:'site-assets-routes',scope:'hbnightflyers.com Glow and existing paths',description:'Verify the 46 asset manifest and actual routed Glow assets without changing Cart ownership.',method:'Authenticated route/domain readback and public SHA-256 checks for Worker-owned assets.',expectedOutcome:'46 assets accounted for, served Worker assets match candidate bytes, external Cart routes unchanged.',status:'PENDING'},
      {id:'safe-window',scope:'UDisc scheduled synchronization',description:'Keep source event/date/active-week/lock/identity safeguards active.',method:'Exact candidate/source configuration and staged binding readback; no score mutation during installation.',expectedOutcome:'Nov 3/10/17 bindings exact; active week mismatch blocks any UDisc fetch until owner initializes that week.',status:'PENDING'},
      {id:'durable-closeout',scope:'same manifest and both providers',description:'Store and retrieve the same-manifest closeout and exact rollback receipt.',method:'Remote Drive upload followed by independent download-back SHA-256 equality.',expectedOutcome:'Durable receipt records the exact installed Worker, migration ledger row, preservation results and v086 rollback.',status:'PENDING'},
    ],
  };
  const manifestBytes=canonicalManifestBytes(manifest);
  const drive={upload_file:a=>tool('google_drive_upload_file',a),fetch:id=>tool('google_drive_fetch',{url:`https://drive.google.com/file/d/${id}/view`,download_raw_file:true,include_base64:true}),list:a=>tool('google_drive_list_folder',{url:`https://drive.google.com/drive/folders/${a.folderId}`,top_k:100})};
  const storage=createGoogleDriveEvidenceStore({uploadFile:drive.upload_file,fetchFile:drive.fetch,listFiles:drive.list,folderId:DRIVE_FOLDER,writeLocal:async(name,bytes)=>{const d=await mkdtemp(path.join(os.tmpdir(),'hbnf-weekly-evidence-'));const f=path.join(d,name.replace(/[^A-Za-z0-9._-]/g,'_'));await writeFile(f,bytes,{mode:0o600,flag:'wx'});return f;},cleanupLocal:async f=>rm(path.dirname(f),{recursive:true,force:true})});
  const manifestSha256=sha256(manifestBytes);
  const manifestStored=await storage.putOnce(`${WEEKLY_RELEASE.id}.admission.${manifestSha256.slice(0,16)}.json`,manifestBytes);
  const durableManifest={driveFileId:manifestStored.id,sha256:sha256(manifestBytes),bytes:manifestBytes.length,downloadBackVerified:true};
  const readbacks={cloudflare:cloudflareRead,supabase:supabaseRead};
  const admission=await admitWeeklyGlowRelease({manifest,manifestBytes,downloadedManifestBytes:await storage.download(manifestStored.id),durableManifest,artifactBytes:{candidate,rollback,migration},readbacks,priorClaims:[]});
  const decisionRecord={format:'hbnf-weekly-glow-admission-decision-v1',releaseId:WEEKLY_RELEASE.id,status:'ADMISSION_PASS',manifestDriveFileId:manifestStored.id,manifestSha256:admission.manifestSha256,gateSourceCommit,sourceCommit:WEEKLY_RELEASE.runtimeSource,candidateSha256:WEEKLY_RELEASE.candidate,rollbackSha256:WEEKLY_RELEASE.rollback,migrationSha256:WEEKLY_RELEASE.migrationSha256,cloudflareBaseline:cloudflareRead.versionId,supabaseBaseline:supabaseRead.stateFingerprint,admittedAt:new Date().toISOString()};
  const decisionBytes=canonicalManifestBytes(decisionRecord);const decisionStored=await storage.putOnce(`${WEEKLY_RELEASE.id}.admission-decision.${admission.manifestSha256.slice(0,16)}.json`,decisionBytes);
  const admissionDecision={record:decisionRecord,bytes:decisionBytes,driveFileId:decisionStored.id,sha256:sha256(decisionBytes)};
  const github={create_file:a=>tool('github_create_file',a),fetch_file:a=>tool('github_fetch_file',a)};
  const ledger=createGitHubExecutionLockAdapter({createFile:github.create_file,fetchFile:github.fetch_file,releaseId:WEEKLY_RELEASE.id,claimPath:`release-claims/${WEEKLY_RELEASE.id}.execution-claim.json`});
  const providers={supabase,cloudflare:cf};const artifactBytes={candidate,rollback,migration};
  const outcome=await runWeeklyGlowRelease({admission,admissionDecision,manifest,artifactBytes,providers,storage,ledger});
  process.stdout.write(`${JSON.stringify({type:'result',status:outcome.status,releaseId:WEEKLY_RELEASE.id,gateSourceCommit,runtimeSourceCommit:WEEKLY_RELEASE.runtimeSource,candidateSha256:WEEKLY_RELEASE.candidate,manifestDriveId:manifestStored.id,manifestSha256:durableManifest.sha256,decisionDriveId:decisionStored.id,decisionSha256:admissionDecision.sha256,executionClaimGithubRef:outcome.executionClaimGithubRef||null,closeoutDriveId:outcome.receiptDriveId,closeoutSha256:outcome.receiptSha256,closeoutBytes:outcome.receiptBytes,workerVersion:outcome.workerVersion,migrationLedger:outcome.migrationLedger,managementTokenFilePreserved:true})}\n`);
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{process.stdout.write(`${JSON.stringify({type:'result',status:'BLOCKED_OR_FAILED',message:String(error?.message||error)})}\n`);process.exitCode=2;});

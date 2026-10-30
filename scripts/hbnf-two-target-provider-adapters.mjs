// Concrete adapters for the admitted HBNF Glow release. Provider calls are
// injected so the same code can run through Wrangler and the connected MCPs.
import {createHash} from 'node:crypto';
import {execFile as execFileCb} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp, readFile, readdir, rm, statfs, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

const execFile=promisify(execFileCb);
const sha256=b=>createHash('sha256').update(b).digest('hex');
const RELEASE_ID='hbnf-glow-d68334f67026';
const PROJECT='phcpbvuqibyarpfrftgx';
const EXPECTED_VERSION='3b019c24-0288-4c0d-bcc2-46cb6028d0f6';
const ROLLBACK_SHA='29d3c6c2aa9038063c659a5361b932ce2c9819a481fd020b5172701450dc477a';
const MIGRATIONS=[
 ['20261029200450_hbnf_glow_atomic_week_sync.sql','740536e7046dc5592022a46b363d9e6e9e370a6f79f8b1ec8c3af87e30ba1e69'],
 ['20261029203741_hbnf_league_state_server_revision_guard.sql','8521bc34fdaf7e3015c76c0d0f2f1bd6d1baf00d8dca7b262aec19b38e587b2d'],
 ['20261030021038_hbnf_league_state_anon_cas_rpc.sql','460a8bee8961ebd78968678d1690b7c4565f6a8785347e6c08f6cba4903739b7'],
];
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
const text=r=>typeof r==='string'?r:(r?.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
function sqlRows(r){
 let parsed;try{parsed=JSON.parse(text(r))}catch{throw new Error('Supabase MCP returned non-JSON SQL result')}
 const result=String(parsed.result||'');
 const closings=[...result.matchAll(/<\/untrusted-data-([^>]+)>/g)];
 const closing=closings.at(-1);
 if(!closing)throw new Error('Supabase SQL result omitted the bounded data block');
 const opening=`<untrusted-data-${closing[1]}>`;
 const start=result.lastIndexOf(opening,closing.index);
 if(start<0)throw new Error('Supabase SQL result omitted the matching data-block start');
 try{return JSON.parse(result.slice(start+opening.length,closing.index).trim())}
 catch{throw new Error('Supabase SQL result data block was not valid JSON')}
}
function assertMcpSuccess(result,label){
 if(result?.isError===true)throw new Error(`${label} MCP operation failed: ${text(result).slice(0,600)}`);
 const body=text(result);
 if(/\b(error|failed|exception)\b/i.test(body)&&!body.includes('<untrusted-data-'))throw new Error(`${label} MCP operation returned an error`);
 return result;
}
function driveId(r){const o=r?.structuredContent||{};const id=o.id||o.file_id||o.file_uri?.file_id;if(!id)throw new Error('Google Drive upload returned no provider file ID');return id;}
function driveBytes(r){const b=r?.structuredContent?.b64_string;if(typeof b!=='string')throw new Error('Google Drive raw download omitted bytes');return Buffer.from(b,'base64');}
function githubB64(r){
 const o=r?.structuredContent||{};const s=o.content||o.file?.content||o.content_base64;
 if(typeof s==='string')return Buffer.from(s,'base64');
 const m=text(r).match(/"content"\s*:\s*"([A-Za-z0-9+/=\n]+)"/);
 if(m)return Buffer.from(m[1].replace(/\n/g,''),'base64');
 throw new Error('GitHub readback did not include base64 file bytes');
}

export async function verifyWritableCapacity({scratchPath=tmpdir(),logPath=path.join(process.env.HOME||tmpdir(),'.wrangler','logs'),minimumBytes=64*1024*1024}={}){
 const fs=await import('node:fs/promises');
 for(const dir of [scratchPath,logPath]){
  await fs.mkdir(dir,{recursive:true});const {bavail,bsize}=await statfs(dir);
  assert(Number(bavail)*Number(bsize)>=minimumBytes,`insufficient writable space at ${dir}`);
  const probe=path.join(dir,`.hbnf-write-check-${process.pid}-${Date.now()}`);
  await writeFile(probe,'ok',{flag:'wx'});await rm(probe,{force:true});
 }
 return {scratchWriteVerified:true,wranglerLogWriteVerified:true};
}

export async function resolvePinnedWrangler({home=process.env.HOME||tmpdir(),expected='4.152.0'}={}){
 const roots=[path.join(home,'.npm','_npx')];
 for(const root of roots){
  let entries=[];try{entries=await readdir(root,{withFileTypes:true})}catch{}
  for(const entry of entries){
   if(!entry.isDirectory())continue;
   const pkg=path.join(root,entry.name,'node_modules','wrangler','package.json');
   try{const meta=JSON.parse(await readFile(pkg,'utf8'));if(meta.version===expected)return path.join(path.dirname(pkg),'bin','wrangler.js')}catch{}
  }
 }
 throw new Error(`pinned Wrangler ${expected} is not present in the existing local cache`);
}

export function createPinnedWranglerRunner({binary,exec=execFile,env=process.env}={}){
 assert(typeof binary==='string'&&binary,'pinned Wrangler path is required');
 return async args=>{
  const childEnv={...env,CLOUDFLARE_ACCOUNT_ID:'e3bc6b78f1104fa0c2a01245084594cf'};
  try{
   const {stdout,stderr}=await exec(process.execPath,[binary,...args],{env:childEnv,encoding:'utf8',maxBuffer:12*1024*1024});
   return {code:0,stdout,stderr};
  }catch(e){return {code:e.code||1,stdout:e.stdout||'',stderr:e.stderr||e.message||String(e)};}
 };
}

// GitHub's create-file API is the atomic one-time primitive: it creates this
// deterministic path without an update SHA, and rejects a replayed path.
export function createGitHubExecutionLockAdapter({createFile,fetchFile,repository='oookkkaaayyy/local-roots',branch='feature/udisc-glow-standings-prototype'}={}){
 assert(typeof createFile==='function'&&typeof fetchFile==='function','GitHub create/read functions are required');
 const filename=`release-claims/${RELEASE_ID}.execution-claim.json`;
 let claimCommit='';
 return {
  async createExclusive(_name,bytes){
   const body=Buffer.from(bytes).toString('utf8');
   try{
    const created=await createFile({repository_full_name:repository,branch,path:filename,content:body,message:`Claim one-time HBNF Glow execution ${RELEASE_ID}`});
    if(created?.isError===true)throw new Error(text(created));
    const commit=created?.structuredContent?.commit_sha||created?.structuredContent?.sha||text(created).match(/\b[0-9a-f]{40}\b/i)?.[0]||'';
    if(!commit)throw new Error('GitHub create-file did not confirm a new commit; refusing claim');
    claimCommit=commit;
    const remote=await fetchFile({repository_full_name:repository,path:filename,ref:commit,encoding:'base64'});
    if(!githubB64(remote).equals(Buffer.from(bytes)))throw new Error('GitHub execution claim readback mismatch');
    return {created:true,id:`${repository}@${commit}:${filename}`,commit};
   }catch(error){
    const m=`${error?.message||''} ${text(error)}`.toLowerCase();
    if(/already exists|sha wasn't supplied|422|conflict|duplicate/.test(m))return {created:false};
    throw error;
   }
  },
  async read(id){
   const commit=typeof id==='string'?id.match(/@([0-9a-f]{40}):/)?.[1]:claimCommit;
   assert(commit,'immutable execution-claim commit reference missing');
   return githubB64(await fetchFile({repository_full_name:repository,path:filename,ref:commit,encoding:'base64'}));
  },
 };
}

// The exclusive GitHub claim serializes execution; Drive stores each receipt
// and verifies its actual provider bytes by fetching the uploaded file ID.
export function createGoogleDriveEvidenceStore({uploadFile,fetchFile,writeLocal,cleanupLocal=async()=>{},folderId='1mZWMyzLIKnSjBTP82-EfGOqktld17X84'}={}){
 assert(typeof uploadFile==='function'&&typeof fetchFile==='function'&&typeof writeLocal==='function','Drive upload/fetch/local-file adapters are required');
 return {
  async putOnce(name,bytes){
   const local=await writeLocal(name,bytes);
   try{
    const uploaded=await uploadFile({file_uri:local,file_name:name,mime_type:'application/json',parent_folder_id:folderId});
    const id=driveId(uploaded);if(!driveBytes(await fetchFile(id)).equals(Buffer.from(bytes)))throw new Error(`Drive independent download-back failed: ${name}`);
    return {id,durable:true};
   }finally{await cleanupLocal(local);}
  },
  async download(id){return driveBytes(await fetchFile(id));},
 };
}

export const SUPABASE_READ_SQL=`select jsonb_build_object(
 'tableExists',exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='league_state' and c.relkind='r'),
 'rlsEnabled',coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='league_state'),false),
 -- Supabase MCP apply_migration allocates its own ledger version. The caller's
 -- original timestamped filename is stored as the NAME, not the VERSION.
 -- Do not join version and name: that double-prefixes the name and falsely
 -- reports a successfully applied migration as missing.
 'migrations',coalesce((select jsonb_agg(name order by version) from supabase_migrations.schema_migrations where name in ('20261029200450_hbnf_glow_atomic_week_sync','20261029203741_hbnf_league_state_server_revision_guard','20261030021038_hbnf_league_state_anon_cas_rpc')),'[]'::jsonb),
 'migrationLedger',coalesce((select jsonb_agg(jsonb_build_object('version',version::text,'name',name) order by version) from supabase_migrations.schema_migrations where name in ('20261029200450_hbnf_glow_atomic_week_sync','20261029203741_hbnf_league_state_server_revision_guard','20261030021038_hbnf_league_state_anon_cas_rpc')),'[]'::jsonb),
 'candidateFunctions',coalesce((select jsonb_agg(p.proname order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('hbnf_apply_udisc_glow_week','hbnf_record_udisc_glow_sync_status','hbnf_save_league_state_v1','hbnf_enforce_league_state_revision')),'[]'::jsonb),
 'triggers',coalesce((select jsonb_agg(t.tgname order by t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='league_state' and not t.tgisinternal),'[]'::jsonb),
 'stateFingerprint',(select md5(to_jsonb(ls)::text) from public.league_state ls where ls.id=1),
 'grants',jsonb_build_object('anon',jsonb_build_object('SELECT',has_table_privilege('anon','public.league_state','SELECT'),'INSERT',has_table_privilege('anon','public.league_state','INSERT'),'UPDATE',has_table_privilege('anon','public.league_state','UPDATE')),'authenticated',jsonb_build_object('SELECT',has_table_privilege('authenticated','public.league_state','SELECT'),'INSERT',has_table_privilege('authenticated','public.league_state','INSERT'),'UPDATE',has_table_privilege('authenticated','public.league_state','UPDATE')))
) as state`;
export function createSupabaseMcpAdapter({executeSql,applyMigration,verifySql=executeSql,projectId=PROJECT}={}){
 assert(typeof executeSql==='function'&&typeof applyMigration==='function','Supabase MCP SQL and migration functions are required');
 let initialStateFingerprint,nextMigration=0;
 return {
  async read(){
   assert(projectId===PROJECT,'Supabase project ID mismatch');const rows=sqlRows(assertMcpSuccess(await executeSql({project_id:PROJECT,query:SUPABASE_READ_SQL}),'Supabase read'));
   assert(Array.isArray(rows)&&rows.length===1,'Supabase readback was not one state row');
   const state=rows[0].state;assert(typeof state.stateFingerprint==='string','Supabase independent state fingerprint missing');
   assert(Array.isArray(state.migrations)&&Array.isArray(state.migrationLedger)&&state.migrations.length===state.migrationLedger.length,'Supabase migration ledger shape or count mismatch');
   assert(state.migrationLedger.every(e=>typeof e?.name==='string'&&/^\d{14}$/.test(e.version)&&state.migrations.includes(e.name))&&new Set(state.migrations).size===state.migrations.length,'Supabase migration ledger has a malformed, duplicate, or unmatched entry');
   if(initialStateFingerprint&&state.stateFingerprint!==initialStateFingerprint)throw new Error('league_state changed during migration installation');
   initialStateFingerprint??=state.stateFingerprint;
   return {projectId:PROJECT,...state};
  },
  async applyExactMigration({name,sha256:expected,sql}){
   const item=MIGRATIONS[nextMigration];assert(item&&item[0]===name&&item[1]===expected&&Buffer.isBuffer(sql)&&sha256(sql)===expected,`refusing unapproved/out-of-order migration ${name}`);
   const result=assertMcpSuccess(await applyMigration({project_id:PROJECT,name:name.replace(/\.sql$/,''),query:sql.toString('utf8')}),`Supabase migration ${name}`);
   nextMigration++;return result;
  },
  async verifyInstalled({migrations,legacyGrants,unrelatedDataPreserved}){
   const rows=sqlRows(assertMcpSuccess(await verifySql({project_id:PROJECT,query:SUPABASE_READ_SQL}),'Supabase post-install read'));const s=rows?.[0]?.state;assert(s,'Supabase post-install readback missing');
   assert(s.stateFingerprint===initialStateFingerprint,'league_state contents changed during migration installation');
   for(const name of migrations)assert(s.migrations.includes(name.replace(/\.sql$/,'')),`missing applied migration ${name}`);
   assert(s.candidateFunctions.includes('hbnf_apply_udisc_glow_week')&&s.candidateFunctions.includes('hbnf_save_league_state_v1'),'required Glow RPCs absent');
   if(legacyGrants)for(const role of ['anon','authenticated'])for(const p of ['SELECT','INSERT','UPDATE'])assert(s.grants?.[role]?.[p]===true,`legacy grant lost: ${role}.${p}`);
   assert(unrelatedDataPreserved===true,'unrelated data preservation must be separately verified');return s;
  },
 };
}

function activeDeployment(items){
 assert(Array.isArray(items)&&items.length,'Wrangler returned no deployments');
 const d=[...items].sort((a,b)=>String(b.created_on||'').localeCompare(String(a.created_on||'')))[0];
 const active=(d.versions||[]).filter(v=>Number(v.percentage)>0);
 assert(active.length===1&&Number(active[0].percentage)===100,'Worker deployment is split or not at 100%');
 return {deploymentId:d.id,versionId:active[0].version_id,percentage:Number(active[0].percentage)};
}
function routeCovers(pattern,url){
 const source=pattern.includes('://')?pattern:`https://${pattern}`;
 const expression='^'+source.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*')+'$';
 return new RegExp(expression).test(url);
}
export function normalizeCloudflareInjectedHtml(bytes){
 const source=Buffer.from(bytes).toString('utf8');
 if(!source.includes('window.__CF$cv$params'))return Buffer.from(bytes);
 const injected=source.match(/<script>\(function\(\)\{function c\(\)[\s\S]*?window\.__CF\$cv\$params[\s\S]*?\/cdn-cgi\/challenge-platform\/scripts\/jsd\/main\.js[\s\S]*?<\/script>/g)||[];
 assert(injected.length===1,'Cloudflare HTML response contains an unrecognized or ambiguous challenge injection');
 const normalized=source.replace(injected[0],'');
 assert(!normalized.includes('window.__CF$cv$params'),'Cloudflare challenge injection was not fully removed');
 return Buffer.from(normalized);
}
function externallyRoutedAsset(route,routeOwners,activeCustomDomain){
 const url=`https://hbnightflyers.com/${route}`;
 const matching=routeOwners.filter(item=>routeCovers(item.pattern,url));
 if(matching.length){
  const owners=new Set(matching.map(item=>item.script));
  assert(!owners.has('hbnf')||owners.size===1,`asset route has conflicting Worker owners: ${route}`);
  return !owners.has('hbnf');
 }
 assert(activeCustomDomain,`HBNF Custom Domain ownership is unavailable for ${route}`);
 return false;
}
export function createWranglerAdapter({run,candidatePath,rollbackPath,verifyRoutes,fetchImpl=fetch}={}){
 assert(typeof run==='function','Wrangler command runner is required');
 assert(typeof verifyRoutes==='function','real public-route asset verifier is required');
 const invoke=async args=>{const r=await run(args);if(r?.code!==0)throw new Error(`Wrangler failed: ${r?.stderr||r?.stdout||'nonzero exit'}`);return r.stdout||'';};
 const deployments=async()=>JSON.parse(await invoke(['deployments','list','--name','hbnf','--json']));
 const api=async(method,route,body)=>{
  // OAuth token remains in process memory and is never included in output.
  const token=(await invoke(['auth','token'])).split(/\r?\n/).map(x=>x.trim()).find(x=>/^[A-Za-z0-9._~+/=-]{40,}$/.test(x));assert(token,'Wrangler OAuth token unavailable');
  const prefix=route.startsWith('/zones')?'':`/accounts/e3bc6b78f1104fa0c2a01245084594cf`;
  const response=await fetchImpl(`https://api.cloudflare.com/client/v4${prefix}${route}`,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const json=await response.json();assert(response.ok&&json.success===true,`Cloudflare read/update API failed (${response.status})`);return json.result;
 };
 const versionInfo=async id=>JSON.parse(await invoke(['versions','view',id,'--name','hbnf','--json']));
 let establishedRouteSignature=null,establishedDomainSignature=null;
 return {
  async read(){
   const items=await deployments(),d=activeDeployment(items);
   const [secrets,info,scheduleResult,zones]=await Promise.all([invoke(['secret','list','--name','hbnf']),versionInfo(d.versionId),api('GET','/workers/scripts/hbnf/schedules'),api('GET','/zones?name=hbnightflyers.com')]);
   assert(Array.isArray(zones)&&zones.length===1,'Cloudflare zone readback did not identify hbnightflyers.com exactly');
   // A Worker Custom Domain owns all paths of its hostname. Zone Routes
   // match URL patterns and may override Custom Domains at specific paths.
   // Both inventories are required; a root-only Route is NOT evidence that
   // a separately enabled Custom Domain fails to serve /glow.html.
   const [routes,domains]=await Promise.all([
    api('GET',`/zones/${zones[0].id}/workers/routes`),
    api('GET','/workers/domains?hostname=hbnightflyers.com&service=hbnf&enabled=true'),
   ]);
   const bindings=info?.resources?.bindings||[];
   assert(!secrets.includes('UDISC_GLOW_ACCESS_APPROVED')&&!bindings.some(x=>x.name==='UDISC_GLOW_ACCESS_APPROVED'&&x.text==='true'),'UDISC_GLOW_ACCESS_APPROVED is enabled or cannot be proven disabled');
   assert(Array.isArray(scheduleResult?.schedules),'Cloudflare schedule readback is malformed');
   const schedules=scheduleResult.schedules;
   assert(Array.isArray(routes),'Cloudflare routes readback is malformed');
   assert(routes.every(r=>typeof r.pattern==='string'&&typeof r.script==='string'&&r.script.length>0),'Cloudflare route ownership identities are incomplete');
   assert(Array.isArray(domains),'Cloudflare Worker Custom Domains readback is malformed');
   const activeCustomDomain=domains.some(d=>d.hostname==='hbnightflyers.com'&&d.service==='hbnf'&&d.enabled===true);
   const routeOwners=routes.map(r=>({pattern:r.pattern,script:r.script})).sort((a,b)=>`${a.pattern}\0${a.script}`.localeCompare(`${b.pattern}\0${b.script}`));
   const routeSignature=JSON.stringify(routeOwners);
   const domainSignature=JSON.stringify(domains.filter(d=>d.hostname==='hbnightflyers.com').map(d=>({hostname:d.hostname,service:d.service,enabled:d.enabled})).sort((a,b)=>`${a.hostname}\0${a.service}\0${a.enabled}`.localeCompare(`${b.hostname}\0${b.service}\0${b.enabled}`)));
   if(establishedRouteSignature!==null)assert(routeSignature===establishedRouteSignature,'Cloudflare route ownership changed during release execution');
   if(establishedDomainSignature!==null)assert(domainSignature===establishedDomainSignature,'Cloudflare Custom Domain ownership changed during release execution');
   establishedRouteSignature??=routeSignature;establishedDomainSignature??=domainSignature;
   const paths=['/glow.html','/glow-save-sync.mjs','/league-state-cas.mjs'];
   const glowRouteCovered=paths.every(p=>{
    const matching=routes.filter(r=>routeCovers(r.pattern,`https://hbnightflyers.com${p}`));
    // Cloudflare lets Routes precede Custom Domains. Without an exact,
    // trusted precedence witness, any conflicting match must fail closed.
    return matching.length?matching.every(r=>r.script==='hbnf'):activeCustomDomain;
   });
   const staticAssetsOnly=d.versionId===EXPECTED_VERSION&&info?.id===EXPECTED_VERSION&&info?.resources?.script?.handlers===null&&info?.resources?.script_runtime?.assets?.serve_directly===true;
   return {worker:'hbnf',...d,rollbackRetained:items.some(x=>(x.versions||[]).some(v=>v.version_id===EXPECTED_VERSION)),pollingDisabled:true,cronRemoved:schedules.length===0,staticAssetsOnly,installedAssetHash:null,assetHashUnavailable:true,glowRouteCovered,activeCustomDomain,schedules,routePatterns:routes.map(x=>x.pattern),routeOwners,scriptHandlers:info?.resources?.script?.handlers??null,bindings};
  },
  async deployExact({zip,sha256:expected,keepPollingDisabled}){
   assert(sha256(zip)===expected,'candidate bytes mismatch');assert(keepPollingDisabled===true,'polling must remain disabled');
   const dir=await mkdtemp(path.join(tmpdir(),'hbnf-glow-candidate-'));
   try{
    const file=path.join(dir,'candidate.zip');await writeFile(file,zip);await execFile('unzip',['-q',file,'-d',dir]);
    const config=JSON.parse(await readFile(path.join(dir,'wrangler.jsonc'),'utf8'));
    assert(config.name==='hbnf'&&config.triggers?.crons?.length===1,'candidate Worker configuration mismatch');
    assert(config.vars?.UDISC_GLOW_ACCESS_APPROVED!=='true','candidate enables UDisc polling');
    assert(await readFile(candidatePath).then(b=>sha256(b)===expected),'candidate path does not identify admitted ZIP');
    const before=activeDeployment(await deployments()).versionId;
    await invoke(['deploy','--config',path.join(dir,'wrangler.jsonc'),'--name','hbnf','--keep-vars','--message',`${RELEASE_ID} ${expected}`]);
    const after=activeDeployment(await deployments());assert(after.versionId!==before,'Worker version did not advance');return {versionId:after.versionId};
   }finally{await rm(dir,{recursive:true,force:true});}
  },
  async restoreV343({versionId,sha256:expected,removeCron}){
   assert(versionId===EXPECTED_VERSION&&expected===ROLLBACK_SHA&&removeCron===true,'rollback identity/Cron removal mismatch');
   assert(sha256(await readFile(rollbackPath))===expected,'rollback ZIP hash mismatch');
   await invoke(['rollback',EXPECTED_VERSION,'--name','hbnf','--yes','--message',`${RELEASE_ID} restore exact v343 version`]);
   // Explicitly clear schedules after restoring v343; do not rely on an omitted
   // triggers field to remove the candidate's one-minute Cron.
   const cleared=await api('PUT','/workers/scripts/hbnf/schedules',[]);
   assert((cleared?.schedules||[]).length===0,'Cloudflare did not confirm explicit Cron removal');
   return await this.read();
  },
  async verifyDeployed({versionId,expectedAssetDelta,legacyReadOnly}){
   const active=activeDeployment(await deployments());assert(active.versionId===versionId&&active.percentage===100,'deployed Worker identity readback mismatch');
   assert(legacyReadOnly===true,'legacy route preservation was not requested');
   const routeRead=await this.read();
   assert(routeRead.versionId===versionId&&routeRead.activeCustomDomain&&routeRead.glowRouteCovered,'deployed Glow routes or HBNF Custom Domain readback failed');
   const proof=await verifyRoutes({versionId,expectedAssetDelta,routeOwners:routeRead.routeOwners,activeCustomDomain:routeRead.activeCustomDomain});assert(proof?.passed===true,'public route asset verification did not pass');return proof;
  },
 };
}

export function createHbnfPublicAssetVerifier({candidatePath,origin='https://hbnightflyers.com',fetchImpl=fetch}={}){
 assert(candidatePath,'exact candidate path required for public route verification');
 let manifestPromise;
 const manifest=()=>manifestPromise??=(async()=>JSON.parse((await execFile('unzip',['-p',candidatePath,'PACKAGE_MANIFEST.json'],{encoding:'utf8',maxBuffer:5*1024*1024})).stdout))();
 return async({kind,expectedAssetDelta,routeOwners=[],activeCustomDomain=false}={})=>{
  const pkg=await manifest();const lineage=pkg.assetLineage||{};let expected=[];
  if(kind==='rollback'){
   expected=Object.entries(lineage).flatMap(([name,row])=>row.source?.startsWith('v343:')?[[name,row.sha256]]:row.replacesBaselineSha256?[[name,row.replacesBaselineSha256]]:[]);
   assert(expected.length===44,`rollback manifest does not describe exactly the 44 installed assets (got ${expected.length})`);
  }else{
   expected=Object.entries(lineage).map(([name,row])=>[name,row.sha256]);
   const unchanged=expected.filter(([n])=>lineage[n].source?.startsWith('v343:')).length;
   const modified=expected.filter(([n])=>lineage[n].change==='intentional Glow integration').length;
   const added=expected.filter(([n])=>lineage[n].change==='required new Glow helper').length;
   assert(unchanged===43&&modified===1&&lineage['public/glow.html']?.change==='intentional Glow integration'&&added===2,'candidate static asset delta differs from admission');
   assert(expectedAssetDelta?.same===43&&expectedAssetDelta?.modified?.includes('glow.html')&&expectedAssetDelta?.added?.length===2,'caller asset delta does not match admitted package');
   assert(expected.length===46,'candidate manifest does not describe 46 static assets');
  }
  const queue=[...expected];let matched=0,externallyRouted=0;const errors=[];
  async function worker(){for(;;){const item=queue.shift();if(!item)return;const [name,hash]=item;const route=name.replace(/^public\//,'');
   try{if(externallyRoutedAsset(route,routeOwners,activeCustomDomain)){externallyRouted++;continue;}
    const response=await fetchImpl(`${origin.replace(/\/$/,'')}/${route}`,{cache:'no-store',redirect:'follow',headers:{'Cache-Control':'no-cache'}});if(!response.ok)throw new Error(`HTTP ${response.status}`);let bytes=Buffer.from(await response.arrayBuffer());if(route.toLowerCase().endsWith('.html'))bytes=normalizeCloudflareInjectedHtml(bytes);if(sha256(bytes)!==hash)throw new Error('SHA-256 mismatch');matched++;}
   catch(e){errors.push(`${route}: ${e.message}`);}
  }}
  await Promise.all(Array.from({length:5},worker));
  if(errors.length)throw new Error(`public asset verification failed for ${errors.length}/${expected.length}: ${errors.slice(0,5).join('; ')}`);
  assert(matched+externallyRouted===expected.length,`public asset verification accounted for ${matched+externallyRouted}/${expected.length} assets`);
  return {passed:true,kind,assetCount:matched,externallyRoutedAssetCount:externallyRouted,assetMapSha256:sha256(Buffer.from(JSON.stringify(expected.slice().sort((a,b)=>a[0].localeCompare(b[0])))))};
 };
}

export function createMcpReleaseAdapters({github,drive,supabase,runWrangler,candidatePath,rollbackPath,verifyRoutes}={}){
 assert(github?.create_file&&github?.fetch_file,'connected GitHub create/read tools are required');
 assert(drive?.upload_file&&drive?.fetch,'connected Drive upload/read tools are required');
 assert(supabase?.execute_sql&&supabase?.apply_migration,'connected Supabase SQL/migration tools are required');
 const gh={
  createFile:a=>github.create_file(a),
  fetchFile:a=>github.fetch_file(a),
 };
 const driveFns={
  uploadFile:a=>drive.upload_file(a),
  fetchFile:id=>drive.fetch({url:`https://drive.google.com/file/d/${id}/view`,download_raw_file:true,include_base64:true}),
  writeLocal:async(name,bytes)=>{
   const dir=await mkdtemp(path.join(tmpdir(),'hbnf-release-evidence-'));
   const file=path.join(dir,name.replace(/[^A-Za-z0-9._-]/g,'_'));
   await writeFile(file,bytes,{flag:'wx'});return file;
  },
  cleanupLocal:async file=>rm(path.dirname(file),{recursive:true,force:true}),
 };
 const store=createGoogleDriveEvidenceStore(driveFns);
 const providers={
  cloudflare:createWranglerAdapter({run:runWrangler,candidatePath,rollbackPath,verifyRoutes}),
  supabase:createSupabaseMcpAdapter({executeSql:a=>supabase.execute_sql(a),applyMigration:a=>supabase.apply_migration(a)}),
 };
 return {providers,storage:store,executionLock:createGitHubExecutionLockAdapter(gh),verifyWritableCapacity};
}

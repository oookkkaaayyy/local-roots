// Local-only SQL rebind utility. It never connects to a provider or executes SQL.
// Given a fresh authenticated read-only provider snapshot and SQL from an
// existing private child artifact, it refreshes only the global root CAS pair.
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {basename,resolve} from 'node:path';

const sha=b=>createHash('sha256').update(b).digest('hex');
const md5=b=>createHash('md5').update(b).digest('hex');
const PATHS={
  oct27:{target:['skins','weeks','2026-10-27'],guard:['glow','weeks','2026-11-03'],pathMd5:'d211577dffb13ed572ba12c9e9265537'},
  oct24:{target:['glow','weeks','2026-10-24'],trophy:['glow','trophyHistory','2026-10-24'],guard:['glow','weeks','2026-11-03'],pathMd5:'8d06671f5cfb87d9b088e373bc47256e',trophyMd5:'be9e43d53fc1c334a36006c6f61b3573'},
  nov03:{target:['glow','trophyHistory','2026-11-03'],guard:['glow','weeks','2026-11-03'],pathMd5:'90494f540fc2ae184fdd142d70b99334',trophyAbsent:true},
};
const get=(o,p)=>p.reduce((v,k)=>v?.[k],o);

export function rebindHistoricalSql({kind,sql,snapshot,pgHashes}){
  const spec=PATHS[kind];
  if(!spec)throw Error('UNKNOWN_HISTORICAL_KIND');
  const root=snapshot?.state_json;
  if(!root||!snapshot.updated_at||!root.glow)throw Error('FRESH_PROVIDER_ROOT_REQUIRED');
  const rootMd5=pgHashes?.rootMd5;
  if(!/^[0-9a-f]{32}$/.test(rootMd5||''))throw Error('POSTGRES_JSONB_ROOT_MD5_REQUIRED');
  const currentWeek=get(root,spec.guard);
  if(!currentWeek||!Array.isArray(currentWeek.players)||currentWeek.players.length!==4||
     !Array.isArray(currentWeek.udiscSync?.latest?.rows)||currentWeek.udiscSync.latest.rows.length!==4)
    throw Error('NOV03_SCORE_PREIMAGE_UNEXPECTED');
  const scores=currentWeek.players.map(p=>({name:p.name,total:(p.scores||[]).reduce((n,s)=>n+(Number(s)||0),0)}));
  if(JSON.stringify(scores)!==JSON.stringify([
    {name:'Fox / Jason',total:48},{name:'Andrew / Matt',total:52},
    {name:'Kyle / Dylan',total:52},{name:'Karl / Tony Howell',total:57}]))
    throw Error('NOV03_GENUINE_S1_SCORE_FENCE_FAILED');
  if(snapshot.tagAuthorityRevision!==11||snapshot.nov03GlowFinalizations!==1||snapshot.matrixAutoLive!==false)
    throw Error('NOV03_TAG_OR_MATRIX_FENCE_FAILED');
  if(typeof pgHashes.targetPresent!=='boolean'||pgHashes.targetPresent!==!spec.trophyAbsent)
    throw Error('TARGET_PATH_PRESENCE_CHANGED');
  if(pgHashes.targetMd5!==spec.pathMd5)throw Error('TARGET_PATH_POSTGRES_MD5_CHANGED');
  if(spec.trophyMd5&&pgHashes.trophyMd5!==spec.trophyMd5)throw Error('TARGET_TROPHY_PATH_CHANGED');
  if(kind==='oct24'&&pgHashes.nov03Md5!=='90494f540fc2ae184fdd142d70b99334')throw Error('NOV03_SCORE_ROOT_CHANGED');
  const oldRoot='58f2015ef01268d2d00842298e67c390';
  if(!sql.includes(oldRoot))throw Error('EXPECTED_ORIGINAL_ROOT_GUARD_MISSING');
  const rebound=sql.replaceAll(oldRoot,rootMd5);
  if(rebound===sql||rebound.includes(oldRoot))throw Error('ROOT_CAS_REBIND_FAILED');
  const oldDate='2026-11-05 08:18:41.788058+00';
  const dateLiteral=pgHashes.updatedAtSqlLiteral;
  if(typeof dateLiteral!=='string'||!/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d+)?\+00$/.test(dateLiteral))
    throw Error('POSTGRES_TIMESTAMP_LITERAL_REQUIRED');
  if(!sql.includes(oldDate))throw Error('EXPECTED_ORIGINAL_TIMESTAMP_GUARD_MISSING');
  const finalSql=rebound.replaceAll(oldDate,dateLiteral);
  if(finalSql.includes(oldDate)||!finalSql.includes(rootMd5)||!finalSql.includes(dateLiteral))throw Error('REBIND_OUTPUT_INVALID');
  return {sql:finalSql,receipt:{schema:'hbnf.historical-sql-rebind.review.v1',status:'LOCAL_REVIEW_ONLY_NOT_ADMITTED',kind,
    targetPath:spec.target.join('.'),providerUpdatedAt:snapshot.updated_at,providerRootMd5:rootMd5,
    targetMd5:pgHashes.targetMd5,nov03ScorePreserved:true,tagAuthorityRevision:11,
    sqlSha256:sha(Buffer.from(finalSql)),productionWrite:false,admission:'NOT_ADMITTED'}};
}

if(import.meta.url===`file://${process.argv[1]}`){
  const [kind,sqlPath,snapshotPath,hashesPath,outDir]=process.argv.slice(2);
  if(!kind||!sqlPath||!snapshotPath||!hashesPath||!outDir)throw Error('USAGE kind apply.sql current-row.json postgres-hashes.json output-dir');
  const [sql,snapshot,pgHashes]=await Promise.all([
    readFile(resolve(sqlPath),'utf8'),readFile(resolve(snapshotPath),'utf8').then(JSON.parse),
    readFile(resolve(hashesPath),'utf8').then(JSON.parse)]);
  const result=rebindHistoricalSql({kind,sql,snapshot,pgHashes});
  await mkdir(resolve(outDir),{recursive:true});
  await writeFile(resolve(outDir,basename(sqlPath)),result.sql,{mode:0o600});
  await writeFile(resolve(outDir,'rebind-review.json'),JSON.stringify(result.receipt,null,2)+'\n',{mode:0o600});
  process.stdout.write(JSON.stringify(result.receipt)+'\n');
}

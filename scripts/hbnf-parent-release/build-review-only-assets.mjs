// Assemble a REVIEW_ONLY public-asset candidate from an exact installed source snapshot.
// No provider credentials, Cloudflare deployment, SQL execution, or release admission.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

const installedSource='44612c09677f59b84bece7de655af7bb011b51e7';
const prefix='source-snapshots/hbnf-worker-d1a5f936-20261024/public/';
const overlays=['skins.html','glow.html','admin.html','random.html','skills.html','hbnf-league-state-sync.js','glow-save-sync.mjs','league-state-cas.mjs'];
const out='build/hbnf-scoring-review-only', site=path.join(out,'public');
const digest=b=>createHash('sha256').update(b).digest('hex');
const git=(...args)=>execFileSync('git',args,{maxBuffer:16*1024*1024});
const sourceHead=git('rev-parse','HEAD').toString().trim();
if(!/^[0-9a-f]{40}$/.test(sourceHead)||sourceHead===installedSource)throw Error('Candidate source identity invalid');
const sourcePaths=git('ls-tree','-r','--name-only',installedSource,prefix).toString().trim().split('\n').filter(Boolean);
if(sourcePaths.length!==46)throw Error('Exact installed snapshot asset list is not 46: '+JSON.stringify(sourcePaths));
const byPath=new Map();
for(const absolute of sourcePaths){
 if(!absolute.startsWith(prefix))throw Error('Unexpected source path');
 const rel=absolute.slice(prefix.length);
 if(!rel||rel.startsWith('/')||rel.includes('..')||path.isAbsolute(rel))throw Error('Unsafe source path');
 byPath.set(rel,{bytes:git('show',installedSource+':'+absolute),origin:'installed-v48'});
}
for(const rel of overlays){
 const p=path.join('public',rel);
 if(!existsSync(p))throw Error('Missing required candidate overlay: '+rel);
 const bytes=readFileSync(p);
 if(!bytes.length)throw Error('Empty overlay: '+rel);
 byPath.set(rel,{bytes,origin:'PR151-review'});
}
if(byPath.size!==47)throw Error('Expected installed 46 assets plus one new guarded-sync helper; observed '+byPath.size);
const required=['skins.html','glow.html','admin.html','random.html','skills.html','glow-save-sync.mjs','league-state-cas.mjs','hbnf-league-state-sync.js'];
if(required.some(x=>!byPath.has(x)))throw Error('Required scorer/helper absent');
for(const [page,library] of [['glow.html','glow-save-sync.mjs'],['skins.html','league-state-cas.mjs'],['admin.html','league-state-cas.mjs'],['random.html','league-state-cas.mjs'],['skills.html','league-state-cas.mjs']]){
 if(!byPath.get(page).bytes.toString('utf8').includes(library))throw Error(page+' must reference '+library);
}
for(const page of ['skins.html','admin.html','random.html','skills.html']){
 if(!byPath.get(page).bytes.toString('utf8').includes('hbnf_save_league_state_v1')&&!byPath.get(page).bytes.toString('utf8').includes('league-state-cas.mjs'))throw Error(page+' has no guarded save route');
}
const entries=[];
for(const [rel,blob] of [...byPath.entries()].sort(([a],[b])=>a.localeCompare(b))){
 const dest=path.join(site,rel);mkdirSync(path.dirname(dest),{recursive:true});writeFileSync(dest,blob.bytes);
 const roundTrip=readFileSync(dest);
 if(digest(roundTrip)!==digest(blob.bytes))throw Error('Staged asset readback mismatch: '+rel);
 entries.push({path:'public/'+rel,bytes:blob.bytes.length,sha256:digest(blob.bytes),origin:blob.origin});
}
const manifest={schema:1,releaseAdmission:'REVIEW_ONLY_NOT_ADMITTED',scope:'HBNF scoring public assets only',sourceCommit:sourceHead,installedSourceCommit:installedSource,assetCount:entries.length,assets:entries};
mkdirSync(out,{recursive:true});
writeFileSync(path.join(out,'assets-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const zipOut='build/HBNF-P0-public-assets-REVIEW_ONLY.zip';
const py=`from pathlib import Path
from zipfile import ZipFile,ZipInfo,ZIP_DEFLATED
base=Path('build/hbnf-scoring-review-only')
out=Path('build/HBNF-P0-public-assets-REVIEW_ONLY.zip')
with ZipFile(out,'w',compression=ZIP_DEFLATED,compresslevel=9) as z:
 for p in sorted(x for x in base.rglob('*') if x.is_file()):
  info=ZipInfo(p.relative_to(base).as_posix(),(2026,11,1,0,0,0))
  info.compress_type=ZIP_DEFLATED
  info.external_attr=0o644<<16
  z.writestr(info,p.read_bytes(),compress_type=ZIP_DEFLATED,compresslevel=9)
`;
const built=spawnSync('python3',['-c',py],{encoding:'utf8'});
if(built.status!==0)throw Error('ZIP creation failed: '+built.stderr);
const z=readFileSync(zipOut);
const result={...manifest,zip:{path:zipOut,bytes:z.length,sha256:digest(z)}};
writeFileSync('build/HBNF-P0-public-assets-review-result.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:'REVIEW_ONLY_NOT_ADMITTED',source:sourceHead,installed:installedSource,assets:entries.length,zipBytes:z.length,zipSha256:digest(z)}));

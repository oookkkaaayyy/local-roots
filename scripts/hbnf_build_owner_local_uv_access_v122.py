#!/usr/bin/env python3
"""Build exact-source local UV access v1.0.22 with correctly scoped auth phase."""
import argparse, hashlib, json, subprocess, zipfile
from pathlib import Path
PKG=Path('staging/coordinated-backend/opal/owner-local-control-local-commissioning-v1.0.22')
SOURCES={
 'etc/hbnf-local-control/lua/auth_owner.lua':Path('staging/coordinated-backend/opal/owner-local-control/auth_owner.lua'),
 'etc/hbnf-local-control/lua/uv_status_access.lua':Path('staging/coordinated-backend/opal/owner-local-control/uv_status_access.lua'),
 'etc/hbnf-local-control/lua/uv_policy_access.lua':Path('staging/coordinated-backend/opal/owner-local-control/uv_policy_access.lua'),
}
TX='OWNER-LOCAL-UV-LOCAL-ACCESS-V122-20261028-01'; NAME='hbnf-owner-local-uv-local-access-v1.0.22'; ROLLBACK_ID='1P9cdd42xkhmpSkhMqeLWCYMMhe4GJn19'
def sha(b): return hashlib.sha256(b).hexdigest()
def build(repo,commit,out):
 repo,out=repo.resolve(),out.resolve()
 if subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD'],text=True).strip()!=commit: raise ValueError('source commit must equal HEAD')
 if subprocess.check_output(['git','-C',str(repo),'status','--porcelain','--untracked-files=all'],text=True).strip(): raise ValueError('checkout must be clean')
 d=repo/PKG; bm=(d/'BASELINE_FILES.SHA256SUMS').read_bytes(); rb=(d/'ROLLBACK_BASELINE.zip').read_bytes(); baseline={line[66:]:line[:64] for line in bm.decode().splitlines()}
 if len(baseline)!=20: raise ValueError('expected exact 20-file Opal baseline')
 with zipfile.ZipFile(d/'ROLLBACK_BASELINE.zip') as z: old={n:z.read(n) for n in z.namelist()}
 if set(old)!=set(baseline) or any(sha(old[n])!=baseline[n] for n in baseline): raise ValueError('rollback archive differs from live manifest')
 cand={}
 for target,src in SOURCES.items():
  body=(repo/src).read_bytes()
  if body!=subprocess.check_output(['git','-C',str(repo),'show',f'{commit}:{src.as_posix()}']): raise ValueError('candidate differs from source commit')
  cand[target]=body
 auth=cand['etc/hbnf-local-control/lua/auth_owner.lua']
 if b'origin == "http://192.168.77.1"' not in auth or b'uri == "/api/aux/uv-status"' not in auth or b'uri == "/api/aux/uv-policy"' not in auth: raise ValueError('narrow exact-origin and exact-route auth exception missing')
 if b'auth.owner_access(false)' not in auth: raise ValueError('normal Owner auth fallback missing')
 updated=dict(baseline); updated.update({n:sha(b) for n,b in cand.items()})
 um=''.join(f'{updated[n]}  {n}\n' for n in sorted(updated)).encode()
 files={'BASELINE_FILES.SHA256SUMS':bm,'UPDATED_FILES.SHA256SUMS':um,'ROLLBACK_BASELINE.zip':rb,'LIVE-BASELINE-READBACK.json':(d/'LIVE-BASELINE-READBACK.json').read_bytes(),'CANDIDATE_FILES.SHA256SUMS':''.join(f'{sha(b)}  {Path(n).name}\n' for n,b in sorted(cand.items())).encode(),'install.sh':(d/'install.sh').read_bytes(),'rollback.sh':(d/'rollback.sh').read_bytes(),'README.md':(d/'README.md').read_bytes()}
 for target,body in cand.items(): files[Path(target).name]=body
 meta={'schema':'hbnf-opal-local-uv-access-update-v1','package':NAME,'transactionId':TX,'sourceCommit':commit,'releaseDisposition':'INSTALLABLE_REQUIRES_ONE_TIME_ADMISSION_AND_FRESH_TARGET_READBACK','target':{'model':'GL-SFT1200','ip':'192.168.77.1'},'baseline':{'managedFiles':20,'packageSha256':sha(rb),'installedFilesManifestSha256':sha(bm)},'recovery':{'archivePath':'ROLLBACK_BASELINE.zip','sha256':sha(rb),'size':len(rb),'driveFileId':ROLLBACK_ID},'changedInstalledFiles':['/'+n for n in SOURCES],'scope':['Allow the exact Cart-local PWA to read UV readiness and call existing bounded UV policy without pairing','Limit auth exception to exact local origin and exactly two UV routes','Retain Owner pairing for public HTTPS origin','Keep unknown origins denied','Keep hardware and commissioning gates unchanged'],'acceptanceCriteria':[{'id':'local-status','method':'tokenless GET with Cart-local Origin','expected':'HTTP 200 status JSON and exact local ACAO'},{'id':'local-policy-validation','method':'invalid-mode local POST','expected':'HTTP 400 unsupported_uv_mode before dispatch'},{'id':'public-auth','method':'tokenless public-origin read','expected':'401 paired_owner_required'},{'id':'unknown-origin','method':'unknown-origin read','expected':'403 without ACAO'},{'id':'baseline-readback','method':'hash all 20 managed files','expected':'updated manifest passes'}],'files':{n:sha(b) for n,b in sorted(files.items())}}
 files['PACKAGE.json']=(json.dumps(meta,indent=2,sort_keys=True)+'\n').encode(); files['SHA256SUMS']=''.join(f'{sha(b)}  {n}\n' for n,b in sorted(files.items())).encode()
 out.mkdir(parents=True,exist_ok=True); archive=out/(NAME+'.zip')
 with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_STORED,strict_timestamps=True) as z:
  for n,b in sorted(files.items()):
   i=zipfile.ZipInfo(f'{NAME}/{n}',(2020,1,1,0,0,0)); i.create_system=3; i.external_attr=(0o100755 if n.endswith('.sh') else 0o100644)<<16; i.compress_type=zipfile.ZIP_STORED; z.writestr(i,b)
 h=sha(archive.read_bytes()); (out/'PACKAGE.SHA256').write_text(f'{h}  {archive.name}\n'); (out/'PACKAGE.json').write_bytes(files['PACKAGE.json']); (out/'SHA256SUMS').write_bytes(files['SHA256SUMS']); return archive,h
def main():
 p=argparse.ArgumentParser();p.add_argument('--repo',type=Path,default=Path(__file__).resolve().parents[1]);p.add_argument('--source-commit',required=True);p.add_argument('--out-dir',type=Path,required=True);a=p.parse_args();f,h=build(a.repo,a.source_commit,a.out_dir);print(f'PACKAGE={f}\nSHA256={h}\nBYTES={f.stat().st_size}')
if __name__=='__main__':main()

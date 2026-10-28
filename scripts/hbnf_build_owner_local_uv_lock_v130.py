#!/usr/bin/env python3
"""Deterministically package the v1.0.30 exception-detail slice."""
import argparse, hashlib, json, subprocess, zipfile
from pathlib import Path

NAME='hbnf-owner-local-uv-local-access-v1.0.30'
TX='OWNER-LOCAL-UV-LOCAL-ACCESS-V130-20261028-01'
RELEASE='HBNF-OPAL-UV-LOCK-V130-20261028-01'
ROLLBACK_ID='1yoQeSLUdvw0J5eFKsB64fSLZeSjWBtEI'
PKG=Path('staging/coordinated-backend/opal/owner-local-control-local-commissioning-v1.0.30')
SOURCES={'auth_owner.lua':Path('staging/coordinated-backend/opal/owner-local-control/auth_owner.lua'),
         'uv_status_access.lua':Path('staging/coordinated-backend/opal/owner-local-control/uv_status_access.lua'),
         'uv_policy_access.lua':Path('staging/coordinated-backend/opal/owner-local-control/uv_policy_access.lua')}
def sha(b): return hashlib.sha256(b).hexdigest()
def build(repo,commit,out):
 repo,out=repo.resolve(),out.resolve()
 if subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD'],text=True).strip()!=commit: raise ValueError('source commit must equal HEAD')
 if subprocess.check_output(['git','-C',str(repo),'status','--porcelain','--untracked-files=all'],text=True).strip(): raise ValueError('checkout must be clean')
 d=repo/PKG; baseline_zip=(d/'ROLLBACK_BASELINE.zip').read_bytes(); bm=(d/'BASELINE_FILES.SHA256SUMS').read_bytes()
 baseline={line[66:]:line[:64] for line in bm.decode().splitlines()}
 with zipfile.ZipFile(d/'ROLLBACK_BASELINE.zip') as z: old={n:z.read(n) for n in z.namelist()}
 if len(baseline)!=20 or set(old)!=set(baseline) or any(sha(old[n])!=baseline[n] for n in baseline): raise ValueError('exact v1.0.29 rollback mismatch')
 files={}
 for target,src in SOURCES.items():
  body=(repo/src).read_bytes()
  if body!=subprocess.check_output(['git','-C',str(repo),'show',f'{commit}:{src.as_posix()}']): raise ValueError('source commit mismatch')
  files[target]=body
 files['nginx-server.conf']=old['etc/hbnf-local-control/nginx-server.conf']
 for name in ('install.sh','rollback.sh'):
  files[name]=(d/name).read_bytes().replace(b'V129',b'V130').replace(b'v129',b'v130').replace(b'V128',b'V129').replace(b'v1.0.28',b'v1.0.29').replace(b'V128-20261028',b'V129-20261028').replace(b'v128',b'v129')
 files['README.md']=b'# Opal UV commissioning diagnostic v1.0.30\n\nPreserves the Lua exception returned by protected WLED apply and OFF calls so the exact failure can be isolated. No route, write scope, timing, hardware gate, or ordinary UV policy is changed. Exact v1.0.29 rollback is included. Install only with one-time release admission and fresh target baseline check.\n'
 updated=dict(baseline)
 for name,body in files.items():
  if name in ('auth_owner.lua','uv_status_access.lua','uv_policy_access.lua'): updated['etc/hbnf-local-control/lua/'+name]=sha(body)
 cm=''.join(f'{sha(files[n])}  {n}\n' for n in sorted(('auth_owner.lua','uv_status_access.lua','uv_policy_access.lua'))).encode()
 um=''.join(f'{updated[n]}  {n}\n' for n in sorted(updated)).encode()
 readback={'schema':'hbnf-opal-installed-baseline-v1','observedAtUtc':'2026-10-28T22:14:00Z','identity':'GL-SFT1200 at 192.168.77.1 on HBNF-Cart; v1.0.29 installed; all 20 managed files freshly re-read and matched v1.0.29 post-install manifest; UV segments 1 and 2 OFF.','installedManifestSha256':sha(bm),'managedFiles':20,'status':'PASS'}
 files.update({'BASELINE_FILES.SHA256SUMS':bm,'UPDATED_FILES.SHA256SUMS':um,'CANDIDATE_FILES.SHA256SUMS':cm,'ROLLBACK_BASELINE.zip':baseline_zip,'LIVE-BASELINE-READBACK.json':(json.dumps(readback,indent=2)+'\n').encode()})
 meta={'schema':'hbnf-opal-local-uv-lock-zone-update-v1','package':NAME,'transactionId':TX,'releaseId':RELEASE,'sourceCommit':commit,'releaseDisposition':'INSTALLABLE_REQUIRES_ONE_TIME_ADMISSION_AND_FRESH_TARGET_READBACK','target':{'model':'GL-SFT1200','ip':'192.168.77.1','provider':'GL.iNet Opal local device','identity':'GL-SFT1200 at 192.168.77.1 on HBNF-Cart LAN'},'baseline':{'managedFiles':20,'identity':readback['identity'],'packageSha256':sha(baseline_zip),'installedFilesManifestSha256':sha(bm),'driveFileId':ROLLBACK_ID},'recovery':{'archivePath':'ROLLBACK_BASELINE.zip','sha256':sha(baseline_zip),'size':len(baseline_zip),'driveFileId':ROLLBACK_ID,'driveUrl':f'https://drive.google.com/file/d/{ROLLBACK_ID}/view'},'changedInstalledFiles':['/etc/hbnf-local-control/lua/uv_policy_access.lua'],'scope':['Preserve the actual protected Lua exception string for ON apply and OFF cleanup failures','Keep all existing UV and Owner controls unchanged'],'acceptanceCriteria':[{'id':'live-baseline','method':'hash all 20 managed files immediately before install','expected':'exact match to retained v1.0.29 baseline'},{'id':'diagnostic','method':'one admitted Cart commissioning request and read exact API diagnosis plus Nginx log','expected':'actual apply/cleanup exception text captured; no uncaught handler failure'},{'id':'outputs-off','method':'UV status and direct WLED state readback','expected':'both outputs OFF'},{'id':'ordinary-lock','method':'read UV status','expected':'normal UV remains locked until hardware acceptance'}],'files':{n:sha(b) for n,b in sorted(files.items())}}
 files['PACKAGE.json']=(json.dumps(meta,indent=2,sort_keys=True)+'\n').encode(); files['SHA256SUMS']=''.join(f'{sha(v)}  {n}\n' for n,v in sorted(files.items())).encode()
 out.mkdir(parents=True,exist_ok=True); archive=out/(NAME+'.zip')
 with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_STORED,strict_timestamps=True) as z:
  for n,b in sorted(files.items()):
   i=zipfile.ZipInfo(f'{NAME}/{n}',(2020,1,1,0,0,0));i.create_system=3;i.external_attr=(0o100755 if n.endswith('.sh') else 0o100644)<<16;i.compress_type=zipfile.ZIP_STORED;z.writestr(i,b)
 digest=sha(archive.read_bytes());(out/'PACKAGE.SHA256').write_text(f'{digest}  {archive.name}\n');(out/'PACKAGE.json').write_bytes(files['PACKAGE.json']);(out/'SHA256SUMS').write_bytes(files['SHA256SUMS']);return archive,digest
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--repo',type=Path,default=Path(__file__).resolve().parents[1]);p.add_argument('--source-commit',required=True);p.add_argument('--out-dir',type=Path,required=True);a=p.parse_args();f,h=build(a.repo,a.source_commit,a.out_dir);print(f'PACKAGE={f}\nSHA256={h}\nBYTES={f.stat().st_size}')

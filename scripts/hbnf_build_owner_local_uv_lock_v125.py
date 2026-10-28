#!/usr/bin/env python3
"""Build the isolated UV lock-zone package from exact live baseline + source."""
import argparse, hashlib, json, subprocess, zipfile
from pathlib import Path
PKG = Path('staging/coordinated-backend/opal/owner-local-control-local-commissioning-v1.0.25')
SOURCES = {
 'auth_owner.lua': Path('staging/coordinated-backend/opal/owner-local-control/auth_owner.lua'),
 'uv_status_access.lua': Path('staging/coordinated-backend/opal/owner-local-control/uv_status_access.lua'),
 'uv_policy_access.lua': Path('staging/coordinated-backend/opal/owner-local-control/uv_policy_access.lua'),
}
TX='OWNER-LOCAL-UV-LOCAL-ACCESS-V125-20261028-02'
RELEASE_ID='HBNF-OPAL-UV-LOCK-V125-20261028-02'
NAME='hbnf-owner-local-uv-local-access-v1.0.25'
ROLLBACK_ID='1XKZganaXmOHuvw0x_gWrkQpPpc5oNanm'
def sha(b): return hashlib.sha256(b).hexdigest()
def build(repo, commit, out):
 repo,out=repo.resolve(),out.resolve()
 if subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD'],text=True).strip()!=commit: raise ValueError('source commit must equal HEAD')
 if subprocess.check_output(['git','-C',str(repo),'status','--porcelain','--untracked-files=all'],text=True).strip(): raise ValueError('checkout must be clean')
 d=repo/PKG
 bm=(d/'BASELINE_FILES.SHA256SUMS').read_bytes(); rb=(d/'ROLLBACK_BASELINE.zip').read_bytes(); baseline={line[66:]:line[:64] for line in bm.decode().splitlines()}
 if len(baseline)!=20: raise ValueError('expected exact 20-file Opal baseline')
 with zipfile.ZipFile(d/'ROLLBACK_BASELINE.zip') as z: old={n:z.read(n) for n in z.namelist()}
 if set(old)!=set(baseline) or any(sha(old[n])!=baseline[n] for n in baseline): raise ValueError('rollback archive differs from live baseline manifest')
 candidate={}
 for target,src in SOURCES.items():
  body=(repo/src).read_bytes()
  if body!=subprocess.check_output(['git','-C',str(repo),'show',f'{commit}:{src.as_posix()}']): raise ValueError('candidate differs from exact source commit')
  candidate[target]=body
 if b'ngx.shared.hbnf_uv_policy_lock' not in candidate['uv_policy_access.lua'] or b'ngx.shared.hbnf_owner_rate' in candidate['uv_policy_access.lua']:
  raise ValueError('UV policy lock is not isolated from Owner rate-limit storage')
 config_path='etc/hbnf-local-control/nginx-server.conf'; config=old[config_path]
 needle=b'lua_shared_dict hbnf_owner_rate 8k;\n'
 if config.count(needle)!=1 or config.count(b'lua_shared_dict hbnf_uv_policy_lock 64k;\n')!=1: raise ValueError('live config is not the expected exact v1.0.24 baseline')
 candidate['nginx-server.conf']=config
 changed={'etc/hbnf-local-control/lua/'+k:v for k,v in candidate.items() if k!='nginx-server.conf'}
 changed[config_path]=candidate['nginx-server.conf']
 updated=dict(baseline); updated.update({n:sha(v) for n,v in changed.items()})
 um=''.join(f'{updated[n]}  {n}\n' for n in sorted(updated)).encode()
 candidate_manifest=''.join(f'{sha(v)}  {Path(n).name}\n' for n,v in sorted(candidate.items())).encode()
 files={
  'BASELINE_FILES.SHA256SUMS':bm, 'UPDATED_FILES.SHA256SUMS':um,
  'ROLLBACK_BASELINE.zip':rb,
  'LIVE-BASELINE-READBACK.json':(d/'LIVE-BASELINE-READBACK.json').read_bytes(),
  'CANDIDATE_FILES.SHA256SUMS':candidate_manifest,
  'install.sh':(d/'install.sh').read_bytes(),'rollback.sh':(d/'rollback.sh').read_bytes(),
  'README.md':(d/'README.md').read_bytes(), **candidate,
 }
 meta={
  'schema':'hbnf-opal-local-uv-lock-zone-update-v1','package':NAME,'transactionId':TX,'releaseId':RELEASE_ID,
  'sourceCommit':commit,'releaseDisposition':'INSTALLABLE_REQUIRES_ONE_TIME_ADMISSION_AND_FRESH_TARGET_READBACK',
  'target':{'model':'GL-SFT1200','ip':'192.168.77.1','provider':'GL.iNet Opal local device','identity':'GL-SFT1200 at 192.168.77.1 on HBNF-Cart LAN'},
  'baseline':{'managedFiles':20,'identity':json.loads((d/'LIVE-BASELINE-READBACK.json').read_text())['identity'],'packageSha256':sha(rb),'installedFilesManifestSha256':sha(bm),'driveFileId':ROLLBACK_ID},
  'recovery':{'archivePath':'ROLLBACK_BASELINE.zip','sha256':sha(rb),'size':len(rb),'driveFileId':ROLLBACK_ID,'driveUrl':f'https://drive.google.com/file/d/{ROLLBACK_ID}/view'},
  'changedInstalledFiles':['/etc/hbnf-local-control/lua/auth_owner.lua','/etc/hbnf-local-control/lua/uv_status_access.lua','/etc/hbnf-local-control/lua/uv_policy_access.lua','/etc/hbnf-local-control/nginx-server.conf'],
  'scope':['Complete the bounded commissioning response after internal AUX subrequests without aborting the Nginx Lua request','Keep Owner authentication rate limiting separate and unchanged','Preserve current UV hardware readiness gate and three-second single-channel commissioning test','Preserve public Owner pairing and unknown-origin denial'],
  'acceptanceCriteria':[
   {'id':'live-baseline','method':'hash all 20 managed files immediately before install','expected':'exact match to admitted rollback baseline'},
   {'id':'uv-status','method':'Cart-local read-only GET','expected':'HTTP 200, commissioning test available, output remains off'},
   {'id':'uv-command-lock','method':'valid three-second commissioning command after install','expected':'not rejected as permanently in progress; one selected channel, then both outputs read back off'},
   {'id':'ordinary-gates','method':'read UV policy after install','expected':'manual/follow remain locked until hardware profile acceptance'},
   {'id':'public-auth','method':'public-origin status request without token','expected':'HTTP 401 paired_owner_required'},
   {'id':'unknown-origin','method':'status request from unknown origin','expected':'HTTP 403 without CORS permission'},
   {'id':'recovery','method':'verify Drive download-back and on-device transaction rollback','expected':'exact 20-file prior baseline retained and restorable'}],
  'files':{n:sha(b) for n,b in sorted(files.items())}}
 files['PACKAGE.json']=(json.dumps(meta,indent=2,sort_keys=True)+'\n').encode()
 files['SHA256SUMS']=''.join(f'{sha(v)}  {n}\n' for n,v in sorted(files.items())).encode()
 out.mkdir(parents=True,exist_ok=True); archive=out/(NAME+'.zip')
 with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_STORED,strict_timestamps=True) as z:
  for n,b in sorted(files.items()):
   i=zipfile.ZipInfo(f'{NAME}/{n}',(2020,1,1,0,0,0)); i.create_system=3; i.external_attr=(0o100755 if n.endswith('.sh') else 0o100644)<<16; i.compress_type=zipfile.ZIP_STORED; z.writestr(i,b)
 digest=sha(archive.read_bytes()); (out/'PACKAGE.SHA256').write_text(f'{digest}  {archive.name}\n'); (out/'PACKAGE.json').write_bytes(files['PACKAGE.json']); (out/'SHA256SUMS').write_bytes(files['SHA256SUMS'])
 return archive,digest
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--repo',type=Path,default=Path(__file__).resolve().parents[1]);p.add_argument('--source-commit',required=True);p.add_argument('--out-dir',type=Path,required=True);a=p.parse_args();f,h=build(a.repo,a.source_commit,a.out_dir);print(f'PACKAGE={f}\nSHA256={h}\nBYTES={f.stat().st_size}')

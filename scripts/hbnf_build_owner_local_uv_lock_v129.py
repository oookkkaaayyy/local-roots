#!/usr/bin/env python3
"""Build source-bound Opal UV v1.0.29 against the freshly captured live baseline."""
import argparse, hashlib, json, subprocess, zipfile, re
from pathlib import Path
PKG=Path('staging/coordinated-backend/opal/owner-local-control-local-commissioning-v1.0.29')
SOURCES={'auth_owner.lua':Path('staging/coordinated-backend/opal/owner-local-control/auth_owner.lua'),'uv_status_access.lua':Path('staging/coordinated-backend/opal/owner-local-control/uv_status_access.lua'),'uv_policy_access.lua':Path('staging/coordinated-backend/opal/owner-local-control/uv_policy_access.lua')}
TX='OWNER-LOCAL-UV-LOCAL-ACCESS-V129-20261028-01'; RELEASE_ID='HBNF-OPAL-UV-LOCK-V129-20261028-01'; NAME='hbnf-owner-local-uv-local-access-v1.0.29'; ROLLBACK_ID='12VxPKvkNs8xZEKu1lCFEVyAtyFyjGRlu'
def sha(b): return hashlib.sha256(b).hexdigest()
def build(repo,commit,out):
 repo,out=repo.resolve(),out.resolve()
 if subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD'],text=True).strip()!=commit: raise ValueError('source commit must equal HEAD')
 if subprocess.check_output(['git','-C',str(repo),'status','--porcelain','--untracked-files=all'],text=True).strip(): raise ValueError('checkout must be clean')
 d=repo/PKG; bm=(d/'BASELINE_FILES.SHA256SUMS').read_bytes(); rb=(d/'ROLLBACK_BASELINE.zip').read_bytes(); baseline={line[66:]:line[:64] for line in bm.decode().splitlines()}
 if len(baseline)!=20: raise ValueError('expected exact 20-file Opal baseline')
 with zipfile.ZipFile(d/'ROLLBACK_BASELINE.zip') as z: old={n:z.read(n) for n in z.namelist()}
 if set(old)!=set(baseline) or any(sha(old[n])!=baseline[n] for n in baseline): raise ValueError('rollback archive differs from live baseline manifest')
 candidate={}
 for target,src in SOURCES.items():
  body=(repo/src).read_bytes()
  if body!=subprocess.check_output(['git','-C',str(repo),'show',f'{commit}:{src.as_posix()}']): raise ValueError('candidate differs from exact source commit')
  candidate[target]=body
 policy=candidate['uv_policy_access.lua']
 if not re.search(rb'local function apply_and_read\(segments\)[\s\S]*?if not result then return nil, "wled_apply_no_response" end[\s\S]*?local state, state_error = runtime\.read_state\(\)[\s\S]*?return state',policy): raise ValueError('write path must confirm with separate state GET and report failure stage')
 if re.search(rb'local function apply_and_read\(segments\)[\s\S]*?runtime\.decode_state\(result\.body\)',policy): raise ValueError('write acknowledgement must not be parsed as device state')
 if b'ngx.shared.hbnf_uv_policy_lock' not in policy or b'ngx.shared.hbnf_owner_rate' in policy: raise ValueError('UV policy lock must remain isolated')
 if b'wled_apply_http_' not in policy or b'wled_state_' not in policy or b'diagnosis = { on = on_error' not in policy: raise ValueError('commissioning test failure stages must be reported')
 if b'pcall(runtime.segment_matches' not in policy: raise ValueError('segment verification errors must not bypass OFF cleanup')
 if re.search(rb'ngx\s*\.\s*exit\s*\(',re.sub(rb'--[^\n]*',b'',policy)): raise ValueError('response handler must return normally')
 config_path='etc/hbnf-local-control/nginx-server.conf'; config=old[config_path]
 if config.count(b'lua_shared_dict hbnf_uv_policy_lock 64k;\n')!=1: raise ValueError('live config is not the expected locked v1.0.28 baseline')
 candidate['nginx-server.conf']=config
 changed={'etc/hbnf-local-control/lua/'+k:v for k,v in candidate.items() if k!='nginx-server.conf'}; changed[config_path]=candidate['nginx-server.conf']
 updated=dict(baseline); updated.update({n:sha(v) for n,v in changed.items()}); um=''.join(f'{updated[n]}  {n}\n' for n in sorted(updated)).encode()
 cm=''.join(f'{sha(v)}  {Path(n).name}\n' for n,v in sorted(candidate.items())).encode()
 files={'BASELINE_FILES.SHA256SUMS':bm,'UPDATED_FILES.SHA256SUMS':um,'ROLLBACK_BASELINE.zip':rb,'LIVE-BASELINE-READBACK.json':(d/'LIVE-BASELINE-READBACK.json').read_bytes(),'CANDIDATE_FILES.SHA256SUMS':cm,'install.sh':(d/'install.sh').read_bytes(),'rollback.sh':(d/'rollback.sh').read_bytes(),'README.md':(d/'README.md').read_bytes(),**candidate}
 meta={'schema':'hbnf-opal-local-uv-lock-zone-update-v1','package':NAME,'transactionId':TX,'releaseId':RELEASE_ID,'sourceCommit':commit,'releaseDisposition':'INSTALLABLE_REQUIRES_ONE_TIME_ADMISSION_AND_FRESH_TARGET_READBACK','target':{'model':'GL-SFT1200','ip':'192.168.77.1','provider':'GL.iNet Opal local device','identity':'GL-SFT1200 at 192.168.77.1 on HBNF-Cart LAN'},'baseline':{'managedFiles':20,'identity':json.loads((d/'LIVE-BASELINE-READBACK.json').read_text())['identity'],'packageSha256':sha(rb),'installedFilesManifestSha256':sha(bm),'driveFileId':ROLLBACK_ID},'recovery':{'archivePath':'ROLLBACK_BASELINE.zip','sha256':sha(rb),'size':len(rb),'driveFileId':ROLLBACK_ID,'driveUrl':f'https://drive.google.com/file/d/{ROLLBACK_ID}/view'},'changedInstalledFiles':['/etc/hbnf-local-control/lua/auth_owner.lua','/etc/hbnf-local-control/lua/uv_status_access.lua','/etc/hbnf-local-control/lua/uv_policy_access.lua','/etc/hbnf-local-control/nginx-server.conf'],'scope':['After each WLED POST, perform a separate internal GET and verify the full AUX state instead of parsing the POST acknowledgement as device state','Keep the bounded three-second single-channel commissioning pulse and both-output OFF closeout','Keep the UV hardware profile gate closed for ordinary controls','Preserve Owner pairing and origin protections'],'acceptanceCriteria':[{'id':'live-baseline','method':'hash all 20 managed files immediately before install','expected':'exact match to admitted v1.0.27 rollback baseline'},{'id':'post-write-readback','method':'valid three-second commissioning pulse and separate internal GET state readback','expected':'selected channel is confirmed ON during pulse, then both outputs are confirmed OFF'},{'id':'cart-bar-visible','method':'run each channel at brightness 255 through the PWA with physical strips powered','expected':'Cart and Bar each illuminate during their own pulse'},{'id':'ordinary-gates','method':'read UV status after tests','expected':'uvControlEnabled false until hardware acceptance; both outputs OFF'},{'id':'owner-origin','method':'installer local status, invalid policy, public unauthenticated status and unknown origin checks','expected':'local 200; invalid policy 400 without write; public 401; unknown origin 403'},{'id':'recovery','method':'verify Drive download-back and on-device exact prior image','expected':'exact live v1.0.28 20-file baseline retained and restorable'}],'files':{n:sha(b) for n,b in sorted(files.items())}}
 files['PACKAGE.json']=(json.dumps(meta,indent=2,sort_keys=True)+'\n').encode(); files['SHA256SUMS']=''.join(f'{sha(v)}  {n}\n' for n,v in sorted(files.items())).encode()
 out.mkdir(parents=True,exist_ok=True); archive=out/(NAME+'.zip')
 with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_STORED,strict_timestamps=True) as z:
  for n,b in sorted(files.items()):
   i=zipfile.ZipInfo(f'{NAME}/{n}',(2020,1,1,0,0,0));i.create_system=3;i.external_attr=(0o100755 if n.endswith('.sh') else 0o100644)<<16;i.compress_type=zipfile.ZIP_STORED;z.writestr(i,b)
 digest=sha(archive.read_bytes());(out/'PACKAGE.SHA256').write_text(f'{digest}  {archive.name}\n');(out/'PACKAGE.json').write_bytes(files['PACKAGE.json']);(out/'SHA256SUMS').write_bytes(files['SHA256SUMS']);return archive,digest
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--repo',type=Path,default=Path(__file__).resolve().parents[1]);p.add_argument('--source-commit',required=True);p.add_argument('--out-dir',type=Path,required=True);a=p.parse_args();f,h=build(a.repo,a.source_commit,a.out_dir);print(f'PACKAGE={f}\nSHA256={h}\nBYTES={f.stat().st_size}')

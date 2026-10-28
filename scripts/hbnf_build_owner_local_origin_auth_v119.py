#!/usr/bin/env python3
"""Build the exact-source Opal Cart-local auth-origin update v1.0.19."""
from __future__ import annotations
import argparse, hashlib, json, subprocess, zipfile
from pathlib import Path

PKG=Path("staging/coordinated-backend/opal/owner-local-control-origin-auth-v1.0.19")
SOURCE=Path("staging/coordinated-backend/opal/owner-local-control/auth.lua")
TX="OWNER-LOCAL-CONTROL-LOCAL-AUTH-V119-20261028-01"
NAME="hbnf-owner-local-control-origin-auth-v1.0.19"
TARGET="etc/hbnf-local-control/lua/auth.lua"
ROLLBACK_DRIVE_ID="1SuxUto9Uw-5TYNVniY3RScwgZCuwiLNs"

def sha(b:bytes)->str: return hashlib.sha256(b).hexdigest()

def build(repo:Path, commit:str, out:Path)->tuple[Path,str]:
 repo,out=repo.resolve(),out.resolve()
 if subprocess.check_output(["git","-C",str(repo),"rev-parse","HEAD"],text=True).strip()!=commit: raise ValueError("source commit must equal checkout HEAD")
 if subprocess.check_output(["git","-C",str(repo),"status","--porcelain","--untracked-files=all"],text=True).strip(): raise ValueError("source checkout must be clean")
 d=repo/PKG; bm=(d/"BASELINE_FILES.SHA256SUMS").read_bytes(); rb=(d/"ROLLBACK_BASELINE.zip").read_bytes()
 baseline={}
 for line in bm.decode().splitlines():
  digest,rel=line[:64],line[66:]
  if len(digest)!=64 or rel.startswith("/") or ".." in rel.split("/"): raise ValueError("malformed baseline manifest")
  baseline[rel]=digest
 if len(baseline)!=20 or baseline.get(TARGET) is None: raise ValueError("expected exact 20-file live baseline")
 with zipfile.ZipFile(d/"ROLLBACK_BASELINE.zip") as z: old={n:z.read(n) for n in z.namelist()}
 if set(old)!=set(baseline) or any(sha(old[n])!=h for n,h in baseline.items()): raise ValueError("rollback bytes do not match live manifest")
 candidate=(repo/SOURCE).read_bytes()
 committed=subprocess.check_output(["git","-C",str(repo),"show",f"{commit}:{SOURCE.as_posix()}"])
 if candidate!=committed: raise ValueError("auth source differs from exact commit")
 if b'local LOCAL_ORIGIN = "http://192.168.77.1"' not in candidate or b'headers.origin ~= LOCAL_ORIGIN' not in candidate: raise ValueError("exact local Origin acceptance missing")
 if b'paired_owner_required' not in candidate or b'owner_session_expired_or_revoked' not in candidate: raise ValueError("Owner pairing/revocation guards missing")
 updated=dict(baseline); updated[TARGET]=sha(candidate)
 um="".join(f"{updated[n]}  {n}\n" for n in sorted(updated)).encode()
 files={"BASELINE_FILES.SHA256SUMS":bm,"UPDATED_FILES.SHA256SUMS":um,"ROLLBACK_BASELINE.zip":rb,
        "LIVE-BASELINE-READBACK.json":(d/"LIVE-BASELINE-READBACK.json").read_bytes(),"auth.lua":candidate,
        "install.sh":(d/"install.sh").read_bytes(),"rollback.sh":(d/"rollback.sh").read_bytes(),"README.md":(d/"README.md").read_bytes()}
 baseline_sha=sha(bm); rb_sha=sha(rb)
 meta={"schema":"hbnf-opal-local-origin-auth-update-v1","package":NAME,"transactionId":TX,"sourceCommit":commit,
       "releaseDisposition":"INSTALLABLE_REQUIRES_ONE_TIME_ADMISSION_AND_FRESH_TARGET_READBACK",
       "target":{"model":"GL-SFT1200","ip":"192.168.77.1"},
       "baseline":{"managedFiles":20,"packageSha256":rb_sha,"installedFilesManifestSha256":baseline_sha},
       "recovery":{"archivePath":"ROLLBACK_BASELINE.zip","sha256":rb_sha,"size":len(rb),"driveFileId":ROLLBACK_DRIVE_ID},
       "changedInstalledFiles":["/"+TARGET],
       "scope":["Allow the exact local Cart PWA Origin in Lua Owner auth","Preserve paired Owner token, expiry, and revocation checks","Keep the existing public Origin and deny unknown Origins","Change no firmware, UV output, Matrix, underglow, or PWA files"],
       "acceptanceCriteria":[{"id":"local-origin-owner-gate","method":"tokenless read-only UV status GET with exact local Origin","expected":"HTTP 401 paired_owner_required, with local ACAO; never owner_origin_required"},{"id":"public-origin-preserved","method":"tokenless read-only UV status GET with public Origin","expected":"HTTP 401 paired_owner_required with public ACAO"},{"id":"unknown-origin-denied","method":"read-only UV status GET with unknown Origin","expected":"HTTP 403 with no ACAO"},{"id":"baseline-and-readback","method":"20-file installed manifest and package closeout","expected":"all hashes match exact candidate manifest"}],
       "files":{n:sha(b) for n,b in sorted(files.items())}}
 files["PACKAGE.json"]=(json.dumps(meta,indent=2,sort_keys=True)+"\n").encode()
 files["SHA256SUMS"]="".join(f"{sha(b)}  {n}\n" for n,b in sorted(files.items())).encode()
 out.mkdir(parents=True,exist_ok=True); archive=out/(NAME+".zip")
 with zipfile.ZipFile(archive,"w",compression=zipfile.ZIP_STORED,strict_timestamps=True) as z:
  for n,b in sorted(files.items()):
   i=zipfile.ZipInfo(f"{NAME}/{n}",(2020,1,1,0,0,0)); i.create_system=3; i.external_attr=(0o100755 if n.endswith(".sh") else 0o100644)<<16; i.compress_type=zipfile.ZIP_STORED; z.writestr(i,b)
 digest=sha(archive.read_bytes()); (out/"PACKAGE.SHA256").write_text(f"{digest}  {archive.name}\n"); (out/"PACKAGE.json").write_bytes(files["PACKAGE.json"]); (out/"SHA256SUMS").write_bytes(files["SHA256SUMS"])
 return archive,digest

def main():
 p=argparse.ArgumentParser(); p.add_argument("--repo",type=Path,default=Path(__file__).resolve().parents[1]); p.add_argument("--source-commit",required=True); p.add_argument("--out-dir",type=Path,required=True); a=p.parse_args()
 f,h=build(a.repo,a.source_commit,a.out_dir); print(f"PACKAGE={f}\nSHA256={h}\nBYTES={f.stat().st_size}")
if __name__=="__main__": main()

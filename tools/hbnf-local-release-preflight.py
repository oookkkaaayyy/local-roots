#!/usr/bin/env python3
"""One-pass local, non-hardware preflight for the HBNF coordinated release.

Creates only temporary files under /tmp. It does not contact the cart, flash
firmware, modify the router, deploy cloud functions, or expose signing keys.
"""
from __future__ import annotations
import hashlib, json, os, pathlib, stat, subprocess, sys, urllib.request

ROOT=pathlib.Path(__file__).resolve().parents[1]
EXPECTED_V11="0aeb668e58cad3bae5b636fdc79573a263c3d0e911903ed48af0bbc2e5681f61"
EXPECTED_ROLLBACK="32802f354cf2edcc1636698e5f15b6bc61311b0bffc7ecf72960221f3478fb55"
EXPECTED_UPDATER="090300853504e3e2bc6fe50c64cbb2b87c6688e38af9dc51dfcada2d87fbcdff"
UPDATER_URL="https://hbnightflyers.com/firmware/opal-updater/1.2.3/luci-app-hbnf-updater_1.2.3-1_all-090300853504e3e2bc6fe50c64cbb2b87c6688e38af9dc51dfcada2d87fbcdff.ipk"
SIGN_DIR=pathlib.Path.home()/".config/hbnf-ota-signing"
V11=pathlib.Path.home()/"Documents/Codex/2026-09-30/files-pasted-by-the-user-hbnf/outputs/HBNF_AUDIO_EXPRESSION_V1_1/HBNF_AUDIO_EXPRESSION_V1_1_candidate.bin"
ROLLBACK=pathlib.Path.home()/"Documents/Codex/2026-09-30/this-is-the-highest-priority-next/outputs/HBNF_IPAD_MINI_INTEGRATION/HBNF_iPad_Mini2_iOS12_Candidate.bin"
DETAIL=pathlib.Path("/tmp/HBNF_LOCAL_PREFLIGHT.json")
BASE_IPK=pathlib.Path("/tmp/hbnf-updater-base-1.2.3.ipk")
NEW_IPK=pathlib.Path("/tmp/hbnf-updater-1.2.4.ipk")

def sha256(path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""): h.update(chunk)
    return h.hexdigest()

def run(cmd,cwd=None,timeout=120):
    p=subprocess.run(cmd,cwd=cwd,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
    return {"code":p.returncode,"stdout":p.stdout.strip(),"stderr":p.stderr.strip()}

def file_check(path,expected):
    if not path.is_file(): return {"path":str(path),"present":False,"match":False}
    actual=sha256(path)
    return {"path":str(path),"present":True,"sha256":actual,"match":actual==expected,"size_bytes":path.stat().st_size}

def signer_check():
    private=SIGN_DIR/"release-private.pem"; public=SIGN_DIR/"release-public.pem"
    out={"directory":str(SIGN_DIR),"private_present":private.is_file(),"public_present":public.is_file()}
    if private.is_file():
        out["private_mode"]=oct(stat.S_IMODE(private.stat().st_mode))
        out["private_mode_ok"]=stat.S_IMODE(private.stat().st_mode)==0o600
    if public.is_file():
        out["public_mode"]=oct(stat.S_IMODE(public.stat().st_mode))
        p=run(["openssl","pkey","-pubin","-in",str(public),"-outform","DER"],timeout=15)
        if p["code"]==0:
            der=subprocess.run(["openssl","pkey","-pubin","-in",str(public),"-outform","DER"],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=15).stdout
            out["public_der_sha256"]=hashlib.sha256(der).hexdigest()
    return out

def ensure_base_ipk():
    candidates=[
        pathlib.Path("/tmp/hbnf-updater.ipk"),
        BASE_IPK,
        pathlib.Path.home()/"Downloads/luci-app-hbnf-updater_1.2.3-1_all-090300853504e3e2bc6fe50c64cbb2b87c6688e38af9dc51dfcada2d87fbcdff.ipk",
    ]
    for p in candidates:
        if p.is_file() and sha256(p)==EXPECTED_UPDATER:
            if p!=BASE_IPK:
                BASE_IPK.write_bytes(p.read_bytes())
            return {"source":str(p),"path":str(BASE_IPK),"downloaded":False,"sha256":EXPECTED_UPDATER,"match":True}
    try:
        with urllib.request.urlopen(UPDATER_URL,timeout=20) as response:
            data=response.read()
        BASE_IPK.write_bytes(data)
        actual=sha256(BASE_IPK)
        return {"source":UPDATER_URL,"path":str(BASE_IPK),"downloaded":True,"sha256":actual,"match":actual==EXPECTED_UPDATER}
    except Exception as e:
        return {"path":str(BASE_IPK),"downloaded":False,"match":False,"error":str(e)}

def main():
    out={}
    out["accepted_v11"]=file_check(V11,EXPECTED_V11)
    out["rollback"]=file_check(ROLLBACK,EXPECTED_ROLLBACK)
    out["signer"]=signer_check()

    identity=run([sys.executable,str(ROOT/"tools/hbnf-source-identity-preflight.py")],cwd=ROOT,timeout=180)
    out["source_identity_exit"]=identity["code"]
    try: out["source_identity"]=json.loads(identity["stdout"])
    except Exception: out["source_identity_raw"]={"stdout":identity["stdout"],"stderr":identity["stderr"]}

    tests=[]
    commands=[
        ["node","tests/hbnf-coordinated-controller-contract.mjs"],
        ["node","tests/hbnf-coordinated-backend-staging.mjs"],
        ["node","tests/hbnf-release-readiness.mjs"],
        ["node","tests/hbnf-ios12-compat-audit.mjs"],
        ["node","tests/hbnf-canonical-palette-projection.mjs"],
        [sys.executable,"-m","py_compile","tools/hbnf-rebuild-opal-updater.py","tools/hbnf-source-identity-preflight.py","tests/hbnf-opal-updater-rebuilder.test.py"],
        [sys.executable,"tests/hbnf-opal-updater-rebuilder.test.py"],
    ]
    for cmd in commands:
        try:
            result=run(cmd,cwd=ROOT,timeout=180)
        except FileNotFoundError as e:
            result={"code":127,"stdout":"","stderr":str(e)}
        tests.append({"command":" ".join(cmd),"code":result["code"],"stdout":result["stdout"],"stderr":result["stderr"]})
    out["tests"]=tests

    updater=ensure_base_ipk()
    out["updater_base"]=updater
    if updater.get("match"):
        rebuild=run([sys.executable,str(ROOT/"tools/hbnf-rebuild-opal-updater.py"),str(BASE_IPK),str(NEW_IPK)],cwd=ROOT,timeout=180)
        out["updater_rebuild"]={"code":rebuild["code"],"stdout":rebuild["stdout"],"stderr":rebuild["stderr"]}
        if rebuild["code"]==0 and NEW_IPK.is_file():
            out["updater_rebuild"]["path"]=str(NEW_IPK)
            out["updater_rebuild"]["sha256"]=sha256(NEW_IPK)
            out["updater_rebuild"]["size_bytes"]=NEW_IPK.stat().st_size

    hard=[
        out["accepted_v11"].get("match") is True,
        out["rollback"].get("match") is True,
        out.get("source_identity_exit")==0,
        all(t["code"]==0 for t in tests),
        out["signer"].get("private_present") is True,
        out["signer"].get("private_mode_ok") is True,
        out["signer"].get("public_present") is True,
        out["updater_base"].get("match") is True,
        out.get("updater_rebuild",{}).get("code")==0,
    ]
    out["pass"]=all(hard)
    DETAIL.write_text(json.dumps(out,indent=2)+"\n")

    print("HBNF_LOCAL_PREFLIGHT="+("PASS" if out["pass"] else "NEEDS_ATTENTION"))
    print("V11_SHA="+("PASS" if out["accepted_v11"].get("match") else "FAIL"))
    print("ROLLBACK_SHA="+("PASS" if out["rollback"].get("match") else "FAIL"))
    print("SOURCE_IDENTITY="+("PASS" if out.get("source_identity_exit")==0 else "FAIL"))
    print("SOURCE_TESTS="+("PASS" if all(t["code"]==0 for t in tests) else "FAIL"))
    print("SIGNER="+("PASS" if out["signer"].get("private_present") and out["signer"].get("private_mode_ok") and out["signer"].get("public_present") else "FAIL"))
    print("UPDATER_BASE="+("PASS" if out["updater_base"].get("match") else "FAIL"))
    print("UPDATER_REBUILD="+("PASS" if out.get("updater_rebuild",{}).get("code")==0 else "FAIL"))
    if out.get("updater_rebuild",{}).get("sha256"):
        print("UPDATER_1_2_4_SHA256="+out["updater_rebuild"]["sha256"])
    identity_obj=out.get("source_identity",{})
    sources=[]
    for a in identity_obj.get("artifacts",[]):
        if a.get("accepted_hash_match"):
            sources.extend([x.get("path") for x in a.get("nearby_sources",[]) if x.get("path")])
    print("SOURCE_CANDIDATES="+str(len(set(sources))))
    for p in sorted(set(sources))[:8]: print("SOURCE="+p)
    print("DETAIL_JSON="+str(DETAIL))
    return 0 if out["pass"] else 2

if __name__=="__main__":
    raise SystemExit(main())

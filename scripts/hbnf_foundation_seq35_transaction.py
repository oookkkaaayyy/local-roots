#!/usr/bin/env python3
"""One exact seq35 Foundation run with seq36 Release07 failure recovery.

Never reads Opal release-state. Candidate OTA is attempted at most once. Once
attempted, any non-PASS outcome triggers one exact Release07 recovery from Opal.
"""
from __future__ import annotations
import argparse, hashlib, json, pathlib, shlex, subprocess, sys, time, urllib.request

MATRIX="http://192.168.77.10"; AUX="http://192.168.77.11"; OPAL="root@192.168.77.1"
MATRIX_MAC="704bca5b345c"; AUX_MAC="8c94df55c34c"
BASE="hbnf-matrix-coordinated-v1-20261002-07"; BASE_SHA="8e8db17786b178fc8fcd2cdf8a21512681ec7158941ee49ea255509970b1bcab"; BASE_SIZE=1458624
CANDIDATE="hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1"; CANDIDATE_SHA="6285f1fde93edf74038e718dee519df5340ec27a9c18bef6075562b272894338"; CANDIDATE_SIZE=1488768
SSH=["ssh","-i",str(pathlib.Path.home()/".ssh/hbnf_opal_rsa"),"-o","IdentitiesOnly=yes","-o","HostKeyAlgorithms=+ssh-rsa","-o","PubkeyAcceptedAlgorithms=+ssh-rsa","-o","PasswordAuthentication=no","-o","BatchMode=yes"]

def sha_bytes(b): return hashlib.sha256(b).hexdigest()
def save(p,v):
    p=pathlib.Path(p);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,indent=2,sort_keys=True)+"\n")
def get(url,timeout=8):
    req=urllib.request.Request(url,headers={"Accept":"application/json","Cache-Control":"no-store"})
    with urllib.request.urlopen(req,timeout=timeout) as r:
        raw=r.read();return r.status,raw,json.loads(raw)
def capture(out,label):
    d={"captured_at_unix":time.time(),"responses":{}}
    for name,url in (("matrix_info",MATRIX+"/json/info"),("matrix_state",MATRIX+"/json/state"),("matrix_build",MATRIX+"/hbnf/build.json"),("aux_info",AUX+"/json/info"),("aux_state",AUX+"/json/state")):
        code,raw,obj=get(url);save(out/(label+"-"+name+".json"),obj)
        d["responses"][name]={"http":code,"bytes":len(raw),"sha256":sha_bytes(raw),"data":obj}
    return d
def assert_identity(d,release):
    i=d["responses"]["matrix_info"]["data"]; b=d["responses"]["matrix_build"]["data"]
    if i.get("ip")!="192.168.77.10" or i.get("mac","").replace(":","").lower()!=MATRIX_MAC:raise RuntimeError("matrix-ip-or-mac-mismatch")
    if i.get("ver")!="16.0.1" or b.get("release_id")!=release or b.get("candidate")!=release:raise RuntimeError("matrix-runtime-identity-mismatch")
    if "HBNF" not in d["responses"]["matrix_state"]["data"]:raise RuntimeError("matrix-hbnf-state-missing")
def assert_aux(d):
    a=d["responses"]["aux_info"]["data"]
    if a.get("ip")!="192.168.77.11" or a.get("mac","").replace(":","").lower()!=AUX_MAC:raise RuntimeError("aux-ip-or-mac-mismatch")
    if a.get("live") is not True or a.get("lm")!="DDP" or a.get("lip")!="192.168.77.10":raise RuntimeError("aux-ddp-not-live-from-matrix")
def wait_identity(out,release,timeout=180):
    deadline=time.time()+timeout;last=None
    while time.time()<deadline:
        try:
            d=capture(out,"identity-poll");assert_identity(d,release);return d
        except Exception as e:last=str(e);time.sleep(3)
    raise RuntimeError(f"runtime-identity-timeout:{release}:{last}")
def ledger_write(seq,release,digest):
    line=f"{seq} {release} {digest}"
    remote="umask 077; printf '%s\\n' "+shlex.quote(line)+" > /etc/hbnf-updater/release-state.tmp && chmod 600 /etc/hbnf-updater/release-state.tmp && sync && mv /etc/hbnf-updater/release-state.tmp /etc/hbnf-updater/release-state && sync && printf LEDGER_WRITE_OK"
    p=subprocess.run(SSH+["-o","ConnectTimeout=8",OPAL,remote],capture_output=True,text=True,timeout=20)
    if p.returncode or "LEDGER_WRITE_OK" not in p.stdout:raise RuntimeError(f"seq{seq}-ledger-atomic-write-failed:{p.stderr[-500:]}")
def upload_candidate_once(binary,response_path):
    cmd=["curl","--silent","--show-error","--connect-timeout","5","--max-time","180","-F",f"update=@{binary};type=application/octet-stream","-o",str(response_path),"-w","%{http_code}",MATRIX+"/update"]
    p=subprocess.run(cmd,capture_output=True,text=True,timeout=190);raw=pathlib.Path(response_path).read_bytes() if pathlib.Path(response_path).exists() else b""
    r={"exit":p.returncode,"http_status":p.stdout.strip(),"response_bytes":len(raw),"response_sha256":sha_bytes(raw),"update_successful":b"Update successful" in raw,"stderr_tail":p.stderr[-1000:],"attempts":1}
    if p.returncode or p.stdout.strip()!="200" or not r["update_successful"]:raise RuntimeError("seq35-ota-response-not-confirmed-no-retry")
    return r
def recover_once(binary,out):
    data=binary.read_bytes();remote_path="/tmp/hbnf-seq36-release07.bin"
    remote="umask 077; cat > "+remote_path+" && chmod 600 "+remote_path+" && test \"$(sha256sum "+remote_path+" | cut -d' ' -f1)\" = "+BASE_SHA+" && test \"$(wc -c < "+remote_path+" | tr -d ' ')\" = "+str(BASE_SIZE)+" && printf OPAL_ARTIFACT_VERIFIED"
    p=subprocess.run(SSH+["-o","ConnectTimeout=8","-T",OPAL,remote],input=data,capture_output=True,timeout=90)
    if p.returncode or b"OPAL_ARTIFACT_VERIFIED" not in p.stdout:raise RuntimeError("seq36-opal-copy-hash-verification-failed")
    command="code=$(curl --silent --show-error --connect-timeout 5 --max-time 180 -F 'update=@"+remote_path+";type=application/octet-stream' -o /tmp/hbnf-seq36-ota-response.html -w '%{http_code}' http://192.168.77.10/update) && test \"$code\" = 200 && grep -q 'Update successful' /tmp/hbnf-seq36-ota-response.html && printf 'HTTP_%s UPDATE_OK\\n' \"$code\" && sha256sum /tmp/hbnf-seq36-ota-response.html && cat /tmp/hbnf-seq36-ota-response.html"
    p=subprocess.run(SSH+["-o","ConnectTimeout=8",OPAL,command],capture_output=True,text=True,timeout=210)
    # Dropbear command channel returns the remote command text; preserve it as raw evidence.
    raw=p.stdout.encode();(out/"seq36-opal-ota-response.txt").write_bytes(raw)
    if p.returncode or "HTTP_200 UPDATE_OK" not in p.stdout or "Update successful" not in p.stdout:raise RuntimeError("seq36-opal-ota-response-not-confirmed")
    d=wait_identity(out,BASE);time.sleep(8);stable=capture(out,"seq36-post-recovery");assert_identity(stable,BASE)
    aux=stable["responses"]["aux_info"]["data"]
    if aux.get("ip")!="192.168.77.11" or aux.get("mac","").replace(":","").lower()!=AUX_MAC or aux.get("live") is not True or aux.get("lm")!="DDP" or aux.get("lip")!="192.168.77.10":raise RuntimeError("aux-ddp-continuity-failed-after-recovery")
    ledger_write(36,BASE,BASE_SHA)
    return {"status":"PASS","sequence":36,"release":BASE,"sha256":BASE_SHA,"size_bytes":BASE_SIZE,"aux_ddp_live":True,"device_identity":stable}
def main():
    ap=argparse.ArgumentParser();ap.add_argument("--candidate-bin",required=True);ap.add_argument("--provenance",required=True);ap.add_argument("--recovery-bin",required=True);ap.add_argument("--adapter",required=True);ap.add_argument("--inventory",required=True);ap.add_argument("--policy",required=True);ap.add_argument("--outdir",required=True);ap.add_argument("--dry-run",action="store_true");a=ap.parse_args()
    candidate=pathlib.Path(a.candidate_bin).resolve(); provenance=json.loads(pathlib.Path(a.provenance).read_text()); recovery=pathlib.Path(a.recovery_bin).resolve(); out=pathlib.Path(a.outdir).resolve();out.mkdir(parents=True,exist_ok=True)
    cb=candidate.read_bytes();rb=recovery.read_bytes(); inv=json.loads(pathlib.Path(a.inventory).read_text())
    if sha_bytes(cb)!=CANDIDATE_SHA or len(cb)!=CANDIDATE_SIZE or provenance.get("candidate")!=CANDIDATE or provenance.get("firmware_sha256")!=CANDIDATE_SHA or provenance.get("firmware_bytes")!=CANDIDATE_SIZE or provenance.get("diagnostic_source_sha256")!="f0350177d671f44577d2bfd40780b498662f57d08e5a4078be738c995da8f67a" or provenance.get("github_commit")!="b18b162ec4b4f9173b1de892957ff8b834fe2b50" or provenance.get("ota_headroom_bytes")!=84096:raise RuntimeError("seq35-candidate-artifact-provenance-contract-failed")
    if sha_bytes(rb)!=BASE_SHA or len(rb)!=BASE_SIZE:raise RuntimeError("seq36-release07-artifact-contract-failed")
    entries=inv.get("entries",[])
    if inv.get("expected_kernel_count")!=28 or len(entries)!=28 or [x.get("effect_id") for x in entries]!=list(range(220,248)) or [x.get("runtime_kernel_index_expected") for x in entries]!=list(range(28)):raise RuntimeError("seq35-inventory-contract-failed")
    policy=json.loads(pathlib.Path(a.policy).read_text());adapter=json.loads(pathlib.Path(a.adapter).read_text())
    if adapter.get("expected_release_id")!=CANDIDATE or adapter.get("timeout_seconds")!=240:raise RuntimeError("seq35-adapter-contract-failed")
    if a.dry_run:
        print(json.dumps({"status":"DRY_RUN_PASS","candidate_sha256":CANDIDATE_SHA,"candidate_size_bytes":CANDIDATE_SIZE,"release07_sha256":BASE_SHA,"kernel_count":28,"soak_seconds":5400,"hard_stop_frame_ms":1000},indent=2));return 0
    started={"schema":"hbnf-foundation-seq35-36-transaction-v1","candidate":{"release":CANDIDATE,"sha256":CANDIDATE_SHA,"size_bytes":CANDIDATE_SIZE,"source_commit":provenance["github_commit"]},"recovery":{"release":BASE,"sha256":BASE_SHA,"size_bytes":BASE_SIZE,"sequence":36},"candidate_install_attempts":0,"sweep_attempts":0,"recovery_attempts":0,"status":"STARTED"};save(out/"TRANSACTION_STARTED.json",started)
    before=capture(out,"seq35-pre-install");assert_identity(before,BASE);assert_aux(before)
    started["pre_install_identity"]=before;attempted=False
    try:
        attempted=True;started["candidate_install_attempts"]=1;save(out/"TRANSACTION_STARTED.json",started)
        started["candidate_ota"]=upload_candidate_once(candidate,out/"seq35-candidate-ota-response.html")
        installed=wait_identity(out,CANDIDATE);started["candidate_runtime_identity"]=installed
        ledger_write(35,CANDIDATE,CANDIDATE_SHA);started["seq35_ledger_write"]="PASS_WITHOUT_READBACK";save(out/"CANDIDATE_INSTALLED.json",started)
        sweep_out=out/"foundation-sweep";cmd=[sys.executable,str(pathlib.Path(__file__).with_name("hbnf_live_kernel_sweep.py")),"--adapter",str(pathlib.Path(a.adapter).resolve()),"--inventory",str(pathlib.Path(a.inventory).resolve()),"--outdir",str(sweep_out),"--contract","foundation","--qualify","--policy",str(pathlib.Path(a.policy).resolve()),"--soak-seconds","5400","--soak-interval-seconds","8","--threshold-policy",str(pathlib.Path(a.policy).resolve()),"--threshold-baseline",str((out/"PRE_SOAK_BASELINE.json").resolve())]
        started["sweep_attempts"]=1;save(out/"CANDIDATE_INSTALLED.json",started)
        p=subprocess.run(cmd,capture_output=True,text=True,timeout=8*60*60)
        (out/"foundation-sweep-stdout.txt").write_text(p.stdout);(out/"foundation-sweep-stderr.txt").write_text(p.stderr)
        started["sweep_exit_code"]=p.returncode
        report=sweep_out/"ALL_KERNEL_SWEEP_REPORT.json"; manifest=sweep_out/"SWEEP_MANIFEST.json"; restore=sweep_out/"RESTORE_RECEIPT.json"
        started["sweep_status"]="PASS" if p.returncode==0 and report.is_file() and manifest.is_file() and restore.is_file() and json.loads(restore.read_text()).get("snapshot_equal") is True else "FAIL"
        if report.is_file():started["foundation_report"]=json.loads(report.read_text())
        if manifest.is_file():started["sweep_manifest"]=json.loads(manifest.read_text())
        save(out/"POST_SWEEP.json",started)
    except Exception as e:
        started["sweep_status"]="FAIL";started["failure"]=f"{type(e).__name__}: {e}";save(out/"POST_SWEEP.json",started)
    # On candidate/sweep failure, the exact pre-authorized Release07 transaction
    # is the one failure path. A complete Foundation PASS leaves candidate live.
    passed=started.get("sweep_status")=="PASS"
    if attempted and not passed:
        started["recovery_attempts"]=1;save(out/"RECOVERY_STARTED.json",started)
        try:started["recovery"]=recover_once(recovery,out);started["recovery_status"]="PASS"
        except Exception as e:started["recovery_status"]="FAIL_STOP";started["recovery_error"]=f"{type(e).__name__}: {e}"
    elif passed:
        started["recovery_status"]="NOT_USED__FOUNDATION_PASS"
    started["status"]="FOUNDATION_SWEEP_AND_SOAK_PASS" if passed else "RECOVERY_PASS__FOUNDATION_FAIL" if started.get("recovery_status")=="PASS" else "FAIL_STOP"
    save(out/"TRANSACTION_RESULT.json",started);print(json.dumps(started,indent=2,sort_keys=True));return 0 if passed else 2
if __name__=="__main__":
    try:raise SystemExit(main())
    except Exception as e:print(f"seq35/36 transaction failed before/within guarded execution: {type(e).__name__}: {e}",file=sys.stderr);raise SystemExit(2)

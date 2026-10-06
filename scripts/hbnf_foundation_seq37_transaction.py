#!/usr/bin/env python3
"""Seq37 exact-candidate Foundation transaction; seq38 is genuine-failure-only."""
from __future__ import annotations
import argparse,hashlib,json,pathlib,shlex,subprocess,sys,time,urllib.request
from hbnf_foundation_seq37_failure_policy import recovery_decision,restore_is_proven,read_json

ROOT=pathlib.Path(__file__).resolve().parents[1]
MATRIX="http://192.168.77.10";AUX="http://192.168.77.11";OPAL="root@192.168.77.1"
MATRIX_MAC="704bca5b345c";AUX_MAC="8c94df55c34c"
BASE="hbnf-matrix-coordinated-v1-20261002-07";BASE_SHA="8e8db17786b178fc8fcd2cdf8a21512681ec7158941ee49ea255509970b1bcab";BASE_SIZE=1458624
CANDIDATE="hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1";CANDIDATE_SHA="6285f1fde93edf74038e718dee519df5340ec27a9c18bef6075562b272894338";CANDIDATE_SIZE=1488768
SSH=["ssh","-i",str(pathlib.Path.home()/".ssh/hbnf_opal_rsa"),"-o","IdentitiesOnly=yes","-o","HostKeyAlgorithms=+ssh-rsa","-o","PubkeyAcceptedAlgorithms=+ssh-rsa","-o","PasswordAuthentication=no","-o","BatchMode=yes"]

def sha(b):return hashlib.sha256(b).hexdigest()
def save(path,value):
    p=pathlib.Path(path);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(value,indent=2,sort_keys=True)+"\n")
def get(url,timeout=8):
    req=urllib.request.Request(url,headers={"Accept":"application/json","Cache-Control":"no-store"})
    with urllib.request.urlopen(req,timeout=timeout) as r:
        raw=r.read();return r.status,raw,json.loads(raw)
def capture(out,label):
    data={"captured_at_unix":time.time(),"responses":{}}
    for name,url in (("matrix_info",MATRIX+"/json/info"),("matrix_state",MATRIX+"/json/state"),("matrix_build",MATRIX+"/hbnf/build.json"),("aux_info",AUX+"/json/info"),("aux_state",AUX+"/json/state")):
        code,raw,obj=get(url);p=pathlib.Path(out)/(label+"-"+name+".json");save(p,obj)
        data["responses"][name]={"http":code,"bytes":len(raw),"sha256":sha(raw),"path":str(p),"data":obj}
    return data
def identity(data,release):
    i=data["responses"]["matrix_info"]["data"];b=data["responses"]["matrix_build"]["data"];s=data["responses"]["matrix_state"]["data"]
    if i.get("ip")!="192.168.77.10" or i.get("mac","").replace(":","").lower()!=MATRIX_MAC:raise RuntimeError("matrix-ip-or-mac-mismatch")
    if i.get("ver")!="16.0.1" or b.get("release_id")!=release or b.get("candidate")!=release:raise RuntimeError("matrix-runtime-identity-mismatch")
    if not isinstance(s.get("HBNF"),dict):raise RuntimeError("matrix-HBNF-state-missing")
    return i,b,s
def assert_aux(data):
    a=data["responses"]["aux_info"]["data"]
    if a.get("ip")!="192.168.77.11" or a.get("mac","").replace(":","").lower()!=AUX_MAC or a.get("live") is not True or a.get("lm")!="DDP" or a.get("lip")!="192.168.77.10":raise RuntimeError("aux-ddp-not-live-from-matrix")
def wait_identity(out,release,timeout=180):
    deadline=time.time()+timeout;last=None
    while time.time()<deadline:
        try:
            d=capture(out,"identity-poll");identity(d,release);return d
        except Exception as e:last=f"{type(e).__name__}: {e}";time.sleep(3)
    raise RuntimeError(f"runtime-identity-timeout:{release}:{last}")
def ledger_write(seq,release,digest):
    line=f"{seq} {release} {digest}"
    remote="umask 077; printf '%s\\n' "+shlex.quote(line)+" > /etc/hbnf-updater/release-state.tmp && chmod 600 /etc/hbnf-updater/release-state.tmp && sync && mv /etc/hbnf-updater/release-state.tmp /etc/hbnf-updater/release-state && sync && printf LEDGER_WRITE_OK"
    p=subprocess.run(SSH+["-o","ConnectTimeout=8",OPAL,remote],capture_output=True,text=True,timeout=20)
    if p.returncode or "LEDGER_WRITE_OK" not in p.stdout:raise RuntimeError(f"seq{seq}-ledger-atomic-write-failed:{p.stderr[-500:]}")
def ota_once(binary,response_path,label):
    cmd=["curl","--silent","--show-error","--connect-timeout","5","--max-time","180","-F",f"update=@{binary};type=application/octet-stream","-o",str(response_path),"-w","%{http_code}",MATRIX+"/update"]
    p=subprocess.run(cmd,capture_output=True,text=True,timeout=190);raw=pathlib.Path(response_path).read_bytes() if pathlib.Path(response_path).exists() else b""
    receipt={"exit":p.returncode,"http_status":p.stdout.strip(),"response_bytes":len(raw),"response_sha256":sha(raw),"update_successful":b"Update successful" in raw,"stderr_tail":p.stderr[-1000:],"attempts":1}
    save(pathlib.Path(response_path).with_suffix(".json"),receipt)
    if p.returncode or p.stdout.strip()!="200" or not receipt["update_successful"]:raise RuntimeError(f"{label}-ota-response-not-confirmed-single-attempt")
    return receipt
def recover_once(binary,out):
    data=binary.read_bytes();remote_path="/tmp/hbnf-seq38-release07.bin"
    remote="umask 077; cat > "+remote_path+" && chmod 600 "+remote_path+" && test \"$(sha256sum "+remote_path+" | cut -d' ' -f1)\" = "+BASE_SHA+" && test \"$(wc -c < "+remote_path+" | tr -d ' ')\" = "+str(BASE_SIZE)+" && printf OPAL_ARTIFACT_VERIFIED"
    p=subprocess.run(SSH+["-o","ConnectTimeout=8","-T",OPAL,remote],input=data,capture_output=True,timeout=90)
    if p.returncode or b"OPAL_ARTIFACT_VERIFIED" not in p.stdout:raise RuntimeError("seq38-opal-copy-hash-verification-failed")
    command="code=$(curl --silent --show-error --connect-timeout 5 --max-time 180 -F 'update=@"+remote_path+";type=application/octet-stream' -o /tmp/hbnf-seq38-ota-response.html -w '%{http_code}' http://192.168.77.10/update) && test \"$code\" = 200 && grep -q 'Update successful' /tmp/hbnf-seq38-ota-response.html && printf 'HTTP_200 UPDATE_OK\\n' && sha256sum /tmp/hbnf-seq38-ota-response.html && cat /tmp/hbnf-seq38-ota-response.html"
    p=subprocess.run(SSH+["-o","ConnectTimeout=8",OPAL,command],capture_output=True,text=True,timeout=210);(pathlib.Path(out)/"seq38-opal-ota-response.txt").write_text(p.stdout)
    if p.returncode or "HTTP_200 UPDATE_OK" not in p.stdout or "Update successful" not in p.stdout:raise RuntimeError("seq38-opal-ota-response-not-confirmed")
    d=wait_identity(out,BASE);time.sleep(8);post=capture(out,"seq38-post-recovery");identity(post,BASE);assert_aux(post);ledger_write(38,BASE,BASE_SHA)
    return {"status":"PASS","sequence":38,"release":BASE,"sha256":BASE_SHA,"size_bytes":BASE_SIZE,"aux_ddp_live":True,"post_recovery_identity":post}
def verify_artifacts(candidate,provenance_path,recovery,inventory_path,adapter_path,policy_path):
    cb=candidate.read_bytes();rb=recovery.read_bytes();provenance=json.loads(provenance_path.read_text());inv=json.loads(inventory_path.read_text());adapter=json.loads(adapter_path.read_text());policy=json.loads(policy_path.read_text())
    if sha(cb)!=CANDIDATE_SHA or len(cb)!=CANDIDATE_SIZE or provenance.get("candidate")!=CANDIDATE or provenance.get("firmware_sha256")!=CANDIDATE_SHA or provenance.get("firmware_bytes")!=CANDIDATE_SIZE or provenance.get("diagnostic_source_sha256")!="f0350177d671f44577d2bfd40780b498662f57d08e5a4078be738c995da8f67a" or provenance.get("github_commit")!="b18b162ec4b4f9173b1de892957ff8b834fe2b50":raise RuntimeError("seq37-candidate-artifact-provenance-contract-failed")
    if sha(rb)!=BASE_SHA or len(rb)!=BASE_SIZE:raise RuntimeError("seq38-release07-artifact-contract-failed")
    entries=inv.get("entries",[])
    if inv.get("expected_kernel_count")!=28 or len(entries)!=28 or [x.get("effect_id") for x in entries]!=list(range(220,248)) or [x.get("runtime_kernel_index_expected") for x in entries]!=list(range(28)):raise RuntimeError("seq37-inventory-contract-failed")
    if adapter.get("expected_release_id")!=CANDIDATE or adapter.get("timeout_seconds")!=240:raise RuntimeError("seq37-adapter-contract-failed")
    if policy.get("schema")!="hbnf-runtime-qualification-policy-v1" or policy.get("status")!="FROZEN":raise RuntimeError("seq37-threshold-policy-not-frozen")
    return provenance,inv
def run_sweep(adapter,inventory,policy,out):
    sweep=pathlib.Path(out)/"foundation-sweep";cmd=[sys.executable,str(ROOT/"scripts/hbnf_live_kernel_sweep.py"),"--adapter",str(adapter),"--inventory",str(inventory),"--outdir",str(sweep),"--contract","foundation","--soak-seconds","5400","--soak-interval-seconds","8","--threshold-policy",str(policy),"--threshold-baseline",str(pathlib.Path(out)/"PRE_SOAK_BASELINE.json")]
    try:p=subprocess.run(cmd,capture_output=True,text=True,timeout=8*60*60)
    except subprocess.TimeoutExpired as e:
        save(pathlib.Path(out)/"HOST_PROCESS_TIMEOUT.json",{"status":"HOST_PROCESS_TIMEOUT","timeout_seconds":e.timeout});return 124
    (pathlib.Path(out)/"foundation-sweep-stdout.txt").write_text(p.stdout);(pathlib.Path(out)/"foundation-sweep-stderr.txt").write_text(p.stderr);return p.returncode
def renderer_restore_evidence(out,adapter):
    sweep=pathlib.Path(out)/"foundation-sweep";snap=read_json(sweep/"PRE_SWEEP_STATE.json");raw=read_json(sweep/"POST_RESTORE_RAW_STATE.json");receipt=read_json(sweep/"POST_RESTORE_STATE.json")
    if snap and (raw is None or not restore_is_proven(snap,raw,receipt)):
        cfg=json.loads(pathlib.Path(adapter).read_text());cmd=[x.replace("{snapshot_file}",str(sweep/"PRE_SWEEP_STATE.json")) for x in cfg["restore_argv"]]
        p=subprocess.run(cmd,capture_output=True,text=True,timeout=130)
        try:raw=json.loads(p.stdout);save(sweep/"SEQ37_HOST_FAILURE_RESTORE.json",raw)
        except Exception:raw=None
        qv=cfg["snapshot_argv"][:]
        if "--observer-output" in qv:
            i=qv.index("--observer-output");del qv[i:i+2]
        q=subprocess.run(qv,capture_output=True,text=True,timeout=120)
        try:receipt=json.loads(q.stdout);save(sweep/"SEQ37_HOST_FAILURE_RESTORE_RECEIPT.json",receipt)
        except Exception:receipt=None
        return bool(snap and raw and restore_is_proven(snap,raw,receipt))
    return bool(snap and raw and restore_is_proven(snap,raw,receipt))
def run(args):
    candidate=pathlib.Path(args.candidate_bin).resolve();provp=pathlib.Path(args.provenance).resolve();recovery=pathlib.Path(args.recovery_bin).resolve();inventory=pathlib.Path(args.inventory).resolve();adapter=pathlib.Path(args.adapter).resolve();policy=pathlib.Path(args.policy).resolve();out=pathlib.Path(args.outdir).resolve();out.mkdir(parents=True,exist_ok=True)
    provenance,inv=verify_artifacts(candidate,provp,recovery,inventory,adapter,policy)
    if args.dry_run:
        print(json.dumps({"status":"DRY_RUN_PASS","candidate_sha256":CANDIDATE_SHA,"candidate_size_bytes":CANDIDATE_SIZE,"recovery_sha256":BASE_SHA,"inventory_kernels":len(inv["entries"]),"soak_seconds":5400,"observer_evidence":"seq33 exact candidate PASS reused","host_failure_policy":"preserve only with identity/no-restart/restore/AUX proofs; seq38 genuine failures only"},indent=2));return 0
    start={"schema":"hbnf-foundation-seq37-38-transaction-v1","candidate":{"sequence":37,"release":CANDIDATE,"sha256":CANDIDATE_SHA,"size_bytes":CANDIDATE_SIZE,"source_commit":provenance["github_commit"]},"recovery":{"sequence":38,"release":BASE,"sha256":BASE_SHA,"size_bytes":BASE_SIZE,"role":"REAL_FAILURE_RECOVERY_ONLY"},"candidate_install_attempts":0,"sweep_attempts":0,"recovery_attempts":0,"status":"STARTED"};save(out/"TRANSACTION_STARTED.json",start)
    pre=capture(out,"seq37-pre-install");identity(pre,BASE);assert_aux(pre);start["pre_install_identity"]=pre;start["candidate_install_attempts"]=1;save(out/"TRANSACTION_STARTED.json",start)
    start["candidate_ota"]=ota_once(candidate,out/"seq37-candidate-ota-response.html","seq37-candidate");installed=wait_identity(out,CANDIDATE);start["candidate_runtime_identity"]=installed;ledger_write(37,CANDIDATE,CANDIDATE_SHA);start["seq37_ledger_write"]="PASS_WITHOUT_READBACK";save(out/"CANDIDATE_INSTALLED.json",start)
    _,_,candidate_state=identity(installed,CANDIDATE);baseline_uptime=float(candidate_state.get("HBNF",{}).get("timing",{}).get("uptimeSec",0));start["sweep_attempts"]=1;save(out/"CANDIDATE_INSTALLED.json",start)
    code=run_sweep(adapter,inventory,policy,out);start["sweep_exit_code"]=code
    sweep=out/"foundation-sweep";report=read_json(sweep/"ALL_KERNEL_SWEEP_REPORT.json");manifest=read_json(sweep/"SWEEP_MANIFEST.json");receipt=read_json(sweep/"RESTORE_RECEIPT.json")
    soak_audit=read_json(sweep/"FOUNDATION_SOAK_AUDIT.json")
    if code==0 and report and report.get("status")=="PASS" and manifest and receipt and receipt.get("snapshot_equal") is True and soak_audit and soak_audit.get("status")=="PASS" and (soak_audit.get("foundation_qualification") or {}).get("status")=="PASS":
        start.update({"sweep_status":"PASS","foundation_report":report,"sweep_manifest":manifest,"foundation_soak_audit":soak_audit,"recovery_status":"NOT_USED__FOUNDATION_PASS","status":"FOUNDATION_SWEEP_AND_90_MINUTE_SOAK_PASS"});save(out/"TRANSACTION_RESULT.json",start);return 0
    abort=read_json(sweep/"SWEEP_ABORT.json") or {};audit=read_json(sweep/"FOUNDATION_SOAK_AUDIT.json") or {};error="; ".join(str(x) for x in (abort.get("run_error"),abort.get("restore_error"),("foundation-sweep-report-failed: "+json.dumps(report.get("failures",[])) if report and report.get("status")!="PASS" else None),("foundation-soak-audit-failed: "+json.dumps(audit.get("errors",[])) if audit and audit.get("status")!="PASS" else None),"runner_exit="+str(code)) if x)
    restored=renderer_restore_evidence(out,adapter)
    try:
        after=capture(out,"seq37-failure-postflight");info,build,state=identity(after,CANDIDATE);assert_aux(after);up=float(state.get("HBNF",{}).get("timing",{}).get("uptimeSec",info.get("uptime",0)))
        candidate_healthy=True;no_restart=up>=baseline_uptime;aux_healthy=True
    except Exception as exc:after=None;candidate_healthy=False;no_restart=False;aux_healthy=False;error+=f"; postflight={type(exc).__name__}: {exc}"
    decision=recovery_decision(error,candidate_healthy,no_restart,restored,aux_healthy)
    start.update({"sweep_status":"FAIL","failure":error,"renderer_restored":restored,"candidate_healthy":candidate_healthy,"no_unexpected_restart":no_restart,"aux_healthy":aux_healthy,"failure_policy_decision":decision,"post_failure_identity":after})
    if decision["action"]=="PRESERVE_SEQ37_AND_FIX_HOST":
        start.update({"status":"HOST_FAILURE__CANDIDATE_PRESERVED__NO_SEQ38","resume_action":"Fix host offline; do not OTA or allocate another sequence. Soft-reboot only this candidate if needed to clear boot-scoped snapshot RAM, then rerun qualification."});save(out/"HOST_FAILURE_SAFE_TO_RESUME.json",start)
    else:
        start["recovery_attempts"]=1;save(out/"RECOVERY_STARTED.json",start)
        try:start["recovery_result"]=recover_once(recovery,out);start["recovery_status"]="PASS"
        except Exception as exc:start["recovery_status"]="FAIL_STOP";start["recovery_error"]=f"{type(exc).__name__}: {exc}"
        start["status"]="REAL_FAILURE__RELEASE07_RECOVERY_"+start["recovery_status"]
    save(out/"TRANSACTION_RESULT.json",start);return 2
def main():
    p=argparse.ArgumentParser();p.add_argument("--candidate-bin",required=True);p.add_argument("--provenance",required=True);p.add_argument("--recovery-bin",required=True);p.add_argument("--adapter",required=True);p.add_argument("--inventory",required=True);p.add_argument("--policy",required=True);p.add_argument("--outdir",required=True);p.add_argument("--dry-run",action="store_true");return run(p.parse_args())
if __name__=="__main__":
    try:raise SystemExit(main())
    except Exception as e:print(f"seq37/38 transaction failed: {type(e).__name__}: {e}",file=sys.stderr);raise SystemExit(2)

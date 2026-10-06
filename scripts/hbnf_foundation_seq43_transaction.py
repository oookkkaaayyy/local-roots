#!/usr/bin/env python3
"""Seq43 requalification: reuse the completed seq39 28-kernel baseline and qualify the same-install soak."""
from __future__ import annotations
import argparse, hashlib, json, pathlib, subprocess, sys, time, shlex, shutil

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
import hbnf_foundation_live_adapter as adapter
import hbnf_live_kernel_sweep as sweep
import hbnf_foundation_continuous_soak as continuous_soak
from hbnf_foundation_seq39_failure_policy import classify_run_error, recovery_decision, restore_is_proven

BASE="hbnf-matrix-coordinated-v1-20261002-07"
BASE_SHA="8e8db17786b178fc8fcd2cdf8a21512681ec7158941ee49ea255509970b1bcab"
BASE_SIZE=1458624
CANDIDATE="hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1"
CANDIDATE_SHA="338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c"
CANDIDATE_SIZE=1489008
MAC="704bca5b345c"
AUX_MAC="8c94df55c34c"
OPAL="root@192.168.77.1"
SSH=["ssh","-i",str(pathlib.Path.home()/".ssh/hbnf_opal_rsa"),"-o","IdentitiesOnly=yes","-o","HostKeyAlgorithms=+ssh-rsa","-o","PubkeyAcceptedAlgorithms=+ssh-rsa","-o","PasswordAuthentication=no","-o","BatchMode=yes"]

def digest(path): return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()
def save(path,obj): sweep.atomic_write(path,json.dumps(obj,indent=2,sort_keys=True)+"\n")
def run(argv,timeout=30,input_bytes=None):
    return subprocess.run(argv,input=input_bytes,capture_output=True,timeout=timeout)

def check_inputs(candidate,recovery,provenance,inventory,policy,baseline,old_manifest,freeze_receipt):
    candidate=pathlib.Path(candidate).resolve();recovery=pathlib.Path(recovery).resolve()
    if candidate.stat().st_size!=CANDIDATE_SIZE or digest(candidate)!=CANDIDATE_SHA:raise ValueError("seq43 candidate hash/size mismatch")
    if recovery.stat().st_size!=BASE_SIZE or digest(recovery)!=BASE_SHA:raise ValueError("seq44 Release07 hash/size mismatch")
    p=json.loads(pathlib.Path(provenance).read_text())
    if p.get("candidate")!=CANDIDATE or p.get("firmware_sha256")!=CANDIDATE_SHA or p.get("firmware_bytes")!=CANDIDATE_SIZE:raise ValueError("seq43 durable build provenance mismatch")
    inv=json.loads(pathlib.Path(inventory).read_text()); entries=inv.get("entries",[])
    if inv.get("expected_kernel_count")!=28 or len(entries)!=28 or [int(x.get("runtime_kernel_index_expected",-1)) for x in entries]!=list(range(28)):raise ValueError("exact 28-kernel inventory invalid")
    cfg=json.loads(pathlib.Path(policy).read_text()); base=json.loads(pathlib.Path(baseline).read_text()); old=json.loads(pathlib.Path(old_manifest).read_text())
    receipt=json.loads(pathlib.Path(freeze_receipt).read_text())
    if base.get("schema")!="hbnf-foundation-28-kernel-baseline-v1" or base.get("release_id")!=CANDIDATE or base.get("kernel_count")!=28:raise ValueError("seq39 baseline identity/coverage invalid")
    if old.get("release_id")!=CANDIDATE or old.get("restore_verified") is not True or len(old.get("kernels",[]))!=28:raise ValueError("seq39 completed sweep manifest invalid")
    restore_path=(pathlib.Path(old_manifest).resolve().parent/old.get("restore_receipt","")).resolve()
    proof=json.loads(restore_path.read_text())
    if proof.get("schema")!="hbnf-seq39-restore-reuse-proof-v1" or proof.get("restoreVerified") is not True or proof.get("packet20Same") is not True:raise ValueError("seq39 exact renderer restore proof invalid")
    for key,filename in (("pre_sweep_state","PRE_SWEEP_STATE.json"),("post_restore_raw_state","POST_RESTORE_RAW_STATE.json"),("post_restore_state","POST_RESTORE_STATE.json")):
        evidence=proof.get("source_files",{}).get(key,{})
        path=restore_path.parent/"foundation-sweep"/filename
        if not path.is_file() or digest(path)!=evidence.get("sha256"):raise ValueError(f"seq39 restore evidence hash mismatch: {filename}")
    if receipt.get("status")!="FROZEN_BEFORE_SOAK" or receipt.get("soak_started") is not False or receipt.get("baseline",{}).get("sha256")!=digest(baseline) or receipt.get("pre_soak_sweep",{}).get("sha256")!=digest(old_manifest):raise ValueError("seq43 threshold freeze not hash-bound to baseline and completed sweep")
    from hbnf_foundation_threshold_freeze import validate_policy
    policy_errors=validate_policy(cfg)
    if policy_errors:raise ValueError("Foundation policy invalid: "+"; ".join(policy_errors))
    if receipt.get("policy",{}).get("sha256")!=digest(policy):raise ValueError("seq43 threshold freeze receipt is not bound to the current AUX-corrected policy")
    adapter_cfg=json.loads(pathlib.Path(ROOT/"config/HBNF_FOUNDATION_LIVE_SWEEP_ADAPTER_SEQ39_20261006.json").read_text())
    sweep.validate_adapter(adapter_cfg)
    return {"candidate_sha256":CANDIDATE_SHA,"candidate_bytes":CANDIDATE_SIZE,"recovery_sha256":BASE_SHA,"recovery_bytes":BASE_SIZE,"kernel_count":28,"baseline_sha256":digest(baseline),"completed_sweep_sha256":digest(old_manifest),"policy_sha256":digest(policy)}

def capture(label,out):
    result={"captured_at_unix":time.time(),"label":label,"responses":{}}
    for name,url in (("matrix_info",adapter.MATRIX+"/json/info"),("matrix_state",adapter.MATRIX+"/json/state"),("matrix_build",adapter.MATRIX+"/hbnf/build.json"),("aux_info",adapter.AUX+"/json/info"),("aux_state",adapter.AUX+"/json/state")):
        value=adapter.get(url);raw=json.dumps(value,sort_keys=True,separators=(",",":")).encode();save(pathlib.Path(out)/(label+"-"+name+".json"),value)
        result["responses"][name]={"sha256":hashlib.sha256(raw).hexdigest(),"body":value}
    info=result["responses"]["matrix_info"]["body"]; build=result["responses"]["matrix_build"]["body"]; aux=result["responses"]["aux_info"]["body"]
    if info.get("ip")!="192.168.77.10" or info.get("mac","").replace(":","").lower()!=MAC:raise RuntimeError("matrix-ip-or-mac-mismatch")
    if aux.get("ip")!="192.168.77.11" or aux.get("mac","").replace(":","").lower()!=AUX_MAC or aux.get("live") is not True or aux.get("lm")!="DDP" or aux.get("lip")!="192.168.77.10":raise RuntimeError("aux-ddp-not-live-from-matrix")
    return result

def require_release(capture_result,release):
    b=capture_result["responses"]["matrix_build"]["body"]
    if b.get("release_id")!=release or b.get("candidate")!=release:raise RuntimeError("matrix-runtime-identity-mismatch")

def opal_install(binary,seq,release,sha,size,out):
    remote=f"/tmp/hbnf-seq{seq}-candidate.bin"
    verify=("umask 077; cat > "+remote+" && chmod 600 "+remote+" && test \"$(sha256sum "+remote+" | cut -d' ' -f1)\" = "+sha+" && test \"$(wc -c < "+remote+" | tr -d ' ')\" = "+str(size)+" && printf ARTIFACT_VERIFIED")
    p=run(SSH+["-o","ConnectTimeout=8","-T",OPAL,verify],90,pathlib.Path(binary).read_bytes())
    save(pathlib.Path(out)/f"seq{seq}-opal-copy-receipt.json",{"exit":p.returncode,"verified":p.returncode==0 and b"ARTIFACT_VERIFIED" in p.stdout,"sha256":sha,"size":size,"stderr":p.stderr.decode(errors="replace")[-1000:]})
    if p.returncode or b"ARTIFACT_VERIFIED" not in p.stdout:raise RuntimeError(f"seq{seq}-opal-copy-hash-verification-failed")
    response=f"/tmp/hbnf-seq{seq}-ota-response.html"
    remote_cmd=("code=$(curl --silent --show-error --connect-timeout 5 --max-time 180 -F 'update=@"+remote+";type=application/octet-stream' -o "+response+" -w '%{http_code}' http://192.168.77.10/update) && test \"$code\" = 200 && grep -q 'Update successful' "+response+" && printf 'HTTP_200 UPDATE_OK\\n' && sha256sum "+response+" && cat "+response)
    p=run(SSH+["-o","ConnectTimeout=8",OPAL,remote_cmd],210)
    (pathlib.Path(out)/f"seq{seq}-opal-ota-response.txt").write_bytes(p.stdout)
    if p.returncode or b"HTTP_200 UPDATE_OK" not in p.stdout or b"Update successful" not in p.stdout:raise RuntimeError(f"seq{seq}-opal-ota-response-not-confirmed")
    return {"status":"PASS","transport":"single Opal-origin WLED local /update after remote exact hash/size verification","release":release,"sha256":sha,"size_bytes":size}

def ledger_write(seq,release,sha):
    line=f"{seq} {release} {sha}"
    remote="umask 077; printf '%s\\n' "+shlex.quote(line)+" > /etc/hbnf-updater/release-state.tmp && chmod 600 /etc/hbnf-updater/release-state.tmp && sync && mv /etc/hbnf-updater/release-state.tmp /etc/hbnf-updater/release-state && sync && printf LEDGER_WRITE_OK"
    p=run(SSH+["-o","ConnectTimeout=8",OPAL,remote],25)
    if p.returncode or b"LEDGER_WRITE_OK" not in p.stdout:raise RuntimeError(f"seq{seq}-ledger-write-failed:{p.stderr.decode(errors='replace')[-500:]}")

def wait_release(expected,out,deadline_seconds=180):
    end=time.monotonic()+deadline_seconds;last="not-polled"
    while time.monotonic()<end:
        try:
            d=capture("identity-poll",out);require_release(d,expected);return d
        except Exception as e:last=f"{type(e).__name__}: {e}";time.sleep(3)
    raise RuntimeError(f"runtime-identity-timeout:{expected}:{last}")

def main():
    ap=argparse.ArgumentParser()
    for name in ("candidate-bin","recovery-bin","provenance","inventory","policy","baseline","sweep-manifest","threshold-freeze","outdir"):ap.add_argument("--"+name,required=True)
    ap.add_argument("--duration-seconds",type=int,default=5400);ap.add_argument("--interval-seconds",type=float,default=8,help="state-change cadence; telemetry has its own independent 5-second cadence");ap.add_argument("--dry-run",action="store_true")
    a=ap.parse_args(); out=pathlib.Path(a.outdir).resolve();out.mkdir(parents=True,exist_ok=True)
    checked=check_inputs(a.candidate_bin,a.recovery_bin,a.provenance,a.inventory,a.policy,a.baseline,a.sweep_manifest,a.threshold_freeze)
    if a.duration_seconds<5400:raise ValueError("Foundation soak cannot be shorter than 5400 seconds")
    if not 0<a.interval_seconds<15:raise ValueError("soak interval must be below 15 seconds")
    if a.dry_run:
        save(out/"DRY_RUN.json",{"status":"DRY_RUN_PASS","sequence":43,"recovery_sequence":44,"candidate":CANDIDATE,"artifacts":checked,"repeat_sweep":False,"observer_effect":"inherited exact-artifact PASS; not rerun","soak_seconds":a.duration_seconds})
        print(json.dumps({"status":"DRY_RUN_PASS",**checked},indent=2));return 0
    if shutil.disk_usage(out).free<100*1024*1024:raise RuntimeError("insufficient-disk-headroom-before-live-mutation")
    outcome={"schema":"hbnf-foundation-seq43-44-soak-v1","sequence":43,"recovery_sequence":44,"candidate":CANDIDATE,"candidate_sha256":CANDIDATE_SHA,"status":"STARTED","started_at_unix":time.time(),"repeat_28_kernel_sweep":False,"observer_effect_reused":True}
    save(out/"TRANSACTION_STARTED.json",outcome)
    pre=None;snapshot=None;soak_error=None;restored=False;latest_uptime=None;ota_attempted=False;candidate_installed=False;render_ops_started=False
    try:
        pre=capture("seq43-pre-install",out);require_release(pre,BASE)
        outcome["pre_install"]={k:v for k,v in pre.items() if k!="responses"};save(out/"TRANSACTION_STARTED.json",outcome)
        ota_attempted=True
        outcome["candidate_ota"]=opal_install(a.candidate_bin,43,CANDIDATE,CANDIDATE_SHA,CANDIDATE_SIZE,out)
        installed=wait_release(CANDIDATE,out);candidate_installed=True;ledger_write(43,CANDIDATE,CANDIDATE_SHA)
        outcome["candidate_runtime_verified"]={"release":CANDIDATE,"sha256":CANDIDATE_SHA,"responses":installed["responses"]};save(out/"CANDIDATE_INSTALLED.json",outcome)
        info,build=adapter.identity(); state,p20=adapter.p20_state()
        render_ops_started=True
        snapshot=adapter.snapshot(None,a.inventory)
        save(out/"PRE_SWEEP_STATE.json",snapshot)
        outcome["snapshot"]=snapshot;save(out/"TRANSACTION_STARTED.json",outcome)
        adapter.enable_tails(False)
        adapter.select(0);time.sleep(5)
        steady=adapter.collect_frame_window("seq43-production-like-tails-off",30,minimum_samples=20)
        save(out/"STEADY_STATE_TAILS_OFF.json",{"duration_seconds":30,"sample_count":len(steady),"frame_average_ms_median":__import__("statistics").median(steady),"frame_average_ms_min":min(steady),"frame_average_ms_max":max(steady)})
        adapter.enable_tails(True);adapter.select(0);time.sleep(5)
        warmup=adapter.telemetry(a.inventory,str(out/"sacrificial-warmup"),emit=False)
        save(out/"SACRIFICIAL_WARMUP_EXCLUDED.json",warmup)
        adapter.enable_tails(False);adapter.enable_tails(True)
        baseline=json.loads(pathlib.Path(a.baseline).read_text());policy=json.loads(pathlib.Path(a.policy).read_text());inventory=json.loads(pathlib.Path(a.inventory).read_text())
        previous_uptime=float(warmup["uptime_seconds"]);latest_uptime=previous_uptime
        result=continuous_soak.run(json.loads(pathlib.Path(ROOT/"config/HBNF_FOUNDATION_LIVE_SWEEP_ADAPTER_SEQ39_20261006.json").read_text()),inventory,out,a.duration_seconds,CANDIDATE,0,previous_uptime,policy,select_period=a.interval_seconds)
        latest_uptime=previous_uptime
        audit_cmd=[sys.executable,str(ROOT/"scripts/hbnf_foundation_soak_audit.py"),"--input",str(out/"FOUNDATION_SOAK.jsonl"),"--inventory",a.inventory,"--expected-release",CANDIDATE,"--baseline",a.baseline,"--policy",a.policy,"--output",str(out/"FOUNDATION_SOAK_AUDIT.json")]
        p=subprocess.run(audit_cmd,capture_output=True,text=True,timeout=60);(out/"FOUNDATION_SOAK_AUDIT_STDOUT.txt").write_text(p.stdout);(out/"FOUNDATION_SOAK_AUDIT_STDERR.txt").write_text(p.stderr)
        audit=json.loads((out/"FOUNDATION_SOAK_AUDIT.json").read_text()) if (out/"FOUNDATION_SOAK_AUDIT.json").is_file() else {}
        if p.returncode or audit.get("status")!="PASS" or (audit.get("foundation_qualification") or {}).get("status")!="PASS":raise RuntimeError("foundation-soak-audit-failed:"+json.dumps(audit.get("errors",[])))
        outcome["soak"]={**result,"audit_status":"PASS","audit_path":str(out/"FOUNDATION_SOAK_AUDIT.json")}
    except Exception as exc:
        soak_error=f"{type(exc).__name__}: {exc}"
        save(out/"SEQ43_FAILURE.json",{"error":soak_error,"classification":classify_run_error(soak_error),"candidate_may_be_preserved":classify_run_error(soak_error)=="HOST_OR_EXTERNAL"})
    finally:
        if snapshot:
            try:
                adapter.enable_tails(False)
                restore_value=adapter._restore_snapshot(snapshot["snapshotId"],snapshot["snapshotHash"])
                raw_state,p20=adapter.p20_state();post_build=adapter.get(adapter.MATRIX+"/hbnf/build.json")
                raw={"HBNF":{"packet20Diagnostic":p20},"restoreVerified":p20.get("restoreVerified"),"packet20Same":p20.get("packet20Same")}
                receipt={"snapshot_equal":restore_value.get("packet20Same") is True,
                    "packet20Same":restore_value.get("packet20Same"),
                    "snapshotId":snapshot["snapshotId"],"snapshotHash":snapshot["snapshotHash"],
                    "packet20_same_contract":{
                        "schema":"hbnf-packet20-restore-semantic-binding-v1",
                        "candidate_release":CANDIDATE,"candidate_sha256":CANDIDATE_SHA,
                        "source_path":"firmware/packet20/seq39-tail250/usermod_hbnf_foundation_v1.cpp",
                        "source_sha256":"31126d341bf0a3e54a33d87de0856c5f68e79f20dd05653ae1d5df3270a9bc9d"}}
                save(out/"POST_RESTORE_RAW_STATE.json",raw);save(out/"POST_RESTORE_STATE.json",{"release_id":post_build.get("release_id"),"candidate":post_build.get("candidate"),"packet20Diagnostic":p20})
                restored=restore_is_proven(snapshot,raw,receipt)
                if not restored:raise RuntimeError("packet20-restore-unverified")
                save(out/"RESTORE_RECEIPT.json",{"status":"PASS","restoreVerified":True,"packet20Same":True,"snapshotId":snapshot["snapshotId"],"snapshotHash":snapshot["snapshotHash"]})
            except Exception as restore_exc:
                save(out/"RESTORE_FAILURE.json",{"error":f"{type(restore_exc).__name__}: {restore_exc}"});restored=False
    if snapshot and not restored and not soak_error:
        soak_error="packet20-restore-unverified"
    final=None
    if not soak_error:
        try:
            final=capture("seq43-postqualification",out);require_release(final,CANDIDATE)
        except Exception as exc:
            soak_error=f"postqualification-identity-or-health-failed: {type(exc).__name__}: {exc}"
            save(out/"SEQ43_FAILURE.json",{"error":soak_error,"classification":classify_run_error(soak_error),"candidate_may_be_preserved":False})
    if soak_error:
        # Preserve the same candidate after host-only faults only if identity, uptime, renderer restore and AUX remain proven.
        try:
            post=capture("seq43-failure-postflight",out)
            build=post["responses"]["matrix_build"]["body"]
            state=post["responses"]["matrix_state"]["body"]
            current=float(state.get("HBNF",{}).get("timing",{}).get("uptimeSec",0))
            aux=post["responses"]["aux_info"]["body"];aux_ok=aux.get("live") is True and aux.get("lm")=="DDP" and aux.get("lip")=="192.168.77.10"
            tail=(out/"FOUNDATION_SOAK.jsonl").read_text().splitlines()[-1] if (out/"FOUNDATION_SOAK.jsonl").is_file() and (out/"FOUNDATION_SOAK.jsonl").stat().st_size else None
            if tail:
                sample=json.loads(tail);latest_uptime=float(sample.get("uptime_seconds",latest_uptime or 0))
                continuity_ok=int(sample.get("restart_count",-1))==0
            else:continuity_ok=True
            identity_ok=build.get("release_id")==CANDIDATE and build.get("candidate")==CANDIDATE
            renderer_safe=restored if render_ops_started else True
            decision=recovery_decision(
                soak_error,
                candidate_healthy=bool(identity_ok and current>=float(latest_uptime or 0)),
                no_restart=continuity_ok,
                renderer_restored=renderer_safe,
                aux_healthy=aux_ok)
            safe=decision.get("safe_candidate_retry") is True
            outcome["failure_disposition"]={**decision,"candidate_identity_ok":identity_ok,
                "uptime_continuity_ok":current>=float(latest_uptime or 0),
                "restart_continuity_ok":continuity_ok,"renderer_restore_proven":renderer_safe,
                "aux_health_ok":aux_ok}
        except Exception as health_exc:
            post=None;safe=False;soak_error+=f"; postfailure_health={type(health_exc).__name__}: {health_exc}"
        base_still_installed=bool(post and post["responses"]["matrix_build"]["body"].get("release_id")==BASE and post["responses"]["matrix_build"]["body"].get("candidate")==BASE)
        if ota_attempted and not safe and not base_still_installed:
            outcome["recovery"]={"sequence":44,"reason":"device/runtime/Foundation failure or safety proof unavailable"}
            recovery_result=opal_install(a.recovery_bin,44,BASE,BASE_SHA,BASE_SIZE,out)
            recovered=wait_release(BASE,out);ledger_write(44,BASE,BASE_SHA)
            outcome["recovery"].update(recovery_result);outcome["recovery"]["verified_release"]=BASE;outcome["recovery"]["responses"]=recovered["responses"]
        outcome.update({"status":"FAIL","error":soak_error,"renderer_restored":restored,"candidate_installed":candidate_installed,"host_failure_preserved_candidate":safe,"finished_at_unix":time.time()})
        save(out/"TRANSACTION_RESULT.json",outcome);print(json.dumps(outcome,indent=2));return 2
    outcome.update({"status":"PASS","renderer_restored":restored,"soak_audit":"PASS","candidate_left_installed":True,"postqualification_identity":{"release":CANDIDATE,"sha256":CANDIDATE_SHA,"aux_ddp_live":True},"finished_at_unix":time.time()})
    save(out/"TRANSACTION_RESULT.json",outcome);print(json.dumps({"status":"PASS","release":CANDIDATE,"sha256":CANDIDATE_SHA,"soak":outcome.get("soak"),"renderer_restored":restored},indent=2));return 0

if __name__=="__main__":
    try:raise SystemExit(main())
    except Exception as exc:print(f"seq43 transaction refused/failed: {type(exc).__name__}: {exc}",file=sys.stderr);raise SystemExit(2)

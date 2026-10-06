#!/usr/bin/env python3
"""One allowed same-candidate retry after a proven host-only seq47 telemetry timeout."""
from __future__ import annotations
import hashlib, json, pathlib, shlex, subprocess, sys, time

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
import hbnf_foundation_live_adapter as adapter
import hbnf_foundation_continuous_soak as soak
import hbnf_live_kernel_sweep as sweep
import hbnf_opal_telemetry_transport as opal
from hbnf_foundation_seq39_failure_policy import classify_run_error, restore_is_proven

CANDIDATE="hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1"
CANDIDATE_SHA="338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c"
RELEASE07="hbnf-matrix-coordinated-v1-20261002-07"
RELEASE07_SHA="8e8db17786b178fc8fcd2cdf8a21512681ec7158941ee49ea255509970b1bcab"
RELEASE07_SIZE=1458624
SOURCE_PATH="firmware/packet20/seq39-tail250/usermod_hbnf_foundation_v1.cpp"
SOURCE_SHA="31126d341bf0a3e54a33d87de0856c5f68e79f20dd05653ae1d5df3270a9bc9d"
SSH_KEY=pathlib.Path.home()/".ssh/hbnf_opal_rsa"
SSH=["ssh","-i",str(SSH_KEY),"-o","IdentitiesOnly=yes","-o","HostKeyAlgorithms=+ssh-rsa","-o","PubkeyAcceptedAlgorithms=+ssh-rsa","-o","PasswordAuthentication=no","-o","BatchMode=yes","-o","ConnectTimeout=8"]
HOST="root@192.168.77.1"

def digest(p): return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def save(p,obj):
    p=pathlib.Path(p);p.parent.mkdir(parents=True,exist_ok=True)
    sweep.atomic_write(p,json.dumps(obj,indent=2,sort_keys=True)+"\n")

def read_live(out):
    bodies,elapsed=opal.fetch(str(out))
    return bodies,elapsed

def safety(bodies,snapshot,prior):
    mi,mb,ms,ai,ast=(bodies[k] for k in ("matrix_info","matrix_build","matrix_state","aux_info","aux_state"))
    p20=ms.get("HBNF",{}).get("packet20Diagnostic",{})
    checks={
      "matrix_identity":mi.get("ip")=="192.168.77.10" and mi.get("mac","").replace(":","").lower()=="704bca5b345c",
      "candidate_identity":mb.get("release_id")==CANDIDATE and mb.get("candidate")==CANDIDATE,
      "uptime_continuity":float(ms.get("HBNF",{}).get("timing",{}).get("uptimeSec",0))>=float(prior.get("uptime_seconds",0)),
      "restart_continuity":int(prior.get("restart_count",-1))==0,
      "diagnostic_active":p20.get("enabled") is True,
      "snapshot_same":p20.get("snapshotValid") is True and p20.get("snapshotState")=="READY" and p20.get("snapshotId")==snapshot.get("snapshotId") and p20.get("snapshotHash")==snapshot.get("snapshotHash"),
      "aux_native_ddp":ai.get("ip")=="192.168.77.11" and ai.get("mac","").replace(":","").lower()=="8c94df55c34c" and ai.get("live") is True and ai.get("lm")=="DDP" and ai.get("lip")=="192.168.77.10",
    }
    return checks,p20,ms,ai,ast

def post_restore_safety_checks(bodies,snapshot,raw,restored,seed_uptime,last_good_sample):
    mi,mb,ms,ai,_=(bodies[k] for k in ("matrix_info","matrix_build","matrix_state","aux_info","aux_state"))
    h=ms.get("HBNF",{})
    p20=raw.get("HBNF",{}).get("packet20Diagnostic",{})
    latest_uptime=float(h.get("timing",{}).get("uptimeSec",0))
    checks={
      "matrix_identity":mi.get("ip")=="192.168.77.10" and mi.get("mac","").replace(":","").lower()=="704bca5b345c",
      "candidate_identity":mb.get("release_id")==CANDIDATE and mb.get("candidate")==CANDIDATE,
      "restart_continuity":int(last_good_sample.get("restart_count",-1))==0,
      "uptime_continuity":latest_uptime>=max(float(seed_uptime),float(last_good_sample.get("uptime_seconds",0))),
      "renderer_restore_verified":restored is True and p20.get("restoreVerified") is True,
      "restore_snapshot_identity":p20.get("snapshotId")==snapshot["snapshotId"] and p20.get("snapshotHash")==snapshot["snapshotHash"],
      "aux_native_ddp":ai.get("ip")=="192.168.77.11" and ai.get("mac","").replace(":","").lower()=="8c94df55c34c" and ai.get("live") is True and ai.get("lm")=="DDP" and ai.get("lip")=="192.168.77.10",
    }
    return checks

def recover_release07(out,reason):
    remote="/tmp/hbnf-seq48-recovery.bin"
    cmd=("test \"$(sha256sum "+remote+" | cut -d' ' -f1)\" = "+RELEASE07_SHA+
      " && test \"$(wc -c < "+remote+" | tr -d ' ')\" = "+str(RELEASE07_SIZE)+
      " && code=$(curl --silent --show-error --connect-timeout 5 --max-time 180 -F 'update=@"+remote+
      ";type=application/octet-stream' -o /tmp/hbnf-seq48-ota-response.html -w '%{http_code}' http://192.168.77.10/update)"
      " && test \"$code\" = 200 && grep -q 'Update successful' /tmp/hbnf-seq48-ota-response.html && printf 'HTTP_200 UPDATE_OK\\n'")
    proc=subprocess.run(SSH+[HOST,cmd],capture_output=True,text=True,timeout=210,check=False)
    (out/"SEQ48_OTA_RESPONSE.txt").write_text(proc.stdout+"\n"+proc.stderr)
    if proc.returncode or "HTTP_200 UPDATE_OK" not in proc.stdout: raise RuntimeError("seq48_exact_release07_upload_not_confirmed")
    ledger=("umask 077; printf '%s\\n' "+shlex.quote(f"48 {RELEASE07} {RELEASE07_SHA}")+" > /etc/hbnf-updater/release-state.tmp && chmod 600 /etc/hbnf-updater/release-state.tmp && sync && mv /etc/hbnf-updater/release-state.tmp /etc/hbnf-updater/release-state && sync && printf LEDGER_WRITE_OK")
    proc=subprocess.run(SSH+[HOST,ledger],capture_output=True,text=True,timeout=30,check=False)
    (out/"SEQ48_LEDGER_WRITE.txt").write_text(proc.stdout+"\n"+proc.stderr)
    if proc.returncode or "LEDGER_WRITE_OK" not in proc.stdout: raise RuntimeError("seq48_ledger_write_unconfirmed")
    end=time.monotonic()+180;last=None
    while time.monotonic()<end:
        try:
            bodies,_=read_live(out/"post-recovery-readonly")
            mb=bodies["matrix_build"];mi=bodies["matrix_info"];ai=bodies["aux_info"]
            if mb.get("release_id")==RELEASE07 and mb.get("candidate")==RELEASE07:
                if mi.get("mac","").replace(":","").lower()!="704bca5b345c" or ai.get("live") is not True or ai.get("lm")!="DDP" or ai.get("lip")!="192.168.77.10": raise RuntimeError("seq48_release_identity_pass_but_device_health_failed")
                save(out/"SEQ48_RECOVERY_RESULT.json",{"status":"PASS","sequence":48,"reason":reason,"installed_release":RELEASE07,"installed_sha256":RELEASE07_SHA,"runtime_identity_verified":True,"aux_native_ddp_live":True})
                return
            last=mb
        except Exception as exc: last=f"{type(exc).__name__}: {exc}"
        time.sleep(3)
    raise RuntimeError(f"seq48_release07_runtime_identity_timeout:{last}")

def main():
    import argparse
    ap=argparse.ArgumentParser();ap.add_argument("--duration-seconds",type=int,default=5400);ap.add_argument("--out",required=True);a=ap.parse_args()
    out=pathlib.Path(a.out).resolve();out.mkdir(parents=True,exist_ok=True)
    parent=ROOT/"evidence/hbnf-foundation-qualification-20261005/seq47/live"
    original_snapshot=json.loads((parent/"FRESH_PACKET20_SNAPSHOT.json").read_text())
    snapshot={"snapshotId":original_snapshot["snapshotId"],"snapshotHash":original_snapshot["snapshotHash"]}
    prior_sample=json.loads((parent/"FOUNDATION_SOAK.jsonl").read_text().splitlines()[-1])
    policy_path=ROOT/"config/HBNF_FOUNDATION_QUALIFICATION_POLICY_20261006_SUSTAINED_R1.json"
    inventory_path=ROOT/"config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json"
    baseline_path=ROOT/"evidence/hbnf-foundation-qualification-20261005/seq39/live/PRE_SOAK_BASELINE.json"
    if a.duration_seconds<5400: raise RuntimeError("Foundation retry must be a complete >=5400-second soak")
    previous_safety=json.loads((parent/"HOST_FAILURE_SAFETY_PROOF.json").read_text())
    if previous_safety.get("candidate_preservation_safe") is not True: raise RuntimeError("prior host failure did not preserve required device safety proof")
    if digest(policy_path)!="2784d17654e17c3f6509f15775f396b8a806aa14b8b35f28fc00faa37f833797": raise RuntimeError("corrected sustained policy hash mismatch")
    if digest(ROOT/"evidence/hbnf-foundation-qualification-20261005/seq39/artifact/firmware.bin")!=CANDIDATE_SHA: raise RuntimeError("exact seq47 artifact bytes no longer verified")

    bodies,elapsed=read_live(out/"pre-retry-readonly")
    checks,p20,state,aux,aux_state=safety(bodies,snapshot,prior_sample)
    if not all(checks.values()):
        save(out/"RETRY_PRECONDITION_FAILURE.json",{"checks":checks,"snapshot":snapshot,"packet20Diagnostic":p20})
        raise RuntimeError("same-seq47-retry-precondition-failed")
    seed_uptime=float(state.get("HBNF",{}).get("timing",{}).get("uptimeSec",0))
    if state.get("HBNF",{}).get("foundationTelemetry",{}).get("enabled") is not True:
        adapter.enable_tails(True)
    save(out/"RETRY_PRECONDITIONS_PASS.json",{"status":"PASS","prior_attempt":"HOST_TRANSPORT_TIMEOUT__PRESERVED_SEQ47","safety_checks":checks,"candidate":CANDIDATE,"candidate_sha256":CANDIDATE_SHA,"snapshot":snapshot,"uptime_seconds":seed_uptime,"pre_retry_read_elapsed_seconds":elapsed,"telemetry_request_timeout_seconds":opal.CURL_TIMEOUT_SECONDS,"ssh_command_timeout_seconds":opal.SSH_COMMAND_TIMEOUT_SECONDS,"sampler_timeout_seconds":12.5})

    inv=json.loads(inventory_path.read_text());policy=json.loads(policy_path.read_text());baseline=json.loads(baseline_path.read_text())
    adapter_cfg=json.loads((ROOT/"config/HBNF_FOUNDATION_LIVE_SWEEP_ADAPTER_SEQ39_20261006.json").read_text())
    adapter_cfg["telemetry_argv"]=[sys.executable,str(ROOT/"scripts/hbnf_opal_telemetry_transport.py"),"--inventory",str(inventory_path),"--session-id","{session_id}"]
    sweep.validate_adapter(adapter_cfg);sweep.validate_inventory(inv)
    adapter._parallel_soak_reads=lambda session: opal.fetch(str(session))
    seed=adapter.telemetry(str(inventory_path),str(out),emit=False)
    save(out/"RETRY_SOAK_SEED_SAMPLE.json",seed)
    save(out/"RETRY_SOAK_STARTED.json",{"status":"STARTING","same_candidate_boot":True,"fresh_packet20_snapshot_reused":snapshot,"candidate_sha256":CANDIDATE_SHA,"duration_seconds":a.duration_seconds,"started_at_unix":time.time(),"sample_period_seconds":5,"sample_command_timeout_seconds":12.5,"selector_period_seconds":6,"policy_sha256":digest(policy_path),"previous_attempt_data_preserved":str(parent)})
    runtime_error=None
    audit_failed=False
    try:
        soak_result=soak.run(adapter_cfg,inv,out,a.duration_seconds,CANDIDATE,0,float(seed["uptime_seconds"]),policy,sample_timeout=12.5,select_period=6.0)
        save(out/"CONTINUOUS_SOAK_RESULT.json",{"status":"COMPLETE","result":soak_result})
        audit_path=out/"FOUNDATION_SOAK_AUDIT.json"
        cmd=[sys.executable,str(ROOT/"scripts/hbnf_foundation_soak_audit.py"),"--input",str(out/"FOUNDATION_SOAK.jsonl"),"--inventory",str(inventory_path),"--expected-release",CANDIDATE,"--baseline",str(baseline_path),"--policy",str(policy_path),"--output",str(audit_path)]
        proc=subprocess.run(cmd,capture_output=True,text=True,timeout=90)
        (out/"AUDIT_STDOUT.txt").write_text(proc.stdout);(out/"AUDIT_STDERR.txt").write_text(proc.stderr)
        audit=json.loads(audit_path.read_text()) if audit_path.is_file() else {}
        save(out/"SOAK_AUDIT_RESULT.json",audit)
        audit_failed=not (proc.returncode==0 and audit.get("status")=="PASS" and (audit.get("foundation_qualification") or {}).get("status")=="PASS")
        runtime_error=None if not audit_failed else "foundation-soak-sustained-gate-failed"
    except Exception as exc:
        runtime_error=f"{type(exc).__name__}: {exc}"
        save(out/"RETRY_FAILURE.json",{"error":runtime_error,"classification":classify_run_error(runtime_error)})

    # This is the one renderer restore for this still-unrestored seq47 snapshot.
    try:
        restore=adapter._restore_snapshot(snapshot["snapshotId"],snapshot["snapshotHash"])
        raw_state,p20=adapter.p20_state();build=adapter.get(adapter.MATRIX+"/hbnf/build.json")
        raw={"HBNF":{"packet20Diagnostic":p20},"restoreVerified":p20.get("restoreVerified"),"packet20Same":p20.get("packet20Same")}
        save(out/"POST_RESTORE_RAW_STATE.json",raw)
        save(out/"POST_RESTORE_STATE.json",{"release_id":build.get("release_id"),"candidate":build.get("candidate"),"packet20Diagnostic":p20,"timing":raw_state.get("HBNF",{}).get("timing",{})})
        receipt={"snapshot_equal":restore.get("packet20Same") is True,"packet20Same":restore.get("packet20Same"),"snapshotId":snapshot["snapshotId"],"snapshotHash":snapshot["snapshotHash"],"packet20_same_contract":{"schema":"hbnf-packet20-restore-semantic-binding-v1","candidate_release":CANDIDATE,"candidate_sha256":CANDIDATE_SHA,"source_path":SOURCE_PATH,"source_sha256":SOURCE_SHA}}
        save(out/"RESTORE_ADAPTER_RECEIPT.json",restore)
        restored=restore_is_proven(snapshot,raw,receipt)
        save(out/"RESTORE_RECEIPT.json",{"status":"PASS" if restored else "FAIL","restoreVerified":p20.get("restoreVerified"),"packet20Same":restore.get("packet20Same"),"snapshotId":snapshot["snapshotId"],"snapshotHash":snapshot["snapshotHash"],"source_bound":True})
    except Exception as exc:
        restored=False;save(out/"RESTORE_FAILURE.json",{"error":f"{type(exc).__name__}: {exc}"})

    final_error=runtime_error
    if not restored: final_error="renderer-restore-unverified" if final_error is None else final_error+"; renderer-restore-unverified"
    if final_error is None:
        save(out/"SEQ47_RETRY_RESULT.json",{"status":"PASS","candidate":CANDIDATE,"candidate_sha256":CANDIDATE_SHA,"soak":soak_result,"audit":"PASS","restore":"PASS","candidate_left_installed":True,"snapshot":snapshot})
        print(json.dumps({"status":"PASS","result":soak_result,"restore":"PASS"},indent=2));return 0

    # A host-only failure with every safety proof intact leaves seq47 installed.
    if classify_run_error(final_error)=="HOST_OR_EXTERNAL" and restored and not audit_failed:
        try:
            post,_=read_live(out/"postfailure-readonly")
            last_good=json.loads((out/"FOUNDATION_SOAK.jsonl").read_text().splitlines()[-1]) if (out/"FOUNDATION_SOAK.jsonl").is_file() else prior_sample
            checks=post_restore_safety_checks(post,snapshot,raw,restored,seed_uptime,last_good)
            safe=all(checks.values())
            save(out/"HOST_FAILURE_PRESERVED_CANDIDATE.json",{"classification":"HOST_OR_EXTERNAL","checks":checks,"candidate_preserved":safe,"seq48_consumed":False,"diagnostic_snapshot":snapshot,"error":final_error})
            if safe:
                save(out/"SEQ47_RETRY_RESULT.json",{"status":"INCOMPLETE_HOST_FAILURE__SEQ47_PRESERVED","candidate":CANDIDATE,"candidate_sha256":CANDIDATE_SHA,"seq48_consumed":False,"renderer_restored":True,"error":final_error});return 2
            final_error += "; postfailure safety proof unavailable"
        except Exception as exc: final_error+=f"; postfailure health query failed: {type(exc).__name__}: {exc}"
    # A real runtime/Foundation failure or lost safety proof is the sole seq48 path.
    if audit_failed:
        final_error="regressed vs qualified baseline: " + json.dumps(audit.get("foundation_qualification",{}),sort_keys=True)
    recover_release07(out,final_error)
    save(out/"SEQ47_RETRY_RESULT.json",{"status":"FAIL__RELEASE07_RECOVERY_PASS","candidate":CANDIDATE,"candidate_sha256":CANDIDATE_SHA,"error":final_error,"seq48_consumed":True})
    print(json.dumps({"status":"FAIL__RELEASE07_RECOVERY_PASS","error":final_error},indent=2));return 2

if __name__=="__main__":
    try: raise SystemExit(main())
    except Exception as exc:
        print(f"seq47 same-candidate retry stopped: {type(exc).__name__}: {exc}",file=sys.stderr)
        raise SystemExit(2)

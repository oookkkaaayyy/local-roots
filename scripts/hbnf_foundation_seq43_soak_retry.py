#!/usr/bin/env python3
"""One authorized same-install retry of the seq43 Foundation soak.

This continuation never uploads firmware or allocates a sequence. It reuses the
still-valid boot-scoped renderer snapshot, runs only the >=90-minute soak using
the parallel one-shot telemetry reader, restores that exact snapshot, and uses
seq44 only when the post-failure evidence demonstrates a real device/Foundation
failure or loss of a required safety proof.
"""
from __future__ import annotations
import argparse, hashlib, json, pathlib, subprocess, sys, time

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
import hbnf_foundation_live_adapter as adapter
import hbnf_foundation_continuous_soak as continuous
import hbnf_live_kernel_sweep as sweep
import hbnf_foundation_seq43_transaction as tx
from hbnf_foundation_seq39_failure_policy import classify_run_error,recovery_decision

CANDIDATE=tx.CANDIDATE
CANDIDATE_SHA=tx.CANDIDATE_SHA
BASE=tx.BASE
BASE_SHA=tx.BASE_SHA
BASE_SIZE=tx.BASE_SIZE

def save(path,value): sweep.atomic_write(path,json.dumps(value,indent=2,sort_keys=True)+"\n")
def sha(path): return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()

def read_only_capture(out):
    reads,elapsed=adapter._parallel_soak_reads(str(out))
    info,build=reads["matrix_info"],reads["matrix_build"]
    state=reads["matrix_state"]; aux=reads["aux_info"]
    if build.get("release_id")!=CANDIDATE or build.get("candidate")!=CANDIDATE:
        raise RuntimeError("retained-seq43-candidate-runtime-identity-lost")
    if aux.get("ip")!="192.168.77.11" or aux.get("mac","").replace(":","").lower()!=tx.AUX_MAC:
        raise RuntimeError("aux-ip-or-mac-mismatch")
    if not (aux.get("live") is True and aux.get("lm")=="DDP" and aux.get("lip")=="192.168.77.10"):
        raise RuntimeError("aux-matrix-origin-ddp-health-lost")
    h=state.get("HBNF",{});p20=h.get("packet20Diagnostic",{})
    if p20.get("snapshotValid") is not True or p20.get("snapshotState")!="READY":
        raise RuntimeError("existing-boot-scoped-snapshot-no-longer-valid")
    if p20.get("restoreVerified") is not True:
        raise RuntimeError("existing-snapshot-restore-verification-not-proven")
    return {"responses":reads,"elapsed_seconds":elapsed,"uptime_seconds":float(h.get("timing",{}).get("uptimeSec",0)),
            "release_id":build.get("release_id"),"matrix_mac":info.get("mac"),
            "aux_ddp_live":True,"snapshot_id":p20.get("snapshotId"),"snapshot_hash":p20.get("snapshotHash"),
            "snapshot_valid":True,"packet20_restore_verified":p20.get("restoreVerified") is True,
            "packet20_diagnostic_active":p20.get("enabled") is True,
            "packet20_last_command":p20.get("lastCommand"),
            "packet20_last_command_accepted":p20.get("lastCommandAccepted") is True,
            "telemetry_enabled":h.get("foundationTelemetry",{}).get("enabled") is True}

def validate_retry_session(current, prior, snapshot):
    """Fail before the soak if the boot-scoped diagnostic session was closed.

    Firmware deliberately ends Packet20 diagnostic mode when restoring the saved
    renderer state, and does not allow a second begin while that boot's snapshot
    remains saved. A same-boot retry cannot select kernels from that state.
    """
    if current.get("release_id")!=CANDIDATE or current.get("matrix_mac","").replace(":","").lower()!=adapter.MAC:
        raise RuntimeError("retained-seq43-candidate-runtime-identity-lost")
    if current.get("uptime_seconds",0)<prior.get("prior_last_uptime_seconds",0):
        raise RuntimeError("candidate-uptime-regressed-since-last-clean-sample")
    if int(current.get("snapshot_id",-1))!=int(snapshot.get("snapshotId",-2)) or int(current.get("snapshot_hash",-1))!=int(snapshot.get("snapshotHash",-2)):
        raise RuntimeError("current-device-snapshot-identity-changed")
    if current.get("telemetry_enabled"):
        raise RuntimeError("foundation-telemetry-mode-not-clean-after-prior-restore")
    if not current.get("packet20_diagnostic_active"):
        raise RuntimeError("same-install-retry-refused-before-start-packet20-diagnostic-session-closed")

def verify_local_checkpoint(a):
    root=pathlib.Path(a.prior_live).resolve()
    result=json.loads((root/"TRANSACTION_RESULT.json").read_text())
    failure=json.loads((root/"SEQ43_FAILURE.json").read_text())
    restore=json.loads((root/"RESTORE_RECEIPT.json").read_text())
    previous=[json.loads(x) for x in (root/"FOUNDATION_SOAK.jsonl").read_text().splitlines()]
    snap=json.loads((root/"PRE_SWEEP_STATE.json").read_text())
    if result.get("sequence")!=43 or result.get("candidate_sha256")!=CANDIDATE_SHA or result.get("candidate_installed") is not True:
        raise ValueError("prior seq43 exact candidate install receipt missing")
    if result.get("recovery") or result.get("host_failure_preserved_candidate") is not True:
        raise ValueError("prior transaction is not a preserved host-only failure")
    if classify_run_error(str(failure.get("error")))!="HOST_OR_EXTERNAL":
        raise ValueError("prior failure is not classified host/external")
    if restore.get("status")!="PASS" or restore.get("restoreVerified") is not True or restore.get("packet20Same") is not True:
        raise ValueError("prior exact renderer restore evidence missing")
    if int(restore.get("snapshotId",-1))!=int(snap.get("snapshotId",-2)) or int(restore.get("snapshotHash",-1))!=int(snap.get("snapshotHash",-2)):
        raise ValueError("restore receipt does not bind the original boot-scoped snapshot")
    if not previous or any(int(x.get("restart_count",-1))!=0 for x in previous):
        raise ValueError("prior samples do not prove restart continuity")
    if any(str(x.get("release_id"))!=CANDIDATE for x in previous):
        raise ValueError("prior samples changed candidate identity")
    if any(float(x.get("frame_ms_max",0))>=1000 for x in previous):
        raise ValueError("prior telemetry contains a genuine >=1000ms frame interval")
    return {"candidate_sha256":CANDIDATE_SHA,"candidate_release":CANDIDATE,
            "prior_sample_count":len(previous),"prior_last_uptime_seconds":float(previous[-1]["uptime_seconds"]),
            "snapshot_id":int(snap["snapshotId"]),"snapshot_hash":int(snap["snapshotHash"]),
            "prior_host_failure":failure.get("error")}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--candidate-bin",required=True);ap.add_argument("--recovery-bin",required=True)
    ap.add_argument("--inventory",required=True);ap.add_argument("--policy",required=True)
    ap.add_argument("--baseline",required=True);ap.add_argument("--outdir",required=True)
    ap.add_argument("--prior-live",required=True);ap.add_argument("--dry-run",action="store_true")
    a=ap.parse_args(); out=pathlib.Path(a.outdir).resolve();out.mkdir(parents=True,exist_ok=True)
    prior=verify_local_checkpoint(a)
    if pathlib.Path(a.candidate_bin).stat().st_size!=tx.CANDIDATE_SIZE or sha(a.candidate_bin)!=CANDIDATE_SHA:
        raise ValueError("retained candidate file hash/size mismatch")
    if pathlib.Path(a.recovery_bin).stat().st_size!=BASE_SIZE or sha(a.recovery_bin)!=BASE_SHA:
        raise ValueError("seq44 exact Release07 recovery file hash/size mismatch")
    inventory=json.loads(pathlib.Path(a.inventory).read_text());policy=json.loads(pathlib.Path(a.policy).read_text())
    if inventory.get("expected_kernel_count")!=28 or len(inventory.get("entries",[]))!=28:
        raise ValueError("Foundation exact 28-kernel inventory invalid")
    state=json.loads(pathlib.Path(ROOT/"config/HBNF_CONTROL_STATE.json").read_text())
    auth=state.get("live_mutation_authorization",{})
    if state.get("lifecycle_state")!="FIX_CANDIDATE" or state.get("live_mutation_authorized") is not True:
        raise RuntimeError("control plane does not authorize current T2 retry")
    if int(auth.get("candidate_sequence",-1))!=43 or int(auth.get("recovery_sequence",-1))!=44:
        raise RuntimeError("control plane sequence pair is not exact seq43/44")
    if a.dry_run:
        save(out/"RETRY_DRY_RUN.json",{"schema":"hbnf-seq43-same-install-soak-retry-v1","status":"DRY_RUN_PASS",
             "firmware_install":"NONE","sequence_allocation":"NONE","candidate":CANDIDATE,
             "candidate_sha256":CANDIDATE_SHA,"recovery_sha256":BASE_SHA,"prior":prior,
             "telemetry":"five parallel single-shot reads; 4s per-request timeout, 5.5s batch, 7s sampler subprocess limit",
             "duration_seconds":5400,"reuse_snapshot":True})
        print(json.dumps({"status":"DRY_RUN_PASS","firmware_install":"NONE","sequence_allocation":"NONE","prior":prior},indent=2));return 0
    if (out/"RETRY_STARTED.json").exists():raise RuntimeError("same-install retry already started; do not repeat")
    snapshot=json.loads((pathlib.Path(a.prior_live)/"PRE_SWEEP_STATE.json").read_text())
    current=read_only_capture(out)
    save(out/"RETRY_PRESTART_READONLY.json",current)
    try:
        validate_retry_session(current,prior,snapshot)
    except RuntimeError as exc:
        save(out/"RETRY_REFUSED_PRESTART.json",{"schema":"hbnf-seq43-retry-prestart-v1","status":"REFUSED_WITHOUT_DEVICE_MUTATION","error":str(exc),"candidate":CANDIDATE,"candidate_sha256":CANDIDATE_SHA,"snapshot_id":snapshot.get("snapshotId"),"snapshot_hash":snapshot.get("snapshotHash"),"current_read_only":current})
        raise
    plan={"schema":"hbnf-seq43-same-install-soak-retry-v1","status":"STARTED","started_at_unix":time.time(),
          "firmware_install":"NONE","sequence_allocation":"NONE","candidate":CANDIDATE,
          "candidate_sha256":CANDIDATE_SHA,"recovery_sequence":44,"reuse_snapshot":True,"prior":prior}
    save(out/"RETRY_STARTED.json",plan)
    restore_ok=False; soak_error=None; sample_result=None
    warm=None; post_reads=None; post_uptime=0.0; post_identity_ok=False; post_aux_ok=False
    retry_start_uptime=prior["prior_last_uptime_seconds"]; start_safety_proven=False
    try:
        save(out/"RETRY_PRELIVE_READONLY.json",current)
        retry_start_uptime=current["uptime_seconds"];start_safety_proven=True
        adapter.enable_tails(True)
        warm=adapter.telemetry(a.inventory,str(out/"retry-warmup"),emit=False)
        if warm.get("release_id")!=CANDIDATE or int(warm.get("restart_count",-1))!=0:
            raise RuntimeError("candidate-identity-or-restart-continuity-failed-before-retry")
        if float(warm.get("frame_ms_max",0))>=1000:
            raise RuntimeError("post-warmup-frame-interval-greater-than-or-equal-1000ms")
        save(out/"RETRY_START_SAMPLE.json",warm)
        sample_result=continuous.run(json.loads(pathlib.Path(ROOT/"config/HBNF_FOUNDATION_LIVE_SWEEP_ADAPTER_SEQ39_20261006.json").read_text()),
            inventory,out,5400,CANDIDATE,0,float(warm["uptime_seconds"]),policy,
            sample_period=5.0,sample_timeout=7.0,select_period=8.0,select_timeout=30.0,require_kernel_coverage=True)
        audit_cmd=[sys.executable,str(ROOT/"scripts/hbnf_foundation_soak_audit.py"),"--input",str(out/"FOUNDATION_SOAK.jsonl"),
            "--inventory",a.inventory,"--expected-release",CANDIDATE,"--baseline",a.baseline,"--policy",a.policy,"--output",str(out/"FOUNDATION_SOAK_AUDIT.json")]
        audit_proc=subprocess.run(audit_cmd,capture_output=True,text=True,timeout=90)
        (out/"FOUNDATION_SOAK_AUDIT_STDOUT.txt").write_text(audit_proc.stdout)
        (out/"FOUNDATION_SOAK_AUDIT_STDERR.txt").write_text(audit_proc.stderr)
        audit=json.loads((out/"FOUNDATION_SOAK_AUDIT.json").read_text()) if (out/"FOUNDATION_SOAK_AUDIT.json").is_file() else {}
        if audit_proc.returncode or audit.get("status")!="PASS" or (audit.get("foundation_qualification") or {}).get("status")!="PASS":
            raise RuntimeError("foundation-soak-audit-failed:"+json.dumps(audit.get("errors",[])))
    except Exception as exc:
        soak_error=f"{type(exc).__name__}: {exc}"
    finally:
        try:
            adapter.enable_tails(False)
            raw_restore=adapter._restore_snapshot(int(snapshot["snapshotId"]),int(snapshot["snapshotHash"]))
            reads,elapsed=adapter._parallel_soak_reads(str(out))
            post_reads=reads
            matrix_state=reads["matrix_state"]; build=reads["matrix_build"]; aux=reads["aux_info"]
            p20=matrix_state.get("HBNF",{}).get("packet20Diagnostic",{})
            raw={"HBNF":{"packet20Diagnostic":p20},"restoreVerified":p20.get("restoreVerified"),
                 "packet20Same":raw_restore.get("packet20Same"),"post_restore_read_elapsed_seconds":elapsed}
            save(out/"POST_RESTORE_RAW_STATE.json",raw)
            restore_ok=(raw_restore.get("packet20Same") is True and p20.get("restoreVerified") is True
                        and int(p20.get("snapshotId",-1))==int(snapshot["snapshotId"])
                        and int(p20.get("snapshotHash",-1))==int(snapshot["snapshotHash"]))
            save(out/"RESTORE_RECEIPT.json",{"status":"PASS" if restore_ok else "FAIL",
                 "restoreVerified":p20.get("restoreVerified"),"packet20Same":raw_restore.get("packet20Same"),
                 "snapshotId":snapshot["snapshotId"],"snapshotHash":snapshot["snapshotHash"]})
            identity_ok=build.get("release_id")==CANDIDATE and build.get("candidate")==CANDIDATE
            post_uptime=float(matrix_state.get("HBNF",{}).get("timing",{}).get("uptimeSec",0))
            post_aux_ok=aux.get("live") is True and aux.get("lm")=="DDP" and aux.get("lip")=="192.168.77.10"
            post_identity_ok=identity_ok
            if not identity_ok or post_uptime<float(warm.get("uptime_seconds",prior["prior_last_uptime_seconds"])) or not post_aux_ok or not restore_ok:
                raise RuntimeError("post-retry-safety-proof-lost")
        except Exception as restore_exc:
            save(out/"POST_RESTORE_FAILURE.json",{"error":f"{type(restore_exc).__name__}: {restore_exc}"})
            restore_ok=False
    if not restore_ok and not soak_error:
        soak_error="packet20-restore-unverified"
    if soak_error:
        rows=[]
        sample_path=out/"FOUNDATION_SOAK.jsonl"
        if sample_path.is_file():
            try: rows=[json.loads(x) for x in sample_path.read_text().splitlines()]
            except Exception: rows=[]
        last_uptime=float(rows[-1].get("uptime_seconds",retry_start_uptime)) if rows else retry_start_uptime
        sample_restarts=all(int(x.get("restart_count",-1))==0 for x in rows) if rows else start_safety_proven
        no_restart=sample_restarts and post_uptime>=last_uptime
        candidate_ok=post_identity_ok and post_uptime>0 and post_uptime>=last_uptime
        decision=recovery_decision(soak_error,candidate_healthy=candidate_ok,no_restart=no_restart,
                                   renderer_restored=restore_ok,aux_healthy=post_aux_ok)
        safe=decision.get("safe_candidate_retry") is True
        result={"status":"HOST_FAILURE_CANDIDATE_PRESERVED" if safe else "FOUNDATION_OR_SAFETY_FAILURE",
                "error":soak_error,"candidate_preserved":safe,"recovery_decision":decision,
                "candidate_identity_ok":post_identity_ok,"uptime_continuity_ok":candidate_ok,
                "restart_continuity_ok":no_restart,"aux_health_ok":post_aux_ok,
                "restore_verified":restore_ok,"sample_result":sample_result,
                "recovery_sequence_consumed":False}
        if not safe:
            recovery=tx.opal_install(a.recovery_bin,44,BASE,BASE_SHA,BASE_SIZE,out)
            recovered=tx.wait_release(BASE,out);tx.ledger_write(44,BASE,BASE_SHA)
            result.update({"status":"RELEASE07_RECOVERY_PASS","recovery_sequence_consumed":True,
                           "recovery":recovery,"installed_release":BASE,"installed_sha256":BASE_SHA,
                           "recovery_responses":recovered["responses"]})
        save(out/"RETRY_RESULT.json",result);print(json.dumps(result,indent=2));return 2
    result={"status":"SOAK_AND_AUDIT_PASS","candidate_left_installed":True,"candidate":CANDIDATE,
            "candidate_sha256":CANDIDATE_SHA,"recovery_sequence_consumed":False,"restore_verified":restore_ok,
            "sample_result":sample_result,"audit":"PASS"}
    save(out/"RETRY_RESULT.json",result);print(json.dumps(result,indent=2));return 0

if __name__=="__main__":
    try: raise SystemExit(main())
    except Exception as exc:
        print(f"seq43 same-install retry refused/failed: {type(exc).__name__}: {exc}",file=sys.stderr)
        raise SystemExit(2)

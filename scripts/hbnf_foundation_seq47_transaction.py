#!/usr/bin/env python3
"""Final same-artifact seq47 Foundation soak; no repeated kernel sweep or observer A/B."""
from __future__ import annotations
import hashlib, json, pathlib, subprocess, sys, time

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
import hbnf_foundation_live_adapter as adapter
import hbnf_foundation_continuous_soak as soak
import hbnf_live_kernel_sweep as sweep
import hbnf_opal_telemetry_transport as opal_telemetry
from hbnf_foundation_seq39_failure_policy import restore_is_proven

CANDIDATE="hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1"
CANDIDATE_SHA="338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c"
RELEASE07="hbnf-matrix-coordinated-v1-20261002-07"
RELEASE07_SHA="8e8db17786b178fc8fcd2cdf8a21512681ec7158941ee49ea255509970b1bcab"
POLICY_SHA="2784d17654e17c3f6509f15775f396b8a806aa14b8b35f28fc00faa37f833797"
SOURCE_PATH="firmware/packet20/seq39-tail250/usermod_hbnf_foundation_v1.cpp"
SOURCE_SHA="31126d341bf0a3e54a33d87de0856c5f68e79f20dd05653ae1d5df3270a9bc9d"

def digest(p): return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def save(p,x):
    p=pathlib.Path(p);p.parent.mkdir(parents=True,exist_ok=True)
    sweep.atomic_write(p,json.dumps(x,indent=2,sort_keys=True)+"\n")

def main():
    import argparse
    ap=argparse.ArgumentParser()
    ap.add_argument("--duration-seconds",type=int,default=5400)
    ap.add_argument("--out",required=True)
    a=ap.parse_args(); out=pathlib.Path(a.out).resolve();out.mkdir(parents=True,exist_ok=True)
    candidate=ROOT/"evidence/hbnf-foundation-qualification-20261005/seq39/artifact/firmware.bin"
    policy_path=ROOT/"config/HBNF_FOUNDATION_QUALIFICATION_POLICY_20261006_SUSTAINED_R1.json"
    baseline_path=ROOT/"evidence/hbnf-foundation-qualification-20261005/seq39/live/PRE_SOAK_BASELINE.json"
    inventory_path=ROOT/"config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json"
    manifest_path=ROOT/"evidence/hbnf-foundation-qualification-20261005/seq39/live/foundation-sweep/PRE_SOAK_SWEEP_MANIFEST.json"
    freeze_path=ROOT/"evidence/hbnf-foundation-qualification-20261005/qualification-semantics-r1/THRESHOLD_FREEZE_REBIND_RECEIPT.json"
    artifact_proof={"candidate_sha256":digest(candidate),"candidate_size_bytes":candidate.stat().st_size,
      "policy_sha256":digest(policy_path),"baseline_sha256":digest(baseline_path),
      "sweep_manifest_sha256":digest(manifest_path),"threshold_freeze_sha256":digest(freeze_path),
      "inventory_sha256":digest(inventory_path)}
    if artifact_proof["candidate_sha256"]!=CANDIDATE_SHA or artifact_proof["candidate_size_bytes"]!=1489008: raise RuntimeError("candidate-artifact-hash-or-size-mismatch")
    if artifact_proof["policy_sha256"]!=POLICY_SHA: raise RuntimeError("sustained-policy-hash-mismatch")
    if a.duration_seconds<5400: raise RuntimeError("Foundation soak must be >=5400 seconds")
    inv=json.loads(inventory_path.read_text()); baseline=json.loads(baseline_path.read_text()); policy=json.loads(policy_path.read_text())
    if len(inv.get("entries",[]))!=28 or [int(x["runtime_kernel_index_expected"]) for x in inv["entries"]]!=list(range(28)): raise RuntimeError("exact-28-kernel-inventory-invalid")
    if baseline.get("release_id")!=CANDIDATE or baseline.get("kernel_count")!=28: raise RuntimeError("inherited-seq39-baseline-invalid")
    freeze=json.loads(freeze_path.read_text())
    if freeze.get("status")!="FROZEN_BEFORE_SOAK" or freeze.get("soak_started") is not False or freeze.get("policy",{}).get("sha256")!=POLICY_SHA: raise RuntimeError("threshold-freeze-rebind-invalid")
    if freeze.get("baseline",{}).get("sha256")!=artifact_proof["baseline_sha256"] or freeze.get("pre_soak_sweep",{}).get("sha256")!=artifact_proof["sweep_manifest_sha256"]: raise RuntimeError("threshold-freeze-evidence-binding-invalid")
    proof=json.loads((ROOT/"evidence/hbnf-foundation-qualification-20261005/seq39/live/SEQ39_RESTORATION_REUSE_PROOF.json").read_text())
    if proof.get("restoreVerified") is not True or proof.get("packet20Same") is not True: raise RuntimeError("inherited-renderer-restore-proof-invalid")
    save(out/"SEQ47_PRE_SOAK_CLOSURE.json",{"status":"PASS","sequence":47,"recovery_sequence":48,"candidate":CANDIDATE,"candidate_sha256":CANDIDATE_SHA,"release07_sha256":RELEASE07_SHA,"artifact_and_evidence_hashes":artifact_proof,"inherited_28_kernel_sweep":"PASS__28_OF_28__NOT_REPEATED","inherited_observer_effect":"PASS__EXACT_ARTIFACT__NOT_REPEATED"})

    info,build=adapter.identity()
    state,p20=adapter.p20_state()
    if p20.get("enabled") is True or p20.get("snapshotValid") is True: raise RuntimeError("fresh-boot-packet20-state-not-clean")
    start_uptime=float(state.get("HBNF",{}).get("timing",{}).get("uptimeSec",0))
    if start_uptime<=0: raise RuntimeError("fresh-candidate-uptime-invalid")
    save(out/"SEQ47_FRESH_BOOT_PRE_SESSION.json",{"release_id":build.get("release_id"),"candidate":build.get("candidate"),"uptime_seconds":start_uptime,"packet20Diagnostic":p20,"exact_identity":True})

    begin=adapter.command("begin")
    state,p20=adapter.p20_state()
    if p20.get("enabled") is not True or p20.get("snapshotValid") is True: raise RuntimeError("diagnosticActive-not-proven-before-render-change")
    save(out/"DIAGNOSTIC_ACTIVE_PRE_STATE_CHANGE.json",{"status":"PASS","diagnosticActive":True,"enabled":p20.get("enabled"),"packet20Diagnostic":p20,"ack":begin,"uptime_seconds":state.get("HBNF",{}).get("timing",{}).get("uptimeSec"),"first_renderer_state_change_not_yet_sent":True})

    if not adapter.command("snapshot").get("HBNF",{}).get("packet20Diagnostic",{}).get("lastCommandAccepted",False): raise RuntimeError("fresh-packet20-snapshot-command-rejected")
    deadline=time.monotonic()+adapter.SNAPSHOT_READY_TIMEOUT_SECONDS
    while time.monotonic()<deadline:
        snap_state,p20=adapter.p20_state(deadline,stage="seq47-fresh-snapshot-ready")
        if p20.get("snapshotState")=="READY" and p20.get("snapshotValid") is True: break
        if p20.get("snapshotState")=="FAILED": raise RuntimeError("fresh-packet20-snapshot-failed")
        time.sleep(.25)
    else: raise RuntimeError("fresh-packet20-snapshot-ready-timeout")
    snapshot={"snapshotId":p20.get("snapshotId"),"snapshotHash":p20.get("snapshotHash")}
    if not isinstance(snapshot["snapshotId"],int) or snapshot["snapshotId"]<=0 or not isinstance(snapshot["snapshotHash"],int) or snapshot["snapshotHash"]<=0: raise RuntimeError("fresh-snapshot-id-hash-invalid")
    save(out/"PRE_SWEEP_STATE.json",snap_state)
    save(out/"FRESH_PACKET20_SNAPSHOT.json",{"status":"PASS","boot_scoped":True,**snapshot,"packet20Diagnostic":p20,"candidate_sha256":CANDIDATE_SHA})

    # The exact-artifact observer-effect evidence is reused; turn on the already-qualified
    # telemetry mode once, then start the single uninterrupted full state-changing soak.
    tail_state,_=adapter.enable_tails(True)
    save(out/"FOUNDATION_SOAK_STARTED.json",{"status":"STARTING","sequence":47,"started_at_utc":time.time(),"duration_seconds":a.duration_seconds,"release_id":CANDIDATE,"candidate_sha256":CANDIDATE_SHA,"snapshot":snapshot,"diagnosticActive":True,"telemetry_enabled":tail_state.get("HBNF",{}).get("foundationTelemetry",{}).get("enabled"),"state_changer_period_seconds":6,"telemetry_period_seconds":5,"max_sample_gap_seconds":15,"policy_sha256":POLICY_SHA,"evidence_is_fsynced_jsonl":True})
    adapter_cfg=json.loads((ROOT/"config/HBNF_FOUNDATION_LIVE_SWEEP_ADAPTER_SEQ39_20261006.json").read_text())
    # Preserve the already-proven LAN-origin transport: the Mac coordinates the
    # run, while all five telemetry reads originate concurrently from Opal.
    adapter_cfg["telemetry_argv"]=[sys.executable,str(ROOT/"scripts/hbnf_opal_telemetry_transport.py"),
      "--inventory",str(inventory_path),"--session-id","{session_id}"]
    sweep.validate_adapter(adapter_cfg);sweep.validate_inventory(inv)
    adapter._parallel_soak_reads=lambda session: opal_telemetry.fetch(str(session))
    sample=adapter.telemetry(str(inventory_path),str(out),emit=False)
    # This first sample is a baseline seed only; actual soak begins with continuous_soak.run.
    save(out/"SOAK_SEED_SAMPLE.json",sample)
    previous_uptime=float(sample["uptime_seconds"])
    soak_result=soak.run(adapter_cfg,inv,out,a.duration_seconds,CANDIDATE,0,previous_uptime,policy,select_period=6.0)
    save(out/"CONTINUOUS_SOAK_RESULT.json",{"status":"COMPLETE","result":soak_result,"start_uptime_seconds":previous_uptime})
    audit_path=out/"FOUNDATION_SOAK_AUDIT.json"
    cmd=[sys.executable,str(ROOT/"scripts/hbnf_foundation_soak_audit.py"),"--input",str(out/"FOUNDATION_SOAK.jsonl"),"--inventory",str(inventory_path),"--expected-release",CANDIDATE,"--baseline",str(baseline_path),"--policy",str(policy_path),"--output",str(audit_path)]
    p=subprocess.run(cmd,capture_output=True,text=True,timeout=90)
    (out/"FOUNDATION_SOAK_AUDIT_STDOUT.txt").write_text(p.stdout);(out/"FOUNDATION_SOAK_AUDIT_STDERR.txt").write_text(p.stderr)
    if not audit_path.is_file(): raise RuntimeError("foundation-audit-did-not-write-result")
    audit=json.loads(audit_path.read_text());save(out/"SOAK_AUDIT_RESULT.json",audit)

    # Preserve raw post-restore state before running any comparator.
    restore=adapter._restore_snapshot(snapshot["snapshotId"],snapshot["snapshotHash"])
    post_state,p20=adapter.p20_state();post_build=adapter.get(adapter.MATRIX+"/hbnf/build.json")
    raw={"HBNF":{"packet20Diagnostic":p20},"restoreVerified":p20.get("restoreVerified"),"packet20Same":p20.get("packet20Same")}
    save(out/"POST_RESTORE_RAW_STATE.json",raw)
    save(out/"POST_RESTORE_STATE.json",{"release_id":post_build.get("release_id"),"candidate":post_build.get("candidate"),"packet20Diagnostic":p20,"timing":post_state.get("HBNF",{}).get("timing",{})})
    receipt={"snapshot_equal":restore.get("packet20Same") is True,"packet20Same":restore.get("packet20Same"),"snapshotId":snapshot["snapshotId"],"snapshotHash":snapshot["snapshotHash"],"packet20_same_contract":{"schema":"hbnf-packet20-restore-semantic-binding-v1","candidate_release":CANDIDATE,"candidate_sha256":CANDIDATE_SHA,"source_path":SOURCE_PATH,"source_sha256":SOURCE_SHA}}
    save(out/"RESTORE_ADAPTER_RECEIPT.json",restore)
    restored=restore_is_proven(snapshot,raw,receipt)
    save(out/"RESTORE_RECEIPT.json",{"status":"PASS" if restored else "FAIL","restoreVerified":p20.get("restoreVerified"),"packet20Same":restore.get("packet20Same"),"source_bound_comparator":True,"snapshotId":snapshot["snapshotId"],"snapshotHash":snapshot["snapshotHash"]})
    if not restored: raise RuntimeError("seq47-source-bound-renderer-restore-failed")
    if p.returncode or audit.get("status")!="PASS" or (audit.get("foundation_qualification") or {}).get("status")!="PASS": raise RuntimeError("seq47-foundation-soak-audit-not-pass")
    save(out/"SEQ47_TRANSACTION_RESULT.json",{"status":"PASS","sequence":47,"release_id":CANDIDATE,"candidate_sha256":CANDIDATE_SHA,"duration_seconds":soak_result["duration_seconds"],"audit":"PASS","restore":"PASS","candidate_left_installed":True,"snapshot":snapshot})
    print(json.dumps({"status":"PASS","soak":soak_result,"restore":"PASS","audit":"PASS"},indent=2))
    return 0

if __name__=="__main__":
    try: raise SystemExit(main())
    except Exception as exc:
        print(f"seq47 transaction stopped: {type(exc).__name__}: {exc}",file=sys.stderr)
        raise SystemExit(2)

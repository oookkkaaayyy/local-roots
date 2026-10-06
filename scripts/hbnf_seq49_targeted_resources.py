#!/usr/bin/env python3
"""One bounded seq49 targeted settled resource/AUX collection; no soak or firmware build."""
from __future__ import annotations
import argparse, hashlib, json, pathlib, subprocess, sys, time

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
import hbnf_foundation_live_adapter as adapter
import hbnf_foundation_seq41_transaction as tx

CANDIDATE="hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1"
CANDIDATE_SHA="338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c"
CANDIDATE_SIZE=1489008
RELEASE07="hbnf-matrix-coordinated-v1-20261002-07"
RELEASE07_SHA="8e8db17786b178fc8fcd2cdf8a21512681ec7158941ee49ea255509970b1bcab"
RELEASE07_SIZE=1458624

def save(path,obj):
    p=pathlib.Path(path);p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(obj,indent=2,sort_keys=True)+"\n")

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--candidate",required=True);ap.add_argument("--release07",required=True)
    ap.add_argument("--adapter",required=True);ap.add_argument("--inventory",required=True);ap.add_argument("--outdir",required=True)
    a=ap.parse_args(); out=pathlib.Path(a.outdir).resolve();out.mkdir(parents=True,exist_ok=True)
    for p,sha,size,name in ((a.candidate,CANDIDATE_SHA,CANDIDATE_SIZE,"candidate"),(a.release07,RELEASE07_SHA,RELEASE07_SIZE,"Release07")):
        q=pathlib.Path(p)
        if q.stat().st_size!=size or tx.digest(q)!=sha:raise RuntimeError(f"{name}-exact-bytes-size-mismatch")
    adapter_cfg=json.loads(pathlib.Path(a.adapter).read_text())
    tx.sweep.validate_adapter(adapter_cfg)
    inv=json.loads(pathlib.Path(a.inventory).read_text());tx.sweep.validate_inventory(inv)
    if adapter_cfg.get("settle_seconds")!=5 or adapter_cfg.get("sample_seconds",0)<2 or adapter_cfg.get("sample_interval_seconds",99)>1:
        raise RuntimeError("targeted-adapter-settle/sample-contract-mismatch")
    pre=tx.capture("seq49-pre-install",out);tx.require_release(pre,RELEASE07)
    save(out/"SEQ49_PREINSTALL_READONLY.json",pre)
    install=tx.opal_install(a.candidate,49,CANDIDATE,CANDIDATE_SHA,CANDIDATE_SIZE,out)
    save(out/"SEQ49_INSTALL_RECEIPT.json",install)
    installed=tx.wait_release(CANDIDATE,out);tx.ledger_write(49,CANDIDATE,CANDIDATE_SHA)
    state,p20=adapter.p20_state()
    if p20.get("enabled") or p20.get("snapshotValid") or p20.get("snapshotState") not in (None,"IDLE"):
        raise RuntimeError("fresh-boot-packet20-precondition-not-clean")
    # Begin is diagnostic-session setup. No renderer/kernel selection is allowed until
    # this explicit boot-scoped active-session proof is durable.
    adapter.command("begin")
    state,p20=adapter.p20_state()
    if p20.get("enabled") is not True or p20.get("snapshotValid"):
        raise RuntimeError("diagnosticActive-not-proven-before-selector-change")
    active={"schema":"hbnf-seq49-fresh-diagnostic-session-v1","captured_at_unix":time.time(),
       "sequence":49,"boot_uptime_seconds":state.get("HBNF",{}).get("timing",{}).get("uptimeSec"),
       "diagnosticActive":True,"snapshotValid":False,"snapshotState":p20.get("snapshotState"),
       "candidate":CANDIDATE,"candidate_sha256":CANDIDATE_SHA,"runtime_identity":installed["responses"]["matrix_build"]["body"],
       "matrix_aux_ddp_live":True}
    save(out/"SEQ49_DIAGNOSTIC_ACTIVE_BEFORE_SELECT.json",active)
    cmd=[sys.executable,str(ROOT/"scripts/hbnf_live_kernel_sweep.py"),"--adapter",a.adapter,
      "--inventory",a.inventory,"--outdir",str(out/"targeted-resource-sweep"),"--contract","foundation"]
    p=subprocess.run(cmd,text=True,capture_output=True,timeout=1800)
    (out/"SEQ49_SWEEP_STDOUT.txt").write_text(p.stdout)
    (out/"SEQ49_SWEEP_STDERR.txt").write_text(p.stderr)
    if p.returncode:raise RuntimeError(f"targeted-sweep-failed-rc-{p.returncode}")
    manifest=out/"targeted-resource-sweep/SWEEP_MANIFEST.json"
    m=json.loads(manifest.read_text())
    if m.get("expected_kernel_count")!=28 or len(m.get("kernels",[]))!=28 or m.get("restore_verified") is not True:
        raise RuntimeError("targeted-sweep-coverage-or-restore-contract-failed")
    post=tx.capture("seq49-post-sweep",out);tx.require_release(post,CANDIDATE)
    final={"schema":"hbnf-seq49-targeted-resource-result-v1","status":"COLLECTED_RESTORE_PASS",
      "sequence":49,"candidate":CANDIDATE,"candidate_sha256":CANDIDATE_SHA,"candidate_bytes":CANDIDATE_SIZE,
      "release07_recovery_sha256":RELEASE07_SHA,"inventory_kernels":len(m["kernels"]),
      "renderer_restore_verified":True,"snapshot_id":json.loads((out/"targeted-resource-sweep/PRE_SWEEP_STATE.json").read_text()).get("snapshotId"),
      "post_install_release_identity":CANDIDATE,"post_sweep_identity":CANDIDATE,
      "aux_ddp_live_from_matrix":True,"manifest_path":str(manifest),"finished_at_unix":time.time()}
    save(out/"SEQ49_RESULT.json",final);print(json.dumps(final,indent=2));return 0

if __name__=="__main__":
    try:raise SystemExit(main())
    except Exception as e:
        print(f"seq49 targeted collection stopped: {type(e).__name__}: {e}",file=sys.stderr)
        raise SystemExit(2)

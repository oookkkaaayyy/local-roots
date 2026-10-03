#!/usr/bin/env python3
"""HBNF bounded all-kernel live sweep runner.

This runner intentionally knows NOTHING about the cart's mutation API.
A source-connected adapter supplies argv-only commands for:
- snapshot current visual state
- select one retained kernel
- emit one canonical telemetry JSON sample
- restore the exact pre-sweep state

The runner:
- validates the adapter before mutation;
- snapshots once;
- verifies each selected kernel by ID/name before sampling;
- captures canonical JSONL;
- creates one runtime profile per kernel;
- always attempts restore in finally;
- emits a sweep manifest and ranked report.

No shell=True. No implicit WLED mutation endpoint. No auto-fix.
"""
from __future__ import annotations

import argparse, json, pathlib, subprocess, sys, tempfile, time

ROOT=pathlib.Path(__file__).resolve().parents[1]
QUAL=ROOT/"scripts/hbnf_runtime_qualify.py"
REPORT=ROOT/"scripts/hbnf_kernel_sweep_report.py"

REQUIRED_ADAPTER={
    "schema",
    "snapshot_argv",
    "select_argv",
    "telemetry_argv",
    "restore_argv",
    "settle_seconds",
    "sample_seconds",
    "sample_interval_seconds",
}
REQUIRED_SAMPLE_DIAGNOSTIC={
    "release_id","uptime_seconds","fps","frame_ms_avg",
    "kernel_id","kernel_name","variant_id","kernel_ms_avg",
    "palette_ms_avg","audio_ms_avg","overlay_ms_avg",
    "aux_prepare_send_ms_avg","unaccounted_ms_avg",
    "free_heap_bytes","websocket_clients","aux_projection_active",
    "aux_render_fps","wifi_rssi_dbm","restart_count",
    "kernel_ms_avg","kernel_ms_p95","palette_ms_avg","palette_ms_p95",
    "audio_ms_avg","audio_ms_p95","scheduler_ms_avg","scheduler_ms_p95",
    "overlay_ms_avg","overlay_ms_p95","aux_prepare_send_ms_avg","aux_prepare_send_ms_p95",
    "unaccounted_ms_avg","unaccounted_ms_p95",
}
REQUIRED_SAMPLE_FOUNDATION={
    "release_id","uptime_seconds","fps","frame_ms_p50","frame_ms_p95",
    "frame_ms_p99","frame_ms_max","kernel_id","kernel_name","variant_id",
    "free_heap_bytes","minimum_free_heap_bytes","largest_free_block_bytes",
    "websocket_clients","aux_projection_active","aux_projection_age_ms",
    "aux_render_fps","wifi_rssi_dbm","restart_count",
}

def load(path):
    return json.loads(pathlib.Path(path).read_text())

def run_json(argv, timeout=10):
    p=subprocess.run(argv,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
    if p.returncode:
        raise RuntimeError(f"command failed rc={p.returncode}: {argv!r}\n{p.stderr[-2000:]}")
    try:
        return json.loads(p.stdout)
    except Exception as e:
        raise RuntimeError(f"command did not return JSON: {argv!r}: {e}") from e

def run_ok(argv, timeout=15):
    p=subprocess.run(argv,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
    if p.returncode:
        raise RuntimeError(f"command failed rc={p.returncode}: {argv!r}\n{p.stderr[-2000:]}")
    return p.stdout

def subst(argv, values):
    out=[]
    for item in argv:
        s=str(item)
        for key,val in values.items():
            s=s.replace("{"+key+"}",str(val))
        out.append(s)
    return out

def validate_argv(name,value):
    if not isinstance(value,list) or not value or not all(isinstance(x,str) and x for x in value):
        raise ValueError(name+" must be a nonempty argv string array")

def validate_adapter(adapter):
    missing=sorted(REQUIRED_ADAPTER-set(adapter))
    extra=sorted(set(adapter)-REQUIRED_ADAPTER-{"timeout_seconds","notes"})
    if missing: raise ValueError("adapter missing: "+", ".join(missing))
    if extra: raise ValueError("adapter unknown fields: "+", ".join(extra))
    if adapter.get("schema")!="hbnf-live-sweep-adapter-v1":
        raise ValueError("adapter schema mismatch")
    for k in ["snapshot_argv","select_argv","telemetry_argv","restore_argv"]:
        validate_argv(k,adapter[k])
    if "{effect_id}" not in " ".join(adapter["select_argv"]):
        raise ValueError("select_argv must contain {effect_id}")
    if "{snapshot_file}" not in " ".join(adapter["restore_argv"]):
        raise ValueError("restore_argv must contain {snapshot_file}")
    for k in ["settle_seconds","sample_seconds","sample_interval_seconds"]:
        if not isinstance(adapter[k],(int,float)) or adapter[k]<=0:
            raise ValueError(k+" must be > 0")
    if adapter["sample_interval_seconds"]>adapter["sample_seconds"]:
        raise ValueError("sample interval cannot exceed sample duration")

def validate_inventory(inv):
    if inv.get("schema")!="hbnf-kernel-sweep-inventory-v1":
        raise ValueError("inventory schema mismatch")
    entries=inv.get("entries")
    if not isinstance(entries,list) or len(entries)!=28:
        raise ValueError("inventory must contain exactly 28 entries")
    ids=[e.get("effect_id") for e in entries]
    names=[e.get("kernel_name") for e in entries]
    if len(set(ids))!=28 or len(set(names))!=28:
        raise ValueError("inventory IDs/names must be unique")
    if ids!=list(range(220,248)):
        raise ValueError("inventory effect IDs must be exact contiguous 220..247")

def validate_sample(sample, contract):
    required=REQUIRED_SAMPLE_DIAGNOSTIC if contract=="diagnostic" else REQUIRED_SAMPLE_FOUNDATION
    missing=sorted(k for k in required if sample.get(k) is None)
    if missing: raise ValueError("telemetry missing: "+", ".join(missing))

def verify_selected(sample, entry):
    # Runtime kernels are zero-based in current evidence; names are the stronger guard.
    if str(sample.get("kernel_name"))!=str(entry["kernel_name"]):
        raise RuntimeError(
            f"selected kernel mismatch: requested {entry['kernel_name']}, telemetry says {sample.get('kernel_name')}"
        )
    expected=entry.get("runtime_kernel_index_expected")
    if expected is not None and str(sample.get("kernel_id"))!=str(expected):
        raise RuntimeError(
            f"selected kernel id mismatch for {entry['kernel_name']}: expected {expected}, got {sample.get('kernel_id')}"
        )

def collect_kernel(adapter, entry, outdir, timeout, contract):
    vals={
        "effect_id":entry["effect_id"],
        "kernel_name":entry["kernel_name"],
        "runtime_kernel_index":entry.get("runtime_kernel_index_expected"),
        "preset":entry.get("preset"),
    }
    run_ok(subst(adapter["select_argv"],vals),timeout=timeout)
    time.sleep(float(adapter["settle_seconds"]))

    first=run_json(subst(adapter["telemetry_argv"],vals),timeout=timeout)
    validate_sample(first,contract)
    verify_selected(first,entry)

    lines=[first]
    deadline=time.monotonic()+float(adapter["sample_seconds"])
    interval=float(adapter["sample_interval_seconds"])
    while time.monotonic()<deadline:
        time.sleep(interval)
        sample=run_json(subst(adapter["telemetry_argv"],vals),timeout=timeout)
        validate_sample(sample,contract)
        verify_selected(sample,entry)
        lines.append(sample)

    slug=f"{int(entry['runtime_kernel_index_expected']):02d}_{entry['kernel_name']}"
    jsonl=outdir/(slug+".jsonl")
    jsonl.write_text("\n".join(json.dumps(x,separators=(",",":")) for x in lines)+"\n")
    profile=outdir/(slug+".profile.json")
    p=subprocess.run(
        [sys.executable,str(QUAL),"--input",str(jsonl),"--contract",contract,"--profile-only","--output",str(profile)],
        text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE
    )
    if p.returncode:
        raise RuntimeError(f"runtime profile failed for {entry['kernel_name']}:\n{p.stdout}\n{p.stderr}")
    return profile, first.get("release_id"), first.get("variant_id")

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--adapter",required=True)
    ap.add_argument("--inventory",default=str(ROOT/"config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json"))
    ap.add_argument("--outdir",required=True)
    ap.add_argument("--policy")
    ap.add_argument("--contract",choices=["diagnostic","foundation"],default="diagnostic")
    ap.add_argument("--qualify",action="store_true")
    ap.add_argument("--dry-run",action="store_true")
    args=ap.parse_args()

    adapter=load(args.adapter); validate_adapter(adapter)
    inventory=load(args.inventory); validate_inventory(inventory)
    if args.qualify and args.contract!="foundation":
        raise SystemExit("--qualify requires --contract foundation")
    outdir=pathlib.Path(args.outdir).resolve(); outdir.mkdir(parents=True,exist_ok=True)
    timeout=int(adapter.get("timeout_seconds",10))

    if args.dry_run:
        print(json.dumps({
          "status":"DRY_RUN_PASS",
          "kernel_count":len(inventory["entries"]),
          "first":inventory["entries"][0],
          "last":inventory["entries"][-1],
          "adapter_schema":adapter["schema"]
        },indent=2))
        return 0

    snapshot=run_json(adapter["snapshot_argv"],timeout=timeout)
    snapfile=outdir/"PRE_SWEEP_STATE.json"
    snapfile.write_text(json.dumps(snapshot,indent=2,sort_keys=True)+"\n")

    profiles=[]; release_ids=set()
    run_error=None; restore_error=None
    try:
        for entry in inventory["entries"]:
            profile,release_id,variant_id=collect_kernel(adapter,entry,outdir,timeout,args.contract)
            release_ids.add(str(release_id))
            profiles.append({
              "kernel_id":entry["runtime_kernel_index_expected"],
              "kernel_name":entry["kernel_name"],
              "variant_id":variant_id,
              "effect_id":entry["effect_id"],
              "preset":entry.get("preset"),
              "profile_path":profile.name
            })
    except Exception as e:
        run_error=str(e)
    finally:
        try:
            run_ok(subst(adapter["restore_argv"],{"snapshot_file":str(snapfile)}),timeout=max(timeout,20))
        except Exception as e:
            restore_error=str(e)

    if run_error or restore_error:
        failure={
          "status":"FAIL",
          "run_error":run_error,
          "restore_error":restore_error,
          "profiles_completed":len(profiles),
          "pre_sweep_state":str(snapfile)
        }
        (outdir/"SWEEP_ABORT.json").write_text(json.dumps(failure,indent=2)+"\n")
        print(json.dumps(failure,indent=2))
        return 2

    if len(release_ids)!=1:
        print(json.dumps({"status":"FAIL","error":"release identity changed during sweep","release_ids":sorted(release_ids)},indent=2))
        return 2

    manifest={
      "schema":"hbnf-kernel-sweep-input-v1",
      "release_id":next(iter(release_ids)),
      "contract":args.contract,
      "expected_kernel_count":28,
      "kernels":profiles
    }
    mf=outdir/"SWEEP_MANIFEST.json"; mf.write_text(json.dumps(manifest,indent=2)+"\n")
    report=outdir/"ALL_KERNEL_SWEEP_REPORT.json"
    cmd=[sys.executable,str(REPORT),"--manifest",str(mf),"--output",str(report)]
    if args.qualify:
        if not args.policy: raise SystemExit("--qualify requires --policy")
        cmd += ["--qualify","--policy",args.policy]
    p=subprocess.run(cmd,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    print(p.stdout)
    if p.stderr: print(p.stderr,file=sys.stderr)
    return p.returncode

if __name__=="__main__":
    raise SystemExit(main())

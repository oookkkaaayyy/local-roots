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

import argparse, json, os, pathlib, shutil, subprocess, sys, tempfile, time

ROOT=pathlib.Path(__file__).resolve().parents[1]
QUAL=ROOT/"scripts/hbnf_runtime_qualify.py"
REPORT=ROOT/"scripts/hbnf_kernel_sweep_report.py"
MIN_FREE_BYTES=512*1024*1024
RECOVERY_RESERVE_BYTES=8*1024*1024
MIN_FOUNDATION_SOAK_SECONDS=90*60
MAX_FOUNDATION_SOAK_SAMPLE_GAP_SECONDS=15
FOUNDATION_HARD_FRAME_INTERVAL_MS=1000.0

REQUIRED_ADAPTER={
    "schema",
    "snapshot_argv",
    "select_argv",
    "telemetry_argv",
    "restore_argv",
    "settle_seconds",
    "sample_seconds",
    "sample_interval_seconds",
    "expected_release_id",
}
REQUIRED_SAMPLE_DIAGNOSTIC={
    "release_id","uptime_seconds","fps","frame_ms_avg",
    "kernel_id","kernel_name","variant_id","kernel_ms_avg",
    "palette_ms_avg","audio_ms_avg","overlay_ms_avg",
    "aux_prepare_send_ms_avg","unaccounted_ms_avg",
    "free_heap_bytes","websocket_clients","aux_projection_active",
    "aux_render_fps","wifi_rssi_dbm","restart_count",
}
REQUIRED_SAMPLE_FOUNDATION={
    "release_id","uptime_seconds","fps","frame_ms_p50","frame_ms_p95",
    "frame_ms_p99","frame_ms_max","kernel_id","kernel_name","variant_id",
    "free_heap_bytes","minimum_free_heap_bytes","largest_free_block_bytes",
    "websocket_clients","aux_projection_active","aux_projection_age_ms",
    "aux_render_fps","wifi_rssi_dbm","restart_count",
    "kernel_ms_avg","kernel_ms_p95","palette_ms_avg","palette_ms_p95",
    "audio_ms_avg","audio_ms_p95","scheduler_ms_avg","scheduler_ms_p95",
    "overlay_ms_avg","overlay_ms_p95","aux_prepare_send_ms_avg","aux_prepare_send_ms_p95",
    "unaccounted_ms_avg","unaccounted_ms_p95",
}

def load(path):
    return json.loads(pathlib.Path(path).read_text())

def _excerpt(value):
    if value is None:return ""
    if isinstance(value,bytes):value=value.decode("utf-8","replace")
    return str(value)[-2000:]

def _run_error(argv, timeout, exc):
    stdout=_excerpt(getattr(exc,"stdout",None) or getattr(exc,"output",None))
    stderr=_excerpt(getattr(exc,"stderr",None))
    return RuntimeError(
        f"subprocess timed out after {timeout}s: argv={argv!r}; "
        f"stdout_tail={stdout!r}; stderr_tail={stderr!r}"
    )

def run_json(argv, timeout=10):
    try:p=subprocess.run(argv,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
    except subprocess.TimeoutExpired as e:raise _run_error(argv,timeout,e) from e
    if p.returncode:
        raise RuntimeError(f"command failed rc={p.returncode}: {argv!r}\n{p.stderr[-2000:]}")
    try:
        return json.loads(p.stdout)
    except Exception as e:
        raise RuntimeError(
            f"command did not return JSON: argv={argv!r}; error={type(e).__name__}: {e}; "
            f"stdout_tail={p.stdout[-2000:]!r}; stderr_tail={p.stderr[-2000:]!r}"
        ) from e

def run_ok(argv, timeout=15):
    try:p=subprocess.run(argv,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
    except subprocess.TimeoutExpired as e:raise _run_error(argv,timeout,e) from e
    if p.returncode:
        raise RuntimeError(f"command failed rc={p.returncode}: {argv!r}\n{p.stderr[-2000:]}")
    return p.stdout

def atomic_write(path, data):
    path=pathlib.Path(path)
    path.parent.mkdir(parents=True,exist_ok=True)
    raw=data if isinstance(data,bytes) else str(data).encode("utf-8")
    fd,tmp=tempfile.mkstemp(prefix=path.name+".",suffix=".partial",dir=str(path.parent))
    try:
        with os.fdopen(fd,"wb") as f:
            f.write(raw); f.flush(); os.fsync(f.fileno())
        os.replace(tmp,path)
    except Exception:
        try:os.unlink(tmp)
        except OSError:pass
        raise

def require_disk_headroom(outdir, minimum=MIN_FREE_BYTES):
    free=shutil.disk_usage(pathlib.Path(outdir)).free
    if free<minimum:
        raise RuntimeError(
            f"insufficient evidence disk headroom before device preflight: "
            f"available={free} required={minimum} path={pathlib.Path(outdir)}"
        )
    return free

def create_recovery_reserve(outdir, size=RECOVERY_RESERVE_BYTES):
    path=pathlib.Path(outdir)/".restore-evidence-reserve"
    fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    try:
        if hasattr(os,"posix_fallocate"):
            os.posix_fallocate(fd,0,size)
        else:
            block=b"\0"*min(1024*1024,size)
            left=size
            while left:
                chunk=block[:min(len(block),left)]
                os.write(fd,chunk);left-=len(chunk)
        os.fsync(fd)
    except Exception:
        os.close(fd)
        try:path.unlink()
        except OSError:pass
        raise
    os.close(fd)
    return path

def persist_restore_evidence(outdir, restore_stdout, post_restore_state, expected_state):
    outdir=pathlib.Path(outdir)
    atomic_write(outdir/"POST_RESTORE_RAW_STATE.json",restore_stdout)
    raw=json.dumps(post_restore_state,indent=2,sort_keys=True)+"\n"
    atomic_write(outdir/"POST_RESTORE_STATE.json",raw)
    # Persist both observations before equality checks can raise.
    assert_same_snapshot(expected_state,post_restore_state)

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
    if not isinstance(adapter.get("expected_release_id"),str) or not adapter["expected_release_id"].strip():
        raise ValueError("expected_release_id must be a nonempty string")
    for k in ["snapshot_argv","select_argv","telemetry_argv","restore_argv"]:
        validate_argv(k,adapter[k])
    selection_command=" ".join(adapter["select_argv"])
    if "{effect_id}" not in selection_command and "{runtime_kernel_index}" not in selection_command:
        raise ValueError("select_argv must contain {effect_id} or {runtime_kernel_index}")
    if "{snapshot_file}" not in " ".join(adapter["restore_argv"]):
        raise ValueError("restore_argv must contain {snapshot_file}")
    for k in ["settle_seconds","sample_seconds","sample_interval_seconds"]:
        if not isinstance(adapter[k],(int,float)) or adapter[k]<=0:
            raise ValueError(k+" must be > 0")
    timeout=adapter.get("timeout_seconds",10)
    if not isinstance(timeout,(int,float)) or timeout<=0:
        raise ValueError("timeout_seconds must be > 0")
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

def validate_continuity(sample, expected_release_id=None, expected_restart_count=None, previous_uptime=None):
    release_id=str(sample.get("release_id"))
    restart_count=int(sample.get("restart_count"))
    uptime=float(sample.get("uptime_seconds"))
    if expected_release_id is not None and release_id!=str(expected_release_id):
        raise RuntimeError(f"release identity changed during sweep: expected {expected_release_id}, got {release_id}")
    if expected_restart_count is not None and restart_count!=int(expected_restart_count):
        raise RuntimeError(
            f"restart_count changed during sweep: expected {expected_restart_count}, got {restart_count}"
        )
    if previous_uptime is not None and uptime<float(previous_uptime):
        raise RuntimeError(f"uptime decreased during sweep: previous {previous_uptime}, got {uptime}")
    return release_id,restart_count,uptime

def validate_soak_sample(sample, entry, release_id, restart_count, previous_uptime, previous_sample_time=None):
    """Validate one state-changing soak sample before it is appended durably."""
    validate_sample(sample,"foundation")
    enforce_foundation_frame_interval(sample)
    verify_selected(sample,entry)
    _,_,uptime=validate_continuity(sample,release_id,restart_count,previous_uptime)
    stamp=float(sample.get("sample_time"))
    if previous_sample_time is not None:
        gap=stamp-float(previous_sample_time)
        if gap<=0 or gap>MAX_FOUNDATION_SOAK_SAMPLE_GAP_SECONDS:
            raise RuntimeError(f"foundation soak sample gap invalid: {gap:.3f}s; maximum {MAX_FOUNDATION_SOAK_SAMPLE_GAP_SECONDS}s")
    return uptime,stamp

def enforce_foundation_frame_interval(sample):
    """Fail closed on any exact post-warm-up frame interval >= 1 second."""
    maximum=float(sample["frame_ms_max"])
    if maximum>=FOUNDATION_HARD_FRAME_INTERVAL_MS:
        raise RuntimeError(f"foundation-steady-state-frame-interval-stop: frame_ms_max={maximum:g}ms threshold={FOUNDATION_HARD_FRAME_INTERVAL_MS:g}ms kernel={sample.get('kernel_name')} id={sample.get('kernel_id')}")

def append_jsonl_durable(path,sample):
    path=pathlib.Path(path)
    path.parent.mkdir(parents=True,exist_ok=True)
    with path.open("a",encoding="utf-8") as f:
        f.write(json.dumps(sample,separators=(",",":"))+"\n")
        f.flush();os.fsync(f.fileno())

def run_foundation_soak(adapter,inventory,outdir,timeout,release_id,restart_count,previous_uptime,duration_seconds,interval_seconds,policy):
    """Run the changing 28-kernel soak inside the same one-snapshot transaction."""
    if duration_seconds<MIN_FOUNDATION_SOAK_SECONDS:
        raise ValueError(f"foundation soak must be at least {MIN_FOUNDATION_SOAK_SECONDS}s")
    if interval_seconds<=0 or interval_seconds>=MAX_FOUNDATION_SOAK_SAMPLE_GAP_SECONDS:
        raise ValueError(f"soak interval must be positive and below {MAX_FOUNDATION_SOAK_SAMPLE_GAP_SECONDS}s")
    path=pathlib.Path(outdir)/"FOUNDATION_SOAK.jsonl"
    path.unlink(missing_ok=True)
    started=time.monotonic();end=started+duration_seconds;sample_index=0
    previous_sample_time=None;observed=set();catastrophic_streak=0
    entries=inventory["entries"]
    while True:
        now=time.monotonic()
        if now>=end:break
        entry=entries[sample_index%len(entries)]
        values={"effect_id":entry["effect_id"],"kernel_name":entry["kernel_name"],
                "runtime_kernel_index":entry.get("runtime_kernel_index_expected"),"preset":entry.get("preset"),
                "session_id":str(pathlib.Path(outdir).resolve())}
        run_ok(subst(adapter["select_argv"],values),timeout=timeout)
        # Keep telemetry cadence below the hard 15-second gap even when select/HTTP
        # overhead varies; any actual overrun is a fail-closed stop before restore.
        target=started+(sample_index+1)*interval_seconds
        delay=target-time.monotonic()
        if delay>0:time.sleep(delay)
        sample=run_json(subst(adapter["telemetry_argv"],values),timeout=timeout)
        # Monotonic time avoids wall-clock/NTP jumps invalidating interval checks.
        sample["sample_time"]=time.monotonic()
        try:
            previous_uptime,previous_sample_time=validate_soak_sample(
                sample,entry,release_id,restart_count,previous_uptime,previous_sample_time
            )
        except Exception as e:
            append_jsonl_durable(path,sample)
            persist_failure_sample(pathlib.Path(outdir),entry,"soak_sample",sample,e)
            raise
        stop=policy["catastrophic_early_stop"];bad=(float(sample["fps"])<float(stop["fps_floor_absolute"])
            or float(sample["frame_ms_p99"])>float(stop["frame_ms_p99_ceiling_absolute"])
            or float(sample["aux_projection_age_ms"])>float(stop["aux_projection_age_ms_ceiling"]))
        catastrophic_streak=catastrophic_streak+1 if bad else 0
        if catastrophic_streak>=int(stop["consecutive_samples"]):
            append_jsonl_durable(path,sample)
            raise RuntimeError(f"catastrophic Foundation threshold crossed for {catastrophic_streak} consecutive samples: fps={sample['fps']} p99_ms={sample['frame_ms_p99']} aux_age_ms={sample['aux_projection_age_ms']}")
        observed.add(int(sample["kernel_id"]))
        append_jsonl_durable(path,sample)
        sample_index+=1
    if sample_index==0:raise RuntimeError("foundation soak ended without a sample")
    expected={int(e["runtime_kernel_index_expected"]) for e in entries}
    if observed!=expected:raise RuntimeError(f"foundation soak missed exact kernel coverage: observed {len(observed)}/28")
    return {"path":str(path),"sample_count":sample_index,"duration_seconds":time.monotonic()-started,
            "state_changing_kernel_count":len({int(x["runtime_kernel_index_expected"]) for x in entries})}

def validate_soak_options(contract,duration_seconds,interval_seconds):
    if not duration_seconds:return
    if contract!="foundation":raise ValueError("--soak-seconds requires --contract foundation")
    if duration_seconds<MIN_FOUNDATION_SOAK_SECONDS:
        raise ValueError(f"--soak-seconds must be at least {MIN_FOUNDATION_SOAK_SECONDS}")
    if interval_seconds<=0 or interval_seconds>=MAX_FOUNDATION_SOAK_SAMPLE_GAP_SECONDS:
        raise ValueError(f"--soak-interval-seconds must be positive and below {MAX_FOUNDATION_SOAK_SAMPLE_GAP_SECONDS}")

def assert_same_snapshot(before, after):
    if before!=after:
        raise RuntimeError("post-restore visual-state snapshot does not match pre-sweep snapshot")

def persist_failure_sample(outdir, entry, phase, sample, error):
    slug=f"{int(entry['runtime_kernel_index_expected']):02d}_{entry['kernel_name']}"
    path=outdir/(slug+f".{phase}.failure.json")
    atomic_write(path,json.dumps({
      "status":"FAIL",
      "phase":phase,
      "error":str(error),
      "requested":{
        "effect_id":entry.get("effect_id"),
        "kernel_name":entry.get("kernel_name"),
        "runtime_kernel_index_expected":entry.get("runtime_kernel_index_expected"),
      },
      "sample":sample,
    },indent=2,sort_keys=True)+"\n")
    return path

def collect_kernel(adapter, entry, outdir, timeout, contract, expected_release_id=None, expected_restart_count=None, previous_uptime=None):
    vals={
        "effect_id":entry["effect_id"],
        "kernel_name":entry["kernel_name"],
        "runtime_kernel_index":entry.get("runtime_kernel_index_expected"),
        "preset":entry.get("preset"),
        "session_id":str(pathlib.Path(outdir).resolve()),
    }
    run_ok(subst(adapter["select_argv"],vals),timeout=timeout)
    time.sleep(float(adapter["settle_seconds"]))

    first=run_json(subst(adapter["telemetry_argv"],vals),timeout=timeout)
    try:
        validate_sample(first,contract)
        verify_selected(first,entry)
        if contract=="foundation":enforce_foundation_frame_interval(first)
        release_id,restart_count,previous_uptime=validate_continuity(
            first,expected_release_id,expected_restart_count,previous_uptime
        )
    except Exception as e:
        persist_failure_sample(outdir,entry,"first_sample",first,e)
        raise

    lines=[first]
    deadline=time.monotonic()+float(adapter["sample_seconds"])
    interval=float(adapter["sample_interval_seconds"])
    while time.monotonic()<deadline:
        time.sleep(interval)
        sample=run_json(subst(adapter["telemetry_argv"],vals),timeout=timeout)
        try:
            validate_sample(sample,contract)
            verify_selected(sample,entry)
            if contract=="foundation":enforce_foundation_frame_interval(sample)
            _,_,previous_uptime=validate_continuity(sample,release_id,restart_count,previous_uptime)
        except Exception as e:
            persist_failure_sample(outdir,entry,"sample",sample,e)
            raise
        lines.append(sample)

    slug=f"{int(entry['runtime_kernel_index_expected']):02d}_{entry['kernel_name']}"
    jsonl=outdir/(slug+".jsonl")
    atomic_write(jsonl,"\n".join(json.dumps(x,separators=(",",":")) for x in lines)+"\n")
    profile=outdir/(slug+".profile.json")
    p=subprocess.run(
        [sys.executable,str(QUAL),"--input",str(jsonl),"--contract",contract,"--profile-only","--output",str(profile)],
        text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE
    )
    if p.returncode:
        raise RuntimeError(f"runtime profile failed for {entry['kernel_name']}:\n{p.stdout}\n{p.stderr}")
    return profile, release_id, first.get("variant_id"), restart_count, previous_uptime

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--adapter",required=True)
    ap.add_argument("--inventory",default=str(ROOT/"config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json"))
    ap.add_argument("--outdir",required=True)
    ap.add_argument("--policy")
    ap.add_argument("--contract",choices=["diagnostic","foundation"],default="diagnostic")
    ap.add_argument("--qualify",action="store_true")
    ap.add_argument("--soak-seconds",type=int,default=0,
                    help="optional state-changing Foundation soak before the same transaction's exact renderer restore (minimum 5400s)")
    ap.add_argument("--soak-interval-seconds",type=float,default=8.0)
    ap.add_argument("--threshold-policy",help="fully frozen Foundation policy; required for an integrated soak")
    ap.add_argument("--threshold-baseline",help="output path for the baseline generated from this run's complete 28-kernel sweep")
    ap.add_argument("--dry-run",action="store_true")
    args=ap.parse_args()

    adapter=load(args.adapter); validate_adapter(adapter)
    inventory=load(args.inventory); validate_inventory(inventory)
    if args.qualify and args.contract!="foundation":
        raise SystemExit("--qualify requires --contract foundation")
    try:validate_soak_options(args.contract,args.soak_seconds,args.soak_interval_seconds)
    except ValueError as e:raise SystemExit(str(e))
    outdir=pathlib.Path(args.outdir).resolve(); outdir.mkdir(parents=True,exist_ok=True)
    timeout=int(adapter.get("timeout_seconds",10))

    if args.dry_run:
        print(json.dumps({
          "status":"DRY_RUN_PASS",
          "kernel_count":len(inventory["entries"]),
          "first":inventory["entries"][0],
          "last":inventory["entries"][-1],
          "adapter_schema":adapter["schema"],
          "expected_release_id":adapter["expected_release_id"]
        },indent=2))
        return 0

    if args.soak_seconds:
        if not args.threshold_policy:
            raise SystemExit("integrated soak requires a fully frozen --threshold-policy; refuses before device preflight")
        freeze_validator=ROOT/"scripts/hbnf_foundation_threshold_freeze.py"
        run_json([sys.executable,str(freeze_validator),"--policy",args.threshold_policy,
                  "--baseline",str(ROOT/"config/HBNF_RUNTIME_QUALIFICATION_POLICY_TEMPLATE.json"),
                  "--validate-policy-only"],timeout=15)

    try:
        available=require_disk_headroom(outdir)
    except Exception as e:
        print(json.dumps({"status":"BLOCKED_BEFORE_DEVICE_PREFLIGHT","error":str(e)},indent=2))
        return 2
    # Read-only identity/continuity preflight MUST pass before the first select/mutation.
    try:
        preflight=run_json(subst(adapter["telemetry_argv"],{"session_id":str(outdir)}),timeout=timeout)
        atomic_write(outdir/"PRE_SWEEP_TELEMETRY.json",json.dumps(preflight,indent=2,sort_keys=True)+"\n")
    except Exception as e:
        failure={"status":"READONLY_PREFLIGHT_FAILED","error":str(e),"device_mutation_started":False}
        try:atomic_write(outdir/"PRE_SWEEP_ABORT.json",json.dumps(failure,indent=2,sort_keys=True)+"\n")
        except Exception as evidence_error:failure["evidence_write_error"]=str(evidence_error)
        print(json.dumps(failure,indent=2))
        return 2
    try:
        validate_sample(preflight,args.contract)
        expected_release_id,expected_restart_count,previous_uptime=validate_continuity(
            preflight,adapter["expected_release_id"],None,None
        )
    except Exception as e:
        preflight_failure={"status":"FAIL","error":str(e),"sample":preflight}
        atomic_write(outdir/"PRE_SWEEP_ABORT.json",json.dumps(preflight_failure,indent=2,sort_keys=True)+"\n")
        print(json.dumps(preflight_failure,indent=2))
        return 2

    snapfile=outdir/"PRE_SWEEP_STATE.json"
    profiles=[]; release_ids=set()
    run_error=None; restore_error=None; post_restore_state=None;snapshot=None
    reserve=None
    try:
        # Hold real disk blocks so an unexpected host-full condition can still
        # release space for the mandatory restore response and state evidence.
        reserve=create_recovery_reserve(outdir)
        snapshot=run_json(subst(adapter["snapshot_argv"],{"observer_output":str(outdir/"OBSERVER_EFFECT.json")}),timeout=timeout)
        atomic_write(snapfile,json.dumps(snapshot,indent=2,sort_keys=True)+"\n")
        for entry in inventory["entries"]:
            profile,release_id,variant_id,restart_count,previous_uptime=collect_kernel(
                adapter,entry,outdir,timeout,args.contract,expected_release_id,expected_restart_count,previous_uptime
            )
            release_ids.add(str(release_id))
            profiles.append({
              "kernel_id":entry["runtime_kernel_index_expected"],
              "kernel_name":entry["kernel_name"],
              "variant_id":variant_id,
              "effect_id":entry["effect_id"],
              "preset":entry.get("preset"),
              "profile_path":profile.name
            })
        soak_result=None
        if args.soak_seconds:
            if args.contract!="foundation":raise ValueError("--soak-seconds requires --contract foundation")
            pre_soak_manifest={"schema":"hbnf-kernel-sweep-input-v1","release_id":expected_release_id,
                "contract":"foundation","expected_kernel_count":28,"restore_verified":False,"kernels":profiles}
            pre_soak_path=outdir/"PRE_SOAK_SWEEP_MANIFEST.json"
            atomic_write(pre_soak_path,json.dumps(pre_soak_manifest,indent=2,sort_keys=True)+"\n")
            baseline_path=pathlib.Path(args.threshold_baseline).resolve() if args.threshold_baseline else outdir/"PRE_SOAK_BASELINE.json"
            run_json([sys.executable,str(ROOT/"scripts/hbnf_foundation_baseline.py"),
                "--sweep-manifest",str(pre_soak_path),"--output",str(baseline_path)],timeout=30)
            freeze_receipt=outdir/"THRESHOLD_FREEZE_RECEIPT.json"
            freeze_result=run_json([sys.executable,str(ROOT/"scripts/hbnf_foundation_threshold_freeze.py"),
                "--policy",str(pathlib.Path(args.threshold_policy).resolve()),
                "--baseline",str(baseline_path),
                "--sweep-manifest",str(pre_soak_path),"--expected-release",expected_release_id,
                "--output",str(freeze_receipt)],timeout=30)
            if freeze_result.get("status")!="FROZEN_BEFORE_SOAK" or freeze_result.get("soak_started") is not False:
                raise RuntimeError("threshold freeze receipt did not pass before soak")
            soak_result=run_foundation_soak(
                adapter,inventory,outdir,timeout,expected_release_id,expected_restart_count,
                previous_uptime,args.soak_seconds,args.soak_interval_seconds,
                load(args.threshold_policy)
            )
            soak_result["baseline_path"]=str(baseline_path)
            soak_result["pre_soak_manifest_path"]=str(pre_soak_path)
            soak_result["threshold_freeze_receipt_path"]=str(freeze_receipt)
            soak_result["threshold_freeze_receipt_sha256"]=__import__("hashlib").sha256(freeze_receipt.read_bytes()).hexdigest()
    except Exception as e:
        run_error=str(e)
        if snapshot is None and reserve is not None:
            restore_error=(
                "snapshot command did not return a verifiable snapshot; renderer state is uncertain; "
                "stop and use the pre-proven exact Release07 recovery path"
            )
    finally:
        if reserve is not None:
            try:reserve.unlink()
            except FileNotFoundError:pass
            except Exception as e:restore_error=f"could-not-release-restore-evidence-reserve: {e}"
        if snapshot is not None:
            try:
                restore_stdout=run_ok(subst(adapter["restore_argv"],{
                    "snapshot_file":str(snapfile),
                    "restore_raw_state":str(outdir/"POST_RESTORE_RAW_STATE.json")
                }),timeout=max(timeout,20))
                post_restore_state=run_json(adapter["snapshot_argv"],timeout=timeout)
                persist_restore_evidence(outdir,restore_stdout,post_restore_state,snapshot)
            except Exception as e:
                restore_error=str(e)

    if run_error or restore_error:
        failure={
          "status":"FAIL",
          "run_error":run_error,
          "restore_error":restore_error,
          "profiles_completed":len(profiles),
          "pre_sweep_state":str(snapfile),
          "post_restore_state":str(outdir/"POST_RESTORE_STATE.json") if post_restore_state is not None else None
        }
        try:atomic_write(outdir/"SWEEP_ABORT.json",json.dumps(failure,indent=2)+"\n")
        except Exception as evidence_error:
            failure["abort_evidence_write_error"]=str(evidence_error)
        print(json.dumps(failure,indent=2))
        return 2

    if len(release_ids)!=1:
        print(json.dumps({"status":"FAIL","error":"release identity changed during sweep","release_ids":sorted(release_ids)},indent=2))
        return 2

    restore_receipt={
      "status":"PASS",
      "snapshot_equal":True,
      "pre_sweep_state":str(snapfile),
      "post_restore_state":str(outdir/"POST_RESTORE_STATE.json")
    }
    atomic_write(outdir/"RESTORE_RECEIPT.json",json.dumps(restore_receipt,indent=2)+"\n")
    manifest={
      "schema":"hbnf-kernel-sweep-input-v1",
      "release_id":next(iter(release_ids)),
      "contract":args.contract,
      "expected_kernel_count":28,
      "restore_verified":True,
      "restore_receipt":"RESTORE_RECEIPT.json",
      "kernels":profiles
    }
    if args.soak_seconds:
        manifest["foundation_soak"]={**soak_result,"minimum_duration_seconds":MIN_FOUNDATION_SOAK_SECONDS,
            "sample_gap_limit_seconds":MAX_FOUNDATION_SOAK_SAMPLE_GAP_SECONDS,
            "threshold_status":"NOT_EVALUATED__MUST_BE_FROZEN_BEFORE_SOAK"}
    mf=outdir/"SWEEP_MANIFEST.json"; atomic_write(mf,json.dumps(manifest,indent=2)+"\n")
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

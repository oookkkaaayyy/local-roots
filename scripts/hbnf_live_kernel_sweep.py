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

import argparse, hashlib, json, os, pathlib, shutil, subprocess, sys, tempfile, time

ROOT=pathlib.Path(__file__).resolve().parents[1]
QUAL=ROOT/"scripts/hbnf_runtime_qualify.py"
REPORT=ROOT/"scripts/hbnf_kernel_sweep_report.py"
MIN_FREE_BYTES=512*1024*1024
RECOVERY_RESERVE_BYTES=8*1024*1024
MIN_FOUNDATION_SOAK_SECONDS=90*60
MAX_FOUNDATION_SOAK_SAMPLE_GAP_SECONDS=15
FOUNDATION_HARD_FRAME_INTERVAL_MS=1000.0
R4_BASELINE_MANIFEST=ROOT/"evidence/hbnf-foundation-qualification-20261005/seq39/live/PRE_SOAK_BASELINE.json"
R4_BASELINE_MANIFEST_SHA256="45c1562b92877a55048cc47bada00ecdac9dd23f2533dfdbad63da0e9f8476be"

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
    try:p=subprocess.run(argv,cwd=ROOT,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
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
    try:p=subprocess.run(argv,cwd=ROOT,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
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

def prepare_output_dir(path):
    """Create a run directory only when it cannot overwrite prior evidence."""
    path=pathlib.Path(path).resolve()
    if path.exists() and not path.is_dir():
        raise RuntimeError(f"sweep output path is not a directory: {path}")
    if path.exists() and any(path.iterdir()):
        raise RuntimeError(f"sweep output directory is not empty; refusing to overwrite evidence: {path}")
    path.mkdir(parents=True,exist_ok=True)
    return path

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

def reconcile_verified_observer_restore(outdir):
    """Retain a restore already proven by the adapter when its snapshot call fails."""
    outdir=pathlib.Path(outdir);sidecar=outdir/"OBSERVER_EFFECT_FAILURE.json"
    try:failure=load(sidecar) if sidecar.is_file() else {}
    except Exception:return None
    restored=failure.get("restore",{})
    if not (failure.get("status")=="OBSERVER_FAILED__RENDERER_RESTORED"
        and restored.get("restoreVerified") is True and restored.get("packet20Same") is True
        and isinstance(restored.get("snapshotId"),int) and isinstance(restored.get("snapshotHash"),int)):
        return None
    state={"restoreVerified":True,"packet20Same":True,"snapshotId":restored["snapshotId"],
      "snapshotHash":restored["snapshotHash"],"evidence":"OBSERVER_EFFECT_FAILURE.json"}
    atomic_write(outdir/"POST_RESTORE_STATE.json",json.dumps(state,indent=2,sort_keys=True)+"\n")
    atomic_write(outdir/"RESTORE_RECEIPT.json",json.dumps({"status":"RESTORE_VERIFIED_AFTER_PREQUAL_FAILURE",**state},indent=2,sort_keys=True)+"\n")
    return state

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

def validate_adapter(adapter, contract=None):
    missing=sorted(REQUIRED_ADAPTER-set(adapter))
    extra=sorted(set(adapter)-REQUIRED_ADAPTER-{"timeout_seconds","notes","preflight_argv","verify_restore_argv","telemetry_mode_argv"})
    if missing: raise ValueError("adapter missing: "+", ".join(missing))
    if extra: raise ValueError("adapter unknown fields: "+", ".join(extra))
    if adapter.get("schema")!="hbnf-live-sweep-adapter-v1":
        raise ValueError("adapter schema mismatch")
    if not isinstance(adapter.get("expected_release_id"),str) or not adapter["expected_release_id"].strip():
        raise ValueError("expected_release_id must be a nonempty string")
    for k in ["snapshot_argv","select_argv","telemetry_argv","restore_argv"]:
        validate_argv(k,adapter[k])
    for k in ("verify_restore_argv","telemetry_mode_argv"):
        if k in adapter:validate_argv(k,adapter[k])
    if contract=="foundation":
        missing_foundation=[k for k in ("verify_restore_argv","telemetry_mode_argv") if k not in adapter]
        if missing_foundation:raise ValueError("Foundation adapter missing: "+", ".join(missing_foundation))
    if "preflight_argv" in adapter:validate_argv("preflight_argv",adapter["preflight_argv"])
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

def validate_readonly_preflight(sample, expected_release_id, resume_snapshot=None):
    required=("schema","release_id","candidate","wled","matrix_ip","matrix_mac","matrix_uptime_seconds",
      "uptime_seconds","restart_count","matrix_on","matrix_brightness","packet20_enabled",
      "packet20_snapshot_valid","packet20_snapshot_id","packet20_snapshot_hash","packet20_restore_verified",
      "foundation_telemetry_enabled","aux_ip","aux_mac","aux_on","aux_live","aux_live_mode",
      "aux_live_ip","aux_led_count")
    missing=[k for k in required if sample.get(k) is None]
    if missing:raise ValueError("read-only preflight missing: "+", ".join(missing))
    if sample["schema"]!="hbnf-live-qualification-preflight-v1":raise ValueError("read-only preflight schema mismatch")
    if sample["release_id"]!=expected_release_id or sample["candidate"]!=expected_release_id:raise RuntimeError("preflight-release-identity-mismatch")
    if sample["matrix_on"] is not True or sample["matrix_brightness"]!=44:raise RuntimeError("preflight-matrix-output-or-brightness-mismatch")
    if resume_snapshot is None:
        if sample["packet20_enabled"] is True or sample["foundation_telemetry_enabled"] is True:
            raise RuntimeError("preflight-diagnostics-already-active")
    else:
        if sample["packet20_enabled"] is not True or sample["packet20_snapshot_valid"] is not True:
            raise RuntimeError("resume-preflight-no-active-valid-packet20-snapshot")
        if sample["packet20_restore_verified"] is True:
            raise RuntimeError("resume-preflight-snapshot-already-restored")
        if int(sample["packet20_snapshot_id"])!=int(resume_snapshot.get("snapshotId",-1)):
            raise RuntimeError("resume-preflight-snapshot-id-mismatch")
        if int(sample["packet20_snapshot_hash"])!=int(resume_snapshot.get("snapshotHash",-1)):
            raise RuntimeError("resume-preflight-snapshot-hash-mismatch")
        if sample["foundation_telemetry_enabled"] is not resume_snapshot.get("foundationTelemetryEnabledBefore"):
            raise RuntimeError("resume-preflight-foundation-telemetry-state-mismatch")
        if not isinstance(resume_snapshot.get("foundationTelemetryEnabledBefore"),bool):
            raise RuntimeError("resume-snapshot-missing-foundation-telemetry-prestate")
    if sample["aux_on"] is not True or not (sample["aux_live"] is True and sample["aux_live_mode"]=="DDP" and sample["aux_live_ip"]=="192.168.77.10" and sample["aux_led_count"]==22):raise RuntimeError("preflight-aux-native-ddp-source-mismatch")

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

def validate_r4_profile_set(r4_profile_dir, baseline_manifest_path, inventory, expected_r4_release):
    """Verify all 28 immutable R4 profiles against the committed baseline before device work."""
    manifest_path=pathlib.Path(baseline_manifest_path).resolve()
    if manifest_path!=R4_BASELINE_MANIFEST.resolve():
        raise RuntimeError(f"early-R4-baseline-manifest-path-not-authoritative: {manifest_path}")
    if hashlib.sha256(manifest_path.read_bytes()).hexdigest()!=R4_BASELINE_MANIFEST_SHA256:
        raise RuntimeError(f"early-R4-baseline-manifest-hash-mismatch: {manifest_path}")
    manifest=load(manifest_path)
    if (manifest.get("schema")!="hbnf-foundation-28-kernel-baseline-v1"
        or manifest.get("contract")!="foundation"
        or manifest.get("release_id")!=expected_r4_release
        or manifest.get("kernel_count")!=28
        or set(manifest.get("kernels",{}))!={str(i) for i in range(28)}):
        raise RuntimeError(f"early-R4-baseline-manifest-invalid: {manifest_path}")
    profile_dir=pathlib.Path(r4_profile_dir).resolve()
    for entry in inventory["entries"]:
        i=int(entry["runtime_kernel_index_expected"]); key=str(i)
        pinned=manifest["kernels"][key]
        if pinned.get("kernel_name")!=entry["kernel_name"]:
            raise RuntimeError(f"early-R4-baseline-kernel-unbound: index={i}")
        profile_path=profile_dir/f"{i:02d}_{entry['kernel_name']}.profile.json"
        if not profile_path.is_file() or hashlib.sha256(profile_path.read_bytes()).hexdigest()!=pinned.get("profile_sha256"):
            raise RuntimeError(f"early-R4-baseline-profile-hash-mismatch: {profile_path}")
        profile=load(profile_path).get("profile",{})
        if (profile.get("release_id")!=expected_r4_release
            or profile.get("kernel",{}).get("name")!=entry["kernel_name"]
            or profile.get("kernel",{}).get("variant_id")!=pinned.get("variant_id")):
            raise RuntimeError(f"early-R4-baseline-profile-identity-mismatch: {profile_path}")

def order_entries_for_early_baseline(entries, early_indices=(0,13)):
    """Check historically failing matched kernels first without dropping sweep entries."""
    by_index={int(e["runtime_kernel_index_expected"]):e for e in entries}
    if len(entries)!=28 or set(by_index)!=set(range(28)) or any(i not in by_index for i in early_indices):
        raise ValueError("early-R4 ordering requires the exact 28-kernel inventory and all requested kernels")
    return [by_index[i] for i in early_indices]+[e for e in entries if int(e["runtime_kernel_index_expected"]) not in early_indices]

def compare_profile_to_r4(candidate_path, r4_profile_dir, entry, frozen_policy, expected_r4_release,
                          r4_baseline_manifest=None):
    """Apply the unchanged frozen candidate/R4 distribution and resource ratios."""
    candidate=load(candidate_path).get("profile",{})
    slug=f"{int(entry['runtime_kernel_index_expected']):02d}_{entry['kernel_name']}.profile.json"
    baseline_path=pathlib.Path(r4_profile_dir)/slug
    baseline_manifest_path=pathlib.Path(r4_baseline_manifest) if r4_baseline_manifest else R4_BASELINE_MANIFEST
    baseline_manifest=load(baseline_manifest_path)
    if (baseline_manifest.get("schema")!="hbnf-foundation-28-kernel-baseline-v1"
        or baseline_manifest.get("contract")!="foundation"
        or baseline_manifest.get("release_id")!=expected_r4_release
        or baseline_manifest.get("kernel_count")!=28):
        raise RuntimeError(f"early-R4-baseline-manifest-invalid: {baseline_manifest_path}")
    baseline_doc=load(baseline_path)
    baseline=baseline_doc.get("profile",{})
    if baseline_doc.get("status")!="PASS" or baseline.get("release_id")!=expected_r4_release:
        raise RuntimeError(f"early-R4-baseline-invalid: {baseline_path}")
    kernel_index=str(int(entry["runtime_kernel_index_expected"]))
    pinned=baseline_manifest.get("kernels",{}).get(kernel_index)
    if not isinstance(pinned,dict) or pinned.get("kernel_name")!=entry["kernel_name"]:
        raise RuntimeError(f"early-R4-baseline-kernel-unbound: {baseline_path}")
    if hashlib.sha256(baseline_path.read_bytes()).hexdigest()!=pinned.get("profile_sha256"):
        raise RuntimeError(f"early-R4-baseline-profile-hash-mismatch: {baseline_path}")
    if candidate.get("qualification_eligible") is not True:
        raise RuntimeError(f"candidate-profile-ineligible: {candidate_path}")
    if candidate.get("kernel",{}).get("name")!=entry["kernel_name"] or baseline.get("kernel",{}).get("name")!=entry["kernel_name"]:
        raise RuntimeError(f"kernel-name-mismatch: {entry['kernel_name']}")
    if candidate.get("kernel",{}).get("variant_id")!=baseline.get("kernel",{}).get("variant_id"):
        raise RuntimeError(f"kernel-variant-not-comparable: {entry['kernel_name']}")
    cfg=frozen_policy["comparison"]["candidate_vs_baseline"]
    c_heap=candidate["heap"]; b_heap=baseline["heap"]
    checks={
      "fps_median":candidate["fps"]["median"] >= baseline["fps"]["median"]*cfg["fps_median_min_ratio"],
      "frame_p95_median":candidate["frame_ms"]["p95_median"] <= baseline["frame_ms"]["p95_median"]*cfg["frame_p95_max_ratio"],
      "frame_p99_median":candidate["frame_ms"]["p99_median"] <= baseline["frame_ms"]["p99_median"]*cfg["frame_p99_max_ratio"],
      "minimum_free_heap":c_heap["minimum_free_min"] >= b_heap["minimum_free_min"]*cfg["minimum_free_heap_min_ratio"],
      "largest_free_block":min(c_heap["largest_block_start"],c_heap["largest_block_end"]) >= min(b_heap["largest_block_start"],b_heap["largest_block_end"])*cfg["largest_free_block_min_ratio"],
    }
    result={"schema":"hbnf-candidate-vs-r4-kernel-profile-v1","status":"PASS" if all(checks.values()) else "FAIL",
      "kernel":entry["kernel_name"],"kernel_index":entry["runtime_kernel_index_expected"],
      "candidate_profile":str(candidate_path),"r4_profile":str(baseline_path),
      "candidate_release":candidate.get("release_id"),"r4_release":baseline.get("release_id"),
      "candidate_variant_id":candidate["kernel"]["variant_id"],"r4_variant_id":baseline["kernel"]["variant_id"],
      "checks":checks,"candidate_metrics":{"fps_median":candidate["fps"]["median"],"frame_p95_median":candidate["frame_ms"]["p95_median"],"frame_p99_median":candidate["frame_ms"]["p99_median"],"minimum_free_heap":c_heap["minimum_free_min"],"largest_free_block_min":min(c_heap["largest_block_start"],c_heap["largest_block_end"])},
      "r4_metrics":{"fps_median":baseline["fps"]["median"],"frame_p95_median":baseline["frame_ms"]["p95_median"],"frame_p99_median":baseline["frame_ms"]["p99_median"],"minimum_free_heap":b_heap["minimum_free_min"],"largest_free_block_min":min(b_heap["largest_block_start"],b_heap["largest_block_end"])}}
    return result

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
    if path.exists():
        raise RuntimeError(f"foundation soak evidence already exists; refusing to replace it: {path}")
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
            or (stop.get("aux_projection_active_required",True) and not bool(sample["aux_projection_active"])))
        catastrophic_streak=catastrophic_streak+1 if bad else 0
        if catastrophic_streak>=int(stop["consecutive_samples"]):
            append_jsonl_durable(path,sample)
            raise RuntimeError(f"catastrophic Foundation threshold crossed for {catastrophic_streak} consecutive samples: fps={sample['fps']} p99_ms={sample['frame_ms_p99']} aux_projection_active={sample['aux_projection_active']}")
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

def run_combined_feature_check(script,outdir,release_id,timeout):
    """Run the exact candidate-bound combined check inside the open snapshot."""
    argv=[sys.executable,str(pathlib.Path(script).resolve()),"--release-id",release_id,
          "--out",str(pathlib.Path(outdir).resolve()/"COMBINED_FEATURE_CHECK.json")]
    if not isinstance(argv,list) or not argv or not all(isinstance(x,str) and x for x in argv):
        raise ValueError("combined feature check requires a nonempty argv")
    values={"outdir":str(pathlib.Path(outdir).resolve()),"release_id":release_id}
    result=run_json(subst(argv,values),timeout=timeout)
    atomic_write(pathlib.Path(outdir)/"COMBINED_FEATURE_CHECK.json",json.dumps(result,indent=2,sort_keys=True)+"\n")
    if result.get("status")!="PASS":
        raise RuntimeError("combined-feature-check-failed:"+json.dumps(result,sort_keys=True))
    return result

def assert_same_snapshot(before, after):
    """Verify firmware's source-bound snapshot receipt, ignoring receipt-only fields."""
    expected_id=before.get("snapshotId"); expected_hash=before.get("snapshotHash")
    if not isinstance(expected_id,int) or not isinstance(expected_hash,int):
        # Legacy adapters bind selected renderer fields directly rather than a
        # firmware snapshot hash. Require every captured field to match; ignore
        # additional restore receipt metadata.
        if not isinstance(before,dict) or not before or any(after.get(k)!=v for k,v in before.items()):
            raise RuntimeError("post-restore visual-state snapshot does not match pre-sweep snapshot")
        return
    if (after.get("snapshotId")!=expected_id or after.get("snapshotHash")!=expected_hash
        or after.get("restoreVerified") is not True or after.get("packet20Same") is not True
        or after.get("foundationTelemetryEnabled") is not before.get("foundationTelemetryEnabledBefore")):
        raise RuntimeError("post-restore visual-state snapshot does not match pre-sweep snapshot")

def set_foundation_telemetry(adapter, enabled, timeout):
    argv=subst(adapter["telemetry_mode_argv"],{"enabled":"true" if enabled else "false"})
    state=run_json(argv,timeout=timeout)
    actual=state.get("HBNF",{}).get("foundationTelemetry",{}).get("enabled")
    if actual is not enabled:
        raise RuntimeError(f"foundation telemetry mode readback mismatch: requested={enabled} actual={actual}")
    return actual

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
    ap.add_argument("--combined-check-script",help="candidate-bound combined-feature check run after all 28 kernels and before baseline freeze/soak inside the same renderer snapshot")
    ap.add_argument("--early-r4-profile-dir",help="exact R4 profile directory; when supplied, run historically failing kernel indices 0 and 13 first and stop before remaining kernels if frozen relative gates fail")
    ap.add_argument("--early-r4-baseline-manifest",default=str(ROOT/"evidence/hbnf-foundation-qualification-20261005/seq39/live/PRE_SOAK_BASELINE.json"),help="source-bound 28-kernel R4 baseline containing exact profile hashes")
    ap.add_argument("--early-r4-release",default="hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1")
    ap.add_argument("--compare-all-r4",action="store_true",help="after the early 0/13 gates, apply the same frozen relative profile/resource gates to every kernel against the exact R4 profile directory before starting any soak")
    ap.add_argument("--resume-snapshot-file",help="resume one exact previously captured, still-open Packet20 snapshot; never issues begin/snapshot")
    ap.add_argument("--resume-observer-proof",help="PASS observer-effect receipt for the exact expected release, required with --resume-snapshot-file")
    ap.add_argument("--dry-run",action="store_true")
    args=ap.parse_args()

    adapter=load(args.adapter); validate_adapter(adapter,args.contract)
    inventory=load(args.inventory); validate_inventory(inventory)
    resume_snapshot=None
    if args.resume_snapshot_file:
        if args.contract!="foundation":
            raise SystemExit("--resume-snapshot-file requires --contract foundation")
        if not args.resume_observer_proof:
            raise SystemExit("--resume-snapshot-file requires --resume-observer-proof")
        resume_snapshot=load(args.resume_snapshot_file)
        observer=load(args.resume_observer_proof)
        effect=observer.get("observer_effect",{})
        if (observer.get("status")!="PASS" or observer.get("candidate_release")!=adapter["expected_release_id"]
            or effect.get("candidate_release")!=adapter["expected_release_id"]
            or effect.get("status")!="MEASURED_ON_CURRENT_ARTIFACT"):
            raise SystemExit("resume observer proof is not a PASS for the exact expected release")
        if (type(resume_snapshot.get("snapshotId")) is not int
            or type(resume_snapshot.get("snapshotHash")) is not int
            or not isinstance(resume_snapshot.get("foundationTelemetryEnabledBefore"),bool)):
            raise SystemExit("resume snapshot file lacks exact snapshot ID/hash or telemetry prestate")
    if args.qualify and args.contract!="foundation":
        raise SystemExit("--qualify requires --contract foundation")
    if args.compare_all_r4 and not args.early_r4_profile_dir:
        raise SystemExit("--compare-all-r4 requires --early-r4-profile-dir")
    if args.early_r4_profile_dir:
        try:validate_r4_profile_set(args.early_r4_profile_dir,args.early_r4_baseline_manifest,inventory,args.early_r4_release)
        except (OSError,ValueError,KeyError,RuntimeError) as e:raise SystemExit(f"R4 comparison preflight failed before device access: {e}")
    try:validate_soak_options(args.contract,args.soak_seconds,args.soak_interval_seconds)
    except ValueError as e:raise SystemExit(str(e))
    try:
        outdir=prepare_output_dir(args.outdir)
    except (OSError,RuntimeError) as e:
        print(json.dumps({"status":"BLOCKED_BEFORE_DEVICE_PREFLIGHT","error":str(e)},indent=2))
        return 2
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
        preflight_argv=adapter.get("preflight_argv",adapter["telemetry_argv"])
        preflight=run_json(subst(preflight_argv,{"session_id":str(outdir)}),timeout=timeout)
        atomic_write(outdir/"PRE_SWEEP_TELEMETRY.json",json.dumps(preflight,indent=2,sort_keys=True)+"\n")
    except Exception as e:
        failure={"status":"READONLY_PREFLIGHT_FAILED","error":str(e),"device_mutation_started":False}
        try:atomic_write(outdir/"PRE_SWEEP_ABORT.json",json.dumps(failure,indent=2,sort_keys=True)+"\n")
        except Exception as evidence_error:failure["evidence_write_error"]=str(evidence_error)
        print(json.dumps(failure,indent=2))
        return 2
    try:
        if preflight.get("schema")=="hbnf-live-qualification-preflight-v1":
            validate_readonly_preflight(preflight,adapter["expected_release_id"],resume_snapshot)
        else:validate_sample(preflight,args.contract)
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
    telemetry_mode_before=None
    reserve=None
    try:
        # Hold real disk blocks so an unexpected host-full condition can still
        # release space for the mandatory restore response and state evidence.
        reserve=create_recovery_reserve(outdir)
        if resume_snapshot is not None:
            # Reuse only the exact snapshot already confirmed by the read-only
            # preflight above. This path cannot issue a second begin/snapshot.
            snapshot=resume_snapshot
        else:
            snapshot=run_json(subst(adapter["snapshot_argv"],{"observer_output":str(outdir/"OBSERVER_EFFECT.json")}),timeout=timeout)
        atomic_write(snapfile,json.dumps(snapshot,indent=2,sort_keys=True)+"\n")
        telemetry_mode_before=snapshot.get("foundationTelemetryEnabledBefore")
        if args.contract=="foundation":
            if not isinstance(telemetry_mode_before,bool):
                raise RuntimeError("snapshot did not preserve pre-transaction foundation telemetry mode")
            # The observer window intentionally ends with tails OFF; kernel profiling
            # requires the histogram contract, so explicitly enable and verify it.
            set_foundation_telemetry(adapter,True,timeout)
        entries=inventory["entries"]
        if args.early_r4_profile_dir:
            entries=order_entries_for_early_baseline(entries)
            frozen_policy=load(args.threshold_policy or str(ROOT/"config/HBNF_FOUNDATION_QUALIFICATION_POLICY_20261006_SUSTAINED_R1.json"))
        for entry in entries:
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
            kernel_index=int(entry["runtime_kernel_index_expected"])
            compare_this=(args.early_r4_profile_dir is not None and
                (kernel_index in (0,13) or args.compare_all_r4))
            if compare_this:
                comparison=compare_profile_to_r4(profile,args.early_r4_profile_dir,entry,frozen_policy,args.early_r4_release,args.early_r4_baseline_manifest)
                label="EARLY_R4" if kernel_index in (0,13) else "R4"
                atomic_write(outdir/f"{label}_COMPARISON_KERNEL_{kernel_index}.json",json.dumps(comparison,indent=2,sort_keys=True)+"\n")
                if comparison["status"]!="PASS":
                    gate="early-matched-R4" if kernel_index in (0,13) else "frozen-R4"
                    raise RuntimeError(f"{gate}-kernel-gate-failed: {entry['kernel_name']}: {json.dumps(comparison['checks'],sort_keys=True)}")
        soak_result=None
        if args.soak_seconds:
            if args.contract!="foundation":raise ValueError("--soak-seconds requires --contract foundation")
            if not args.combined_check_script:
                raise ValueError("integrated Foundation soak requires the frozen combined-feature check before baseline freeze")
            combined_result=run_combined_feature_check(args.combined_check_script,outdir,expected_release_id,timeout)
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
            soak_result["combined_feature_check_path"]=str(outdir/"COMBINED_FEATURE_CHECK.json")
            soak_result["combined_feature_check_status"]=combined_result["status"]
            soak_result["pre_soak_manifest_path"]=str(pre_soak_path)
            soak_result["threshold_freeze_receipt_path"]=str(freeze_receipt)
            soak_result["threshold_freeze_receipt_sha256"]=__import__("hashlib").sha256(freeze_receipt.read_bytes()).hexdigest()
            # Apply the already-frozen per-kernel baseline-relative gates to
            # the complete 90-minute JSONL before declaring Foundation PASS.
            audit_path=outdir/"FOUNDATION_SOAK_AUDIT.json"
            audit_cmd=[sys.executable,str(ROOT/"scripts/hbnf_foundation_soak_audit.py"),
                "--input",str(outdir/"FOUNDATION_SOAK.jsonl"),
                "--inventory",str(pathlib.Path(args.inventory).resolve()),
                "--expected-release",expected_release_id,
                "--baseline",str(baseline_path),"--policy",str(pathlib.Path(args.threshold_policy).resolve()),
                "--output",str(audit_path)]
            audit_proc=subprocess.run(audit_cmd,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            atomic_write(outdir/"FOUNDATION_SOAK_AUDIT_STDOUT.txt",audit_proc.stdout)
            atomic_write(outdir/"FOUNDATION_SOAK_AUDIT_STDERR.txt",audit_proc.stderr)
            audit_result=load(audit_path) if audit_path.is_file() else {}
            soak_result["audit_path"]=str(audit_path)
            soak_result["audit_status"]=audit_result.get("status")
            if audit_proc.returncode!=0 or audit_result.get("status")!="PASS" or (audit_result.get("foundation_qualification") or {}).get("status")!="PASS":
                raise RuntimeError("foundation-soak-audit-failed: "+json.dumps(audit_result.get("errors",[]),sort_keys=True))
    except Exception as e:
        run_error=str(e)
        if snapshot is None and reserve is not None:
            post_restore_state=reconcile_verified_observer_restore(outdir)
            if post_restore_state is None:
                restore_error=(
                    "snapshot command did not return a verifiable snapshot and no matching verified observer-sidecar restore exists; "
                    "renderer state is uncertain; stop live testing and preserve exact recovery path"
                )
    finally:
        if reserve is not None:
            try:reserve.unlink()
            except FileNotFoundError:pass
            except Exception as e:restore_error=f"could-not-release-restore-evidence-reserve: {e}"
        if snapshot is not None:
            if args.contract=="foundation":
                try:set_foundation_telemetry(adapter,telemetry_mode_before,timeout)
                except Exception as e:restore_error=(f"{restore_error}; " if restore_error else "")+f"telemetry-mode-restore-failed: {e}"
            try:
                restore_stdout=run_ok(subst(adapter["restore_argv"],{
                    "snapshot_file":str(snapfile),
                    "restore_raw_state":str(outdir/"POST_RESTORE_RAW_STATE.json")
                }),timeout=max(timeout,20))
                verify_argv=adapter.get("verify_restore_argv",adapter["restore_argv"])
                post_restore_state=run_json(subst(verify_argv,{
                    "snapshot_file":str(snapfile),"session_id":str(outdir.resolve())
                }),timeout=timeout)
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

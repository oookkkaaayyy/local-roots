#!/usr/bin/env python3
"""Independent telemetry sampler and kernel selector for Foundation soak.

The sampler and state changer run as separate OS processes. A slow kernel-select
acknowledgement therefore cannot block the telemetry cadence. Every telemetry
sample is validated and fsynced immediately; selector commands are recorded in
a separate JSONL stream. A slow/broken telemetry read fails closed at its own
bounded timeout instead of creating a long silent evidence gap.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import signal
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import hbnf_live_kernel_sweep as sweep

SAMPLE_PERIOD_SECONDS = 5.0
# The telemetry adapter now performs a 5.5s parallel-read batch. Keep enough
# room for process startup/JSON serialization while remaining below the 15s
# maximum allowed inter-sample gap.
SAMPLE_COMMAND_TIMEOUT_SECONDS = 7.0
SELECT_PERIOD_SECONDS = 6.0
SELECT_COMMAND_TIMEOUT_SECONDS = 30.0


def _append(path: pathlib.Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = (json.dumps(value, separators=(",", ":"), sort_keys=True) + "\n").encode()
    fd = os.open(path, os.O_CREAT | os.O_APPEND | os.O_WRONLY, 0o600)
    try:
        offset = 0
        while offset < len(raw):
            offset += os.write(fd, raw[offset:])
        os.fsync(fd)
    finally:
        os.close(fd)


def _atomic(path: pathlib.Path, value: dict) -> None:
    sweep.atomic_write(path, json.dumps(value, indent=2, sort_keys=True) + "\n")


def _stop_process(proc: subprocess.Popen) -> None:
    if proc.poll() is not None:
        return
    try:
        if os.name == "posix":
            os.killpg(proc.pid, signal.SIGTERM)
        else:
            proc.terminate()
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        if os.name == "posix":
            os.killpg(proc.pid, signal.SIGKILL)
        else:
            proc.kill()
        proc.wait()


def _sampler_worker(argv: list[str], entries: list[dict], outdir: pathlib.Path,
                    duration: float, expected_release: str, expected_restart: int,
                    previous_uptime: float, policy: dict, period: float,
                    command_timeout: float, initial_delay: float = 0.0,
                    include_boundary_sample: bool = False,
                    expected_kernel_id: int | None = None,
                    expected_variant_id: int | None = None,
                    expected_trace_armed: bool | None = None,
                    expected_cpu_mhz: int | None = None) -> int:
    path = outdir / "FOUNDATION_SOAK.jsonl"
    failure = outdir / "TELEMETRY_SAMPLER_FAILURE.json"
    started = time.monotonic()
    end = started + duration
    next_start = started + initial_delay
    previous_sample_time = None
    observed: set[int] = set()
    catastrophic_streak = 0
    count = 0
    by_id = {int(e["runtime_kernel_index_expected"]): e for e in entries}
    while next_start < end or (include_boundary_sample and next_start == end):
        if next_start > end:
            break
        delay = next_start - time.monotonic()
        if delay > 0:
            time.sleep(delay)
        scheduled_start = next_start
        sample = None
        persisted = False
        try:
            p = subprocess.run(argv, text=True, capture_output=True,
                               timeout=command_timeout, check=False)
            if p.returncode:
                raise RuntimeError(f"telemetry command failed rc={p.returncode}: {p.stderr[-1200:]}")
            sample = json.loads(p.stdout)
            sample["sample_time"] = time.monotonic()
            # Save the exact returned response before any contract check can reject it.
            _append(path, sample)
            persisted = True
            # Optional exact diagnostic contract. These checks run per sample
            # so a changed kernel/variant, trace mode, or CPU clock invalidates
            # the window immediately while preserving the failing evidence.
            if expected_kernel_id is not None and int(sample.get("kernel_id", -1)) != expected_kernel_id:
                raise RuntimeError(f"diagnostic-sample-contract:kernel-id:{sample.get('kernel_id')}!={expected_kernel_id}")
            if expected_variant_id is not None and int(sample.get("variant_id", -1)) != expected_variant_id:
                raise RuntimeError(f"diagnostic-sample-contract:variant-id:{sample.get('variant_id')}!={expected_variant_id}")
            if expected_trace_armed is not None and sample.get("trace_armed") is not expected_trace_armed:
                raise RuntimeError(f"diagnostic-sample-contract:trace-armed:{sample.get('trace_armed')}!={expected_trace_armed}")
            if expected_cpu_mhz is not None:
                clocks=(sample.get("trace_cpu_mhz_start"),sample.get("trace_cpu_mhz_readback"))
                if clocks != (expected_cpu_mhz,expected_cpu_mhz):
                    raise RuntimeError(f"diagnostic-sample-contract:cpu-mhz:{clocks}!={(expected_cpu_mhz,expected_cpu_mhz)}")
            if expected_trace_armed is not None and sample.get("trace_records_serialized") is not False:
                raise RuntimeError("diagnostic-sample-contract:trace-records-serialized-during-window")
            sweep.validate_sample(sample, "foundation")
            sweep.enforce_foundation_frame_interval(sample)
            release, restart, uptime = sweep.validate_continuity(
                sample, expected_release, expected_restart, previous_uptime)
            kid = int(sample["kernel_id"])
            entry = by_id.get(kid)
            if entry is None or str(sample.get("kernel_name")) != str(entry["kernel_name"]):
                raise RuntimeError(f"telemetry runtime-kernel identity outside inventory: {kid}/{sample.get('kernel_name')}")
            if previous_sample_time is not None:
                gap = sample["sample_time"] - previous_sample_time
                if gap <= 0 or gap > sweep.MAX_FOUNDATION_SOAK_SAMPLE_GAP_SECONDS:
                    raise RuntimeError(f"foundation soak sample gap invalid: {gap:.3f}s; maximum {sweep.MAX_FOUNDATION_SOAK_SAMPLE_GAP_SECONDS}s")
            previous_uptime, previous_sample_time = uptime, sample["sample_time"]
            stop = policy["catastrophic_early_stop"]
            bad = (float(sample["fps"]) < float(stop["fps_floor_absolute"])
                   or float(sample["frame_ms_p99"]) > float(stop["frame_ms_p99_ceiling_absolute"])
                   or (stop.get("aux_projection_active_required", True)
                       and not bool(sample["aux_projection_active"])))
            catastrophic_streak = catastrophic_streak + 1 if bad else 0
            count += 1
            observed.add(kid)
            if catastrophic_streak >= int(stop["consecutive_samples"]):
                raise RuntimeError(f"catastrophic Foundation threshold crossed for {catastrophic_streak} consecutive telemetry samples")
            if count == 3:
                first_three = path.read_bytes().splitlines(keepends=True)[:3]
                import hashlib
                _atomic(outdir / "PARALLEL_LANES_READY.json", {
                    "schema": "hbnf-foundation-parallel-ready-v1",
                    "status": "PARALLEL_LANES_READY",
                    "release_id": expected_release,
                    "first_clean_soak_samples": 3,
                    "first_sample_kernel_ids": [json.loads(x)["kernel_id"] for x in first_three],
                    "restart_count": restart,
                    "aux_projection_active": bool(sample["aux_projection_active"]),
                    "sample_sha256": hashlib.sha256(b"".join(first_three)).hexdigest(),
                    "sample_file": str(path),
                    "sampler_pid": os.getpid(),
                    "note": "Independent telemetry sampler is healthy; signal does not authorize device mutation."})
        except Exception as exc:
            if sample is not None and not persisted:
                _append(path, sample)
            _atomic(failure, {"status": "FAIL", "error": f"{type(exc).__name__}: {exc}",
                              "sample_count": count, "last_sample_time_monotonic": previous_sample_time,
                              "failing_sample": sample,
                              "sampler_pid": os.getpid()})
            return 2
        next_start = scheduled_start + period
        now = time.monotonic()
        if next_start <= now:
            # This observer is a safety monitor: a late completion means a
            # scheduled sample was missed. Preserve the sample above, record
            # the gap, and fail closed instead of silently shifting cadence.
            _atomic(failure, {"status":"FAIL", "error":"telemetry-sample-schedule-overrun",
                              "sample_count":count,"last_sample_time_monotonic":previous_sample_time,
                              "next_sample_deadline_monotonic":next_start,
                              "overrun_seconds":now-next_start,"sampler_pid":os.getpid()})
            return 2
    _atomic(outdir / "SAMPLER_PROGRESS.json", {
        "status": "COMPLETE", "sample_count": count,
        "observed_kernel_ids": sorted(observed), "sampler_pid": os.getpid(),
        "duration_seconds": time.monotonic() - started})
    return 0


def _selector_worker(argv_template: list[str], entries: list[dict], outdir: pathlib.Path,
                     duration: float, period: float, command_timeout: float) -> int:
    path = outdir / "FOUNDATION_STATE_CHANGES.jsonl"
    failure = outdir / "STATE_CHANGER_FAILURE.json"
    started = time.monotonic()
    end = started + duration
    next_start = started
    count = 0
    while time.monotonic() < end:
        delay = next_start - time.monotonic()
        if delay > 0:
            time.sleep(delay)
        entry = entries[count % len(entries)]
        values = {"effect_id": entry["effect_id"],
                  "kernel_name": entry["kernel_name"],
                  "runtime_kernel_index": entry.get("runtime_kernel_index_expected"),
                  "preset": entry.get("preset"),
                  "session_id": str(outdir.resolve())}
        record = {"select_index": count, "kernel_id": int(entry["runtime_kernel_index_expected"]),
                  "kernel_name": entry["kernel_name"], "started_at_monotonic": time.monotonic(),
                  "selector_pid": os.getpid()}
        try:
            command = sweep.subst(argv_template, values)
            p = subprocess.run(command, text=True, capture_output=True,
                               timeout=command_timeout, check=False)
            if p.returncode:
                raise RuntimeError(f"state-change command failed rc={p.returncode}: {p.stderr[-1200:]}")
            record.update({"status": "PASS", "completed_at_monotonic": time.monotonic()})
            _append(path, record)
            count += 1
        except Exception as exc:
            record.update({"status": "FAIL", "error": f"{type(exc).__name__}: {exc}",
                           "completed_at_monotonic": time.monotonic()})
            _append(path, record)
            _atomic(failure, record)
            return 2
        next_start += period
        if next_start <= time.monotonic():
            # A lagging selector skips missed slots; the sampler remains independent.
            next_start = time.monotonic() + period
    _atomic(outdir / "STATE_CHANGER_PROGRESS.json", {
        "status": "COMPLETE", "selection_count": count,
        "selected_kernel_ids": sorted({int(e["runtime_kernel_index_expected"]) for e in entries}),
        "selector_pid": os.getpid(), "duration_seconds": time.monotonic() - started})
    return 0


def run(adapter: dict, inventory: dict, outdir: str | pathlib.Path, duration_seconds: float,
        release_id: str, restart_count: int, previous_uptime: float, policy: dict,
        sample_period: float = SAMPLE_PERIOD_SECONDS,
        sample_timeout: float = SAMPLE_COMMAND_TIMEOUT_SECONDS,
        select_period: float = SELECT_PERIOD_SECONDS,
        select_timeout: float = SELECT_COMMAND_TIMEOUT_SECONDS,
        require_kernel_coverage: bool = True) -> dict:
    """Run independent sampler and selector children; preserve JSONL on any error."""
    sweep.validate_adapter(adapter)
    sweep.validate_inventory(inventory)
    if duration_seconds <= 0 or not 0 < sample_period < sweep.MAX_FOUNDATION_SOAK_SAMPLE_GAP_SECONDS:
        raise ValueError("duration must be positive and sample period must remain below the 15s gap limit")
    if not 0 < select_period < duration_seconds or sample_timeout <= 0 or select_timeout <= 0:
        raise ValueError("invalid state-change period or command timeout")
    # Keep sampling beyond the selector's last possible in-flight command, and
    # leave two telemetry periods beyond that so response-time skew cannot make
    # a nominal 90-minute run audit short of 5,400 s.
    selector_duration = duration_seconds
    sampler_duration = duration_seconds + select_timeout + 2 * sample_period
    out = pathlib.Path(outdir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    sample_path = out / "FOUNDATION_SOAK.jsonl"
    sample_path.unlink(missing_ok=True)
    (out / "FOUNDATION_STATE_CHANGES.jsonl").unlink(missing_ok=True)
    entries = inventory["entries"]
    sample_values = {"effect_id": entries[0]["effect_id"],
                     "kernel_name": entries[0]["kernel_name"],
                     "runtime_kernel_index": entries[0].get("runtime_kernel_index_expected"),
                     "preset": entries[0].get("preset"), "session_id": str(out)}
    telemetry_argv = sweep.subst(adapter["telemetry_argv"], sample_values)
    selector_argv = adapter["select_argv"]
    sampler_cmd = [sys.executable, str(pathlib.Path(__file__).resolve()), "--worker", "sampler",
                   "--worker-data", json.dumps({"argv": telemetry_argv, "entries": entries,
                    "outdir": str(out), "duration": sampler_duration, "release": release_id,
                    "restart": restart_count, "uptime": previous_uptime, "policy": policy,
                    "period": sample_period, "timeout": sample_timeout})]
    selector_cmd = [sys.executable, str(pathlib.Path(__file__).resolve()), "--worker", "selector",
                    "--worker-data", json.dumps({"argv": selector_argv, "entries": entries,
                     "outdir": str(out), "duration": selector_duration, "period": select_period,
                     "timeout": select_timeout})]
    started = time.monotonic()
    with (out / "SAMPLER_STDOUT.log").open("w") as sampler_stdout, (out / "SAMPLER_STDERR.log").open("w") as sampler_stderr, \
         (out / "SELECTOR_STDOUT.log").open("w") as selector_stdout, (out / "SELECTOR_STDERR.log").open("w") as selector_stderr:
        sampler = subprocess.Popen(sampler_cmd, stdout=sampler_stdout, stderr=sampler_stderr,
                                   start_new_session=(os.name == "posix"))
        selector = subprocess.Popen(selector_cmd, stdout=selector_stdout, stderr=selector_stderr,
                                    start_new_session=(os.name == "posix"))
        _atomic(out / "CONTINUOUS_SOAK_PROCESSES.json", {
            "schema": "hbnf-foundation-independent-soak-processes-v1",
            "status": "RUNNING", "started_at_monotonic": started,
            "sample_period_seconds": sample_period, "sample_command_timeout_seconds": sample_timeout,
            "selector_period_seconds": select_period, "selector_command_timeout_seconds": select_timeout,
            "sampler_pid": sampler.pid, "selector_pid": selector.pid,
            "requested_duration_seconds": duration_seconds, "sampler_duration_seconds": sampler_duration,
            "selector_duration_seconds": selector_duration,
            "telemetry_source": "existing exact candidate telemetry adapter"})
        try:
            while sampler.poll() is None or selector.poll() is None:
                if sampler.poll() not in (None, 0):
                    failure = out / "TELEMETRY_SAMPLER_FAILURE.json"
                    detail = json.loads(failure.read_text()).get("error") if failure.is_file() else "sampler process exited without a failure receipt"
                    raise RuntimeError(f"continuous Foundation telemetry sampler failed: {detail}")
                if selector.poll() not in (None, 0):
                    failure = out / "STATE_CHANGER_FAILURE.json"
                    detail = json.loads(failure.read_text()).get("error") if failure.is_file() else "state changer exited without a failure receipt"
                    raise RuntimeError(f"continuous Foundation state changer failed: {detail}")
                time.sleep(0.25)
            if sampler.returncode != 0:
                raise RuntimeError("continuous Foundation telemetry sampler exited nonzero")
            if selector.returncode != 0:
                raise RuntimeError("continuous Foundation state changer exited nonzero")
        except BaseException:
            for proc in (sampler, selector):
                _stop_process(proc)
            _atomic(out / "CONTINUOUS_SOAK_PROCESSES.json", {
                "schema": "hbnf-foundation-independent-soak-processes-v1", "status": "FAIL",
                "elapsed_seconds": time.monotonic() - started,
                "sampler_returncode": sampler.returncode, "selector_returncode": selector.returncode,
                "sample_count": sum(1 for _ in sample_path.open()) if sample_path.is_file() else 0})
            raise
    lines = sample_path.read_text().splitlines() if sample_path.exists() else []
    if not lines:
        raise RuntimeError("continuous Foundation soak ended without telemetry samples")
    last = json.loads(lines[-1])
    observed = {int(json.loads(line)["kernel_id"]) for line in lines}
    selector_lines = (out / "FOUNDATION_STATE_CHANGES.jsonl").read_text().splitlines()
    selected = {int(json.loads(line)["kernel_id"]) for line in selector_lines}
    if require_kernel_coverage and selected != set(range(28)):
        raise RuntimeError(f"state changer did not issue all 28 kernel selections ({len(selected)}/28)")
    if require_kernel_coverage and observed != set(range(28)):
        raise RuntimeError(f"continuous telemetry did not observe all 28 runtime kernels ({len(observed)}/28)")
    duration = float(last["sample_time"]) - float(json.loads(lines[0])["sample_time"])
    _atomic(out / "CONTINUOUS_SOAK_PROCESSES.json", {
        "schema": "hbnf-foundation-independent-soak-processes-v1", "status": "COMPLETE",
        "elapsed_seconds": time.monotonic() - started, "sample_count": len(lines),
        "telemetry_observed_kernel_ids": sorted(observed), "state_changed_kernel_ids": sorted(selected),
        "sampler_pid": sampler.pid, "selector_pid": selector.pid,
        "sample_timeline_seconds": duration,
        "max_gap_seconds": max((float(json.loads(b)["sample_time"])-float(json.loads(a)["sample_time"])
                                 for a,b in zip(lines,lines[1:])), default=0.0),
        "telemetry_file": str(sample_path), "state_change_file": str(out / "FOUNDATION_STATE_CHANGES.jsonl")})
    return {"path": str(sample_path), "state_change_path": str(out / "FOUNDATION_STATE_CHANGES.jsonl"),
            "sample_count": len(lines), "duration_seconds": duration,
            "max_gap_seconds": max((float(json.loads(b)["sample_time"])-float(json.loads(a)["sample_time"])
                                     for a,b in zip(lines,lines[1:])), default=0.0),
            "observed_kernel_count": len(observed), "state_changed_kernel_count": len(selected),
            "sampler_process_count": 1, "selector_process_count": 1}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--worker", choices=("sampler", "selector"))
    parser.add_argument("--worker-data")
    args = parser.parse_args()
    data = json.loads(args.worker_data)
    if args.worker == "sampler":
        return _sampler_worker(data["argv"], data["entries"], pathlib.Path(data["outdir"]),
            float(data["duration"]), data["release"], int(data["restart"]), float(data["uptime"]),
            data["policy"], float(data["period"]), float(data["timeout"]),
            float(data.get("initial_delay",0.0)),bool(data.get("include_boundary_sample",False)))
    return _selector_worker(data["argv"], data["entries"], pathlib.Path(data["outdir"]),
        float(data["duration"]), float(data["period"]), float(data["timeout"]))


if __name__ == "__main__":
    raise SystemExit(main())

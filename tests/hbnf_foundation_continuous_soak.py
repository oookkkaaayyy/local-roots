#!/usr/bin/env python3
"""Offline regression: a 24.114s blocked selector cannot stall telemetry."""
from __future__ import annotations

import json
import pathlib
import subprocess
import sys
import tempfile
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import hbnf_foundation_continuous_soak as continuous


def entry(i):
    return {"effect_id": 220 + i, "kernel_name": f"effect-{i}",
            "runtime_kernel_index_expected": i, "preset": "default"}


def fixture():
    op = sys.argv[1]
    if op == "select":
        index = int(sys.argv[2])
        selected = pathlib.Path(sys.argv[3])
        delay = float(sys.argv[4]) if index == 0 else 0
        if delay:
            time.sleep(delay)
        selected.write_text(str(index))
        print("selected")
        return 0
    if op == "telemetry":
        selected = pathlib.Path(sys.argv[2])
        kernel = int(selected.read_text()) if selected.exists() else 0
        sample = {
            "release_id": "candidate-r1", "uptime_seconds": 100.0,
            "fps": 42.0, "frame_ms_p50": 18.0, "frame_ms_p95": 24.0,
            "frame_ms_p99": 28.0, "frame_ms_max": 35.0,
            "kernel_id": kernel, "kernel_name": f"effect-{kernel}",
            "variant_id": "default", "free_heap_bytes": 100000,
            "minimum_free_heap_bytes": 95000, "largest_free_block_bytes": 90000,
            "websocket_clients": 0, "aux_projection_active": True,
            "aux_projection_age_ms": 10, "aux_render_fps": 42.0,
            "wifi_rssi_dbm": -48, "restart_count": 0,
            "kernel_ms_avg": 5.0, "kernel_ms_p95": 7.0,
            "palette_ms_avg": 0.5, "palette_ms_p95": 1.0,
            "audio_ms_avg": 1.0, "audio_ms_p95": 2.0,
            "scheduler_ms_avg": 1.0, "scheduler_ms_p95": 2.0,
            "overlay_ms_avg": 0.1, "overlay_ms_p95": 0.2,
            "aux_prepare_send_ms_avg": 0.1, "aux_prepare_send_ms_p95": 0.2,
            "unaccounted_ms_avg": 5.0, "unaccounted_ms_p95": 7.0,
        }
        print(json.dumps(sample))
        return 0
    raise SystemExit(f"unknown fixture op {op}")


if __name__ == "__main__" and len(sys.argv) > 1 and sys.argv[1] in ("select", "telemetry"):
    raise SystemExit(fixture())


with tempfile.TemporaryDirectory(prefix="hbnf-independent-soak-") as temp:
    out = pathlib.Path(temp)
    selected = out / "selected-kernel.txt"
    entries = [entry(i) for i in range(28)]
    adapter = {
        "schema": "hbnf-live-sweep-adapter-v1",
        "snapshot_argv": [sys.executable, __file__, "telemetry", str(selected)],
        "select_argv": [sys.executable, __file__, "select", "{runtime_kernel_index}", str(selected), "24.114"],
        "telemetry_argv": [sys.executable, __file__, "telemetry", str(selected)],
        "restore_argv": [sys.executable, __file__, "telemetry", "{snapshot_file}"],
        "settle_seconds": 1, "sample_seconds": 1, "sample_interval_seconds": 1,
        "expected_release_id": "candidate-r1",
    }
    result = continuous.run(
        adapter, {"schema": "hbnf-kernel-sweep-inventory-v1", "entries": entries}, out,
        duration_seconds=26.5, release_id="candidate-r1", restart_count=0,
        previous_uptime=99.0, policy={"catastrophic_early_stop": {
            "fps_floor_absolute": 20, "frame_ms_p99_ceiling_absolute": 75,
            "aux_projection_active_required": True, "consecutive_samples": 3}},
        sample_period=1.0, sample_timeout=3.0, select_period=1.0,
        select_timeout=26.0, require_kernel_coverage=False)
    samples = [json.loads(x) for x in (out / "FOUNDATION_SOAK.jsonl").read_text().splitlines()]
    selections = [json.loads(x) for x in (out / "FOUNDATION_STATE_CHANGES.jsonl").read_text().splitlines()]
    ready = json.loads((out / "PARALLEL_LANES_READY.json").read_text())
    gaps = [b["sample_time"] - a["sample_time"] for a, b in zip(samples, samples[1:])]
    assert result["sample_count"] >= 20, result
    assert max(gaps) < 5.0, max(gaps)
    assert any(x["completed_at_monotonic"] - x["started_at_monotonic"] >= 24.0 for x in selections), selections
    assert result["max_gap_seconds"] == max(gaps)
    assert ready["status"] == "PARALLEL_LANES_READY", ready
    assert ready["first_clean_soak_samples"] == 3 and ready["sample_sha256"], ready
    print(f"PASS: telemetry remained continuous ({len(samples)} samples; max gap {max(gaps):.3f}s) while selector was blocked 24.114s")
    print("PASS: parallel-ready signal is emitted only after three valid persisted telemetry samples")

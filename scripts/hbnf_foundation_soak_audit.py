#!/usr/bin/env python3
"""Offline structural audit for a captured, state-changing Foundation soak.

This tool consumes JSONL only. It performs no network requests or device writes.
Performance acceptance thresholds remain a separate, pre-frozen policy input.
"""
from __future__ import annotations

import argparse
import json
import pathlib


REQUIRED = (
    "sample_time", "release_id", "uptime_seconds", "fps",
    "frame_ms_p50", "frame_ms_p95", "frame_ms_p99", "frame_ms_max",
    "kernel_id", "kernel_name", "variant_id", "free_heap_bytes",
    "minimum_free_heap_bytes", "largest_free_block_bytes",
    "websocket_clients", "aux_projection_active", "aux_projection_age_ms",
    "aux_render_fps", "wifi_rssi_dbm", "restart_count",
)
MIN_DURATION_SECONDS = 90 * 60
MAX_SAMPLE_GAP_SECONDS = 15


def read_json(path: str) -> dict:
    return json.loads(pathlib.Path(path).read_text())


def read_jsonl(path: str) -> list[dict]:
    samples = []
    for line_no, line in enumerate(pathlib.Path(path).read_text().splitlines(), 1):
        if not line.strip():
            continue
        try:
            sample = json.loads(line)
        except Exception as exc:
            raise ValueError(f"invalid JSONL line {line_no}: {exc}") from exc
        if not isinstance(sample, dict):
            raise ValueError(f"JSONL line {line_no} is not an object")
        samples.append(sample)
    return samples


def audit(samples: list[dict], inventory: dict, expected_release: str,
          minimum_duration_seconds: int = MIN_DURATION_SECONDS) -> dict:
    errors: list[str] = []
    if minimum_duration_seconds < MIN_DURATION_SECONDS:
        errors.append("minimum duration cannot be less than 90 minutes")
    if not samples:
        errors.append("no soak samples")
        return {"status": "FAIL", "errors": errors, "sample_count": 0}

    entries = inventory.get("entries")
    if not isinstance(entries, list) or len(entries) != 28:
        errors.append("inventory must contain exactly 28 entries")
        expected_ids: set[int] = set()
    else:
        expected_ids = {int(e["runtime_kernel_index_expected"]) for e in entries}
        if expected_ids != set(range(28)):
            errors.append("inventory runtime kernel indices must be the exact unique range 0..27")

    for index, sample in enumerate(samples):
        missing = [key for key in REQUIRED if sample.get(key) is None]
        if missing:
            errors.append(f"sample {index}: missing fields {','.join(missing)}")
            continue
        if sample.get("release_id") != expected_release:
            errors.append(f"sample {index}: release identity mismatch")
        try:
            kid = int(sample["kernel_id"])
            if kid not in expected_ids:
                errors.append(f"sample {index}: kernel id outside exact inventory")
            if not str(sample["kernel_name"]).strip() or not str(sample["variant_id"]).strip():
                errors.append(f"sample {index}: kernel/variant identity is empty")
        except (TypeError, ValueError):
            errors.append(f"sample {index}: invalid kernel identity")

    valid = [s for s in samples if all(s.get(k) is not None for k in REQUIRED)]
    timestamps = [float(s["sample_time"]) for s in valid]
    uptimes = [float(s["uptime_seconds"]) for s in valid]
    restarts = [int(s["restart_count"]) for s in valid]
    if len(valid) != len(samples):
        errors.append("incomplete samples prevent a full soak qualification")
    if timestamps:
        if any(b <= a for a, b in zip(timestamps, timestamps[1:])):
            errors.append("sample timestamps are not strictly increasing")
        duration = timestamps[-1] - timestamps[0]
        if duration < minimum_duration_seconds:
            errors.append(f"soak duration {duration:.1f}s is below required {minimum_duration_seconds}s")
        if any((b - a) > MAX_SAMPLE_GAP_SECONDS for a, b in zip(timestamps, timestamps[1:])):
            errors.append("sample gap exceeded 15 seconds")
    else:
        duration = 0.0
        errors.append("no complete samples")
    if any(b < a for a, b in zip(uptimes, uptimes[1:])):
        errors.append("uptime regressed")
    if restarts and len(set(restarts)) != 1:
        errors.append("restart count changed during soak")

    observed_ids = {int(s["kernel_id"]) for s in valid if str(s["kernel_id"]).lstrip("-").isdigit()}
    if expected_ids and observed_ids != expected_ids:
        errors.append(f"state-changing workload did not cover all 28 kernels ({len(observed_ids)}/28)")

    def nums(key: str) -> list[float]:
        return [float(s[key]) for s in valid if isinstance(s.get(key), (int, float))]

    frame_p95 = nums("frame_ms_p95")
    frame_p99 = nums("frame_ms_p99")
    frame_max = nums("frame_ms_max")
    minimum_heap = nums("minimum_free_heap_bytes")
    largest_block = nums("largest_free_block_bytes")
    return {
        "schema": "hbnf-foundation-soak-structural-audit-v1",
        "status": "PASS" if not errors else "FAIL",
        "errors": errors,
        "sample_count": len(samples),
        "valid_sample_count": len(valid),
        "duration_seconds": duration,
        "expected_release_id": expected_release,
        "observed_kernel_count": len(observed_ids),
        "expected_kernel_count": len(expected_ids),
        "restart_count": restarts[0] if restarts else None,
        "uptime_start_seconds": uptimes[0] if uptimes else None,
        "uptime_end_seconds": uptimes[-1] if uptimes else None,
        "minimum_free_heap_bytes": min(minimum_heap) if minimum_heap else None,
        "minimum_largest_free_block_bytes": min(largest_block) if largest_block else None,
        "frame_ms_p95_max_across_samples": max(frame_p95) if frame_p95 else None,
        "frame_ms_p99_max_across_samples": max(frame_p99) if frame_p99 else None,
        "frame_ms_max_max_across_samples": max(frame_max) if frame_max else None,
        "performance_thresholds": "NOT_EVALUATED__MUST_BE_FROZEN_BEFORE_SOAK",
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="captured soak JSONL; offline only")
    parser.add_argument("--inventory", required=True)
    parser.add_argument("--expected-release", required=True)
    parser.add_argument("--minimum-duration-seconds", type=int, default=MIN_DURATION_SECONDS)
    parser.add_argument("--output")
    args = parser.parse_args()
    result = audit(read_jsonl(args.input), read_json(args.inventory),
                   args.expected_release, args.minimum_duration_seconds)
    rendered = json.dumps(result, indent=2, sort_keys=True) + "\n"
    if args.output:
        pathlib.Path(args.output).write_text(rendered)
    print(rendered, end="")
    return 0 if result["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())

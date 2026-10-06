#!/usr/bin/env python3
"""Offline structural audit for a captured, state-changing Foundation soak.

This tool consumes JSONL only. It performs no network requests or device writes.
Performance acceptance thresholds remain a separate, pre-frozen policy input.
"""
from __future__ import annotations

import argparse
import json
import statistics
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
          minimum_duration_seconds: int = MIN_DURATION_SECONDS,
          baseline: dict | None = None, policy: dict | None = None) -> dict:
    errors: list[str] = []
    structural_errors: list[str] = []
    if minimum_duration_seconds < MIN_DURATION_SECONDS:
        structural_errors.append("minimum duration cannot be less than 90 minutes")
    if not samples:
        structural_errors.append("no soak samples")
        return {"status": "FAIL", "errors": errors, "sample_count": 0}

    entries = inventory.get("entries")
    if not isinstance(entries, list) or len(entries) != 28:
        structural_errors.append("inventory must contain exactly 28 entries")
        expected_ids: set[int] = set()
    else:
        expected_ids = {int(e["runtime_kernel_index_expected"]) for e in entries}
        if expected_ids != set(range(28)):
            structural_errors.append("inventory runtime kernel indices must be the exact unique range 0..27")

    for index, sample in enumerate(samples):
        missing = [key for key in REQUIRED if sample.get(key) is None]
        if missing:
            structural_errors.append(f"sample {index}: missing fields {','.join(missing)}")
            continue
        if sample.get("release_id") != expected_release:
            structural_errors.append(f"sample {index}: release identity mismatch")
        try:
            kid = int(sample["kernel_id"])
            if kid not in expected_ids:
                structural_errors.append(f"sample {index}: kernel id outside exact inventory")
            if not str(sample["kernel_name"]).strip() or not str(sample["variant_id"]).strip():
                structural_errors.append(f"sample {index}: kernel/variant identity is empty")
        except (TypeError, ValueError):
            structural_errors.append(f"sample {index}: invalid kernel identity")

    valid = [s for s in samples if all(s.get(k) is not None for k in REQUIRED)]
    timestamps = [float(s["sample_time"]) for s in valid]
    uptimes = [float(s["uptime_seconds"]) for s in valid]
    restarts = [int(s["restart_count"]) for s in valid]
    if len(valid) != len(samples):
        structural_errors.append("incomplete samples prevent a full soak qualification")
    if timestamps:
        if any(b <= a for a, b in zip(timestamps, timestamps[1:])):
            structural_errors.append("sample timestamps are not strictly increasing")
        duration = timestamps[-1] - timestamps[0]
        if duration < minimum_duration_seconds:
            structural_errors.append(f"soak duration {duration:.1f}s is below required {minimum_duration_seconds}s")
        if any((b - a) > MAX_SAMPLE_GAP_SECONDS for a, b in zip(timestamps, timestamps[1:])):
            structural_errors.append("sample gap exceeded 15 seconds")
    else:
        duration = 0.0
        structural_errors.append("no complete samples")
    if any(b < a for a, b in zip(uptimes, uptimes[1:])):
        structural_errors.append("uptime regressed")
    if restarts and len(set(restarts)) != 1:
        structural_errors.append("restart count changed during soak")

    observed_ids = {int(s["kernel_id"]) for s in valid if str(s["kernel_id"]).lstrip("-").isdigit()}
    if expected_ids and observed_ids != expected_ids:
        structural_errors.append(f"state-changing workload did not cover all 28 kernels ({len(observed_ids)}/28)")

    def nums(key: str) -> list[float]:
        return [float(s[key]) for s in valid if isinstance(s.get(key), (int, float))]

    frame_p95 = nums("frame_ms_p95")
    frame_p99 = nums("frame_ms_p99")
    frame_max = nums("frame_ms_max")
    minimum_heap = nums("minimum_free_heap_bytes")
    largest_block = nums("largest_free_block_bytes")
    per_kernel={}
    sustained_performance_errors=[]
    isolated_max_diagnostics=[]
    provisional_threshold_diagnostics=[]
    if baseline is not None or policy is not None:
        if not baseline or baseline.get("schema")!="hbnf-foundation-28-kernel-baseline-v1":
            structural_errors.append("fresh complete 28-kernel baseline missing/invalid")
        elif baseline.get("release_id")!=expected_release or baseline.get("kernel_count")!=28:
            structural_errors.append("fresh baseline is not bound to the exact candidate and 28-kernel contract")
        if not policy or policy.get("status")!="FROZEN":
            structural_errors.append("frozen Foundation policy missing/invalid")
        if baseline and policy:
            cfg=policy["comparison"]["candidate_vs_baseline"]
            base=baseline.get("kernels",{})
            for kid in sorted(expected_ids):
                rows=[s for s in valid if int(s["kernel_id"])==kid]
                b=base.get(str(kid))
                if not rows or not b:
                    qualification_errors.append(f"kernel {kid}: baseline or soak samples missing");continue
                vals=lambda k:[float(x[k]) for x in rows]
                metrics={"fps_median":statistics.median(vals("fps")),
                    "frame_p95_median":statistics.median(vals("frame_ms_p95")),
                    "frame_p99_median":statistics.median(vals("frame_ms_p99")),
                    "frame_max":max(vals("frame_ms_max")),
                    "minimum_free_heap":min(vals("minimum_free_heap_bytes")),
                    "largest_free_block_min":min(vals("largest_free_block_bytes")),
                    "aux_stale_fraction":sum(not bool(x["aux_projection_active"]) for x in rows)/len(rows)}
                checks={
                    "fps_median":metrics["fps_median"]>=float(b["fps_median"])*float(cfg["fps_median_min_ratio"]),
                    "frame_p95_median":metrics["frame_p95_median"]<=float(b["frame_p95_median"])*float(cfg["frame_p95_max_ratio"]),
                    "frame_p99_median":metrics["frame_p99_median"]<=float(b["frame_p99_median"])*float(cfg["frame_p99_max_ratio"]),
                    "minimum_free_heap":metrics["minimum_free_heap"]>=float(b["minimum_free_heap"])*float(cfg["minimum_free_heap_min_ratio"]),
                    "largest_free_block_min":metrics["largest_free_block_min"]>=float(b["largest_free_block_min"])*float(cfg["largest_free_block_min_ratio"]),
                    "aux_stale_fraction":metrics["aux_stale_fraction"]<=float(cfg["aux_stale_sample_max_fraction"])}
                max_limit=float(b["frame_max"])*float(cfg["frame_max_max_ratio"])
                max_ratio=metrics["frame_max"]/float(b["frame_max"])
                isolated_max_diagnostics.append({"kernel_id":kid,"kernel_name":b["kernel_name"],
                    "observed_max_ms":metrics["frame_max"],"baseline_max_ms":float(b["frame_max"]),
                    "legacy_relative_limit_ms":max_limit,"legacy_relative_ratio":max_ratio,
                    "over_legacy_relative_limit":metrics["frame_max"]>max_limit,
                    "interpretation":"DIAGNOSTIC_ONLY__DOES_NOT_FAIL_SUSTAINED_PERFORMANCE"})
                per_kernel[str(kid)]={"kernel_name":b["kernel_name"],"samples":len(rows),"baseline":b,"metrics":metrics,"checks":checks,
                    "frame_max_diagnostic":{"limit_ms":max_limit,"ratio":max_ratio,"gate":"DIAGNOSTIC_ONLY"}}
                failed=[f"kernel {kid} {key} failed frozen threshold" for key,ok in checks.items() if not ok]
                if duration >= minimum_duration_seconds:
                    sustained_performance_errors += failed
                else:
                    provisional_threshold_diagnostics += failed
            early=policy.get("catastrophic_early_stop",{})
            streak=0
            for i,s in enumerate(valid):
                bad=(float(s["fps"])<float(early["fps_floor_absolute"]) or
                    float(s["frame_ms_p99"])>float(early["frame_ms_p99_ceiling_absolute"]) or
                    (early.get("aux_projection_active_required",True) and not bool(s["aux_projection_active"])))
                streak=streak+1 if bad else 0
                if streak>=int(early["consecutive_samples"]):
                    sustained_performance_errors.append(f"catastrophic threshold exceeded for {streak} consecutive samples ending at {i}");break
    errors.extend(structural_errors)
    errors.extend(sustained_performance_errors)
    duration_incomplete=(timestamps and duration < minimum_duration_seconds)
    non_duration_structural=[e for e in structural_errors if not e.startswith("soak duration ")]
    performance_status=("FAIL" if sustained_performance_errors else
                        "INCOMPLETE" if duration_incomplete else "PASS")
    overall_status=("FAIL" if sustained_performance_errors or non_duration_structural else
                    "INCOMPLETE" if duration_incomplete else "PASS")
    return {
        "schema": "hbnf-foundation-soak-structural-audit-v1",
        "status": overall_status,
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
        "performance_thresholds": ("EVALUATED_AGAINST_HASH_BOUND_BASELINE_AND_FROZEN_POLICY" if baseline is not None and policy is not None and not duration_incomplete else "NOT_EVALUATED__SOAK_DURATION_INCOMPLETE" if baseline is not None and policy is not None else "NOT_EVALUATED__MUST_BE_FROZEN_BEFORE_SOAK"),
        "sustained_performance": (None if baseline is None and policy is None else {
            "status":performance_status,
            "errors":sustained_performance_errors,
            "provisional_threshold_diagnostics":provisional_threshold_diagnostics,
            "policy":"FPS_MEDIAN_FRAME_P95_MEDIAN_FRAME_P99_MEDIAN_HEAP_FRAGMENTATION_AUX_AND_CATASTROPHIC_CONTINUITY_GATES",
            "relative_frame_max":"DIAGNOSTIC_ONLY",
            "frame_max_diagnostics":isolated_max_diagnostics}),
        "foundation_qualification": (None if baseline is None and policy is None else {
            "status":overall_status,
            "errors":structural_errors+sustained_performance_errors,"per_kernel":per_kernel}),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="captured soak JSONL; offline only")
    parser.add_argument("--inventory", required=True)
    parser.add_argument("--expected-release", required=True)
    parser.add_argument("--baseline")
    parser.add_argument("--policy")
    parser.add_argument("--minimum-duration-seconds", type=int, default=MIN_DURATION_SECONDS)
    parser.add_argument("--output")
    args = parser.parse_args()
    result = audit(read_jsonl(args.input), read_json(args.inventory),
                   args.expected_release, args.minimum_duration_seconds,
                   read_json(args.baseline) if args.baseline else None,
                   read_json(args.policy) if args.policy else None)
    rendered = json.dumps(result, indent=2, sort_keys=True) + "\n"
    if args.output:
        pathlib.Path(args.output).write_text(rendered)
    print(rendered, end="")
    return 0 if result["status"] == "PASS" and (not result.get("foundation_qualification") or result["foundation_qualification"]["status"]=="PASS") else 2


if __name__ == "__main__":
    raise SystemExit(main())

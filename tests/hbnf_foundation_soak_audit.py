#!/usr/bin/env python3
"""Pure offline contract tests for Foundation soak evidence auditing."""
import importlib.util
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "foundation_soak_audit", ROOT / "scripts/hbnf_foundation_soak_audit.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

inventory = {
    "entries": [
        {"runtime_kernel_index_expected": i, "effect_id": 220 + i}
        for i in range(28)
    ]
}


def sample(i, *, release="candidate-r1", kernel=None, restart=0, uptime=None):
    return {
        "sample_time": float(i * 5),
        "release_id": release,
        "uptime_seconds": float(i * 5 if uptime is None else uptime),
        "fps": 42.0,
        "frame_ms_p50": 18.0,
        "frame_ms_p95": 24.0,
        "frame_ms_p99": 28.0,
        "frame_ms_max": 35.0,
        "kernel_id": i % 28 if kernel is None else kernel,
        "kernel_name": f"effect-{i % 28}",
        "variant_id": "default",
        "free_heap_bytes": 100000,
        "minimum_free_heap_bytes": 95000,
        "largest_free_block_bytes": 90000,
        "websocket_clients": 1,
        "aux_projection_active": True,
        "aux_projection_age_ms": 20,
        "aux_render_fps": 42.0,
        "wifi_rssi_dbm": -48,
        "restart_count": restart,
    }


soak = [sample(i) for i in range(1081)]
ok = module.audit(soak, inventory, "candidate-r1")
assert ok["status"] == "PASS", ok
assert ok["duration_seconds"] == 5400
assert ok["observed_kernel_count"] == 28
assert ok["minimum_largest_free_block_bytes"] == 90000
assert ok["performance_thresholds"] == "NOT_EVALUATED__MUST_BE_FROZEN_BEFORE_SOAK"

short = module.audit(soak[:-1], inventory, "candidate-r1")
assert short["status"] == "INCOMPLETE"
assert any("below required" in e for e in short["errors"])

wrong_release = [sample(i, release="other") for i in range(1081)]
assert any("release identity mismatch" in e
           for e in module.audit(wrong_release, inventory, "candidate-r1")["errors"])

restarted = [sample(i, restart=0 if i < 500 else 1) for i in range(1081)]
assert any("restart count changed" in e
           for e in module.audit(restarted, inventory, "candidate-r1")["errors"])

static = [sample(i, kernel=0) for i in range(1081)]
assert any("did not cover all 28 kernels" in e
           for e in module.audit(static, inventory, "candidate-r1")["errors"])

gapped = [sample(i) for i in range(1081)]
gapped[500]["sample_time"] = gapped[499]["sample_time"] + 16
assert any("gap exceeded 15" in e
           for e in module.audit(gapped, inventory, "candidate-r1")["errors"])

assert any("cannot be less than 90 minutes" in e
           for e in module.audit(soak, inventory, "candidate-r1", 5399)["errors"])
print("PASS: offline soak audit enforces duration, complete state change, exact identity, continuity, and preserves threshold freeze as a separate gate")

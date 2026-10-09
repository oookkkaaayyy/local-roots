#!/usr/bin/env python3
"""Offline regression checks for R7 trace extension and live protocol."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROTOCOL = ROOT / "evidence/cart2-r7-performance-repair-20261009/R7_OUTLIER_TRACE_LIVE_PROTOCOL.json"
POLICY = ROOT / "config/HBNF_FOUNDATION_QUALIFICATION_POLICY_20261006_SUSTAINED_R1.json"
TRACE = ROOT / "firmware/phase2/integration-r7/usermod/hbnf_outlier_trace.h"
SOURCE = ROOT / "firmware/phase2/integration-r7/usermod/usermod_hbnf_foundation_v1.cpp"

p = json.loads(PROTOCOL.read_text())
policy = json.loads(POLICY.read_text())
header = TRACE.read_text()
source = SOURCE.read_text()

assert p["status"] == "OWNER_AUTHORIZED__FRESH_PREWRITE_GATES_REQUIRED"
assert p["live_authorization"].startswith("OWNER_AUTHORIZED_FOR_ONE_EXACT_R2_DIAGNOSTIC_INSTALL")
assert "not consumed until a fresh prewrite gate receipt passes" in p["live_authorization"]
assert p["safety_abort_and_go"]["live_recommendation"].startswith("GO only after a fresh exact-artifact prewrite gate receipt passes")
assert p["frozen_policy"]["production_p99_ceiling_ms"] == 42.03125
assert p["frozen_policy"]["catastrophic_abort"] == {
    "bad_samples_consecutive": 3,
    "sample_interval_seconds": 8,
    "fps_below": 20,
    "p99_above_ms": 75,
    "matrix_origin_aux_projection_must_remain_active": True,
}
assert policy["catastrophic_early_stop"]["consecutive_samples"] == 3
assert policy["catastrophic_early_stop"]["fps_floor_absolute"] == 20
assert policy["catastrophic_early_stop"]["frame_ms_p99_ceiling_absolute"] == 75
assert policy["comparison"]["candidate_vs_baseline"]["frame_p99_max_ratio"] == 1.25
assert "does not end the trace" in p["frozen_policy"]["p99_diagnostic_rule"]
assert "INCONCLUSIVE" in p["decision_rules"]["insufficient_or_contaminated"]
assert p["telemetry"]["period_seconds"] == 8
assert p["telemetry"]["command_timeout_seconds"] == 7
assert p["telemetry"]["parallel_request_timeout_seconds"] == 4
assert p["telemetry"]["parallel_batch_timeout_seconds"] == 5.5
assert p["telemetry"]["identity_binding"]["expected_release_id"] == p["exact_artifact"]["release_id"]
assert p["telemetry"]["identity_binding"]["expected_firmware_sha256"] == p["exact_artifact"]["sha256"]
assert "monotonic start" in p["telemetry"]["endpoint_timing"]
assert p["windows"]["duration_seconds"] == 60 and p["windows"]["extensions"] is False
assert p["windows"]["initial_sample_offset_seconds"] == 4
assert p["windows"]["sample_times_seconds"] == [4,12,20,28,36,44,52,60]
assert p["windows"]["expected_samples_per_condition"] == 8
assert p["windows"]["pair_order"] == ["trace_disarmed", "trace_armed"]
assert p["windows"]["trace_control_sequence"] == ["start","stop","reset_tail_histogram","fixed_settle","baseline_window","reset_tail_histogram","fixed_settle","resume","armed_window","stop","final_readback","restore_renderer"]
assert "if(!traceArmed&&traceCount)" in source
assert "Do not run a disarmed extension" in p["windows"]["trace_serialization_contamination"]
assert "INCONCLUSIVE" in p["decision_rules"]["insufficient_or_contaminated"]
assert len(p["exact_artifact"]["sha256"]) == 64
assert p["exact_artifact"]["sha256"] == "9789d9f198699d48f7bf168d7c885d337547724716055e48824072c82c8dfd6b"

assert "bool resume()" in header and "if (!started_) return false" in header
assert "started_=true" in header
assert "traceCaptureBodyCycles" in header and "traceWriteCycles" not in header
assert 'traceOp,"resume"' in source and "hbnfOutlierTrace.resume()" in source
assert 'cpuMHzAtTraceStart' in source and 'cpuMHzAtReadback' in source
assert 'ESP.getCpuFreqMHz()==(F_CPU/1000000u)' in source
assert 'ESP.getCpuFreqMHz()==hbnfOutlierCpuMHz' in source

frame_end = source.split('extern "C" void hbnfPerfFrameEnd() {', 1)[1].split("\n}", 1)[0]
assert "hbnfOutlierTrace.append(record)" in frame_end
for forbidden in ("malloc", "Serial", "WiFi", "HTTP", "snprintf", "new "):
    assert forbidden not in frame_end, f"forbidden hot-path operation: {forbidden}"
assert "esp_timer_get_time()" in frame_end
assert "traceCaptureBodyCycles" not in frame_end  # set after append via helper; not a false total-cost claim
print("PASS: frozen catastrophic monitor, exact R2 telemetry binding, matched 60s windows, serialization symmetry and restore contract")

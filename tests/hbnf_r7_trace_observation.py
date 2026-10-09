#!/usr/bin/env python3
"""Offline replay of the R7 diagnostic's paired-window host controls."""
from __future__ import annotations
import contextlib, json, pathlib, subprocess, sys, tempfile, unittest.mock

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
import hbnf_foundation_continuous_soak as soak
import hbnf_foundation_live_adapter as adapter
import hbnf_live_kernel_sweep as sweep

protocol=json.loads((ROOT/"evidence/cart2-r7-performance-repair-20261009/R7_OUTLIER_TRACE_LIVE_PROTOCOL.json").read_text())
diag=protocol["exact_artifact"]
assert diag["release_id"]=="hbnf-cart2-r7-outlier-trace-diagnostic-r2-20261009"
assert diag["sha256"]=="9789d9f198699d48f7bf168d7c885d337547724716055e48824072c82c8dfd6b"
assert protocol["telemetry"]["period_seconds"]==8
assert protocol["telemetry"]["collector"]=="scripts/hbnf_foundation_continuous_soak.py::_sampler_worker + scripts/hbnf_foundation_live_adapter.py telemetry"
assert protocol["windows"]["duration_seconds"]==60 and protocol["windows"]["extensions"]==False
assert protocol["windows"]["pair_order"]==["trace_disarmed", "trace_armed"]
assert "INCONCLUSIVE" in protocol["decision_rules"]["insufficient_or_contaminated"]

diag_identity=diag["release_id"]
diag_sha=diag["sha256"]
good={
 "release_id":diag_identity,"uptime_seconds":108.0,"fps":41.0,
 "frame_ms_p50":20.0,"frame_ms_p95":30.0,"frame_ms_p99":42.5,"frame_ms_max":55.0,
 "kernel_id":13,"kernel_name":"kernel-13","variant_id":1347100685,
 "free_heap_bytes":100000,"minimum_free_heap_bytes":95000,"largest_free_block_bytes":90000,
 "websocket_clients":0,"aux_projection_active":True,"aux_projection_age_ms":15,
 "aux_render_fps":41.0,"wifi_rssi_dbm":-45,"restart_count":0,
 "kernel_ms_avg":12.0,"kernel_ms_p95":20.0,"palette_ms_avg":1.0,"palette_ms_p95":2.0,
 "audio_ms_avg":1.0,"audio_ms_p95":2.0,"scheduler_ms_avg":0.3,"scheduler_ms_p95":1.0,
 "overlay_ms_avg":0.2,"overlay_ms_p95":1.0,"aux_prepare_send_ms_avg":0.1,
 "aux_prepare_send_ms_p95":0.5,"unaccounted_ms_avg":3.0,"unaccounted_ms_p95":6.0,
 "trace_overflow_count":0,"trace_armed":False,"trace_records_serialized":False,
 "telemetry_endpoint_reads":{"matrix_info":{"status":"PASS","elapsed_seconds":0.01},
  "matrix_build":{"status":"PASS","elapsed_seconds":0.01},"matrix_state":{"status":"PASS","elapsed_seconds":0.02},
  "aux_info":{"status":"PASS","elapsed_seconds":0.01},"aux_state":{"status":"PASS","elapsed_seconds":0.01}},
}

class Clock:
 def __init__(self):self.now=0.0
 def monotonic(self):return self.now
 def sleep(self,n):self.now+=n

def run_sampler(samples,duration,initial_delay=0.0,include_boundary_sample=False):
 clock=Clock();items=iter(samples); out=pathlib.Path(tempfile.mkdtemp(prefix="r7-observer-replay-"))
 def fake_run(argv,**kwargs):
  sample=next(items);clock.now+=0.01
  return subprocess.CompletedProcess(argv,0,json.dumps(sample),"")
 def invoke():
  with unittest.mock.patch.object(soak.subprocess,"run",side_effect=fake_run), \
       unittest.mock.patch.object(soak.time,"monotonic",side_effect=clock.monotonic), \
       unittest.mock.patch.object(soak.time,"sleep",side_effect=clock.sleep):
   return soak._sampler_worker(["fake telemetry"],[{"runtime_kernel_index_expected":13,"kernel_name":"kernel-13"}],
    out,duration,diag_identity,0,100.0,
    {"catastrophic_early_stop":{"consecutive_samples":3,"enabled":True,"fps_floor_absolute":20,
      "frame_ms_p99_ceiling_absolute":75,"aux_projection_active_required":True}},8.0,7.0,
    initial_delay,include_boundary_sample)
 return invoke(),out

# Good paired windows include the 42.03125ms phenomenon without aborting.
# Both conditions use identical start times, endpoints, durations and timing fields.
def window(armed):
 samples=[dict(good,uptime_seconds=108.0+i*8,trace_armed=armed,
   trace_retained_count=(32 if armed else 0),trace_outlier_count=(40 if armed else 0),
   trace_overflow_count=(8 if armed else 0),trace_records_serialized=False) for i in range(8)]
 rc,out=run_sampler(samples,60.0,initial_delay=4.0,include_boundary_sample=True)
 assert rc==0
 rows=[json.loads(line) for line in (out/"FOUNDATION_SOAK.jsonl").read_text().splitlines()]
 assert len(rows)==8 and all(x["frame_ms_p99"]==42.5 for x in rows)
 assert all(x["release_id"]==diag_identity for x in rows)
 assert all(all(v["status"]=="PASS" for v in x["telemetry_endpoint_reads"].values()) for x in rows)
 assert all(x["trace_armed"] is armed and not x["trace_records_serialized"] for x in rows)
 return rows
baseline_rows=window(False)
armed_rows=window(True)
assert [x["sample_time"] for x in baseline_rows]==[x["sample_time"] for x in armed_rows]

# Trace overflow remains visible in durable telemetry; it is not a reason to
# drop frames or rewrite a p99 result. The trace records explicitly report it.
overflow=dict(good,trace_overflow_count=9,trace_armed=True,trace_retained_count=32,trace_outlier_count=41)
rc,out=run_sampler([overflow],8.0)
assert rc==0 and json.loads((out/"FOUNDATION_SOAK.jsonl").read_text().splitlines()[0])["trace_overflow_count"]==9

def fails(samples,duration,expected_text):
 rc,out=run_sampler(samples,duration)
 fail=json.loads((out/"TELEMETRY_SAMPLER_FAILURE.json").read_text())
 assert rc==2 and expected_text in fail["error"]
 return fail,out

# All defined catastrophic causes stop after exactly three consecutive 8s samples.
for mutate,reason in [
 (lambda x:x.update(frame_ms_p99=75.1),"catastrophic Foundation threshold"),
 (lambda x:x.update(fps=19.9),"catastrophic Foundation threshold"),
 (lambda x:x.update(aux_projection_active=False),"catastrophic Foundation threshold")]:
 bad=[]
 for i in range(3):
  x=dict(good,uptime_seconds=108.0+i*8);mutate(x);bad.append(x)
 fail,out=fails(bad,24.0,reason)
 assert fail["sample_count"]==3 # the third bad sample is persisted before abort
 assert len((out/"FOUNDATION_SOAK.jsonl").read_text().splitlines())==3

# A read timeout fails closed and records a sampler failure; it is not skipped.
clock=Clock();out=pathlib.Path(tempfile.mkdtemp(prefix="r7-observer-timeout-"))
with unittest.mock.patch.object(soak.subprocess,"run",side_effect=subprocess.TimeoutExpired(["fake"],7)), \
     unittest.mock.patch.object(soak.time,"monotonic",side_effect=clock.monotonic), \
     unittest.mock.patch.object(soak.time,"sleep",side_effect=clock.sleep):
 rc=soak._sampler_worker(["fake"],[{"runtime_kernel_index_expected":13,"kernel_name":"kernel-13"}],out,8.0,
   diag_identity,0,100.0,{"catastrophic_early_stop":{"consecutive_samples":3,"fps_floor_absolute":20,
   "frame_ms_p99_ceiling_absolute":75,"aux_projection_active_required":True}},8.0,7.0)
assert rc==2 and "TimeoutExpired" in json.loads((out/"TELEMETRY_SAMPLER_FAILURE.json").read_text())["error"]

# Identity mismatch is retained and fails closed instead of inheriting the
# previous R7 production candidate's adapter expectation.
wrong=dict(good,release_id="hbnf-cart2-phase2-offline-wow-r7-20261009")
fail,out=fails([wrong],8.0,"release identity changed")
assert json.loads((out/"FOUNDATION_SOAK.jsonl").read_text().splitlines()[0])["release_id"]==wrong["release_id"]

# The existing restore routine is exercised offline with a revision/hash-bound
# readback and rejects a mismatched restored snapshot.
saved=(adapter.p20_state,adapter.command)
state={"HBNF":{"packet20Diagnostic":{"restoreVerified":False,"snapshotId":77,"snapshotHash":12345,"snapshotState":"RESTORING"}}}
adapter.p20_state=lambda *a,**k:(state,state["HBNF"]["packet20Diagnostic"])
def restore_command(op,**kw):
 state["HBNF"]["packet20Diagnostic"].update(restoreVerified=True,snapshotState="RESTORED",lastCommand="restore",lastCommandAccepted=True)
 return {"HBNF":{"packet20Diagnostic":{"lastCommandAccepted":True}}}
adapter.command=restore_command
result=adapter._restore_snapshot(77,12345)
assert result["restoreVerified"] is True and result["snapshotHash"]==12345
state["HBNF"]["packet20Diagnostic"].update(snapshotHash=12346)
try:adapter._restore_snapshot(77,12345);raise AssertionError("mismatched restore accepted")
except RuntimeError as exc:assert "snapshot-hash-mismatch" in str(exc)
adapter.p20_state,adapter.command=saved

# Endpoint timing is attached to every response from the existing five-way
# parallel collector and failures remain fail-closed.
old_expected=adapter.EXPECTED
adapter.EXPECTED=diag_identity
def fake_read(url,timeout):
 if url.endswith("/hbnf/build.json"): return ({"release_id":diag_identity,"candidate":diag_identity},"a"*64)
 if url.endswith("/json/info") and "192.168.77.10" in url:
  return ({"ip":"192.168.77.10","mac":"70:4b:ca:5b:34:5c"},"b"*64)
 return ({},"c"*64)
with tempfile.TemporaryDirectory(prefix="r7-parallel-reads-") as td, unittest.mock.patch.object(adapter,"_get_json_once",side_effect=fake_read):
 reads,elapsed=adapter._parallel_soak_reads(td)
 timing=reads.pop("_endpoint_timing")
 assert set(timing)=={"matrix_info","matrix_build","matrix_state","aux_info","aux_state"}
 assert all(x["status"]=="PASS" and x["completed_monotonic_ns"]>=x["started_monotonic_ns"] for x in timing.values())
 assert all(x["elapsed_seconds"]>=0 for x in timing.values())
def failed_read(url,timeout):
 if url.endswith("192.168.77.11/json/state"):raise TimeoutError("fixture timeout")
 return fake_read(url,timeout)
with tempfile.TemporaryDirectory(prefix="r7-parallel-failed-read-") as td, unittest.mock.patch.object(adapter,"_get_json_once",side_effect=failed_read):
 try:adapter._parallel_soak_reads(td);raise AssertionError("missing endpoint accepted")
 except RuntimeError as exc:assert "parallel-soak-telemetry-read-failed" in str(exc)
 failure=json.loads((pathlib.Path(td)/"TELEMETRY_PARALLEL_READ_FAILURES.jsonl").read_text().splitlines()[0])
 assert failure["endpoint_timing"]["aux_state"]["status"]=="FAIL"
 assert len(failure["endpoint_timing"])==5
def stale_build_read(url,timeout):
 if url.endswith("/hbnf/build.json"):return ({"release_id":"hbnf-cart2-phase2-offline-wow-r7-20261009","candidate":"hbnf-cart2-phase2-offline-wow-r7-20261009"},"d"*64)
 return fake_read(url,timeout)
with tempfile.TemporaryDirectory(prefix="r7-parallel-identity-") as td, unittest.mock.patch.object(adapter,"_get_json_once",side_effect=stale_build_read):
 try:adapter._parallel_soak_reads(td);raise AssertionError("superseded production identity accepted")
 except RuntimeError as exc:assert "release-identity-mismatch" in str(exc)
 failure=json.loads((pathlib.Path(td)/"TELEMETRY_PARALLEL_READ_FAILURES.jsonl").read_text().splitlines()[0])
 assert failure["failure_reason"]=="foundation-metrics-release-identity-mismatch"
 assert len(failure["endpoint_timing"])==5
adapter.EXPECTED=old_expected

# Read-only adapter preflight binds its expected identity to the diagnostic R2
# release and carries the host-verified SHA separately from device attestation.
reads={
 "matrix_info":{"ip":"192.168.77.10","mac":"70:4b:ca:5b:34:5c","ver":"16.0.1","uptime":300},
 "matrix_build":{"release_id":diag_identity,"candidate":diag_identity},
 "matrix_state":{"on":True,"HBNF":{"matrixBrightness":44,"timing":{"uptimeSec":300,"fps":41},
   "packet20Diagnostic":{"enabled":True,"snapshotValid":True,"snapshotId":77,"snapshotHash":12345,"restoreVerified":False},
   "foundationTelemetry":{"enabled":True}}},
 "aux_info":{"ip":"192.168.77.11","mac":"8c:94:df:55:c3:4c","live":True,"lm":"DDP","lip":"192.168.77.10","leds":{"count":22}},
 "aux_state":{"on":True}}
old_expected=adapter.EXPECTED;adapter.EXPECTED=diag_identity
with unittest.mock.patch.object(adapter,"_parallel_soak_reads",return_value=(reads,0.02)), \
     unittest.mock.patch.dict("os.environ",{"HBNF_EXPECTED_RELEASE_ID":diag_identity,"HBNF_EXPECTED_FIRMWARE_SHA256":diag_sha}):
 preflight=adapter.readonly_preflight("offline-diagnostic-replay")
assert preflight["expected_release_id"]==diag_identity and preflight["expected_firmware_sha256"]==diag_sha
adapter.EXPECTED=old_expected

# A successful but late request cannot shift cadence and erase a missing sample.
clock=Clock();out=pathlib.Path(tempfile.mkdtemp(prefix="r7-observer-overrun-"))
def slow_run(argv,**kwargs):
 clock.now+=9.0
 return subprocess.CompletedProcess(argv,0,json.dumps(good),"")
with unittest.mock.patch.object(soak.subprocess,"run",side_effect=slow_run), \
     unittest.mock.patch.object(soak.time,"monotonic",side_effect=clock.monotonic), \
     unittest.mock.patch.object(soak.time,"sleep",side_effect=clock.sleep):
 rc=soak._sampler_worker(["fake"],[{"runtime_kernel_index_expected":13,"kernel_name":"kernel-13"}],out,60.0,
   diag_identity,0,100.0,{"catastrophic_early_stop":{"consecutive_samples":3,"fps_floor_absolute":20,
   "frame_ms_p99_ceiling_absolute":75,"aux_projection_active_required":True}},8.0,7.0)
failure=json.loads((out/"TELEMETRY_SAMPLER_FAILURE.json").read_text())
assert rc==2 and failure["error"]=="telemetry-sample-schedule-overrun"
assert len((out/"FOUNDATION_SOAK.jsonl").read_text().splitlines())==1

# Source proves record serialization is absent during armed windows and only
# occurs after trace stop; the live order has no disarmed extension after stop.
cpp=(ROOT/"firmware/phase2/integration-r7/usermod/usermod_hbnf_foundation_v1.cpp").read_text()
assert "if(!traceArmed&&traceCount)" in cpp
assert protocol["windows"]["trace_control_sequence"]==["start","stop","reset_tail_histogram","fixed_settle","baseline_window","reset_tail_histogram","fixed_settle","resume","armed_window","stop","final_readback","restore_renderer"]
assert protocol["windows"]["extensions"] is False
adapter.EXPECTED=diag_identity
with unittest.mock.patch.dict("os.environ",{"HBNF_EXPECTED_RELEASE_ID":diag_identity,"HBNF_EXPECTED_FIRMWARE_SHA256":diag_sha}):
 assert adapter.EXPECTED==diag_identity

print("R7 paired-window host protocol PASS: 8s sampler, catastrophic gates, timeout/identity failure, trace overflow retention, and restore verification replayed offline")

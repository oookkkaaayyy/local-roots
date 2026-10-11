#!/usr/bin/env python3
"""Pure contract tests for the R4 Foundation live adapter."""
import contextlib, importlib.util, io, json, pathlib, tempfile, unittest.mock

ROOT=pathlib.Path(__file__).resolve().parents[1]
contract=json.loads((ROOT/"config/HBNF_RUNTIME_TELEMETRY_CONTRACT.json").read_text())
assert contract["aux_projection_source_contract"]["native_ddp_active_source"]=="AUX /json/info live=true, lm=DDP, lip=192.168.77.10"
assert contract["aux_projection_source_contract"]["custom_frame_lock_diagnostics"]["receiver_object"]=="HBNFAUX"
spec=importlib.util.spec_from_file_location("foundation_adapter",ROOT/"scripts/hbnf_foundation_live_adapter.py")
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
real_get=m.get
real_prequal=m.foundation_prequal_windows
assert m.HTTP_TIMEOUT_SECONDS == 10
assert m.POST_TIMEOUT_SECONDS == 25
assert m.COMMAND_ACK_TIMEOUT_SECONDS == 30
assert m.SNAPSHOT_READY_TIMEOUT_SECONDS == 45
assert m.RESTORE_VERIFY_TIMEOUT_SECONDS == 90
with unittest.mock.patch.object(m.time,"monotonic",return_value=100.0):
    assert not m.observer_poll_budget_available(100.0162015)
    assert m.observer_poll_budget_available(101.0)
with unittest.mock.patch.object(m.time,"monotonic",return_value=100.0):
    assert not m.observer_poll_budget_available(100.999)

# Bind the reproduced edge test to the retained seq35 response, which timed
# out with 0.0162015 seconds left under the old polling loop.
seq35=json.loads((ROOT/"evidence/hbnf-foundation-qualification-20261005/seq35/FAILURE_LOCALIZATION.json").read_text())
assert "0.0162015s" in seq35["exact_failure"]
edge_remaining=float(seq35["exact_failure"].split("after ",1)[1].split("s",1)[0])
with unittest.mock.patch.object(m.time,"monotonic",return_value=100.0):
    assert not m.observer_poll_budget_available(100.0+edge_remaining)
    with unittest.mock.patch.object(m,"get",side_effect=lambda *a,**kw:(_ for _ in ()).throw(AssertionError("HTTP started with unusable budget"))):
        try:m.p20_state(deadline=100.0162015,stage="preserved-seq35-edge");raise AssertionError("deadline-edge request accepted")
        except RuntimeError as exc:assert "no GET started" in str(exc)

# Deadline-edge regression: once the minimum count is reached, the window is
# valid even when the reserve prevents another HTTP request from starting.
class FakeClock:
    now=0.0
    def monotonic(self):return self.now
    def sleep(self,seconds):self.now+=seconds
clock=FakeClock();calls=[]
def edge_state(deadline,stage):
    calls.append(stage)
    clock.now+=.4
    return {"HBNF":{"timing":{"wholeFrameUs":20000}}},{}
with unittest.mock.patch.object(m.time,"monotonic",side_effect=clock.monotonic), \
     unittest.mock.patch.object(m.time,"sleep",side_effect=clock.sleep), \
     unittest.mock.patch.object(m,"p20_state",side_effect=edge_state):
    edge=m.collect_frame_window("edge",window_seconds=3,reserve_seconds=1,minimum_samples=2)
assert len(edge)==2 and len(calls)==2, (edge,calls)

# Use the explicit, bounded extension when the nominal window no longer has
# enough request budget; with no extension, preserve fail-closed under-sampling.
clock=FakeClock();calls=[]
def reserve_edge_state(deadline,stage):
    calls.append(stage);clock.now+=1.1
    return {"HBNF":{"timing":{"wholeFrameUs":20000}}},{}
with unittest.mock.patch.object(m.time,"monotonic",side_effect=clock.monotonic), \
     unittest.mock.patch.object(m.time,"sleep",side_effect=clock.sleep), \
     unittest.mock.patch.object(m,"p20_state",side_effect=reserve_edge_state):
    try:m.collect_frame_window("reserve",window_seconds=2,reserve_seconds=1,minimum_samples=2,max_extension_seconds=0);raise AssertionError("under-sampled window accepted")
    except RuntimeError as exc:assert "reserve-under-sampled:1<2" in str(exc)
assert len(calls)==1, calls

clock=FakeClock();calls=[];request_deadlines=[]
def bounded_extension_state(deadline,stage):
    calls.append(stage);request_deadlines.append(deadline);clock.now+=1.1
    return {"HBNF":{"timing":{"wholeFrameUs":20000}}},{}
with unittest.mock.patch.object(m.time,"monotonic",side_effect=clock.monotonic), \
     unittest.mock.patch.object(m.time,"sleep",side_effect=clock.sleep), \
     unittest.mock.patch.object(m,"p20_state",side_effect=bounded_extension_state):
    extended=m.collect_frame_window("bounded-extension",window_seconds=2,reserve_seconds=1,minimum_samples=2,max_extension_seconds=3)
assert len(extended)==2 and len(calls)==2 and all(d<=5 for d in request_deadlines), (extended,request_deadlines)

# A slow /json/state read near the nominal window boundary must use the
# existing hard deadline. The old nominal deadline gave the first request
# only the remaining 2.7 seconds and left the bounded retry unable to start.
assert m.observer_request_deadline(37.25,40.0,50.0)==50.0
assert m.observer_request_deadline(29.0,40.0,50.0)==40.0
clock=FakeClock();calls=[];request_deadlines=[]
def slow_boundary_state(deadline,stage):
    calls.append(stage);request_deadlines.append(deadline)
    if len(calls)<3:
        clock.now+=.1
    else:
        assert deadline==13.0, (deadline,clock.now)
        clock.now+=2.75  # preserved failure's ~2.75 s boundary latency
    return {"HBNF":{"timing":{"wholeFrameUs":20000}}},{ }
with unittest.mock.patch.object(m.time,"monotonic",side_effect=clock.monotonic), \
     unittest.mock.patch.object(m.time,"sleep",side_effect=clock.sleep), \
     unittest.mock.patch.object(m,"p20_state",side_effect=slow_boundary_state):
    boundary=m.collect_frame_window("slow-boundary",window_seconds=3,reserve_seconds=1,
                                    minimum_samples=3,max_extension_seconds=10)
assert len(boundary)==3 and len(calls)==3 and request_deadlines[-1]==13.0, (boundary,calls,request_deadlines)

# Genuine early/mid-window transport failures still fail closed.
clock=FakeClock();calls=[]
def fail_early(deadline,stage):raise TimeoutError("early seq35-like HTTP failure")
with unittest.mock.patch.object(m.time,"monotonic",side_effect=clock.monotonic), \
     unittest.mock.patch.object(m.time,"sleep",side_effect=clock.sleep), \
     unittest.mock.patch.object(m,"p20_state",side_effect=fail_early):
    try:m.collect_frame_window("early-failure",window_seconds=30,minimum_samples=20);raise AssertionError("early HTTP failure swallowed")
    except TimeoutError as exc:assert "early seq35-like" in str(exc)

clock=FakeClock();calls=[]
def fail_mid_window(deadline,stage):
    calls.append(stage)
    if len(calls)==3:raise TimeoutError("preserved seq35-style HTTP timeout")
    return {"HBNF":{"timing":{"wholeFrameUs":20000}}},{}
with unittest.mock.patch.object(m.time,"monotonic",side_effect=clock.monotonic), \
     unittest.mock.patch.object(m.time,"sleep",side_effect=clock.sleep), \
     unittest.mock.patch.object(m,"p20_state",side_effect=fail_mid_window):
    try:m.collect_frame_window("mid-failure",window_seconds=30,minimum_samples=2);raise AssertionError("mid-window HTTP failure swallowed")
    except TimeoutError as exc:assert "seq35-style" in str(exc)
assert len(calls)==3

info={"ip":"192.168.77.10","mac":"70:4b:ca:5b:34:5c","uptime":100,"ws":0,"clock":240,
      "deviceId":"matrix-device","freeheap":90000,"wifi":{"rssi":-45}}
build={"release_id":m.EXPECTED,"candidate":m.EXPECTED,"wled":"16.0.1"}
aux={"ip":"192.168.77.11","mac":"8c94df55c34c","live":True,"lm":"DDP",
     "lip":"192.168.77.10","leds":{"fps":42}}
aux_state={"on":False,"HBNFAUX":{"projectionRxPackets":0,"projectionRxSeq":0,
    "projectionRxActive":False,"projectionRxAgeMs":4294967295,
    "projectionHelloPackets":1045,"projectionPeerKnown":False}}
rx=m.aux_projection_health(aux,aux_state)
assert rx["active"] is True and rx["wled_live_source"] is True
assert rx["frame_lock_active"] is False and rx["age_valid"] is False
assert rx["age_ms"]==4294967295 and rx["rx_packets"]==0
wrong_source=dict(aux,lip="192.168.77.99")
assert m.aux_projection_health(wrong_source,aux_state)["active"] is False
with tempfile.TemporaryDirectory() as td:
    m.foundation_prequal_windows=real_prequal
    t=pathlib.Path(td); m.CACHE=t/"restart-cache.json"
    inventory=ROOT/"config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json"
    state={"HBNF":{"timing":{"kernel":0,"uptimeSec":100,"fps":42,"variantSignature":7,
      "companionPrepUs":123,"companionDdpSendUs":456,
      "freeHeap":88000,"rssi":-45,"wholeFrameUs":19000,"auxProjectionAgeMs":2},
      "foundationTelemetry":{"enabled":True,"frameMsAvg":19,"frameMsP50":18,
      "frameMsP95":21,"frameMsP99":23,"frameMsMax":25,"minimumFreeHeapBytes":80000,
      "largestFreeBlockBytes":60000,"sampleCount":300,"frameTailBinResolutionUs":250,
      "frameTailOverflow":False,"kernelMsAvg":8,"kernelMsP95":10,"vibeCompositorMsAvg":0.42,
      "vibeCompositorMsP95":0.5,"vibeCompositorMsP99":0.75,"paletteMsAvg":3,
      "kernelWithoutCompositorMsAvg":7.5,"kernelWithoutCompositorMsP95":9.5,"kernelWithoutCompositorMsP99":11.5,
      "paletteMsP95":4,"audioMsAvg":1,"audioMsP95":2,"schedulerMsAvg":1,
      "schedulerMsP95":2,"overlayMsAvg":0.1,"overlayMsP95":0.2,
      "auxPrepareSendMsAvg":0.5,"auxPrepareSendMsP95":0.8,"unaccountedMsAvg":5,
      "unaccountedMsP95":6,"outlierTrace":{"enabled":True,"retainedCount":4,
        "outlierCount":4,"overflowCount":0,"cpuMHzAtTraceStart":240,"cpuMHzAtReadback":240}}}}
    reads={"matrix_info":info,"matrix_build":build,
      "matrix_state":state,"aux_info":aux,"aux_state":aux_state}
    reads["_endpoint_timing"]={name:{"status":"PASS","started_monotonic_ns":1,
      "completed_monotonic_ns":2,"elapsed_seconds":0.000001} for name in
      ("matrix_info","matrix_build","matrix_state","aux_info","aux_state")}
    m._parallel_soak_reads=lambda session_id:(reads,0.02)
    m.get=lambda url,*args,**kwargs: info if url.endswith("/json/info") else build
    isolated_run=str(t/"run-a")
    with contextlib.redirect_stdout(io.StringIO()) as output:
        m.telemetry(str(inventory),isolated_run)
    sample=json.loads(output.getvalue())
    assert sample["cpu_clock_mhz"]==240
    assert sample["aux_projection_active"] is True
    assert sample["aux_frame_lock_rx_active"] is False
    assert sample["aux_projection_age_valid"] is False
    assert sample["aux_projection_age_ms"]==4294967295
    assert sample["trace_armed"] is True and sample["trace_retained_count"]==4
    assert sample["trace_records_serialized"] is False
    assert sample["last_frame_companion_prep_us"]==123
    assert sample["last_frame_ddp_send_us"]==456
    assert set(sample["telemetry_endpoint_reads"])=={"matrix_info","matrix_build","matrix_state","aux_info","aux_state"}
    assert sample["expected_firmware_sha256"] is None # WLED does not attest installed bytes.
    required={"release_id","cpu_clock_mhz","uptime_seconds","fps","frame_ms_p50","frame_ms_p95",
      "frame_ms_p99","frame_ms_max","kernel_id","kernel_name","variant_id",
      "free_heap_bytes","minimum_free_heap_bytes","largest_free_block_bytes",
      "websocket_clients","aux_projection_active","aux_projection_age_ms","aux_render_fps",
      "wifi_rssi_dbm","restart_count","kernel_ms_avg","kernel_ms_p95","palette_ms_avg",
      "palette_ms_p95","audio_ms_avg","audio_ms_p95","scheduler_ms_avg","scheduler_ms_p95",
      "overlay_ms_avg","overlay_ms_p95","aux_prepare_send_ms_avg","aux_prepare_send_ms_p95",
      "last_frame_companion_prep_us","last_frame_ddp_send_us",
      "unaccounted_ms_avg","unaccounted_ms_p95"}
    assert required <= sample.keys(), required-sample.keys()
    assert sample["release_id"]==m.EXPECTED and sample["kernel_name"]=="Complex_Kaleido_3"
    assert sample["frame_ms_p99"]==23 and sample["minimum_free_heap_bytes"]==80000
    assert sample["vibe_compositor_ms_avg"]==0.42
    assert sample["vibe_compositor_ms_p95"]==0.5 and sample["vibe_compositor_ms_p99"]==0.75
    assert sample["kernel_without_compositor_ms_avg"]==7.5
    assert sample["kernel_without_compositor_ms_p95"]==9.5 and sample["kernel_without_compositor_ms_p99"]==11.5
    assert sample["largest_free_block_bytes"]==60000 and sample["restart_count"]==0
    # Native WLED DDP and optional HBNF frame-lock counters are distinct paths.
    # The expected Matrix-origin DDP is healthy while custom frame-lock is idle.
    assert aux["live"] is True and sample["aux_wled_live_source"] is True
    assert sample["aux_projection_active"] is True
    assert sample["aux_frame_lock_rx_active"] is False
    assert sample["aux_projection_age_valid"] is False
    assert sample["aux_projection_age_ms"]==4294967295
    assert sample["aux_projection_rx_packets"]==0 and sample["aux_projection_peer_known"] is False
    aux_state["HBNFAUX"].update(projectionRxPackets=17,projectionRxSeq=16,
        projectionRxActive=True,projectionRxAgeMs=24,projectionHelloPackets=1049,
        projectionPeerKnown=True)
    with contextlib.redirect_stdout(io.StringIO()) as output:m.telemetry(str(inventory),isolated_run)
    healthy_rx=json.loads(output.getvalue())
    assert healthy_rx["aux_projection_active"] is True
    assert healthy_rx["aux_projection_age_ms"]==24
    assert healthy_rx["aux_projection_rx_packets"]==17
    # A max in the final bin sets the firmware's global overflow bit, but does
    # not invalidate unsaturated percentile ranks. Preserve the exact max and
    # overflow flag for later baseline-relative gate evaluation.
    ft=state["HBNF"]["foundationTelemetry"]
    ft.update(frameTailOverflow=True,frameMsMax=12559.93,frameMsP99=36.65,
              frameTailBinResolutionUs=250)
    with contextlib.redirect_stdout(io.StringIO()) as output:
        m.telemetry(str(inventory),isolated_run)
    overflow_sample=json.loads(output.getvalue())
    assert overflow_sample["frame_tail_overflow"] is True
    assert overflow_sample["frame_ms_max"]==12559.93
    assert overflow_sample["frame_tail_saturated_quantile_ms"]==127.875
    # If a percentile itself reaches the final-bin representative, the
    # telemetry contract still fails closed before any profile is accepted.
    ft["frameMsP99"]=127.875
    try:
        with contextlib.redirect_stdout(io.StringIO()):m.telemetry(str(inventory),isolated_run)
        raise AssertionError("saturated percentile was accepted")
    except RuntimeError as exc:
        assert "foundation-frame-tail-quantile-saturated-at-127.875ms" in str(exc)
        raw_path=pathlib.Path(isolated_run)/"SATURATED_TELEMETRY_RAW.json"
        raw=json.loads(raw_path.read_text())
        assert raw["status"]=="SATURATED" and raw["frame_ms_max"]==12559.93
        assert raw["saturated_fields"]==["frameMsP99"]
        assert raw["runtime_context"]["cpu_clock_mhz"]==240
    with unittest.mock.patch.dict(m.os.environ,{"HBNF_ALLOW_SATURATED_DIAGNOSTIC":"1"}):
        with contextlib.redirect_stdout(io.StringIO()) as output:m.telemetry(str(inventory),isolated_run)
    diagnostic_only=json.loads(output.getvalue())
    assert diagnostic_only["telemetry_quality"]=="SATURATED_DIAGNOSTIC_ONLY"
    assert diagnostic_only["frame_ms_p99"]==127.875
    per_kernel_raw=pathlib.Path(isolated_run)/"SATURATED_TELEMETRY_KERNEL_00.json"
    assert json.loads(per_kernel_raw.read_text())["saturated_fields"]==["frameMsP99"]
    ft["frameMsP99"]=36.65
    state["HBNF"]["timing"]["uptimeSec"]=90
    with contextlib.redirect_stdout(io.StringIO()) as output:m.telemetry(str(inventory),isolated_run)
    assert json.loads(output.getvalue())["restart_count"]==1
    with contextlib.redirect_stdout(io.StringIO()) as output:m.telemetry(str(inventory),str(t/"run-b"))
    assert json.loads(output.getvalue())["restart_count"]==0

bad_build={**build,"release_id":"wrong"}
m.get=lambda url: info if url.endswith("/json/info") else bad_build
try:
    m.identity(); raise AssertionError("mismatched runtime release accepted")
except RuntimeError as exc:
    assert "release-identity-mismatch" in str(exc)

def timeout(*args,**kwargs): raise TimeoutError("timed out")
m.get=real_get
with unittest.mock.patch.object(m.urllib.request,"urlopen",side_effect=timeout):
    try: m.post_state({"HBNF":{}}); raise AssertionError("POST timeout was not surfaced")
    except RuntimeError as exc:
        assert "POST http://192.168.77.10/json/state failed after 25s" in str(exc)
        assert "TimeoutError" in str(exc)
    try: m.get("http://192.168.77.10/json/info"); raise AssertionError("GET timeout was not surfaced")
    except RuntimeError as exc:
        assert "GET http://192.168.77.10/json/info failed after 10s" in str(exc)
    try: m.get("http://192.168.77.10/json/state"); raise AssertionError("GET timeout was not surfaced")
    except RuntimeError as exc:
        assert "GET http://192.168.77.10/json/state failed after 10s (attempts=2)" in str(exc)
        assert "TimeoutError" in str(exc)

# Only transient read-only /json/state failures get one bounded retry.
class GoodResponse:
    def __enter__(self): return self
    def __exit__(self,*args): pass
    def read(self): return b'{"ok":true}'
calls=[]
def transient_then_ok(*args,**kwargs):
    calls.append(1)
    if len(calls)==1: raise TimeoutError("transient read timeout")
    return GoodResponse()
with unittest.mock.patch.object(m.urllib.request,"urlopen",side_effect=transient_then_ok), unittest.mock.patch.object(m.time,"sleep"):
    assert m.get("http://192.168.77.10/json/state")=={"ok":True}
assert len(calls)==2

# Observer-window errors preserve the snapshot identity and verified auto-restore.
with tempfile.TemporaryDirectory() as td:
    m.identity=lambda: ({}, {})
    idle={"HBNF":{"foundationTelemetry":{"enabled":True},"packet20Diagnostic":{"enabled":True,"snapshotValid":False,"snapshotState":"IDLE"}}}
    snapshot_state={"HBNF":{"foundationTelemetry":{"enabled":True},"packet20Diagnostic":{"enabled":True,"snapshotValid":True,
        "snapshotState":"READY","snapshotId":7,"snapshotHash":1234}}}
    states=iter((idle,snapshot_state))
    m.p20_state=lambda *args,**kwargs:(s:=next(states),s["HBNF"]["packet20Diagnostic"])
    m.command=lambda *_args,**_kwargs:{"HBNF":{"packet20Diagnostic":{"lastCommandAccepted":True}}}
    m.foundation_prequal_windows=lambda *_: (_ for _ in ()).throw(TimeoutError("prequal read failed"))
    m._restore_snapshot=lambda sid,shash:{"restoreVerified":True,"snapshotId":sid,"snapshotHash":shash,"packet20Same":True}
    try: m.snapshot(str(pathlib.Path(td)/"OBSERVER_EFFECT.json")); raise AssertionError("observer failure not surfaced")
    except RuntimeError as exc: assert "OBSERVER_FAILED__RENDERER_RESTORED" in str(exc)
    sidecar=json.loads((pathlib.Path(td)/"OBSERVER_EFFECT_FAILURE.json").read_text())
    assert sidecar["snapshotId"]==7 and sidecar["snapshotHash"]==1234
    assert sidecar["restore"]["restoreVerified"] is True and sidecar["restore"]["packet20Same"] is True
    assert sidecar["status"]=="OBSERVER_FAILED__RENDERER_RESTORED"

# Observer effect is labeled for the current identity-verified artifact, not a
# historical sequence number, because the same host adapter serves R4 and R7.
with tempfile.TemporaryDirectory() as td:
    m.foundation_prequal_windows=real_prequal
    m.select=lambda kernel:None
    m.enable_tails=lambda enabled: ({"HBNF":{"foundationTelemetry":{"enabled":enabled}}},{})
    window_calls=[]
    def fake_window(stage,*args,**kwargs):
        window_calls.append((stage,args,kwargs));return [20.0]*25
    m.collect_frame_window=fake_window
    m.telemetry=lambda *args,**kwargs:{"kernel_id":0,"frame_ms_max":40.0}
    result=m.foundation_prequal_windows(str(pathlib.Path(td)/"OBSERVER_EFFECT.json"),str(inventory))
    assert result["status"]=="PASS"
    assert result["observer_effect"]["status"]=="MEASURED_ON_CURRENT_ARTIFACT"
    assert result["observer_effect"]["lightweight_samples"]==25 and result["observer_effect"]["instrumented_samples"]==25
    assert result["steady_state"]["tails_enabled"] is False and result["steady_state"]["duration_seconds"]==40
    assert result["sacrificial_warmup"]["tails_enabled"] is True and result["sacrificial_warmup"]["excluded_from_foundation"] is True
    assert [x[0] for x in window_calls]==["foundation-steady-state-tails-off","foundation-observer-instrumented-sacrificial-warmup"]

def invalid_json(*args,**kwargs):
    class Response:
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def read(self):return b"{not-json"
    return Response()
with unittest.mock.patch.object(m.urllib.request,"urlopen",side_effect=invalid_json):
    try:m.get("http://192.168.77.10/json/state");raise AssertionError("invalid GET JSON accepted")
    except RuntimeError as exc:assert "returned invalid JSON" in str(exc) and "body_tail" in str(exc)

print("PASS: Foundation adapter enforces exact Matrix/runtime identity and emits complete tail/heap/stage telemetry without network access")

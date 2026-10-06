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

# Never launch an HTTP state read when the remaining budget is below reserve.
clock=FakeClock();calls=[]
def reserve_edge_state(deadline,stage):
    calls.append(stage);clock.now+=1.1
    return {"HBNF":{"timing":{"wholeFrameUs":20000}}},{}
with unittest.mock.patch.object(m.time,"monotonic",side_effect=clock.monotonic), \
     unittest.mock.patch.object(m.time,"sleep",side_effect=clock.sleep), \
     unittest.mock.patch.object(m,"p20_state",side_effect=reserve_edge_state):
    try:m.collect_frame_window("reserve",window_seconds=2,reserve_seconds=1,minimum_samples=2);raise AssertionError("under-sampled window accepted")
    except RuntimeError as exc:assert "reserve-under-sampled:1<2" in str(exc)
assert len(calls)==1, calls

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

info={"ip":"192.168.77.10","mac":"70:4b:ca:5b:34:5c","uptime":100,"ws":0,
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
    def fake_get(url,*args,**kwargs):
        if url==m.MATRIX+"/json/info":return info
        if url==m.MATRIX+"/hbnf/build.json":return build
        if url==m.AUX+"/json/info":return aux
        if url==m.AUX+"/json/state":return aux_state
        raise AssertionError("unexpected telemetry endpoint: "+url)
    m.get=fake_get
    state={"HBNF":{"timing":{"kernel":0,"uptimeSec":100,"fps":42,"variantSignature":7,
      "freeHeap":88000,"rssi":-45,"wholeFrameUs":19000,"auxProjectionAgeMs":2},
      "foundationTelemetry":{"enabled":True,"frameMsAvg":19,"frameMsP50":18,
      "frameMsP95":21,"frameMsP99":23,"frameMsMax":25,"minimumFreeHeapBytes":80000,
      "largestFreeBlockBytes":60000,"sampleCount":300,"frameTailBinResolutionUs":250,
      "frameTailOverflow":False,"kernelMsAvg":8,"kernelMsP95":10,"paletteMsAvg":3,
      "paletteMsP95":4,"audioMsAvg":1,"audioMsP95":2,"schedulerMsAvg":1,
      "schedulerMsP95":2,"overlayMsAvg":0.1,"overlayMsP95":0.2,
      "auxPrepareSendMsAvg":0.5,"auxPrepareSendMsP95":0.8,"unaccountedMsAvg":5,
      "unaccountedMsP95":6}}}
    m.enable_tails=lambda enabled:(state,{})
    with contextlib.redirect_stdout(io.StringIO()) as output:
        m.telemetry(str(inventory),"run-a")
    sample=json.loads(output.getvalue())
    assert sample["aux_projection_active"] is True
    assert sample["aux_frame_lock_rx_active"] is False
    assert sample["aux_projection_age_valid"] is False
    assert sample["aux_projection_age_ms"]==4294967295
    required={"release_id","uptime_seconds","fps","frame_ms_p50","frame_ms_p95",
      "frame_ms_p99","frame_ms_max","kernel_id","kernel_name","variant_id",
      "free_heap_bytes","minimum_free_heap_bytes","largest_free_block_bytes",
      "websocket_clients","aux_projection_active","aux_projection_age_ms","aux_render_fps",
      "wifi_rssi_dbm","restart_count","kernel_ms_avg","kernel_ms_p95","palette_ms_avg",
      "palette_ms_p95","audio_ms_avg","audio_ms_p95","scheduler_ms_avg","scheduler_ms_p95",
      "overlay_ms_avg","overlay_ms_p95","aux_prepare_send_ms_avg","aux_prepare_send_ms_p95",
      "unaccounted_ms_avg","unaccounted_ms_p95"}
    assert required <= sample.keys(), required-sample.keys()
    assert sample["release_id"]==m.EXPECTED and sample["kernel_name"]=="Complex_Kaleido_3"
    assert sample["frame_ms_p99"]==23 and sample["minimum_free_heap_bytes"]==80000
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
    with contextlib.redirect_stdout(io.StringIO()) as output:m.telemetry(str(inventory),"run-a")
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
        m.telemetry(str(inventory),"run-a")
    overflow_sample=json.loads(output.getvalue())
    assert overflow_sample["frame_tail_overflow"] is True
    assert overflow_sample["frame_ms_max"]==12559.93
    assert overflow_sample["frame_tail_saturated_quantile_ms"]==127.875
    # If a percentile itself reaches the final-bin representative, the
    # telemetry contract still fails closed before any profile is accepted.
    ft["frameMsP99"]=127.875
    try:
        with contextlib.redirect_stdout(io.StringIO()):m.telemetry(str(inventory),"run-a")
        raise AssertionError("saturated percentile was accepted")
    except RuntimeError as exc:
        assert "foundation-frame-tail-quantile-saturated-at-127.875ms" in str(exc)
        raw_path=pathlib.Path("run-a")/"SATURATED_TELEMETRY_RAW.json"
        raw=json.loads(raw_path.read_text())
        assert raw["status"]=="SATURATED" and raw["frame_ms_max"]==12559.93
        assert raw["saturated_fields"]==["frameMsP99"]
    ft["frameMsP99"]=36.65
    state["HBNF"]["timing"]["uptimeSec"]=90
    with contextlib.redirect_stdout(io.StringIO()) as output:m.telemetry(str(inventory),"run-a")
    assert json.loads(output.getvalue())["restart_count"]==1
    with contextlib.redirect_stdout(io.StringIO()) as output:m.telemetry(str(inventory),"run-b")
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
    idle={"HBNF":{"packet20Diagnostic":{"enabled":True,"snapshotValid":False,"snapshotState":"IDLE"}}}
    snapshot_state={"HBNF":{"packet20Diagnostic":{"enabled":True,"snapshotValid":True,
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

# Seq39 remeasures observer effect exactly once on the changed telemetry artifact.
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
    assert result["observer_effect"]["status"]=="MEASURED_ON_SEQ39_EXACT_ARTIFACT"
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

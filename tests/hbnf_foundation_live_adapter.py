#!/usr/bin/env python3
"""Pure contract tests for the R4 Foundation live adapter."""
import contextlib, importlib.util, io, json, pathlib, tempfile, unittest.mock

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("foundation_adapter",ROOT/"scripts/hbnf_foundation_live_adapter.py")
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
real_get=m.get
assert m.HTTP_TIMEOUT_SECONDS == 10
assert m.POST_TIMEOUT_SECONDS == 25
assert m.COMMAND_ACK_TIMEOUT_SECONDS == 30
assert m.SNAPSHOT_READY_TIMEOUT_SECONDS == 45
assert m.RESTORE_VERIFY_TIMEOUT_SECONDS == 90
with unittest.mock.patch.object(m.time,"monotonic",return_value=100.0):
    assert not m.observer_poll_budget_available(100.0162015)
    assert m.observer_poll_budget_available(101.0)

info={"ip":"192.168.77.10","mac":"70:4b:ca:5b:34:5c","uptime":100,"ws":0,
      "deviceId":"matrix-device","freeheap":90000,"wifi":{"rssi":-45}}
build={"release_id":m.EXPECTED,"candidate":m.EXPECTED,"wled":"16.0.1"}
aux={"ip":"192.168.77.11","mac":"8c94df55c34c","live":True,"lm":"DDP",
     "lip":"192.168.77.10","leds":{"fps":42}}
with tempfile.TemporaryDirectory() as td:
    t=pathlib.Path(td); m.CACHE=t/"restart-cache.json"
    inventory=ROOT/"config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json"
    m.get=lambda url: info if url.endswith("/json/info") and "77.10" in url else build if url.endswith("/hbnf/build.json") else aux
    state={"HBNF":{"timing":{"kernel":0,"uptimeSec":100,"fps":42,"variantSignature":7,
      "freeHeap":88000,"rssi":-45,"wholeFrameUs":19000,"auxProjectionAgeMs":2},
      "foundationTelemetry":{"enabled":True,"frameMsAvg":19,"frameMsP50":18,
      "frameMsP95":21,"frameMsP99":23,"frameMsMax":25,"minimumFreeHeapBytes":80000,
      "largestFreeBlockBytes":60000,"sampleCount":300,"frameTailBinResolutionUs":1000,
      "frameTailOverflow":False,"kernelMsAvg":8,"kernelMsP95":10,"paletteMsAvg":3,
      "paletteMsP95":4,"audioMsAvg":1,"audioMsP95":2,"schedulerMsAvg":1,
      "schedulerMsP95":2,"overlayMsAvg":0.1,"overlayMsP95":0.2,
      "auxPrepareSendMsAvg":0.5,"auxPrepareSendMsP95":0.8,"unaccountedMsAvg":5,
      "unaccountedMsP95":6}}}
    m.enable_tails=lambda enabled:(state,{})
    with contextlib.redirect_stdout(io.StringIO()) as output:
        m.telemetry(str(inventory),"run-a")
    sample=json.loads(output.getvalue())
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
    # A max in the final bin sets the firmware's global overflow bit, but does
    # not invalidate unsaturated percentile ranks. Preserve the exact max and
    # overflow flag for later baseline-relative gate evaluation.
    ft=state["HBNF"]["foundationTelemetry"]
    ft.update(frameTailOverflow=True,frameMsMax=12559.93,frameMsP99=36.65,
              frameTailBinResolutionUs=100)
    with contextlib.redirect_stdout(io.StringIO()) as output:
        m.telemetry(str(inventory),"run-a")
    overflow_sample=json.loads(output.getvalue())
    assert overflow_sample["frame_tail_overflow"] is True
    assert overflow_sample["frame_ms_max"]==12559.93
    assert overflow_sample["frame_tail_saturated_quantile_ms"]==51.15
    # If a percentile itself reaches the final-bin representative, the
    # telemetry contract still fails closed before any profile is accepted.
    ft["frameMsP99"]=51.15
    try:
        with contextlib.redirect_stdout(io.StringIO()):m.telemetry(str(inventory),"run-a")
        raise AssertionError("saturated percentile was accepted")
    except RuntimeError as exc:
        assert "foundation-frame-tail-quantile-saturated-at-51.15ms" in str(exc)
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
    m.observer_effect=lambda *_: (_ for _ in ()).throw(TimeoutError("observer read failed"))
    m._restore_snapshot=lambda sid,shash:{"restoreVerified":True,"snapshotId":sid,"snapshotHash":shash,"packet20Same":True}
    try: m.snapshot(str(pathlib.Path(td)/"OBSERVER_EFFECT.json")); raise AssertionError("observer failure not surfaced")
    except RuntimeError as exc: assert "OBSERVER_FAILED__RENDERER_RESTORED" in str(exc)
    sidecar=json.loads((pathlib.Path(td)/"OBSERVER_EFFECT_FAILURE.json").read_text())
    assert sidecar["snapshotId"]==7 and sidecar["snapshotHash"]==1234
    assert sidecar["restore"]["restoreVerified"] is True and sidecar["restore"]["packet20Same"] is True

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

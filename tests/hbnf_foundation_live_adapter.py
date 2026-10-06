#!/usr/bin/env python3
"""Pure contract tests for the R4 Foundation live adapter."""
import contextlib, importlib.util, io, json, pathlib, tempfile

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("foundation_adapter",ROOT/"scripts/hbnf_foundation_live_adapter.py")
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

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
        m.telemetry(str(inventory))
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

bad_build={**build,"release_id":"wrong"}
m.get=lambda url: info if url.endswith("/json/info") else bad_build
try:
    m.identity(); raise AssertionError("mismatched runtime release accepted")
except RuntimeError as exc:
    assert "release-identity-mismatch" in str(exc)

print("PASS: Foundation adapter enforces exact Matrix/runtime identity and emits complete tail/heap/stage telemetry without network access")

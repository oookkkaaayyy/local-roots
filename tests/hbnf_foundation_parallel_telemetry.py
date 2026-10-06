#!/usr/bin/env python3
"""Offline proof that soak telemetry reads are concurrent and tightly bounded."""
from __future__ import annotations

import http.server
import json
import pathlib
import sys
import tempfile
import threading
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import hbnf_foundation_live_adapter as adapter
import hbnf_foundation_continuous_soak as continuous

RELEASE = adapter.EXPECTED
MAC = "70:4b:ca:5b:34:5c"
AUX_MAC = "8c94df55c34c"

def responses():
    return {
      "/json/info": {"ip":"192.168.77.10", "mac":MAC, "uptime":100, "ws":0},
      "/hbnf/build.json": {"ip":"192.168.77.10", "mac":MAC,
                            "release_id":RELEASE, "candidate":RELEASE},
      "/json/state": {"HBNF": {
        "timing":{"kernel":0,"uptimeSec":100,"fps":42,"variantSignature":7,
          "freeHeap":88000,"rssi":-45,"wholeFrameUs":19000,"auxProjectionAgeMs":2},
        "foundationTelemetry":{"enabled":True,"frameMsAvg":19,"frameMsP50":18,
          "frameMsP95":21,"frameMsP99":23,"frameMsMax":25,"minimumFreeHeapBytes":80000,
          "largestFreeBlockBytes":60000,"sampleCount":300,"frameTailBinResolutionUs":250,
          "frameTailOverflow":False,"kernelMsAvg":8,"kernelMsP95":10,"paletteMsAvg":3,
          "paletteMsP95":4,"audioMsAvg":1,"audioMsP95":2,"schedulerMsAvg":1,
          "schedulerMsP95":2,"overlayMsAvg":0.1,"overlayMsP95":0.2,
          "auxPrepareSendMsAvg":0.5,"auxPrepareSendMsP95":0.8,"unaccountedMsAvg":5,
          "unaccountedMsP95":6}}},
      "/aux/json/info": {"ip":"192.168.77.11","mac":AUX_MAC,"live":True,
                          "lm":"DDP","lip":"192.168.77.10","leds":{"fps":42}},
      "/aux/json/state": {"on":True,"HBNFAUX":{"projectionRxPackets":0,
          "projectionRxSeq":0,"projectionRxActive":False,"projectionRxAgeMs":4294967295,
          "projectionHelloPackets":10,"projectionPeerKnown":False}}
    }

class Handler(http.server.BaseHTTPRequestHandler):
    delay = 0.0
    delay_path = None
    payloads = responses()
    seen = []
    def do_GET(self):
        type(self).seen.append((self.path, time.monotonic()))
        if type(self).delay and (type(self).delay_path is None or self.path == type(self).delay_path):
            time.sleep(type(self).delay)
        body=json.dumps(type(self).payloads[self.path]).encode()
        self.send_response(200); self.send_header("Content-Type","application/json")
        self.send_header("Content-Length",str(len(body))); self.end_headers(); self.wfile.write(body)
    def log_message(self, *_): pass

class Server(http.server.ThreadingHTTPServer):
    daemon_threads=True

def run_server():
    server=Server(("127.0.0.1",0),Handler)
    thread=threading.Thread(target=server.serve_forever,daemon=True); thread.start()
    return server,thread

inventory={"entries":[{"runtime_kernel_index_expected":0,"kernel_name":"effect-0"}]}
assert continuous.SAMPLE_COMMAND_TIMEOUT_SECONDS==7.0
assert continuous.SAMPLE_COMMAND_TIMEOUT_SECONDS<continuous.sweep.MAX_FOUNDATION_SOAK_SAMPLE_GAP_SECONDS
assert adapter.SOAK_TELEMETRY_BATCH_TIMEOUT_SECONDS<continuous.SAMPLE_COMMAND_TIMEOUT_SECONDS

server,thread=run_server()
try:
    Handler.seen=[]; Handler.delay=1.6; Handler.delay_path=None
    adapter.MATRIX=f"http://127.0.0.1:{server.server_address[1]}"
    adapter.AUX=f"http://127.0.0.1:{server.server_address[1]}/aux"
    adapter.MAC=MAC.replace(":","").lower()
    with tempfile.TemporaryDirectory(prefix="hbnf-parallel-poll-") as td:
        root=pathlib.Path(td); adapter.CACHE=root/"cache.json"
        inv=root/"inventory.json"; inv.write_text(json.dumps(inventory))
        start=time.monotonic()
        sample=adapter.telemetry(str(inv),str(root/"run"),emit=False)
        elapsed=time.monotonic()-start
        arrivals=[stamp for _,stamp in Handler.seen]
        assert len(Handler.seen)==5, Handler.seen
        assert max(arrivals)-min(arrivals)<0.25, arrivals
        assert elapsed<3.2, elapsed  # Five 1.6s endpoints would take >8s serially.
        assert sample["release_id"]==RELEASE and sample["kernel_name"]=="effect-0"
        assert sample["aux_projection_active"] is True
        print(f"PASS: all five endpoints overlapped; 1.6s simulated latency per endpoint completed in {elapsed:.3f}s")

        # A genuinely slow endpoint still fails closed at the per-request bound,
        # and the failure receipt names the concrete endpoint without a retry.
        Handler.seen=[]; Handler.delay=adapter.SOAK_TELEMETRY_HTTP_TIMEOUT_SECONDS+1
        Handler.delay_path="/aux/json/state"
        started=time.monotonic()
        try:
            adapter.telemetry(str(inv),str(root/"timeout-run"),emit=False)
            raise AssertionError("slow endpoint was accepted")
        except RuntimeError as exc:
            assert "parallel-soak-telemetry-read-failed" in str(exc), exc
            assert "aux_state" in str(exc), exc
        failure=(root/"timeout-run"/"TELEMETRY_PARALLEL_READ_FAILURES.jsonl").read_text()
        assert "aux_state" in failure and "completed_response_sha256" in failure, failure
        timeout_elapsed=time.monotonic()-started
        assert timeout_elapsed<5.2, timeout_elapsed
        print(f"PASS: slow endpoint failed closed and was localized in {timeout_elapsed:.3f}s with partial-response hashes preserved")
finally:
    server.shutdown(); server.server_close(); thread.join(timeout=2)

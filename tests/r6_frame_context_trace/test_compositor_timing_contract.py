"""Bind the bounded transaction to the exact low-observer compositor diagnostic."""
import hashlib
import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location("diag_transaction",ROOT/"scripts/hbnf_r6_frame_context_diagnostic_transaction.py")
tx=importlib.util.module_from_spec(spec);spec.loader.exec_module(tx)

receipt=json.loads((ROOT/"evidence/cart2-r6-compositor-timing-diagnostic-20261011/BUILD_RECEIPT.json").read_text())
binding=json.loads((ROOT/"firmware/phase2/integration-r6-compositor-timing/SOURCE_BINDING.json").read_text())
binary=tx.DIAG_BIN.read_bytes()
assert tx.DIAG_ID==binding["release_id"]
assert hashlib.sha256(binary).hexdigest()==tx.DIAG_SHA==receipt["artifact"]["sha256"]
assert len(binary)==tx.DIAG_SIZE==receipt["artifact"]["bytes"]
assert tx.expected_artifact(tx.DIAG_BIN)==(tx.DIAG_SHA,tx.DIAG_SIZE,"hbnf-r6-compositor-timing-diagnostic")
assert tx.expected_artifact(tx.R4_BIN)==(tx.R4_SHA,1489008,"hbnf-r4-exact-return")

with TemporaryDirectory() as directory:
    root=Path(directory);(root/"config").mkdir()
    state={"live_mutation_authorized":False,"live_authorization_binding":{
        "candidate_release_id":tx.DIAG_ID,"candidate_bin_sha256":tx.DIAG_SHA,
        "rollback_bin_sha256":tx.R4_SHA,"matrix_mac":"70:4b:ca:5b:34:5c"},
        tx.AUTH_KEY:{"candidate_release_id":tx.DIAG_ID,"candidate_sha256":tx.DIAG_SHA,
        "mandatory_return_sha256":tx.R4_SHA,"authorization_consumed":False,"install_attempts_used":0}}
    state_path=root/"config/HBNF_CONTROL_STATE.json";state_path.write_text(json.dumps(state))
    old_root=tx.ROOT
    try:
        tx.ROOT=root
        try:tx.consume_authorization_before_write()
        except RuntimeError as exc:assert "exact live authority binding missing" in str(exc)
        else:raise AssertionError("closed control state must reject before authorization consumption")
        assert json.loads(state_path.read_text())==state
        assert not list(root.rglob("AUTHORIZATION_CONSUMPTION.json"))
    finally:tx.ROOT=old_root

sample={"enabled":True,"sampleCount":78,"frameTailOverflow":True,"frameTailBinResolutionUs":250}
sample.update({key:float(i+1) for i,key in enumerate(tx.COMPOSITOR_METRICS)})
captured=tx.compositor_timing_sample(sample)
assert captured["sampleCount"]==78 and captured["vibeCompositorMsP99"]>0
rows=[{key:1.0 for key in tx.COMPOSITOR_METRICS} for _ in range(8)]
assert tx.complete_timing_capture(rows,True,None)
assert not tx.complete_timing_capture(rows[:3],True,None)
assert not tx.complete_timing_capture(rows,True,"RuntimeError: CATASTROPHIC_ABORT")
assert not tx.complete_timing_capture(rows,False,None)
for invalid in ({**sample,"vibeCompositorMsP99":None},{**sample,"enabled":False},{**sample,"sampleCount":0}):
    try:tx.compositor_timing_sample(invalid)
    except RuntimeError:pass
    else:raise AssertionError("incomplete timing evidence must fail closed")
for invalid in ({**sample,"sampleCount":"78"},{**sample,"sampleCount":True},{**sample,"vibeCompositorMsP99":True}):
    try:tx.compositor_timing_sample(invalid)
    except RuntimeError:pass
    else:raise AssertionError("malformed numeric evidence must fail closed")

assert "not independent polling windows" in json.loads((ROOT/"evidence/cart2-r6-compositor-timing-diagnostic-20261011/live-diagnostic/COMPOSITOR_TIMING_DIAGNOSTIC_DRYRUN.json").read_text())["percentile_semantics"]

source=(ROOT/"scripts/hbnf_r6_frame_context_diagnostic_transaction.py").read_text()
assert '"traceStart"' not in source and '"traceStop"' not in source and '"traceRead"' not in source
assert "one exact r6 compositor-timing diagnostic" in source.lower()
print("PASS exact diagnostic/rollback binding, complete timing contract, and no extra frame-trace observer")

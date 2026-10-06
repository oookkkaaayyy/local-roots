#!/usr/bin/env python3
import importlib.util, json, pathlib, tempfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("runner",ROOT/"scripts/hbnf_live_kernel_sweep.py")
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

adapter={
 "schema":"hbnf-live-sweep-adapter-v1",
 "snapshot_argv":["python3","x.py","snapshot"],
 "select_argv":["python3","x.py","select","{effect_id}"],
 "telemetry_argv":["python3","x.py","telemetry"],
 "restore_argv":["python3","x.py","restore","{snapshot_file}"],
 "settle_seconds":1,"sample_seconds":2,"sample_interval_seconds":1,
 "expected_release_id":"r7"
}
m.validate_adapter(adapter)

missing_release=dict(adapter); missing_release["expected_release_id"]=""
try: m.validate_adapter(missing_release); raise AssertionError("empty expected release accepted")
except ValueError: pass

bad=dict(adapter); bad["select_argv"]=["python3","x.py","select"]
try: m.validate_adapter(bad); raise AssertionError("missing effect placeholder accepted")
except ValueError: pass

runtime_index_adapter=dict(adapter)
runtime_index_adapter["select_argv"]=["python3","x.py","select","--kernel","{runtime_kernel_index}"]
m.validate_adapter(runtime_index_adapter)

inv=json.loads((ROOT/"config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json").read_text())
m.validate_inventory(inv)
assert inv["entries"][2]["kernel_name"]=="Parametric_Water"
assert inv["entries"][3]["kernel_name"]=="RGB_Blobs5"

sample={
 "release_id":"r7","uptime_seconds":10,"fps":11.5,"frame_ms_avg":85.3,
 "kernel_id":2,"kernel_name":"Parametric_Water","variant_id":1,
 "kernel_ms_avg":68.9,"palette_ms_avg":0.47,"audio_ms_avg":6.7,
 "overlay_ms_avg":0.04,"aux_prepare_send_ms_avg":4.8,"unaccounted_ms_avg":3.0,
 "free_heap_bytes":98700,"websocket_clients":0,"aux_projection_active":True,
 "aux_render_fps":11.5,"wifi_rssi_dbm":-45,"restart_count":0
}
m.validate_sample(sample,"diagnostic")
m.verify_selected(sample,inv["entries"][2])
release_id,restarts,uptime=m.validate_continuity(sample)
assert release_id=="r7" and restarts==0 and uptime==10
m.validate_continuity(sample,"r7",0,9)
changed_release=dict(sample); changed_release["release_id"]="r8"
try: m.validate_continuity(changed_release,"r7",0,10); raise AssertionError("release change accepted")
except RuntimeError: pass
changed_restart=dict(sample); changed_restart["restart_count"]=1
try: m.validate_continuity(changed_restart,"r7",0,10); raise AssertionError("restart accepted")
except RuntimeError: pass
lower_uptime=dict(sample); lower_uptime["uptime_seconds"]=9
try: m.validate_continuity(lower_uptime,"r7",0,10); raise AssertionError("uptime regression accepted")
except RuntimeError: pass
m.assert_same_snapshot({"effect":220,"bri":90},{"effect":220,"bri":90})
try: m.assert_same_snapshot({"effect":220},{"effect":221}); raise AssertionError("restore mismatch accepted")
except RuntimeError: pass

foundation=dict(sample)
foundation.update({
 "frame_ms_p50":80,"frame_ms_p95":90,"frame_ms_p99":100,"frame_ms_max":120,
 "minimum_free_heap_bytes":97000,"largest_free_block_bytes":70000,
 "aux_projection_age_ms":10,
 "kernel_ms_p95":75,"palette_ms_p95":1,"audio_ms_p95":8,"scheduler_ms_avg":1,"scheduler_ms_p95":2,
 "overlay_ms_p95":0.1,"aux_prepare_send_ms_p95":6,"unaccounted_ms_p95":4
})
m.validate_sample(foundation,"foundation")

foundation_adapter=json.loads((ROOT/"config/HBNF_FOUNDATION_LIVE_SWEEP_ADAPTER_20261005.json").read_text())
m.validate_adapter(foundation_adapter)
assert foundation_adapter["expected_release_id"]=="hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1"
assert "{runtime_kernel_index}" in " ".join(foundation_adapter["select_argv"])
assert pathlib.Path(foundation_adapter["telemetry_argv"][foundation_adapter["telemetry_argv"].index("--inventory")+1]).is_absolute()
wrong=dict(sample); wrong["kernel_name"]="RGB_Blobs5"
try: m.verify_selected(wrong,inv["entries"][2]); raise AssertionError("wrong kernel accepted")
except RuntimeError: pass

# Cross-kernel continuity must carry forward the previous kernel's last uptime.
next_kernel=dict(sample); next_kernel["kernel_id"]=3; next_kernel["kernel_name"]="RGB_Blobs5"; next_kernel["uptime_seconds"]=11
m.validate_continuity(next_kernel,"r7",0,10)
regressed_next=dict(next_kernel); regressed_next["uptime_seconds"]=9
try: m.validate_continuity(regressed_next,"r7",0,10); raise AssertionError("cross-kernel uptime regression accepted")
except RuntimeError: pass

# A continuity/identity failure sample must survive as decisive evidence.
with tempfile.TemporaryDirectory() as td:
    out=pathlib.Path(td)
    p=m.persist_failure_sample(out,inv["entries"][2],"sample",sample,RuntimeError("synthetic failure"))
    payload=json.loads(p.read_text())
    assert payload["status"]=="FAIL"
    assert payload["phase"]=="sample"
    assert payload["sample"]["kernel_name"]=="Parametric_Water"
    assert payload["requested"]["effect_id"]==222

print("PASS: live sweep runner validates adapter/inventory/telemetry, cross-kernel continuity, failure evidence, kernel identity, and exact restore snapshots")

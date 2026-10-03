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
 "settle_seconds":1,"sample_seconds":2,"sample_interval_seconds":1
}
m.validate_adapter(adapter)

bad=dict(adapter); bad["select_argv"]=["python3","x.py","select"]
try: m.validate_adapter(bad); raise AssertionError("missing effect placeholder accepted")
except ValueError: pass

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

foundation=dict(sample)
foundation.update({
 "frame_ms_p50":80,"frame_ms_p95":90,"frame_ms_p99":100,"frame_ms_max":120,
 "minimum_free_heap_bytes":97000,"largest_free_block_bytes":70000,
 "aux_projection_age_ms":10
})
m.validate_sample(foundation,"foundation")
wrong=dict(sample); wrong["kernel_name"]="RGB_Blobs5"
try: m.verify_selected(wrong,inv["entries"][2]); raise AssertionError("wrong kernel accepted")
except RuntimeError: pass

print("PASS: live sweep runner validates adapter/inventory/telemetry and rejects wrong selected kernel")

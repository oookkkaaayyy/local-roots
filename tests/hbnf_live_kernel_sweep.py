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
 "release_id":"r7","uptime_seconds":10,"fps":35,
 "frame_ms_p50":28,"frame_ms_p95":31,"frame_ms_p99":35,"frame_ms_max":40,
 "kernel_id":2,"kernel_name":"Parametric_Water","variant_id":1,
 "free_heap_bytes":99000,"minimum_free_heap_bytes":98000,"largest_free_block_bytes":70000,
 "websocket_clients":0,"aux_projection_active":True,"aux_projection_age_ms":10,
 "aux_render_fps":35,"wifi_rssi_dbm":-40,"restart_count":0
}
m.validate_sample(sample)
m.verify_selected(sample,inv["entries"][2])
wrong=dict(sample); wrong["kernel_name"]="RGB_Blobs5"
try: m.verify_selected(wrong,inv["entries"][2]); raise AssertionError("wrong kernel accepted")
except RuntimeError: pass

print("PASS: live sweep runner validates adapter/inventory/telemetry and rejects wrong selected kernel")

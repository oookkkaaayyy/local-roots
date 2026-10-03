#!/usr/bin/env python3
import importlib.util, pathlib

ROOT=pathlib.Path(__file__).resolve().parents[1]
SCRIPT=ROOT/"scripts/hbnf_runtime_qualify.py"
spec=importlib.util.spec_from_file_location("hbnf_runtime_qualify",SCRIPT)
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

def foundation_sample(i,fps=35,p95=31,p99=36,mx=42,free=100000,minfree=95000,largest=70000,aux=True,auxage=20,restarts=0):
    return {
      "release_id":"golden","uptime_seconds":i*5,"fps":fps,
      "frame_ms_p50":28.5,"frame_ms_p95":p95,"frame_ms_p99":p99,"frame_ms_max":mx,
      "frame_ms_avg":28.8,
      "kernel_id":2,"kernel_name":"Parametric_Water","variant_id":1,
      "free_heap_bytes":free,"minimum_free_heap_bytes":minfree,"largest_free_block_bytes":largest,
      "websocket_clients":1,"aux_projection_active":aux,"aux_projection_age_ms":auxage,
      "aux_render_fps":fps,"wifi_rssi_dbm":-40,
      "kernel_ms_avg":18,"kernel_ms_p95":20,"palette_ms_avg":4,"palette_ms_p95":5,
      "audio_ms_avg":2,"audio_ms_p95":3,"scheduler_ms_avg":1,"scheduler_ms_p95":2,
      "overlay_ms_avg":0.5,"overlay_ms_p95":1,"aux_prepare_send_ms_avg":1.5,"aux_prepare_send_ms_p95":2,
      "unaccounted_ms_avg":2,"unaccounted_ms_p95":3,
      "restart_count":restarts
    }

def diagnostic_sample(i,fps=11.5,kernel_ms=68.9):
    return {
      "release_id":"r7","uptime_seconds":i,
      "fps":fps,"frame_ms_avg":85.3,
      "kernel_id":2,"kernel_name":"Parametric_Water","variant_id":1,
      "kernel_ms_avg":kernel_ms,"palette_ms_avg":0.47,"audio_ms_avg":6.7,
      "overlay_ms_avg":0.04,"aux_prepare_send_ms_avg":4.8,"unaccounted_ms_avg":3.0,
      "free_heap_bytes":98700,"websocket_clients":0,"aux_projection_active":True,
      "aux_render_fps":fps,"wifi_rssi_dbm":-45,"restart_count":0
    }

baseline=m.summarize([foundation_sample(i) for i in range(1,61)],"foundation")
policy={"comparison":{"candidate_vs_baseline":{
  "fps_median_min_ratio":0.85,
  "frame_p95_max_ratio":1.20,
  "frame_p99_max_ratio":1.25,
  "frame_max_max_ratio":1.50,
  "minimum_free_heap_min_ratio":0.85,
  "largest_free_block_min_ratio":0.80,
  "aux_stale_sample_max_fraction":0.02
}}}

good=m.summarize([foundation_sample(i,fps=34,p95=32,p99=38,mx=45,free=99000,minfree=94000,largest=69000) for i in range(1,61)],"foundation")
assert m.qualify(good,baseline,policy)==[]
assert good["stages"]["palette_ms_p95"]["median"]==5
assert good["aux"]["render_fps_median"]==34
assert good["wifi"]["rssi_dbm_median"]==-40

tail=m.summarize([foundation_sample(i,fps=34,p95=32,p99=55,mx=90) for i in range(1,61)],"foundation")
assert any("frame p99" in x or "frame max" in x for x in m.qualify(tail,baseline,policy))

heap=m.summarize([foundation_sample(i,free=80000,minfree=70000,largest=45000) for i in range(1,61)],"foundation")
assert any("heap" in x or "largest free block" in x for x in m.qualify(heap,baseline,policy))

diag=m.summarize([diagnostic_sample(i) for i in range(1,31)],"diagnostic")
assert diag["validation_errors"]==[]
assert diag["qualification_eligible"] is False
assert diag["frame_ms"]["avg_median"]==85.3
assert diag["stages"]["kernel_ms_avg"]["median"]==68.9
assert any("diagnostic profile cannot" in x for x in m.qualify(diag,baseline,policy))

wrong=[diagnostic_sample(i) for i in range(1,5)]
wrong[-1]["kernel_name"]="RGB_Blobs5"
assert any("kernel/variant identity changed" in x for x in m.summarize(wrong,"diagnostic")["validation_errors"])

print("PASS: diagnostic sweep can rank current firmware without tail metrics; foundation qualification remains fail-closed")

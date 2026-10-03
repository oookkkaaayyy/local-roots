#!/usr/bin/env python3
import importlib.util, json, pathlib, tempfile

ROOT=pathlib.Path(__file__).resolve().parents[1]
SCRIPT=ROOT/"scripts/hbnf_runtime_qualify.py"
spec=importlib.util.spec_from_file_location("hbnf_runtime_qualify",SCRIPT)
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

def sample(i,fps=35,p95=31,p99=36,mx=42,free=100000,minfree=95000,largest=70000,aux=True,auxage=20,restarts=0):
    return {
      "release_id":"golden","uptime_seconds":i*5,"fps":fps,
      "frame_ms_p50":28.5,"frame_ms_p95":p95,"frame_ms_p99":p99,"frame_ms_max":mx,
      "kernel_id":220,"kernel_name":"TestKernel","variant_id":1,
      "free_heap_bytes":free,"minimum_free_heap_bytes":minfree,"largest_free_block_bytes":largest,
      "websocket_clients":1,"aux_projection_active":aux,"aux_projection_age_ms":auxage,
      "aux_render_fps":fps,"wifi_rssi_dbm":-40,
      "kernel_ms_avg":18,"kernel_ms_p95":20,"palette_ms_avg":4,"palette_ms_p95":5,
      "audio_ms_avg":2,"audio_ms_p95":3,"scheduler_ms_avg":1,"scheduler_ms_p95":2,
      "overlay_ms_avg":0.5,"overlay_ms_p95":1,"aux_prepare_send_ms_avg":1.5,"aux_prepare_send_ms_p95":2,
      "unaccounted_ms_avg":2,"unaccounted_ms_p95":3,
      "restart_count":restarts
    }

baseline=m.summarize([sample(i) for i in range(1,61)])
policy={"comparison":{"candidate_vs_baseline":{
  "fps_median_min_ratio":0.85,
  "frame_p95_max_ratio":1.20,
  "frame_p99_max_ratio":1.25,
  "frame_max_max_ratio":1.50,
  "minimum_free_heap_min_ratio":0.85,
  "largest_free_block_min_ratio":0.80,
  "aux_stale_sample_max_fraction":0.02
}}}

good=m.summarize([sample(i,fps=34,p95=32,p99=38,mx=45,free=99000,minfree=94000,largest=69000) for i in range(1,61)])
assert m.qualify(good,baseline,policy)==[]
assert good["stages"]["palette_ms_p95"]["median"]==5
assert good["aux"]["render_fps_median"]==34
assert good["wifi"]["rssi_dbm_median"]==-40

tail=m.summarize([sample(i,fps=34,p95=32,p99=55,mx=90) for i in range(1,61)])
assert any("frame p99" in x or "frame max" in x for x in m.qualify(tail,baseline,policy))

heap=m.summarize([sample(i,free=80000,minfree=70000,largest=45000) for i in range(1,61)])
assert any("heap" in x or "largest free block" in x for x in m.qualify(heap,baseline,policy))

aux=m.summarize([sample(i,aux=(i%5!=0),auxage=800 if i%5==0 else 20) for i in range(1,61)])
assert any("AUX" in x for x in m.qualify(aux,baseline,policy))

unset={"comparison":{"candidate_vs_baseline":{
  "fps_median_min_ratio":None,"frame_p95_max_ratio":None,"frame_p99_max_ratio":None,
  "frame_max_max_ratio":None,"minimum_free_heap_min_ratio":None,
  "largest_free_block_min_ratio":None,"aux_stale_sample_max_fraction":None
}}}
assert any("not frozen" in x for x in m.qualify(good,baseline,unset))

print("PASS: runtime qualification catches tail-latency, heap/fragmentation, AUX and unfrozen-policy failures")

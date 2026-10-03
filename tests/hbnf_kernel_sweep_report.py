#!/usr/bin/env python3
import json, pathlib, subprocess, sys, tempfile

ROOT=pathlib.Path(__file__).resolve().parents[1]
SCRIPT=ROOT/"scripts/hbnf_kernel_sweep_report.py"

def foundation_profile(i):
    return {"profile":{
      "contract":"foundation","validation_errors":[],
      "fps":{"median":35-i*.1},
      "frame_ms":{"avg_median":28+i*.1,"p95_median":30+i*.1,"p99_median":32+i*.2,"max":40+i*.3},
      "heap":{"free_end":99000,"minimum_free_min":95000,"largest_block_end":70000},
      "wifi":{"rssi_dbm_median":-40},"aux":{"render_fps_median":35-i*.1},
      "stages":{
        "kernel_ms_avg":{"median":14+i*.2},"kernel_ms_p95":{"median":15+i*.2},
        "palette_ms_avg":{"median":4},"palette_ms_p95":{"median":5},
        "audio_ms_avg":{"median":1.5},"audio_ms_p95":{"median":2},
        "scheduler_ms_avg":{"median":0.8},"scheduler_ms_p95":{"median":1.1},
        "overlay_ms_avg":{"median":0.3},"overlay_ms_p95":{"median":0.5},
        "aux_prepare_send_ms_avg":{"median":1.2},"aux_prepare_send_ms_p95":{"median":1.5},
        "unaccounted_ms_avg":{"median":1.5},"unaccounted_ms_p95":{"median":2}
      }
    }}

def diagnostic_profile(i):
    return {"profile":{
      "contract":"diagnostic","validation_errors":[],
      "fps":{"median":12-i*.05},
      "frame_ms":{"avg_median":80+i},
      "heap":{"free_end":98700,"minimum_free_min":None,"largest_block_end":None},
      "wifi":{"rssi_dbm_median":-45},"aux":{"render_fps_median":12-i*.05},
      "stages":{
        "kernel_ms_avg":{"median":60+i},
        "palette_ms_avg":{"median":0.5},
        "audio_ms_avg":{"median":6.5},
        "overlay_ms_avg":{"median":0.04},
        "aux_prepare_send_ms_avg":{"median":4.8},
        "unaccounted_ms_avg":{"median":3.0}
      }
    }}

def build_manifest(d,contract,profile_fn):
    kernels=[]
    for i in range(28):
        p=d/f"k{i}.json"; p.write_text(json.dumps(profile_fn(i)))
        kernels.append({"kernel_id":i,"kernel_name":f"K{i}","variant_id":0,"effect_id":220+i,"preset":61+i,"profile_path":p.name})
    m=d/"manifest.json"; m.write_text(json.dumps({"release_id":"test","contract":contract,"expected_kernel_count":28,"kernels":kernels}))
    return m

with tempfile.TemporaryDirectory() as td:
    d=pathlib.Path(td)

    # Diagnostic sweep ranks complete current-firmware data but cannot qualify foundation.
    m=build_manifest(d,"diagnostic",diagnostic_profile)
    p=subprocess.run([sys.executable,str(SCRIPT),"--manifest",str(m)],capture_output=True,text=True)
    assert p.returncode==0,(p.stdout,p.stderr)
    out=json.loads(p.stdout)
    assert out["coverage"]["complete"] is True
    assert out["contract"]=="diagnostic"
    assert out["ranked_slowest_first"][0]["kernel_name"]=="K27"
    assert out["shared_stage_summary"]["palette_avg_ms"]["median_across_kernels"]==0.5
    p=subprocess.run([sys.executable,str(SCRIPT),"--manifest",str(m),"--qualify"],capture_output=True,text=True)
    assert p.returncode!=0
    assert "diagnostic sweep cannot foundation-qualify" in p.stdout

    # Foundation sweep can qualify against frozen envelope.
    fdir=d/"foundation"; fdir.mkdir()
    m2=build_manifest(fdir,"foundation",foundation_profile)
    policy=fdir/"policy.json"
    policy.write_text(json.dumps({"all_kernel_sweep":{"envelope":{
      "min_fps_median":31,"max_frame_p95_ms":34,"max_frame_p99_ms":38,"max_frame_max_ms":49
    }}}))
    p=subprocess.run([sys.executable,str(SCRIPT),"--manifest",str(m2),"--policy",str(policy),"--qualify"],capture_output=True,text=True)
    assert p.returncode==0,(p.stdout,p.stderr)

    bad=json.loads(policy.read_text()); bad["all_kernel_sweep"]["envelope"]["max_frame_p99_ms"]=33
    policy.write_text(json.dumps(bad))
    p=subprocess.run([sys.executable,str(SCRIPT),"--manifest",str(m2),"--policy",str(policy),"--qualify"],capture_output=True,text=True)
    assert p.returncode!=0
    assert "envelope failure" in p.stdout

print("PASS: diagnostic sweep ranks all kernels without overclaiming; foundation sweep remains fail-closed")

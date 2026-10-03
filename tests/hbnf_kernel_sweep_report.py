#!/usr/bin/env python3
import json, pathlib, subprocess, sys, tempfile

ROOT=pathlib.Path(__file__).resolve().parents[1]
SCRIPT=ROOT/"scripts/hbnf_kernel_sweep_report.py"

def profile(i):
    return {
      "profile":{
        "validation_errors":[],
        "fps":{"median":35-i*.1},
        "frame_ms":{"p95_median":30+i*.1,"p99_median":32+i*.2,"max":40+i*.3},
        "heap":{"minimum_free_min":95000,"largest_block_end":70000},
        "wifi":{"rssi_dbm_median":-40},
        "aux":{"render_fps_median":35-i*.1},
        "stages":{
          "kernel_ms_p95":{"median":15+i*.2},
          "palette_ms_p95":{"median":5},
          "audio_ms_p95":{"median":2},
          "scheduler_ms_p95":{"median":1},
          "overlay_ms_p95":{"median":0.5},
          "aux_prepare_send_ms_p95":{"median":1.5},
          "unaccounted_ms_p95":{"median":2}
        }
      }
    }

with tempfile.TemporaryDirectory() as td:
    d=pathlib.Path(td)
    kernels=[]
    for i in range(28):
        p=d/f"k{i}.json"; p.write_text(json.dumps(profile(i)))
        kernels.append({"kernel_id":i,"kernel_name":f"K{i}","variant_id":0,"profile_path":p.name})
    m=d/"manifest.json"; m.write_text(json.dumps({"release_id":"test","expected_kernel_count":28,"kernels":kernels}))
    p=subprocess.run([sys.executable,str(SCRIPT),"--manifest",str(m)],capture_output=True,text=True)
    assert p.returncode==0,(p.stdout,p.stderr)
    out=json.loads(p.stdout)
    assert out["coverage"]["complete"] is True
    assert len(out["ranked_slowest_first"])==28
    assert out["ranked_slowest_first"][0]["kernel_name"]=="K27"
    assert out["shared_stage_summary"]["palette_p95_ms"]["median_across_kernels"]==5

    policy=d/"policy.json"
    policy.write_text(json.dumps({"all_kernel_sweep":{"envelope":{
      "min_fps_median":31,"max_frame_p95_ms":34,"max_frame_p99_ms":38,"max_frame_max_ms":49
    }}}))
    p=subprocess.run([sys.executable,str(SCRIPT),"--manifest",str(m),"--policy",str(policy),"--qualify"],capture_output=True,text=True)
    assert p.returncode==0,(p.stdout,p.stderr)

    bad=json.loads(policy.read_text()); bad["all_kernel_sweep"]["envelope"]["max_frame_p99_ms"]=33
    policy.write_text(json.dumps(bad))
    p=subprocess.run([sys.executable,str(SCRIPT),"--manifest",str(m),"--policy",str(policy),"--qualify"],capture_output=True,text=True)
    assert p.returncode!=0
    assert "envelope failure" in p.stdout

print("PASS: all-kernel sweep enforces full coverage, ranking, shared-stage summary, and fail-closed envelope")

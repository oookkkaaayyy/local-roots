#!/usr/bin/env python3
"""Aggregate and qualify a complete HBNF all-kernel performance sweep.

Input manifest points to one runtime profile/result JSON per kernel. Stdlib only.
The script verifies complete coverage, ranks expensive kernels, surfaces shared-path
costs, and can fail closed against an explicitly frozen policy.
"""
from __future__ import annotations
import argparse, json, pathlib, statistics, sys

def load(p): return json.loads(pathlib.Path(p).read_text())

def unwrap_profile(obj):
    return obj.get("profile") if isinstance(obj,dict) and isinstance(obj.get("profile"),dict) else obj

def metric(profile,path):
    cur=profile
    for part in path.split("."):
        if not isinstance(cur,dict) or part not in cur: return None
        cur=cur[part]
    return cur

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--manifest",required=True)
    ap.add_argument("--policy")
    ap.add_argument("--output")
    ap.add_argument("--qualify",action="store_true")
    args=ap.parse_args()

    manifest=load(args.manifest)
    expected=int(manifest.get("expected_kernel_count",28))
    kernels=manifest.get("kernels") or []
    failures=[]
    if len(kernels)!=expected:
        failures.append(f"kernel coverage {len(kernels)}/{expected}")
    ids=[str(k.get("kernel_id")) for k in kernels]
    if len(set(ids))!=len(ids): failures.append("duplicate kernel_id in sweep")
    names=[str(k.get("kernel_name") or "").strip() for k in kernels]
    if any(not x for x in names): failures.append("kernel_name missing")
    if any(k.get("variant_id") is None for k in kernels): failures.append("variant_id missing")

    base=pathlib.Path(args.manifest).resolve().parent
    rows=[]
    for k in kernels:
        pp=pathlib.Path(str(k.get("profile_path","")))
        if not pp.is_absolute(): pp=base/pp
        if not pp.is_file():
            failures.append("missing profile: "+str(pp)); continue
        p=unwrap_profile(load(pp))
        if p.get("validation_errors"):
            failures.append(f"{k.get('kernel_name')}: runtime profile validation errors")
        row={
          "kernel_id":k.get("kernel_id"),"kernel_name":k.get("kernel_name"),"variant_id":k.get("variant_id"),
          "fps_median":metric(p,"fps.median"),
          "frame_p95_ms":metric(p,"frame_ms.p95_median"),
          "frame_p99_ms":metric(p,"frame_ms.p99_median"),
          "frame_max_ms":metric(p,"frame_ms.max"),
          "kernel_p95_ms":metric(p,"stages.kernel_ms_p95.median"),
          "palette_p95_ms":metric(p,"stages.palette_ms_p95.median"),
          "audio_p95_ms":metric(p,"stages.audio_ms_p95.median"),
          "scheduler_p95_ms":metric(p,"stages.scheduler_ms_p95.median"),
          "overlay_p95_ms":metric(p,"stages.overlay_ms_p95.median"),
          "aux_p95_ms":metric(p,"stages.aux_prepare_send_ms_p95.median"),
          "unaccounted_p95_ms":metric(p,"stages.unaccounted_ms_p95.median"),
          "free_heap_min":metric(p,"heap.minimum_free_min"),
          "largest_block_end":metric(p,"heap.largest_block_end"),
          "rssi_dbm_median":metric(p,"wifi.rssi_dbm_median"),
          "aux_render_fps_median":metric(p,"aux.render_fps_median"),
        }
        required=["fps_median","frame_p95_ms","frame_p99_ms","frame_max_ms",
                  "kernel_p95_ms","palette_p95_ms","audio_p95_ms","scheduler_p95_ms",
                  "overlay_p95_ms","aux_p95_ms","unaccounted_p95_ms"]
        missing=[x for x in required if row.get(x) is None]
        if missing: failures.append(f"{row['kernel_name']}: missing metrics {', '.join(missing)}")
        rows.append(row)

    ranked=sorted(rows,key=lambda r:(
        -(float(r["frame_p99_ms"]) if r.get("frame_p99_ms") is not None else -1),
        float(r["fps_median"]) if r.get("fps_median") is not None else 1e9
    ))

    shared={}
    for key in ["palette_p95_ms","audio_p95_ms","scheduler_p95_ms","overlay_p95_ms","aux_p95_ms","unaccounted_p95_ms"]:
        vals=[float(r[key]) for r in rows if isinstance(r.get(key),(int,float))]
        if vals:
            shared[key]={
              "median_across_kernels":statistics.median(vals),
              "max_across_kernels":max(vals)
            }

    classifications={}
    if args.qualify:
        if not args.policy:
            failures.append("--qualify requires --policy")
        else:
            pol=load(args.policy)
            env=((pol.get("all_kernel_sweep") or {}).get("envelope") or {})
            required_env=["min_fps_median","max_frame_p95_ms","max_frame_p99_ms","max_frame_max_ms"]
            unset=[k for k in required_env if env.get(k) is None]
            if unset:
                failures.append("all-kernel envelope not frozen: "+", ".join(unset))
            else:
                for r in rows:
                    errs=[]
                    if float(r["fps_median"])<float(env["min_fps_median"]): errs.append("fps")
                    if float(r["frame_p95_ms"])>float(env["max_frame_p95_ms"]): errs.append("p95")
                    if float(r["frame_p99_ms"])>float(env["max_frame_p99_ms"]): errs.append("p99")
                    if float(r["frame_max_ms"])>float(env["max_frame_max_ms"]): errs.append("max")
                    classifications[str(r["kernel_id"])]=("FAIL" if errs else "PASS")
                    if errs: failures.append(f"{r['kernel_name']}: envelope failure ({','.join(errs)})")

    result={
      "schema":"hbnf-all-kernel-sweep-report-v1",
      "release_id":manifest.get("release_id"),
      "coverage":{"expected":expected,"observed":len(rows),"complete":len(rows)==expected},
      "ranked_slowest_first":ranked,
      "shared_stage_summary":shared,
      "classifications":classifications,
      "status":"PASS" if not failures else "FAIL",
      "failures":failures
    }
    rendered=json.dumps(result,indent=2,sort_keys=True)
    if args.output: pathlib.Path(args.output).write_text(rendered+"\n")
    print(rendered)
    return 0 if not failures else 2

if __name__=="__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Aggregate an HBNF 28-kernel sweep.

Diagnostic sweeps rank all kernels using average timings available from the current
instrumented firmware. Foundation sweeps additionally require frame-tail metrics
and may be qualified against a frozen envelope.
"""
from __future__ import annotations
import argparse, json, pathlib, statistics

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
    contract=manifest.get("contract","foundation")
    if contract not in {"diagnostic","foundation"}:
        raise SystemExit("unknown sweep contract")

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
        if p.get("contract")!=contract:
            failures.append(f"{k.get('kernel_name')}: profile contract mismatch")
        if p.get("validation_errors"):
            failures.append(f"{k.get('kernel_name')}: runtime profile validation errors")

        row={
          "kernel_id":k.get("kernel_id"),"kernel_name":k.get("kernel_name"),"variant_id":k.get("variant_id"),
          "effect_id":k.get("effect_id"),"preset":k.get("preset"),
          "fps_median":metric(p,"fps.median"),
          "frame_avg_ms":metric(p,"frame_ms.avg_median"),
          "frame_p95_ms":metric(p,"frame_ms.p95_median"),
          "frame_p99_ms":metric(p,"frame_ms.p99_median"),
          "frame_max_ms":metric(p,"frame_ms.max"),
          "kernel_avg_ms":metric(p,"stages.kernel_ms_avg.median"),
          "kernel_p95_ms":metric(p,"stages.kernel_ms_p95.median"),
          "palette_avg_ms":metric(p,"stages.palette_ms_avg.median"),
          "palette_p95_ms":metric(p,"stages.palette_ms_p95.median"),
          "audio_avg_ms":metric(p,"stages.audio_ms_avg.median"),
          "audio_p95_ms":metric(p,"stages.audio_ms_p95.median"),
          "scheduler_avg_ms":metric(p,"stages.scheduler_ms_avg.median"),
          "scheduler_p95_ms":metric(p,"stages.scheduler_ms_p95.median"),
          "overlay_avg_ms":metric(p,"stages.overlay_ms_avg.median"),
          "overlay_p95_ms":metric(p,"stages.overlay_ms_p95.median"),
          "aux_avg_ms":metric(p,"stages.aux_prepare_send_ms_avg.median"),
          "aux_p95_ms":metric(p,"stages.aux_prepare_send_ms_p95.median"),
          "unaccounted_avg_ms":metric(p,"stages.unaccounted_ms_avg.median"),
          "unaccounted_p95_ms":metric(p,"stages.unaccounted_ms_p95.median"),
          "free_heap_min":metric(p,"heap.minimum_free_min"),
          "free_heap_end":metric(p,"heap.free_end"),
          "largest_block_end":metric(p,"heap.largest_block_end"),
          "rssi_dbm_median":metric(p,"wifi.rssi_dbm_median"),
          "aux_render_fps_median":metric(p,"aux.render_fps_median"),
        }
        if contract=="diagnostic":
            required=["fps_median","frame_avg_ms","kernel_avg_ms","palette_avg_ms","audio_avg_ms",
                      "overlay_avg_ms","aux_avg_ms","unaccounted_avg_ms","free_heap_end",
                      "rssi_dbm_median","aux_render_fps_median"]
        else:
            required=["fps_median","frame_p95_ms","frame_p99_ms","frame_max_ms",
                      "kernel_p95_ms","palette_p95_ms","audio_p95_ms",
                      "overlay_p95_ms","aux_p95_ms","unaccounted_p95_ms",
                      "free_heap_min","largest_block_end"]
        missing=[x for x in required if row.get(x) is None]
        if missing: failures.append(f"{row['kernel_name']}: missing metrics {', '.join(missing)}")
        rows.append(row)

    if contract=="diagnostic":
        ranked=sorted(rows,key=lambda r:(
            -(float(r["frame_avg_ms"]) if r.get("frame_avg_ms") is not None else -1),
            float(r["fps_median"]) if r.get("fps_median") is not None else 1e9
        ))
        stage_keys=["kernel_avg_ms","palette_avg_ms","audio_avg_ms","scheduler_avg_ms",
                    "overlay_avg_ms","aux_avg_ms","unaccounted_avg_ms"]
    else:
        ranked=sorted(rows,key=lambda r:(
            -(float(r["frame_p99_ms"]) if r.get("frame_p99_ms") is not None else -1),
            float(r["fps_median"]) if r.get("fps_median") is not None else 1e9
        ))
        stage_keys=["kernel_p95_ms","palette_p95_ms","audio_p95_ms","scheduler_p95_ms",
                    "overlay_p95_ms","aux_p95_ms","unaccounted_p95_ms"]

    shared={}
    for key in stage_keys:
        vals=[float(r[key]) for r in rows if isinstance(r.get(key),(int,float))]
        if vals:
            shared[key]={"median_across_kernels":statistics.median(vals),"max_across_kernels":max(vals)}

    classifications={}
    if args.qualify:
        if contract!="foundation":
            failures.append("diagnostic sweep cannot foundation-qualify")
        elif not args.policy:
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
      "schema":"hbnf-all-kernel-sweep-report-v2",
      "contract":contract,
      "release_id":manifest.get("release_id"),
      "coverage":{"expected":expected,"observed":len(rows),"complete":len(rows)==expected},
      "ranked_slowest_first":ranked,
      "shared_stage_summary":shared,
      "classifications":classifications,
      "foundation_qualification_eligible":contract=="foundation" and not failures,
      "status":"PASS" if not failures else "FAIL",
      "failures":failures
    }
    rendered=json.dumps(result,indent=2,sort_keys=True)
    if args.output: pathlib.Path(args.output).write_text(rendered+"\n")
    print(rendered)
    return 0 if not failures else 2

if __name__=="__main__":
    raise SystemExit(main())

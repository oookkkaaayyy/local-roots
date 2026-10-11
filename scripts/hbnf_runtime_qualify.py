#!/usr/bin/env python3
"""HBNF unattended runtime profiler / regression detector.

Two explicit contracts:
- diagnostic: rank current kernels using already-available average timing.
- foundation: require frame tails/resource metrics and permit baseline qualification.

Stdlib only. Foundation qualification fails closed until thresholds are frozen.
"""
from __future__ import annotations

import argparse, json, math, pathlib, sys, time, urllib.request

REQUIRED_DIAGNOSTIC = [
    "release_id","uptime_seconds","fps","frame_ms_avg",
    "kernel_id","kernel_name","variant_id","kernel_ms_avg",
    "palette_ms_avg","audio_ms_avg","overlay_ms_avg",
    "aux_prepare_send_ms_avg","unaccounted_ms_avg",
    "free_heap_bytes","websocket_clients","aux_projection_active",
    "aux_render_fps","wifi_rssi_dbm","restart_count",
]

REQUIRED_FOUNDATION = [
    "release_id","uptime_seconds","fps","frame_ms_p50","frame_ms_p95",
    "frame_ms_p99","frame_ms_max","kernel_id","kernel_name","variant_id",
    "free_heap_bytes","minimum_free_heap_bytes","largest_free_block_bytes",
    "websocket_clients","aux_projection_active","aux_projection_age_ms","aux_render_fps",
    "wifi_rssi_dbm","restart_count",
    "kernel_ms_avg","kernel_ms_p95","palette_ms_avg","palette_ms_p95",
    "audio_ms_avg","audio_ms_p95","scheduler_ms_avg","scheduler_ms_p95",
    "overlay_ms_avg","overlay_ms_p95","aux_prepare_send_ms_avg","aux_prepare_send_ms_p95",
    "unaccounted_ms_avg","unaccounted_ms_p95",
]

STAGE_KEYS = [
    "frame_ms_avg","kernel_ms_avg","kernel_ms_p95","palette_ms_avg","palette_ms_p95",
    "audio_ms_avg","audio_ms_p95","scheduler_ms_avg","scheduler_ms_p95",
    "overlay_ms_avg","overlay_ms_p95","aux_prepare_send_ms_avg","aux_prepare_send_ms_p95",
    "unaccounted_ms_avg","unaccounted_ms_p95","frame_over_budget_count","frame_sample_count",
]

# Cross-release comparisons are meaningful only when these effective controls
# are present and stable throughout each profile. Keep this list aligned with
# hbnf_foundation_live_adapter.py's runtime_controls object.
RENDERING_CONTROL_KEYS = (
    "matrix_on", "wled_brightness", "matrix_brightness", "aux_brightness",
    "scene", "vibe", "motion", "audio_response", "palette", "overlay_id",
)

def pct(values, q):
    vals=sorted(float(x) for x in values)
    if not vals: return None
    if len(vals)==1: return vals[0]
    pos=(len(vals)-1)*q
    lo=int(math.floor(pos)); hi=int(math.ceil(pos))
    if lo==hi: return vals[lo]
    return vals[lo]+(vals[hi]-vals[lo])*(pos-lo)

def read_json(path):
    return json.loads(pathlib.Path(path).read_text())

def read_jsonl(path):
    out=[]
    for n,line in enumerate(pathlib.Path(path).read_text().splitlines(),1):
        if not line.strip(): continue
        try: out.append(json.loads(line))
        except Exception as e: raise SystemExit(f"invalid JSONL line {n}: {e}")
    return out

def dotted(obj, path):
    cur=obj
    for part in str(path).split("."):
        if isinstance(cur,dict) and part in cur: cur=cur[part]
        else: return None
    return cur

def normalize(raw, mapping):
    if not mapping: return raw
    return {key:dotted(raw,path) for key,path in mapping.items()}

def effective_rendering_settings(samples):
    """Describe whether a profile has complete, stable effective controls."""
    good=[s for s in samples if not s.get("collector_error")]
    controls=[s.get("runtime_controls") for s in good]
    if not controls:
        return {"status":"INCOMPLETE","missing_keys":list(RENDERING_CONTROL_KEYS)}
    missing=sorted({key for value in controls if not isinstance(value,dict)
                    for key in RENDERING_CONTROL_KEYS})
    for value in controls:
        if isinstance(value,dict):
            missing.extend(key for key in RENDERING_CONTROL_KEYS if key not in value)
    missing=sorted(set(missing))
    if missing:
        return {"status":"INCOMPLETE","missing_keys":missing}
    first={key:controls[0][key] for key in RENDERING_CONTROL_KEYS} if controls else {}
    changed=sorted(key for key in RENDERING_CONTROL_KEYS
                   if any(value[key]!=first[key] for value in controls[1:]))
    if changed:
        return {"status":"UNSTABLE","changed_keys":changed}
    return {"status":"MATCHED","values":first}

def fetch_json(url, timeout=3.5):
    req=urllib.request.Request(url,headers={"Accept":"application/json","Cache-Control":"no-cache"})
    with urllib.request.urlopen(req,timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8","replace"))

def collect(url, mapping, seconds, interval):
    samples=[]; deadline=time.time()+seconds
    while time.time()<deadline:
        try:
            samples.append(normalize(fetch_json(url),mapping))
        except Exception as e:
            samples.append({"collector_error":f"{type(e).__name__}: {e}","sample_time":time.time()})
        time.sleep(interval)
    return samples

def required_for(contract):
    if contract=="diagnostic": return REQUIRED_DIAGNOSTIC
    if contract=="foundation": return REQUIRED_FOUNDATION
    raise ValueError("unknown telemetry contract")

def validate_samples(samples, contract="foundation"):
    errors=[]
    good=[s for s in samples if not s.get("collector_error")]
    if not good: return ["no valid telemetry samples"], good
    for key in required_for(contract):
        missing=sum(1 for s in good if s.get(key) is None)
        if missing:
            errors.append(f"{key}: missing in {missing}/{len(good)} valid samples")
    releases={str(s.get("release_id")) for s in good if s.get("release_id") is not None}
    if len(releases)!=1: errors.append("release identity changed or is ambiguous during run")
    kernels={(str(s.get("kernel_id")),str(s.get("kernel_name")),str(s.get("variant_id"))) for s in good}
    if len(kernels)!=1: errors.append("kernel/variant identity changed during one profile run")
    restarts=[int(s["restart_count"]) for s in good if s.get("restart_count") is not None]
    if restarts and max(restarts)!=min(restarts): errors.append("restart_count increased during run")
    uptimes=[float(s["uptime_seconds"]) for s in good if s.get("uptime_seconds") is not None]
    if any(b<a for a,b in zip(uptimes,uptimes[1:])): errors.append("uptime decreased during run")
    return errors, good

def summarize(samples, contract="foundation"):
    errors,good=validate_samples(samples,contract)
    def vals(k): return [s[k] for s in good if isinstance(s.get(k),(int,float))]
    fps=vals("fps")
    p50=vals("frame_ms_p50"); p95=vals("frame_ms_p95"); p99=vals("frame_ms_p99"); mx=vals("frame_ms_max")
    favg=vals("frame_ms_avg")
    freeh=vals("free_heap_bytes"); minh=vals("minimum_free_heap_bytes"); largest=vals("largest_free_block_bytes")
    auxage=vals("aux_projection_age_ms"); auxfps=vals("aux_render_fps"); rssi=vals("wifi_rssi_dbm")
    active=[s.get("aux_projection_active") for s in good if s.get("aux_projection_active") is not None]
    stage={}
    for key in STAGE_KEYS:
        vv=vals(key)
        if vv: stage[key]={"median":pct(vv,.5),"p95":pct(vv,.95),"max":max(vv)}
    first=good[0] if good else {}
    return {
      "schema":"hbnf-runtime-profile-v2",
      "contract":contract,
      "qualification_eligible":contract=="foundation",
      "sample_count":len(samples),
      "valid_sample_count":len(good),
      "collection_errors":len(samples)-len(good),
      "validation_errors":errors,
      "release_id":first.get("release_id"),
      "kernel":{
        "id":first.get("kernel_id"),
        "name":first.get("kernel_name"),
        "variant_id":first.get("variant_id")
      },
      "effective_rendering_settings":effective_rendering_settings(good),
      "fps":{"median":pct(fps,.5),"p05":pct(fps,.05),"min":min(fps) if fps else None},
      "frame_ms":{
        "avg_median":pct(favg,.5),
        "p50_median":pct(p50,.5),
        "p95_median":pct(p95,.5),
        "p99_median":pct(p99,.5),
        "max":max(mx) if mx else None
      },
      "heap":{
        "free_start":freeh[0] if freeh else None,"free_end":freeh[-1] if freeh else None,
        "minimum_free_min":min(minh) if minh else None,
        "largest_block_start":largest[0] if largest else None,"largest_block_end":largest[-1] if largest else None,
      },
      "aux":{
        "inactive_samples":sum(1 for x in active if x is False),
        "age_p99_ms":pct(auxage,.99),
        "render_fps_median":pct(auxfps,.5),
      },
      "wifi":{"rssi_dbm_median":pct(rssi,.5),"rssi_dbm_min":min(rssi) if rssi else None},
      "stages":stage,
      "restart_count_start":good[0].get("restart_count") if good else None,
      "restart_count_end":good[-1].get("restart_count") if good else None,
    }

def ratio_ok(candidate, baseline, min_ratio=None, max_ratio=None):
    if candidate is None or baseline in (None,0): return False
    r=float(candidate)/float(baseline)
    if min_ratio is not None and r<float(min_ratio): return False
    if max_ratio is not None and r>float(max_ratio): return False
    return True

def qualify(profile, baseline, policy):
    failures=list(profile.get("validation_errors") or [])
    if profile.get("contract")!="foundation":
        failures.append("diagnostic profile cannot satisfy foundation qualification")
        return failures
    if not baseline or baseline.get("contract")!="foundation":
        failures.append("qualified foundation baseline profile missing or wrong contract")
        return failures
    cfg=((policy or {}).get("comparison") or {}).get("candidate_vs_baseline") or {}
    required=[
      "fps_median_min_ratio","frame_p95_max_ratio","frame_p99_max_ratio","frame_max_max_ratio",
      "minimum_free_heap_min_ratio","largest_free_block_min_ratio","aux_stale_sample_max_fraction",
    ]
    unset=[k for k in required if cfg.get(k) is None]
    if unset:
        failures.append("qualification policy not frozen: "+", ".join(unset))
        return failures
    checks=[
      ("fps median",profile["fps"]["median"],baseline["fps"]["median"],cfg["fps_median_min_ratio"],None),
      ("frame p95",profile["frame_ms"]["p95_median"],baseline["frame_ms"]["p95_median"],None,cfg["frame_p95_max_ratio"]),
      ("frame p99",profile["frame_ms"]["p99_median"],baseline["frame_ms"]["p99_median"],None,cfg["frame_p99_max_ratio"]),
      ("frame max",profile["frame_ms"]["max"],baseline["frame_ms"]["max"],None,cfg["frame_max_max_ratio"]),
      ("minimum free heap",profile["heap"]["minimum_free_min"],baseline["heap"]["minimum_free_min"],cfg["minimum_free_heap_min_ratio"],None),
      ("largest free block end",profile["heap"]["largest_block_end"],baseline["heap"]["largest_block_end"],cfg["largest_free_block_min_ratio"],None),
    ]
    for name,c,b,minr,maxr in checks:
        if not ratio_ok(c,b,minr,maxr): failures.append(name+" regressed vs qualified baseline")
    valid=max(1,int(profile.get("valid_sample_count") or 0))
    stale=float(profile["aux"]["inactive_samples"])/valid
    if stale>float(cfg["aux_stale_sample_max_fraction"]): failures.append("AUX projection stale/inactive fraction exceeded policy")
    return failures

def main():
    ap=argparse.ArgumentParser()
    src=ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--input",help="JSONL telemetry file")
    src.add_argument("--url",help="JSON telemetry endpoint")
    ap.add_argument("--map",dest="mapping",help="JSON object mapping canonical metric names to dotted JSON paths")
    ap.add_argument("--duration-seconds",type=int,default=300)
    ap.add_argument("--interval-seconds",type=float,default=5)
    ap.add_argument("--contract",choices=["diagnostic","foundation"],default="foundation")
    ap.add_argument("--baseline")
    ap.add_argument("--policy")
    ap.add_argument("--output")
    ap.add_argument("--profile-only",action="store_true")
    args=ap.parse_args()

    mapping=read_json(args.mapping) if args.mapping else None
    samples=read_jsonl(args.input) if args.input else collect(args.url,mapping,args.duration_seconds,args.interval_seconds)
    profile=summarize(samples,args.contract)
    failures=[]
    if not args.profile_only:
        failures=qualify(profile,read_json(args.baseline) if args.baseline else None,read_json(args.policy) if args.policy else None)
    result={"status":"PASS" if not failures else "FAIL","profile":profile,"failures":failures}
    rendered=json.dumps(result,indent=2,sort_keys=True)
    if args.output: pathlib.Path(args.output).write_text(rendered+"\n")
    print(rendered)
    return 0 if not failures else 2

if __name__=="__main__":
    raise SystemExit(main())

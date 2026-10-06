#!/usr/bin/env python3
"""Create a pre-soak hash receipt for an already-authorized frozen policy.

This tool never chooses thresholds. It fails closed on the current template's
null values and binds an externally approved policy to its baseline and sweep.
"""
from __future__ import annotations
import argparse, datetime as dt, hashlib, json, pathlib

RATIOS=("fps_median_min_ratio","frame_p95_max_ratio","frame_p99_max_ratio",
        "frame_max_max_ratio","minimum_free_heap_min_ratio",
        "largest_free_block_min_ratio","aux_stale_sample_max_fraction")
ABSOLUTE=("fps_floor_absolute","frame_ms_p99_ceiling_absolute",
          "aux_projection_age_ms_ceiling")

def digest(path):return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()
def validate_inputs(policy,baseline):
    errors=[]
    if policy.get("schema")!="hbnf-runtime-qualification-policy-v1":errors.append("policy schema mismatch")
    if policy.get("status")!="FROZEN":errors.append("policy status must be FROZEN before soak")
    cfg=policy.get("comparison",{}).get("candidate_vs_baseline",{})
    for key in RATIOS:
        value=cfg.get(key)
        if not isinstance(value,(int,float)) or value<0 or (key!="aux_stale_sample_max_fraction" and value==0):errors.append(f"policy threshold missing/invalid: {key}")
    if isinstance(cfg.get("aux_stale_sample_max_fraction"),(int,float)) and cfg["aux_stale_sample_max_fraction"]>1:
        errors.append("aux stale fraction must be <= 1")
    early=policy.get("catastrophic_early_stop",{})
    for key in ABSOLUTE:
        if not isinstance(early.get(key),(int,float)) or early[key]<=0:errors.append(f"early-stop threshold missing/invalid: {key}")
    if baseline.get("contract")!="foundation":errors.append("baseline contract must be foundation")
    if baseline.get("release_id") in (None,""):errors.append("baseline release identity missing")
    baseline_metrics=((baseline.get("fps") or {}).get("median"),
                      (baseline.get("frame_ms") or {}).get("p95_median"),
                      (baseline.get("frame_ms") or {}).get("p99_median"),
                      (baseline.get("frame_ms") or {}).get("max"),
                      (baseline.get("heap") or {}).get("minimum_free_min"),
                      (baseline.get("heap") or {}).get("largest_block_end"))
    if not all(isinstance(v,(int,float)) and v>0 for v in baseline_metrics):errors.append("baseline is missing required positive Foundation performance/heap metrics")
    return errors

def freeze(policy_path,baseline_path,sweep_path,expected_release):
    pp,bp,sp=map(lambda p:pathlib.Path(p).resolve(),(policy_path,baseline_path,sweep_path))
    policy=json.loads(pp.read_text());baseline=json.loads(bp.read_text());sweep=json.loads(sp.read_text())
    errors=validate_inputs(policy,baseline)
    if sweep.get("release_id")!=expected_release:errors.append("sweep release identity mismatch")
    kernels=sweep.get("kernels")
    ids=[int(k.get("kernel_id",-1)) for k in kernels or []]
    if len(ids)!=28 or set(ids)!=set(range(28)):errors.append("pre-soak sweep must bind all exact 28 kernels")
    for item in kernels or []:
        path=(sp.parent/item.get("profile_path","")).resolve()
        if sp.parent not in path.parents or not path.is_file():errors.append(f"missing/unsafe kernel profile: {item.get('profile_path')}")
        else:
            try:
                result=json.loads(path.read_text());profile=result.get("profile",{})
                if result.get("status")!="PASS" or profile.get("contract")!="foundation" or profile.get("validation_errors"):
                    errors.append(f"kernel profile is not a clean Foundation profile: {item.get('profile_path')}")
                if int(profile.get("kernel",{}).get("id",-1))!=int(item.get("kernel_id",-2)):
                    errors.append(f"kernel profile ID mismatch: {item.get('profile_path')}")
                if str(profile.get("kernel",{}).get("name"))!=str(item.get("kernel_name")):
                    errors.append(f"kernel profile name mismatch: {item.get('profile_path')}")
            except Exception as exc:errors.append(f"invalid kernel profile {item.get('profile_path')}: {exc}")
    if errors:raise ValueError("threshold freeze refused: "+"; ".join(errors))
    return {"schema":"hbnf-foundation-threshold-freeze-v1","status":"FROZEN_BEFORE_SOAK",
            "soak_started":False,"expected_release_id":expected_release,
            "policy":{"path":str(pp),"sha256":digest(pp)},
            "baseline":{"path":str(bp),"sha256":digest(bp),"release_id":baseline["release_id"]},
            "pre_soak_sweep":{"path":str(sp),"sha256":digest(sp),"kernel_count":28},
            "frozen_at_utc":dt.datetime.now(dt.timezone.utc).isoformat()}

def main():
    p=argparse.ArgumentParser();p.add_argument("--policy",required=True);p.add_argument("--baseline",required=True)
    p.add_argument("--sweep-manifest");p.add_argument("--expected-release");p.add_argument("--output");p.add_argument("--validate-inputs-only",action="store_true")
    a=p.parse_args()
    if a.validate_inputs_only:
        errors=validate_inputs(json.loads(pathlib.Path(a.policy).read_text()),json.loads(pathlib.Path(a.baseline).read_text()))
        if errors:raise ValueError("threshold inputs refused: "+"; ".join(errors))
        print(json.dumps({"status":"FROZEN_INPUTS_VALID"}));return 0
    if not a.sweep_manifest or not a.expected_release or not a.output:raise ValueError("--sweep-manifest, --expected-release, and --output are required")
    r=freeze(a.policy,a.baseline,a.sweep_manifest,a.expected_release)
    pathlib.Path(a.output).write_text(json.dumps(r,indent=2,sort_keys=True)+"\n");print(json.dumps(r,indent=2));return 0
if __name__=="__main__":
    try:raise SystemExit(main())
    except (OSError,ValueError,KeyError,json.JSONDecodeError) as e:print(str(e));raise SystemExit(2)

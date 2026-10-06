#!/usr/bin/env python3
"""Build a 28-kernel Foundation baseline from the just-completed sweep."""
from __future__ import annotations
import argparse, hashlib, json, pathlib, statistics

def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def build(manifest_path):
    mp=pathlib.Path(manifest_path).resolve(); m=json.loads(mp.read_text())
    if m.get("contract")!="foundation" or m.get("restore_verified") not in (False,True):
        raise ValueError("baseline source must be a Foundation sweep manifest")
    kernels=m.get("kernels") or []
    ids=[int(x.get("kernel_id",-1)) for x in kernels]
    if len(ids)!=28 or set(ids)!=set(range(28)):raise ValueError("baseline source must contain exact 28 kernels")
    profiles={}
    for entry in kernels:
        p=(mp.parent/entry["profile_path"]).resolve()
        if mp.parent not in p.parents or not p.is_file():raise ValueError("unsafe/missing profile path")
        row=json.loads(p.read_text()); profile=row.get("profile",{})
        if row.get("status")!="PASS" or profile.get("validation_errors") or profile.get("contract")!="foundation":
            raise ValueError("kernel profile failed Foundation structural validation")
        if int(profile.get("kernel",{}).get("id",-1))!=int(entry["kernel_id"]):raise ValueError("profile/kernel identity mismatch")
        if profile.get("release_id")!=m.get("release_id") or profile.get("kernel",{}).get("name")!=entry.get("kernel_name"):
            raise ValueError("profile release or kernel name differs from sweep manifest")
        raw=(mp.parent/(p.stem.replace('.profile','')+'.jsonl'))
        samples=[json.loads(line) for line in raw.read_text().splitlines() if line.strip()]
        if not samples:raise ValueError("empty kernel baseline sample file")
        if any(s.get("release_id")!=m["release_id"] or int(s.get("kernel_id",-1))!=int(entry["kernel_id"]) or s.get("kernel_name")!=entry["kernel_name"] for s in samples):
            raise ValueError("raw baseline sample identity differs from sweep manifest")
        key=str(int(entry["kernel_id"]))
        profiles[key]={
            "kernel_name":entry["kernel_name"],"variant_id":profile["kernel"]["variant_id"],
            "sample_count":len(samples),"profile_sha256":sha(p),"samples_sha256":sha(raw),
            "fps_median":profile["fps"]["median"],
            "frame_p95_median":profile["frame_ms"]["p95_median"],
            "frame_p99_median":profile["frame_ms"]["p99_median"],
            "frame_max":profile["frame_ms"]["max"],
            "minimum_free_heap":profile["heap"]["minimum_free_min"],
            "largest_free_block_min":min(int(s["largest_free_block_bytes"]) for s in samples),
            "aux_stale_fraction":sum(not bool(s["aux_projection_active"]) for s in samples)/len(samples),
        }
    med=lambda k:statistics.median(x[k] for x in profiles.values())
    return {"schema":"hbnf-foundation-28-kernel-baseline-v1","contract":"foundation",
        "release_id":m["release_id"],"kernel_count":28,"source_sweep_sha256":sha(mp),
        "kernels":profiles,"fps":{"median":med("fps_median")},
        "frame_ms":{"p95_median":med("frame_p95_median"),"p99_median":med("frame_p99_median"),"max":max(x["frame_max"] for x in profiles.values())},
        "heap":{"minimum_free_min":min(x["minimum_free_heap"] for x in profiles.values()),
                "largest_block_end":min(x["largest_free_block_min"] for x in profiles.values())}}
def main():
    p=argparse.ArgumentParser();p.add_argument("--sweep-manifest",required=True);p.add_argument("--output",required=True);a=p.parse_args()
    result=build(a.sweep_manifest);pathlib.Path(a.output).write_text(json.dumps(result,indent=2,sort_keys=True)+"\n")
    print(json.dumps({"status":"BASELINE_CREATED","release_id":result["release_id"],"kernel_count":28,"output":str(pathlib.Path(a.output).resolve())}))
if __name__=="__main__":
    try:main()
    except (OSError,ValueError,KeyError,TypeError) as e:print(str(e));raise SystemExit(2)

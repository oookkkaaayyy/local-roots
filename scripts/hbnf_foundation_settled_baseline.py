#!/usr/bin/env python3
"""Derive comparable 5-second-settled Foundation resource baselines offline."""
from __future__ import annotations
import argparse, hashlib, json, pathlib

SETTLE_SECONDS=5

def sha(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def derive(baseline_path: str, manifest_path: str, adapter_path: str) -> dict:
    baseline_file=pathlib.Path(baseline_path).resolve()
    manifest_file=pathlib.Path(manifest_path).resolve()
    adapter_file=pathlib.Path(adapter_path).resolve()
    baseline=json.loads(baseline_file.read_text())
    manifest=json.loads(manifest_file.read_text())
    adapter=json.loads(adapter_file.read_text())
    if baseline.get("schema")!="hbnf-foundation-28-kernel-baseline-v1" or baseline.get("kernel_count")!=28:
        raise ValueError("source baseline is not the exact 28-kernel Foundation baseline")
    if manifest.get("contract")!="foundation" or manifest.get("release_id")!=baseline.get("release_id"):
        raise ValueError("raw sweep manifest identity does not match baseline")
    if adapter.get("settle_seconds")!=SETTLE_SECONDS:
        raise ValueError("baseline adapter does not declare the required 5-second settle")
    entries=manifest.get("kernels",[])
    if len(entries)!=28 or {int(x.get("kernel_id",-1)) for x in entries}!=set(range(28)):
        raise ValueError("raw sweep manifest does not cover exact kernels 0..27")
    out=json.loads(json.dumps(baseline))
    for entry in entries:
        kid=str(int(entry["kernel_id"]))
        raw_file=(manifest_file.parent/pathlib.Path(entry["profile_path"]).name.replace(".profile.json",".jsonl")).resolve()
        if manifest_file.parent not in raw_file.parents or not raw_file.is_file():
            raise ValueError(f"missing/unsafe raw baseline profile for kernel {kid}")
        prior=out["kernels"][kid]
        if sha(raw_file)!=prior.get("samples_sha256"):
            raise ValueError(f"raw baseline profile hash mismatch for kernel {kid}")
        rows=[json.loads(line) for line in raw_file.read_text().splitlines() if line.strip()]
        if not rows or any(s.get("release_id")!=baseline["release_id"] or int(s.get("kernel_id",-1))!=int(kid) for s in rows):
            raise ValueError(f"raw baseline profile identity mismatch for kernel {kid}")
        if any(k not in s or s[k] is None for s in rows for k in ("free_heap_bytes","largest_free_block_bytes","aux_projection_active")):
            raise ValueError(f"raw baseline resource/AUX fields incomplete for kernel {kid}")
        prior["comparable_settled_resources"]={
            "settle_seconds":SETTLE_SECONDS,
            "sample_count":len(rows),
            "current_free_heap_min":min(float(s["free_heap_bytes"]) for s in rows),
            "largest_free_block_min":min(float(s["largest_free_block_bytes"]) for s in rows),
            "aux_stale_fraction":sum(not bool(s["aux_projection_active"]) for s in rows)/len(rows),
            "raw_profile_sha256":sha(raw_file),
            "method":"MINIMUM_OF_RAW_CURRENT_FREE_HEAP_AND_LARGEST_BLOCK; AUX_INACTIVE_FRACTION; ALL_SAMPLES_FROM_SWEEP_WITH_5S_POST_SELECT_SETTLE",
        }
    out["resource_comparability"]={
        "schema":"hbnf-foundation-settled-resource-baseline-v1",
        "settle_seconds":SETTLE_SECONDS,
        "source_baseline_sha256":sha(baseline_file),
        "source_sweep_manifest_sha256":sha(manifest_file),
        "source_adapter_sha256":sha(adapter_file),
        "low_watermark_policy":"esp_get_minimum_free_heap_size_boot_lifetime_watermark_retained_as_diagnostic_only",
        "current_free_heap_policy":"minimum free_heap_bytes across preserved raw per-kernel samples, all collected after 5-second selection settle",
    }
    return out

def main() -> int:
    p=argparse.ArgumentParser()
    p.add_argument("--baseline",required=True); p.add_argument("--manifest",required=True)
    p.add_argument("--adapter",required=True); p.add_argument("--output",required=True)
    a=p.parse_args(); result=derive(a.baseline,a.manifest,a.adapter)
    path=pathlib.Path(a.output); path.write_text(json.dumps(result,indent=2,sort_keys=True)+"\n")
    print(json.dumps({"status":"PASS","output":str(path.resolve()),"source_sweep_sha256":result["resource_comparability"]["source_sweep_manifest_sha256"],"kernel_count":28}))
    return 0

if __name__=="__main__":
    try: raise SystemExit(main())
    except (OSError,ValueError,KeyError,TypeError) as exc: print(str(exc)); raise SystemExit(2)

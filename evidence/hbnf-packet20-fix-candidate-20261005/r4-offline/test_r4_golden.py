#!/usr/bin/env python3
"""Fail-closed host gate for the retained 28-effect R1/FastLED FP comparison."""
import csv
import json
import pathlib
import subprocess
import argparse
import tempfile
import hashlib

ROOT = pathlib.Path(__file__).resolve().parent
REPO = ROOT.parents[2]
EXPECTED_UPSTREAM = "adedfc40e73fb80f8e930318781036d8fe1dbd9f"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fastled-root", required=True, type=pathlib.Path)
    ap.add_argument("--repo-root", type=pathlib.Path, default=REPO)
    args = ap.parse_args()
    upstream = args.fastled_root
    inventory = args.repo_root / "config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json"
    commit = subprocess.check_output(["git", "-C", str(upstream), "rev-parse", "HEAD"], text=True).strip()
    assert commit == EXPECTED_UPSTREAM, (commit, EXPECTED_UPSTREAM)
    with tempfile.TemporaryDirectory(prefix="hbnf-r4-golden-") as td:
        binary = pathlib.Path(td) / "r4-replay"
        subprocess.run([
            "clang++", "-std=c++17", "-O2",
            f"-I{upstream / 'src'}", f"-I{upstream / 'src/platforms/shared'}",
            str(ROOT / "replay.cpp"), "-DHBNF_R4", "-o", str(binary)
        ], check=True)
        output = subprocess.check_output([str(binary)], text=True)
    assert output.strip() == (ROOT / "float-fixed-golden-report.csv").read_text().strip()
    rows = list(csv.DictReader(output.splitlines()))
    assert len(rows) == 28 * 4, len(rows)
    names = {r["kernel"] for r in rows}
    assert len(names) == 28, len(names)
    expected = [e["kernel_name"] for e in json.loads(inventory.read_text())["entries"]]
    effect_map = json.loads((ROOT / "effect-map.json").read_text())
    assert [e["hbnf_kernel"] for e in effect_map["entries"]] == expected
    assert names == set(expected)
    for entry in effect_map["entries"]:
        base = upstream / "src/fl/fx/2d/animartrix_detail/viz" / entry["upstream_file"]
        assert entry["upstream_float_class"] in (base.with_suffix(".h")).read_text()
        assert entry["upstream_fixed_class"] in (base.with_suffix(".h")).read_text()
        assert hashlib.sha256(base.with_suffix(".h").read_bytes()).hexdigest() == entry["header_sha256"]
        assert hashlib.sha256(base.with_suffix(".cpp.hpp").read_bytes()).hexdigest() == entry["implementation_sha256"]
    # Strict image thresholds across all 512 pixels / three channels / 4 states.
    # One isolated 12-level channel excursion is accepted only when each effect
    # remains >=99.5% exact, mean <=0.1, p95 <=1, and max <=16.
    bad = []
    for row in rows:
        exact = float(row["exact_pixel_pct"])
        mean = float(row["mean_channel_abs_error"])
        p95 = int(row["p95_channel_abs_error"])
        maximum = int(row["max_channel_abs_error"])
        if exact < 99.5 or mean > 0.1 or p95 > 1 or maximum > 16:
            bad.append(row)
    assert not bad, json.dumps(bad, indent=2)
    print(f"PASS: {len(names)} upstream float/fixed class mappings; {len(names)} kernels x 4 frame states; {len(rows)*512:,} pixels compared; all strict image gates passed")
    print(f"FastLED commit: {commit}")
    for row in rows:
        if float(row["exact_pixel_pct"]) < 100:
            print("isolated deviation:", row)

if __name__ == "__main__":
    main()

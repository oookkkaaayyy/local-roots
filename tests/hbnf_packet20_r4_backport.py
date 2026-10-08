#!/usr/bin/env python3
"""Offline source-integrity gate for the scoped FastLED R4 backport."""
import argparse
import hashlib
import pathlib
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
FIX = ROOT / "scripts/hbnf_packet20_r4_fastled_backport.py"
R1 = ROOT / "tests/fixtures/ANIMartRIX_R1_clockpatched.h"
INVENTORY = ROOT / "config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json"
EXPECTED_INPUT = "bd9d146e2ce5fde991a895ccc2ad2773df1cc77cb815381679c17c6425d7bbe8"
EXPECTED_OUTPUT = "a2bc03b5196dbaacb39e56885ed9301106b15c4916e0b906f86c02db1601ec1b"

def sha(b): return hashlib.sha256(b).hexdigest()

def extract_render(s):
    start = s.index("static float render_value(const render_parameters &animation) {")
    end = s.index("\n}", start) + 2
    return s[start:end]

def normalize_candidate(s, original):
    license_end = s.index("*/") + 2
    marker_start = s.index('#include "fl/stl/compiler_control.h"', license_end)
    original_vector = s.index("#include <vector>", marker_start)
    s = s[:marker_start] + s[original_vector:]
    replacement = extract_render(original)
    s = s.replace(extract_render(s), replacement, 1)
    trailer = "\n\nFL_OPTIMIZATION_LEVEL_O3_END\nFL_FAST_MATH_END\n"
    assert s.endswith(trailer)
    return s[:-len(trailer)]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fastled-root", required=True, type=pathlib.Path)
    args = ap.parse_args()
    original = R1.read_text()
    assert sha(original.encode()) == EXPECTED_INPUT
    with tempfile.TemporaryDirectory(prefix="hbnf-r4-source-test-") as td:
        candidate = pathlib.Path(td) / "ANIMartRIX.h"
        candidate.write_text(original)
        subprocess.run([
            "python3", str(FIX), "--header", str(candidate),
            "--fastled-root", str(args.fastled_root), "--apply"
        ], check=True, stdout=subprocess.DEVNULL)
        result = candidate.read_text()
        assert sha(result.encode()) == EXPECTED_OUTPUT
        assert normalize_candidate(result, original) == original
        assert "FL_FAST_MATH_BEGIN" in result and "FL_FAST_MATH_END" in result
        assert "FL_OPTIMIZATION_LEVEL_O3_BEGIN" in result and "FL_OPTIMIZATION_LEVEL_O3_END" in result
        assert "render_value_fp_from_float" in result
        assert "perlin_s16x16.cpp.hpp" in result and "sin32.cpp.hpp" in result
        assert '#pragma push_macro("R")' in result and "#undef R" in result and "#pragma pop_macro(\"R\")" in result
        assert "animartrix-render-value-trig-cache" not in result
        entries = __import__("json").loads(INVENTORY.read_text())["entries"]
        assert len(entries) == 28
        probe = pathlib.Path(td) / "wled_macro_probe.cpp"
        probe.write_text('''#define R(c) (static_cast<unsigned char>((c) >> 16))
#pragma push_macro("R")
#undef R
#include "fl/fx/2d/animartrix_detail/render_value_fp.h"
#pragma pop_macro("R")
int main() { return R(0x123456); }
''')
        subprocess.run([
            "c++", "-std=c++11", "-I", str(args.fastled_root / "src"),
            "-c", str(probe), "-o", str(pathlib.Path(td) / "wled_macro_probe.o")
        ], check=True)
    print("PASS: exact R1 renderer source; only shared render_value plus scoped FastLED compiler controls changed")
    print(f"R1 SHA-256: {EXPECTED_INPUT}")
    print(f"R4 transformed header SHA-256: {EXPECTED_OUTPUT}")
    print("PASS: WLED R(c) macro collision isolated while FastLED headers are included")

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Apply the bounded FastLED 3.10.4 fixed-point render path to the pinned R1 vendor header."""
from __future__ import annotations

import argparse
import hashlib
import pathlib
import subprocess
import sys

R1_HEADER_SHA256 = "bd9d146e2ce5fde991a895ccc2ad2773df1cc77cb815381679c17c6425d7bbe8"
FASTLED_COMMIT = "adedfc40e73fb80f8e930318781036d8fe1dbd9f"
MARKER = "HBNF_FASTLED_3_10_4_R4_BACKPORT"

INCLUDES_AND_HELPER = r'''
#include "fl/fx/2d/animartrix_detail/render_value_fp.h"
#include "fl/fx/2d/animartrix_detail/perlin_float.h"
#include "fl/math/noise/perlin_s16x16.cpp.hpp"
#include "fl/math/sin32.cpp.hpp"

// HBNF_FASTLED_3_10_4_R4_BACKPORT: fixed-point lookup is initialized once.
static float hbnf_r4_render_value(const fl::render_parameters &p) {
  static fl::i32 fade_lut[257];
  static const bool initialized = []() {
    fl::perlin_s16x16::init_fade_lut(fade_lut);
    return true;
  }();
  (void)initialized;
  return static_cast<float>(fl::render_value_fp_from_float(p, fade_lut, fl::PERLIN_NOISE));
}
'''

RENDER_VALUE = r'''static float render_value(const render_parameters &animation) {
  fl::render_parameters p{};
  p.center_x = animation.center_x; p.center_y = animation.center_y;
  p.dist = animation.dist; p.angle = animation.angle;
  p.scale_x = animation.scale_x; p.scale_y = animation.scale_y; p.scale_z = animation.scale_z;
  p.offset_x = animation.offset_x; p.offset_y = animation.offset_y;
  p.offset_z = animation.offset_z; p.z = animation.z;
  p.low_limit = animation.low_limit; p.high_limit = animation.high_limit;
  return hbnf_r4_render_value(p);
}'''

def sha256(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def apply(header: pathlib.Path, fastled_root: pathlib.Path) -> None:
    commit = subprocess.check_output(
        ["git", "-C", str(fastled_root), "rev-parse", "HEAD"], text=True
    ).strip()
    if commit != FASTLED_COMMIT:
        raise SystemExit(f"FastLED source identity mismatch: {commit}")
    for rel in (
        "src/fl/fx/2d/animartrix_detail/render_value_fp.h",
        "src/fl/math/fixed_point/s16x16.h",
        "src/fl/math/noise/perlin_s16x16.h",
        "src/fl/math/noise/perlin_s16x16.cpp.hpp",
        "src/fl/math/sin32.h",
        "src/fl/math/sin32.cpp.hpp",
        "LICENSE",
    ):
        if not (fastled_root / rel).is_file():
            raise SystemExit(f"required upstream file missing: {rel}")

    raw = header.read_text()
    current = sha256(header)
    if current != R1_HEADER_SHA256:
        raise SystemExit(f"R1 vendor header hash mismatch: {current}")
    # Compiler controls match FastLED 3.10.4's viz source pattern and affect
    # only the included Animartrix translation-unit definitions.
    license_end = raw.find("*/")
    if license_end < 0:
        raise SystemExit("vendor header license block not found")
    raw = raw[:license_end + 2] + r'''

#include "fl/stl/compiler_control.h"
FL_FAST_MATH_BEGIN
FL_OPTIMIZATION_LEVEL_O3_BEGIN
''' + INCLUDES_AND_HELPER + raw[license_end + 2:]

    needle = "static float render_value(const render_parameters &animation) {"
    start = raw.find(needle)
    if start < 0 or raw.find(needle, start + 1) >= 0:
        raise SystemExit("expected exactly one R1 render_value definition")
    end = raw.find("\n}", start)
    if end < 0:
        raise SystemExit("render_value closing brace not found")
    end += 2
    old = raw[start:end]
    if "pnoise(" not in old or "cosf(animation.angle)" not in old or "sinf(animation.angle)" not in old:
        raise SystemExit("R1 render_value body did not match expected implementation")
    raw = raw[:start] + RENDER_VALUE + raw[end:]
    raw += "\n\nFL_OPTIMIZATION_LEVEL_O3_END\nFL_FAST_MATH_END\n"
    if MARKER not in raw or "sincos32" not in (fastled_root / "src/fl/fx/2d/animartrix_detail/render_value_fp.h").read_text():
        raise SystemExit("backport markers/primitives missing")
    header.write_text(raw)

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--header", required=True, type=pathlib.Path)
    ap.add_argument("--fastled-root", required=True, type=pathlib.Path)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if args.apply:
        apply(args.header, args.fastled_root)
    print(f"header_sha256={sha256(args.header)}")
    print(f"fastled_commit={subprocess.check_output(['git','-C',str(args.fastled_root),'rev-parse','HEAD'],text=True).strip()}")
    print(f"fastled_license_sha256={sha256(args.fastled_root / 'LICENSE')}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())

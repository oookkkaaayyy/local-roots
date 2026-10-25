#!/usr/bin/env python3
"""Compile and exercise the R6 mid-band startup baseline on the host."""

from __future__ import annotations

import pathlib
import shutil
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]


def main() -> None:
    compiler = shutil.which("c++") or shutil.which("g++") or shutil.which("clang++")
    if not compiler:
        raise SystemExit("FAIL: a host C++ compiler is required")
    with tempfile.TemporaryDirectory(prefix="hbnf-vibe-mid-startup-") as temp:
        binary = pathlib.Path(temp) / "mid-startup"
        subprocess.run(
            [compiler, "-std=c++17", "-O2", str(ROOT / "tests/hbnf_vibe_mid_startup_host.cpp"), "-o", str(binary)],
            check=True,
        )
        subprocess.run([str(binary)], check=True)
    print("PASS: steady mid-band startup stays at zero change; a later real change is detected")


if __name__ == "__main__":
    main()

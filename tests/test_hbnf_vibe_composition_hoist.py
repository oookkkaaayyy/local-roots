#!/usr/bin/env python3
"""Apply the offline R6 pixel-composition hoist and run its host golden test."""

from __future__ import annotations

import hashlib
import pathlib
import shutil
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE_DIR = pathlib.Path("firmware/phase2/integration-r6-cachefix/usermod")
RUNTIME = SOURCE_DIR / "hbnf_vibe_runtime.h"
USERMOD = SOURCE_DIR / "usermod_hbnf_foundation_v1.cpp"
PATCH = ROOT / "evidence/cart2-r6-audio-cache-20261010/R6_KERNEL0_COMPOSITION_HOIST.patch"
HOST_TEST = ROOT / "tests/hbnf_vibe_runtime_host.cpp"
EXPECTED = {
    "hbnf_vibe_runtime.h": "76a5b711daabef14ca67b1dcd18a4ddcb5e2ebfd43dbf771eac396d6351d26dc",
    "usermod_hbnf_foundation_v1.cpp": "622eae29173c4ba7ce12974e241bd1ad74f5b454f95b304aeb663351d359a40b",
}


def sha256(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    compiler = shutil.which("c++")
    patcher = shutil.which("patch")
    if not compiler or not patcher:
        raise SystemExit("FAIL: local C++ compiler and patch utility are required")
    for path in (RUNTIME, USERMOD):
        if sha256(ROOT / path) != EXPECTED[path.name]:
            raise SystemExit(f"FAIL: unexpected R6 source base hash: {path}")

    with tempfile.TemporaryDirectory(prefix="hbnf-r6-k0-hoist-") as temp_name:
        temp = pathlib.Path(temp_name)
        target = temp / SOURCE_DIR
        target.mkdir(parents=True)
        for path in (RUNTIME, USERMOD):
            shutil.copy2(ROOT / path, target / path.name)
        subprocess.run([patcher, "-p1", "-i", str(PATCH)], cwd=temp, check=True,
                       capture_output=True, text=True)

        patched_runtime = (target / RUNTIME.name).read_text()
        patched_usermod = (target / USERMOD.name).read_text()
        if "vibeComposition_=prepareVibeComposition(f);" not in patched_usermod:
            raise SystemExit("FAIL: factors are not prepared at frame start")
        if "composeVibeColor(colored,*frame_,tx,ty,vibeComposition_)" not in patched_usermod:
            raise SystemExit("FAIL: renderer is not using cached factors")
        if "VibeCompositionFactors" not in patched_runtime:
            raise SystemExit("FAIL: composition factor implementation absent")

        binary = temp / "vibe-host"
        subprocess.run([
            compiler, "-std=c++17", "-O2",
            '-DHBNF_VIBE_RUNTIME_HEADER="hbnf_vibe_runtime.h"',
            "-DHBNF_VIBE_COMPOSITION_CACHE",
            "-I", str(target), str(HOST_TEST), "-o", str(binary),
        ], check=True, capture_output=True, text=True)
        result = subprocess.run([str(binary)], check=True, capture_output=True, text=True)
        print(result.stdout.strip())
        print("PASS: hash-pinned patch applies; production call site caches once per frame; host golden output is bit-exact")


if __name__ == "__main__":
    main()

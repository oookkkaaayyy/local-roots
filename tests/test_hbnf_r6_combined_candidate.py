#!/usr/bin/env python3
"""Verify the isolated compact-text + Vibe-hoist source candidate."""

from __future__ import annotations

import hashlib
import pathlib
import shutil
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
USERMOD = ROOT / "firmware/phase2/integration-r6-cachefix/usermod"
PATCH = pathlib.Path(
    "/tmp/cart2-opal-local-20261009/evidence/cart2-r6-audio-cache-20261010/"
    "R6_KERNEL0_COMPOSITION_HOIST.patch"
)
EXPECTED_RUNTIME_SHA256 = "290e979980af3ebb69b6a9c7c5e0147680055ce005c5c51eb3ece8965e12f1ca"
EXPECTED_USERMOD_SHA256 = "950670efbe2e4aa31c364aeeedc308726975a13e5de4a3746f6902a6c8d56f93"
EXPECTED_PATCH_SHA256 = "f26af5644dd39cede71d873d1023057d0934b563b81016b3a54f280d72747e0b"


def sha256(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    runtime = USERMOD / "hbnf_vibe_runtime.h"
    usermod = USERMOD / "usermod_hbnf_foundation_v1.cpp"
    if sha256(runtime) != EXPECTED_RUNTIME_SHA256:
        raise SystemExit("FAIL: combined-candidate runtime source hash changed")
    if sha256(usermod) != EXPECTED_USERMOD_SHA256:
        raise SystemExit("FAIL: combined-candidate renderer source hash changed")
    if sha256(PATCH) != EXPECTED_PATCH_SHA256:
        raise SystemExit("FAIL: source-pinned compositor patch hash changed")

    source = usermod.read_text()
    if "vibeComposition_=prepareVibeComposition(f);" not in source:
        raise SystemExit("FAIL: compositor factors are not prepared once per frame")
    if "composeVibeColor(colored,*frame_,tx,ty,vibeComposition_)" not in source:
        raise SystemExit("FAIL: per-pixel renderer is not using cached factors")
    if "HbnfNativeText::resolveFontIndex(font,overlay.fontIndex,overlay.text,32)" not in source:
        raise SystemExit("FAIL: compact-font resolver is absent from command overlay")

    compiler = shutil.which("c++")
    if not compiler:
        raise SystemExit("FAIL: local C++ compiler is required")
    with tempfile.TemporaryDirectory(prefix="hbnf-r6-combined-host-") as temp:
        binary = pathlib.Path(temp) / "vibe-host"
        subprocess.run(
            [
                compiler,
                "-std=c++17",
                "-O2",
                '-DHBNF_VIBE_RUNTIME_HEADER="hbnf_vibe_runtime.h"',
                "-DHBNF_VIBE_COMPOSITION_CACHE",
                "-I",
                str(USERMOD),
                str(ROOT / "tests/hbnf_vibe_runtime_host.cpp"),
                "-o",
                str(binary),
            ],
            check=True,
        )
        subprocess.run([str(binary)], check=True)
    print("PASS: source hashes, frame-level hoist/call site, compact-font resolver, and bit-exact host golden")


if __name__ == "__main__":
    main()

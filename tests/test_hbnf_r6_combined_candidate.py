#!/usr/bin/env python3
"""Verify current Cart 2.0 text/Vibe source and candidate identity offline."""
from __future__ import annotations

import hashlib
import json
import pathlib
import shutil
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
USERMOD = ROOT / "firmware/phase2/integration-r6-cachefix/usermod"
EVIDENCE = ROOT / "evidence/cart2-r6-neutral-audio-hue-radial-lazy-20261011"
RELEASE = "hbnf-cart2-phase2-offline-wow-r6-neutral-audio-hue-radial-lazy-20261011"
SHA = "36881ca6c13e813762f3bbf5193d599a5ec3f93bf197771ad0f4ea9156358187"


def digest(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fail(message: str) -> None:
    raise SystemExit(f"FAIL: {message}")


def main() -> None:
    receipt = json.loads((EVIDENCE / "BUILD_RECEIPT.json").read_text())
    tree = json.loads((EVIDENCE / "SOURCE_TREE_MANIFEST.json").read_text())
    binding = json.loads((EVIDENCE / "SUCCESSOR_SOURCE_BINDING.json").read_text())

    if receipt["release_id"] != RELEASE or receipt["artifact"]["sha256"] != SHA:
        fail("exact candidate identity mismatch")
    if (
        binding["release_id"] != RELEASE
        or binding["repository_source_commit"] != receipt["source_commit"]
        or binding["artifact_sha256"] != SHA
    ):
        fail("source binding mismatch")

    expected = {item["path"]: item["sha256"] for item in tree["files"]}
    for name in (
        "hbnf_vibe_runtime.h",
        "usermod_hbnf_foundation_v1.cpp",
        "hbnf_native_text.h",
    ):
        if digest(USERMOD / name) != expected[name]:
            fail(f"current source differs from exact candidate: {name}")

    source = (USERMOD / "usermod_hbnf_foundation_v1.cpp").read_text()
    required_paths = (
        "vibeComposition_=prepareVibeComposition(f);",
        "composeVibeColor(colored,*frame_,tx,ty,vibeComposition_)",
        "HbnfNativeText::resolveFontIndex(font,overlay.fontIndex,overlay.text,32)",
    )
    if any(path not in source for path in required_paths):
        fail("required integrated renderer/text path missing")

    artifact = EVIDENCE / receipt["artifact"]["path"]
    if digest(artifact) != SHA or artifact.stat().st_size != receipt["artifact"]["bytes"]:
        fail("exact candidate BIN mismatch")
    image = artifact.read_bytes()
    if image.count(RELEASE.encode()) != 3:
        fail("embedded release identity mismatch")
    if b"hbnf-cart2-phase2-offline-wow-r6-compositor-hoist-20261011" in image:
        fail("superseded candidate identity remains embedded")

    compiler = shutil.which("c++")
    if not compiler:
        fail("local C++ compiler required")
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

    print(
        "PASS: current candidate identity, native text/Vibe integration, "
        "exact source binding, and bit-exact host golden"
    )


if __name__ == "__main__":
    main()

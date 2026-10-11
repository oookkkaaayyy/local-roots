#!/usr/bin/env python3
"""Verify the current offline R6 successor, exact source closure and R4 recovery."""
from __future__ import annotations
import hashlib, json, subprocess
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "evidence/cart2-r6-neutral-audio-hue-radial-lazy-20261011"
RELEASE = "hbnf-cart2-phase2-offline-wow-r6-neutral-audio-hue-radial-lazy-20261011"
SHA = "36881ca6c13e813762f3bbf5193d599a5ec3f93bf197771ad0f4ea9156358187"
R4 = "338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c"
SOURCE_COMMIT = "7645dae3806c1e352a1063ac22d1482ddb5713ff"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    receipt = json.loads((EVIDENCE / "BUILD_RECEIPT.json").read_text())
    tree = json.loads((EVIDENCE / "SOURCE_TREE_MANIFEST.json").read_text())
    host = json.loads((EVIDENCE / "HOST_VALIDATION_RECEIPT.json").read_text())

    assert receipt["release_id"] == RELEASE
    assert receipt["artifact"]["sha256"] == SHA
    assert receipt["artifact"]["bytes"] == 1_498_832
    assert receipt["source_commit"] == SOURCE_COMMIT
    assert tree["source_tree_sha256"] == receipt["source_tree_sha256"]
    assert tree["file_count"] == 14

    for item in tree["files"]:
        source = subprocess.run(
            ["git", "show", f"{SOURCE_COMMIT}:{receipt['source_tree']}/{item['path']}"],
            cwd=ROOT,
            check=True,
            capture_output=True,
        ).stdout
        assert hashlib.sha256(source).hexdigest() == item["sha256"], item["path"]

    artifact = EVIDENCE / receipt["artifact"]["path"]
    assert sha(artifact) == SHA
    assert artifact.stat().st_size == 1_498_832
    image = artifact.read_bytes()
    assert image.count(RELEASE.encode()) == 3
    assert b'"basedOnFirmwareSha256":"' + R4.encode() + b'"' in image

    for feature in (
        b"silent-audio-pixel-fastpath-v1",
        b"frame-hue-cache-v1",
        b"lazy-bass-radial-v1",
        b"wled-native-fontmanager-text-v1",
    ):
        assert feature in image, feature

    rollback = ROOT / "evidence/cart2-r7-performance-repair-20261009/artifact/hbnf-matrix-foundation-r4-exact.bin"
    assert sha(rollback) == R4
    assert host["candidate_release_id"] == RELEASE
    assert host["candidate_sha256"] == SHA
    assert all(check["result"] == "PASS" for check in host["checks"])
    assert receipt["qualification"]["live_mutation_authorized"] is False
    assert receipt["qualification"]["accepted"] is False
    print(
        f"PASS: {RELEASE} exact source tree, firmware SHA, feature markers, "
        "resource receipt, host checks, and exact R4 recovery verified"
    )


if __name__ == "__main__":
    main()

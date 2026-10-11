#!/usr/bin/env python3
"""Verify the offline R6 frame-cache candidate, exact sources and recovery."""
from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "evidence/cart2-r6-audio-cache-20261010"
MANIFEST_PATH = EVIDENCE / "FINAL_OFFLINE_CANDIDATE_MANIFEST.json"
EXPECTED_RELEASE = "hbnf-cart2-phase2-offline-wow-r6-audio-cache-20261010"
EXPECTED_SHA = "f89a55fbc85b8ffda90390c18eb9b09e934e9e73db96884d712c033d4684a35b"
EXPECTED_R4 = "338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


manifest = json.loads(MANIFEST_PATH.read_text())
assert manifest["release_id"] == EXPECTED_RELEASE
assert manifest["status"].startswith("OFFLINE_BUILD_VERIFIED")
assert manifest["status"].endswith("NOT_ACCEPTED")
artifact = ROOT / manifest["artifact"]["path"]
assert sha(artifact) == EXPECTED_SHA == manifest["artifact"]["sha256"]
assert artifact.stat().st_size == manifest["artifact"]["bytes"] == 1_497_984
assert manifest["artifact"]["embedded_candidate_and_release_id"] == EXPECTED_RELEASE
binding_path = ROOT / manifest["source_binding"]["path"]
binding = json.loads(binding_path.read_text())
assert sha(binding_path) == manifest["source_binding"]["sha256"]
assert binding["release_id"] == EXPECTED_RELEASE
assert binding["status"].startswith("OFFLINE_TARGET_BUILD_VERIFIED")
source_root = ROOT / binding["runtime_source_directory"]
source_commit = binding["repository_source_commit"]
for relative, expected in binding["runtime_files"].items():
    historical_path = f"{binding['runtime_source_directory']}/{relative}"
    historical_bytes = subprocess.run(
        ["git", "show", f"{source_commit}:{historical_path}"],
        cwd=ROOT, check=True, capture_output=True,
    ).stdout
    assert hashlib.sha256(historical_bytes).hexdigest() == expected, relative
assert manifest["parent"]["sha256"] == "340fe93b2eae35518fc588fa194c097b1d44d34050d54933fd97e552762becfb"
rollback = ROOT / manifest["rollback"]["path"]
assert sha(rollback) == EXPECTED_R4 == manifest["rollback"]["sha256"]
resource = manifest["resource_usage"]
assert resource["flash_remaining_bytes"] > 0
assert resource["ram_remaining_bytes"] > 0
assert resource["flash_partition_bytes"] == 1_572_864

strings = subprocess.run(["strings", str(artifact)], check=True, capture_output=True, text=True).stdout
assert strings.count(EXPECTED_RELEASE) >= 1
assert '"basedOnFirmwareSha256":"' + EXPECTED_R4 + '"' in strings
assert "foundation-vibe-audio-r5-unfrozen" in strings
assert "native-text-moments-r5-unfrozen" in strings
assert "hbnf-cart2-r6-frame-context-diagnostic-20261010" not in strings

build_log = (EVIDENCE / "TARGET_BUILD.log").read_text(errors="replace")
assert "-DHBNF_PACKET20_DIAGNOSTICS" in build_log
assert "-DHBNF_R6_FRAME_CONTEXT_TRACE" not in build_log

asm_path = ROOT / binding["target_build"]["target_disassembly_path"]
assert sha(asm_path) == binding["target_build"]["target_disassembly_sha256"]
asm = asm_path.read_text()
modulate = asm.split("### hbnf::AnimartrixAudioBridge::modulate", 1)[1].split("### hbnf::AnimartrixAudioBridge::preparePixelModulation", 1)[0]
prepare = asm.split("### hbnf::AnimartrixAudioBridge::preparePixelModulation", 1)[1].split("### hbnf::AnimartrixAudioBridge::profileLane", 1)[0]
assert "AnimartrixAudioBridge::profileLane" not in modulate
assert prepare.count("AnimartrixAudioBridge::profileLane") == 5

assert manifest["qualification"]["T4"] == "NOT_ACCEPTED"
assert manifest["qualification"]["T5"] == "NOT_ACCEPTED"
assert manifest["authority"]["live_mutation_authorized"] is False
delta = binding["source_deltas"]["hbnf_animartrix_audio_bridge.h"]["change"]
assert "bounded int32 radial branch" in delta
assert "generic int64 fallback" in delta
assert binding["fallback_validation"]["status"] == "PASS"
assert binding["fallback_validation"]["test"] == "tests/test_hbnf_audio_bridge_frame_cache.py"
print(f"PASS: {EXPECTED_RELEASE} exact SHA, source closure, target codegen, resource headroom and R4 recovery verified")

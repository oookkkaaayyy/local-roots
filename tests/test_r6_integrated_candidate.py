#!/usr/bin/env python3
"""Verify the exact offline R6 firmware/source/recovery binding."""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "evidence/cart2-r6-integrated-20261009"
BINARY = EVIDENCE / "hbnf-cart2-phase2-offline-wow-r6-integrated-20261009.bin"
MANIFEST = EVIDENCE / "FINAL_OFFLINE_CANDIDATE_MANIFEST.json"
ROLLBACK = ROOT / "evidence/cart2-r7-performance-repair-20261009/artifact/hbnf-matrix-foundation-r4-exact.bin"
RELEASE = "hbnf-cart2-phase2-offline-wow-r6-integrated-20261009"

def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

manifest = json.loads(MANIFEST.read_text())
assert manifest["release_id"] == RELEASE
assert manifest["status"] == "OFFLINE_CANDIDATE__NOT_LIVE_QUALIFIED__NOT_ACCEPTED"
assert manifest["artifact"]["sha256"] == sha(BINARY)
assert manifest["artifact"]["bytes"] == BINARY.stat().st_size
assert manifest["rollback"]["sha256"] == sha(ROLLBACK) == "338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c"
assert manifest["source_binding"]["all_runtime_files_match"] is True
assert manifest["resource_usage"]["flash_partition_bytes"] == 1_572_864
assert manifest["resource_usage"]["flash_remaining_bytes"] > 0
assert manifest["resource_usage"]["ram_remaining_bytes"] > 0

binding = json.loads((ROOT / manifest["source_binding"]["path"]).read_text())
assert binding["expert_reference"]["selected_source_bridge_sha256"] == "edfe168658d548fe8e52e05b5b9d0cc3390cfe11092423a2c1c12de95884ae74"
for relative, expected in binding["runtime_files"].items():
    assert sha(ROOT / "firmware/phase2/integration-r6/usermod" / relative) == expected, relative

strings = subprocess.run(["strings", str(BINARY)], check=True, capture_output=True, text=True).stdout
assert strings.count(RELEASE) >= 2
assert '"basedOnFirmwareSha256":"338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c"' in strings

disassembly = (EVIDENCE / "AnimartrixAudioBridge_modulate_target_disassembly.txt").read_text()
assert "beqi\ta12, 16" in disassembly and "beqi\ta11, 32" in disassembly
assert "__divdi3" in disassembly
assert "fallback call target map" in disassembly
assert "width_==32u && height_==16u" in disassembly
assert "muluh" in disassembly
assert manifest["codegen_review"]["production_32x16_path_skips_64bit_division_fallback"] is True

assert manifest["build_closure"]["wled_commit"] == "29b389df1c1aaec6ff53aea742d17063b985906c"
assert manifest["build_closure"]["platformio_core"] == "6.1.18"
assert manifest["build_closure"]["esp32_framework"] == "2.0.18+sha.8ba0dc0"
assert manifest["build_closure"]["xtensa_toolchain"] == "8.4.0+2021r2-patch5"
print(f"PASS: {RELEASE} SHA-256 {sha(BINARY)}; exact R4 recovery, full source binding, release identity, and target codegen receipts verified")

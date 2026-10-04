#!/usr/bin/env python3
"""Pure/non-network fixture test for Packet20 cloud artifact validator."""
import hashlib
import importlib.util
import json
import pathlib
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "packet20_build_validate", ROOT / "scripts/hbnf_packet20_build_validate.py"
)
m = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(m)

commit = "a" * 40
with tempfile.TemporaryDirectory() as td:
    root = pathlib.Path(td)
    firmware = b"packet20-fixture-firmware"
    (root / "firmware.bin").write_bytes(firmware)
    (root / "firmware.elf").write_bytes(b"ELF-fixture")
    firmware_sha = hashlib.sha256(firmware).hexdigest()
    size = len(firmware)
    provenance = {
        "status": "BUILD_SUCCEEDED",
        "github_repository": m.EXPECTED_REPOSITORY,
        "github_branch": m.EXPECTED_BRANCH,
        "github_commit": commit,
        "github_run_id": "12345",
        "wled_base_commit": m.EXPECTED_WLED_BASE,
        "platformio_core": m.EXPECTED_PLATFORMIO,
        "environment": m.EXPECTED_ENVIRONMENT,
        "diagnostic_source_sha256": m.EXPECTED_SOURCE_SHA256,
        "firmware_sha256": firmware_sha,
        "firmware_bytes": size,
        "ota_slot_bytes": m.EXPECTED_OTA_SLOT_BYTES,
        "ota_headroom_bytes": m.EXPECTED_OTA_SLOT_BYTES - size,
    }
    (root / "provenance.json").write_text(json.dumps(provenance))
    (root / "size-and-headroom.txt").write_text(
        f"firmware_bytes={size}\n"
        f"ota_slot_bytes={m.EXPECTED_OTA_SLOT_BYTES}\n"
        f"ota_headroom_bytes={m.EXPECTED_OTA_SLOT_BYTES-size}\n"
    )
    (root / "source-input-sha256.txt").write_text(
        f"{m.EXPECTED_SOURCE_SHA256}  usermods/hbnf_foundation_v1/usermod_hbnf_foundation_v1.cpp\n"
        + "0" * 64 + "  platformio_override.ini\n"
    )
    (root / "project-config.json").write_text("{}")
    (root / "project-metadata.json").write_text("{}")
    (root / "resolved-packages.txt").write_text("platform espressif32\nframework arduino\n")
    (root / "build.log").write_text("========================= [SUCCESS] Took 1.00 seconds =========================\n")

    receipt = m.validate_artifact_dir(root, commit)
    assert receipt["status"] == "PASS"
    assert receipt["firmware_sha256"] == firmware_sha
    assert receipt["firmware_bytes"] == size
    assert receipt["ota_headroom_bytes"] == m.EXPECTED_OTA_SLOT_BYTES - size

    bad = json.loads((root / "provenance.json").read_text())
    bad["diagnostic_source_sha256"] = "0" * 64
    (root / "provenance.json").write_text(json.dumps(bad))
    try:
        m.validate_artifact_dir(root, commit)
        raise AssertionError("wrong Packet20 source hash was accepted")
    except m.ValidationError:
        pass

print("PASS: Packet20 cloud build validator accepts exact provenance and fails closed on source drift")

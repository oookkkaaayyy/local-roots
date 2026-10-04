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

    upstream = root / "ANIMartRIX.upstream.h"
    upstream.write_text(
        "class ANIMartRIX {\n"
        " public:\n"
        "  void calculate_oscillators(const oscillators &timings) const {}\n"
        "  void run_default_oscillators() const {}\n"
        "};\n"
    )
    patched = root / "ANIMartRIX.patched.h"
    patched.write_text(
        "class ANIMartRIX {\n"
        " public:\n"
        "  double animation_clock_ms_ = 0.0;\n"
        "  double animation_clock_speed_ = 1.0;\n"
        "  uint32_t animation_clock_last_ms_ = 0;\n"
        "  bool animation_clock_started_ = false;\n"
        "  void calculate_oscillators(const oscillators &timings) {}\n"
        "  void run_default_oscillators() {}\n"
        "};\n"
    )
    patch_bytes = b"fixture animartrix clock patch\n"
    (root / "animartrix-clock.patch").write_bytes(patch_bytes)

    # Fixture-specific identities exercise the same fail-closed logic without
    # embedding the full 130 KiB upstream header in the unit test.
    m.EXPECTED_ANIMARTRIX_UPSTREAM_BLOB = m.git_blob_sha1(upstream)
    m.EXPECTED_ANIMARTRIX_CLOCK_PATCH_SHA256 = hashlib.sha256(patch_bytes).hexdigest()
    patched_sha = hashlib.sha256(patched.read_bytes()).hexdigest()

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
        "source_patch_sha256": m.EXPECTED_SOURCE_PATCH_SHA256,
        "animartrix_upstream_commit": m.EXPECTED_ANIMARTRIX_COMMIT,
        "animartrix_upstream_header_git_blob": m.EXPECTED_ANIMARTRIX_UPSTREAM_BLOB,
        "animartrix_clock_patch_sha256": m.EXPECTED_ANIMARTRIX_CLOCK_PATCH_SHA256,
        "animartrix_patched_header_sha256": patched_sha,
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
        + f"{m.EXPECTED_ANIMARTRIX_CLOCK_PATCH_SHA256}  animartrix-clock.patch\n"
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
    assert receipt["animartrix_patched_header_sha256"] == patched_sha

    bad = json.loads((root / "provenance.json").read_text())
    bad["diagnostic_source_sha256"] = "0" * 64
    (root / "provenance.json").write_text(json.dumps(bad))
    try:
        m.validate_artifact_dir(root, commit)
        raise AssertionError("wrong Packet20 source hash was accepted")
    except m.ValidationError:
        pass

print(
    "PASS: Packet20 cloud build validator accepts exact provenance, "
    "vendor-patch evidence, and fails closed on source drift"
)

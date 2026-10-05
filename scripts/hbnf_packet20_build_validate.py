#!/usr/bin/env python3
"""Fail-closed validator for the one-shot Packet20 cloud build artifact.

Read-only: validates extracted GitHub Actions artifact bytes and emits a receipt.
It does not sign, publish, flash, mutate hardware, or choose updater sequences.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import re
import sys
from typing import Any, Dict, List

EXPECTED_REPOSITORY = "oookkkaaayyy/local-roots"
EXPECTED_BRANCH = "hbnf-packet20-safe-point-cloud-20261004"
EXPECTED_WLED_BASE = "29b389df1c1aaec6ff53aea742d17063b985906c"
EXPECTED_PLATFORMIO = "6.1.18"
EXPECTED_ENVIRONMENT = "hbnf_matrix_wled16_packet20_diag"
EXPECTED_SOURCE_SHA256 = "529e1bf718c3770b7d4ba6408178e9d3e7a4ed1d223b9bbf9071b68e75eed74b"
EXPECTED_SOURCE_PATCH_SHA256 = "aca7b2fa6fe45ce992e162d91447351487e854279de373e691cf02615c149b04"
EXPECTED_ANIMARTRIX_COMMIT = "81eb09b91c8c9c8c01f8ea442787f8127d56c72f"
EXPECTED_ANIMARTRIX_UPSTREAM_BLOB = "db640748175cfdd70dc103fc23c830e646fa5ab6"
EXPECTED_ANIMARTRIX_CLOCK_PATCH_SHA256 = "f38d260d0f1f50644f24166fa92377d48ac0ffbe292b57f8ec5db39579af10c4"
EXPECTED_RENDER_VALUE_CACHE_PATCH_SHA256 = "fb2711140484a140cec35eb2dc90b4b7895a7723cf5bc7561c8e2057dea30b75"
EXPECTED_GENERATED_UI_SHA256 = {
    "package-lock.json": "8a4a7dd525cbf4ddbeeec104c0eec089c9998e1c02f6df2ee2c4ccd1499916c0",
    "tools/cdata.js": "59d90a85abfdd013f4fb8cd71d002f7aa5eb29c44a7e5c91cc05ba09e30b0b5d",
    "pio-scripts/build_ui.py": "3ead020869e422dbbd890a598b5f3f6efc951f6688e1190c797c81d284a004d0",
    "wled00/html_ui.h": "5bc90be907cd9018dbd800d96de688157b62eb3bc21d340b758813f79463fbf6",
    "wled00/html_pixart.h": "57151332f15be8a78b5b2b3d32873a124fd29ed4bef7b71d127a0247c36b51ad",
    "wled00/html_cpal.h": "ba009955a122c3181deb65765271e61e351043df2c7708fe57e46a494b1f8209",
    "wled00/html_edit.h": "d973aa73e7dbd511dfc55bf3bb18756ced8bba5827f55069621703849877b860",
    "wled00/html_pxmagic.h": "c277440c3d67620fd8dbf853f4c9676f3afc53b088e5ee0f705e695972c4a3e3",
    "wled00/html_pixelforge.h": "2285c8bdc29ded50a8dcc1837f8472ba15fc3797f4bf3abcb974187586276a7b",
    "wled00/html_settings.h": "0aff89708dfe2266606f7e4af2633e7826080ffed9e9d6c7885726c51d126a9e",
    "wled00/html_other.h": "df93f03e32317e50c6dc16e341e03c396e9f5d94cf66bd56c4f1add44d2d1917",
    "wled00/js_iro.h": "c2744cf237588c5652a8b56fb14287e004c1edc0c6a7f927319a7250ef50b52d",
    "wled00/js_omggif.h": "de74636a8e56ec28317636f7a819a229318d9af3b89d5ba769833fac16b9c650",
}
EXPECTED_OTA_SLOT_BYTES = 0x180000

REQUIRED_FILES = [
    "firmware.bin",
    "firmware.elf",
    "build.log",
    "source-input-sha256.txt",
    "project-config.json",
    "project-metadata.json",
    "resolved-packages.txt",
    "size-and-headroom.txt",
    "provenance.json",
    "animartrix-clock.patch",
    "ANIMartRIX.upstream.h",
    "ANIMartRIX.patched.h",
    "generated-ui-sha256.txt",
]


class ValidationError(RuntimeError):
    pass


def sha256_file(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def git_blob_sha1(path: pathlib.Path) -> str:
    data = path.read_bytes()
    h = hashlib.sha1()
    h.update(f"blob {len(data)}\0".encode("ascii"))
    h.update(data)
    return h.hexdigest()


def parse_sha256_lines(path: pathlib.Path) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line:
            continue
        parts = line.split(None, 1)
        if len(parts) != 2 or not re.fullmatch(r"[0-9a-f]{64}", parts[0]):
            raise ValidationError(f"malformed SHA-256 line in {path.name}: {raw!r}")
        out[parts[1].strip()] = parts[0]
    return out


def load_json(path: pathlib.Path) -> Dict[str, Any]:
    try:
        value = json.loads(path.read_text())
    except Exception as exc:
        raise ValidationError(f"invalid JSON {path.name}: {exc}") from exc
    if not isinstance(value, dict):
        raise ValidationError(f"{path.name} must contain a JSON object")
    return value


def parse_key_values(path: pathlib.Path) -> Dict[str, int]:
    out: Dict[str, int] = {}
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line:
            continue
        if "=" not in line:
            raise ValidationError(f"malformed line in {path.name}: {raw!r}")
        key, value = line.split("=", 1)
        try:
            out[key.strip()] = int(value.strip())
        except ValueError as exc:
            raise ValidationError(f"non-integer {key!r} in {path.name}") from exc
    return out


def require_equal(actual: Any, expected: Any, label: str) -> None:
    if actual != expected:
        raise ValidationError(f"{label} mismatch: expected {expected!r}, got {actual!r}")


def validate_artifact_dir(
    artifact_dir: pathlib.Path,
    expected_commit: str,
) -> Dict[str, Any]:
    root = pathlib.Path(artifact_dir).resolve()
    if not root.is_dir():
        raise ValidationError(f"artifact directory does not exist: {root}")
    if not re.fullmatch(r"[0-9a-f]{40}", expected_commit):
        raise ValidationError("expected commit must be an exact 40-character lowercase Git SHA")

    missing = [name for name in REQUIRED_FILES if not (root / name).is_file()]
    if missing:
        raise ValidationError("required build artifact files missing: " + ", ".join(missing))

    for name in REQUIRED_FILES:
        if (root / name).stat().st_size <= 0:
            raise ValidationError(f"required build artifact file is empty: {name}")

    provenance = load_json(root / "provenance.json")
    require_equal(provenance.get("status"), "BUILD_SUCCEEDED", "provenance.status")
    require_equal(provenance.get("github_repository"), EXPECTED_REPOSITORY, "provenance.github_repository")
    require_equal(provenance.get("github_branch"), EXPECTED_BRANCH, "provenance.github_branch")
    require_equal(provenance.get("github_commit"), expected_commit, "provenance.github_commit")
    require_equal(provenance.get("wled_base_commit"), EXPECTED_WLED_BASE, "provenance.wled_base_commit")
    require_equal(str(provenance.get("platformio_core")), EXPECTED_PLATFORMIO, "provenance.platformio_core")
    require_equal(provenance.get("environment"), EXPECTED_ENVIRONMENT, "provenance.environment")
    require_equal(
        provenance.get("diagnostic_source_sha256"),
        EXPECTED_SOURCE_SHA256,
        "provenance.diagnostic_source_sha256",
    )
    require_equal(
        provenance.get("source_patch_sha256"),
        EXPECTED_SOURCE_PATCH_SHA256,
        "provenance.source_patch_sha256",
    )
    require_equal(
        provenance.get("animartrix_upstream_commit"),
        EXPECTED_ANIMARTRIX_COMMIT,
        "provenance.animartrix_upstream_commit",
    )
    require_equal(
        provenance.get("animartrix_upstream_header_git_blob"),
        EXPECTED_ANIMARTRIX_UPSTREAM_BLOB,
        "provenance.animartrix_upstream_header_git_blob",
    )

    vendor_patch = root / "animartrix-clock.patch"
    upstream_header = root / "ANIMartRIX.upstream.h"
    patched_header = root / "ANIMartRIX.patched.h"
    require_equal(
        sha256_file(vendor_patch),
        EXPECTED_ANIMARTRIX_CLOCK_PATCH_SHA256,
        "animartrix-clock.patch SHA-256",
    )
    require_equal(
        provenance.get("animartrix_clock_patch_sha256"),
        EXPECTED_ANIMARTRIX_CLOCK_PATCH_SHA256,
        "provenance.animartrix_clock_patch_sha256",
    )
    require_equal(
        git_blob_sha1(upstream_header),
        EXPECTED_ANIMARTRIX_UPSTREAM_BLOB,
        "ANIMartRIX.upstream.h Git blob",
    )
    patched_text = patched_header.read_text(errors="replace")
    for required in (
        "double animation_clock_ms_ = 0.0;",
        "double animation_clock_speed_ = 1.0;",
        "uint32_t animation_clock_last_ms_ = 0;",
        "bool animation_clock_started_ = false;",
        "void calculate_oscillators(const oscillators &timings) {",
        "void run_default_oscillators() {",
    ):
        if required not in patched_text:
            raise ValidationError(f"patched ANIMartRIX header missing required marker: {required}")
    if patched_header.read_bytes() == upstream_header.read_bytes():
        raise ValidationError("patched ANIMartRIX header is identical to pristine upstream header")
    patched_sha = sha256_file(patched_header)
    require_equal(
        provenance.get("animartrix_patched_header_sha256"),
        patched_sha,
        "provenance.animartrix_patched_header_sha256",
    )

    # A fix-candidate build may add the tightly scoped render_value trig cache.
    # Keep the verified Run5/seq19 artifact contract backward compatible while
    # validating the exact additional patch whenever that candidate is present.
    render_cache_patch = root / "animartrix-render-value-trig-cache.patch"
    render_cache_patch_sha = None
    if render_cache_patch.exists():
        render_cache_patch_sha = sha256_file(render_cache_patch)
        require_equal(
            render_cache_patch_sha,
            EXPECTED_RENDER_VALUE_CACHE_PATCH_SHA256,
            "animartrix-render-value-trig-cache.patch SHA-256",
        )
        require_equal(
            provenance.get("render_value_cache_patch_sha256"),
            EXPECTED_RENDER_VALUE_CACHE_PATCH_SHA256,
            "provenance.render_value_cache_patch_sha256",
        )
        for marker in (
            "cached_angle_bits",
            "cached_cos = cosf(animation.angle)",
            "cached_sin = sinf(animation.angle)",
        ):
            if marker not in patched_text:
                raise ValidationError(
                    "patched ANIMartRIX header missing render_value cache marker: "
                    + marker
                )

    firmware = root / "firmware.bin"
    firmware_sha = sha256_file(firmware)
    firmware_bytes = firmware.stat().st_size
    require_equal(provenance.get("firmware_sha256"), firmware_sha, "provenance.firmware_sha256")
    require_equal(provenance.get("firmware_bytes"), firmware_bytes, "provenance.firmware_bytes")
    require_equal(provenance.get("ota_slot_bytes"), EXPECTED_OTA_SLOT_BYTES, "provenance.ota_slot_bytes")
    require_equal(
        provenance.get("ota_headroom_bytes"),
        EXPECTED_OTA_SLOT_BYTES - firmware_bytes,
        "provenance.ota_headroom_bytes",
    )
    if firmware_bytes >= EXPECTED_OTA_SLOT_BYTES:
        raise ValidationError(
            f"firmware does not fit OTA slot: {firmware_bytes} >= {EXPECTED_OTA_SLOT_BYTES}"
        )

    size_receipt = parse_key_values(root / "size-and-headroom.txt")
    require_equal(size_receipt.get("firmware_bytes"), firmware_bytes, "size receipt firmware_bytes")
    require_equal(size_receipt.get("ota_slot_bytes"), EXPECTED_OTA_SLOT_BYTES, "size receipt ota_slot_bytes")
    require_equal(
        size_receipt.get("ota_headroom_bytes"),
        EXPECTED_OTA_SLOT_BYTES - firmware_bytes,
        "size receipt ota_headroom_bytes",
    )

    source_hashes = (root / "source-input-sha256.txt").read_text()
    if EXPECTED_SOURCE_SHA256 not in source_hashes:
        raise ValidationError("source-input-sha256.txt does not contain exact Packet20 source SHA")
    if "usermod_hbnf_foundation_v1.cpp" not in source_hashes:
        raise ValidationError("source-input-sha256.txt does not name Packet20 source file")
    if "platformio_override.ini" not in source_hashes:
        raise ValidationError("source-input-sha256.txt does not include platformio_override.ini")
    if EXPECTED_ANIMARTRIX_CLOCK_PATCH_SHA256 not in source_hashes:
        raise ValidationError("source-input-sha256.txt does not include exact Animartrix clock patch SHA")

    generated = parse_sha256_lines(root / "generated-ui-sha256.txt")
    for path, expected_sha in EXPECTED_GENERATED_UI_SHA256.items():
        require_equal(generated.get(path), expected_sha, f"generated-ui-sha256 {path}")
    source_hash_map = parse_sha256_lines(root / "source-input-sha256.txt")
    for path, expected_sha in EXPECTED_GENERATED_UI_SHA256.items():
        if path.startswith("wled00/"):
            require_equal(source_hash_map.get(path), expected_sha, f"source-input generated output {path}")

    # Require parseable structured PlatformIO evidence. Exact dependency
    # versions are preserved separately in resolved-packages.txt.
    load_json(root / "project-config.json")
    try:
        metadata = json.loads((root / "project-metadata.json").read_text())
    except Exception as exc:
        raise ValidationError(f"invalid JSON project-metadata.json: {exc}") from exc
    if not isinstance(metadata, (dict, list)):
        raise ValidationError("project-metadata.json must contain a JSON object or array")

    package_text = (root / "resolved-packages.txt").read_text()
    if "platform" not in package_text.lower() and "framework" not in package_text.lower():
        raise ValidationError("resolved-packages.txt does not look like PlatformIO package output")

    build_log = (root / "build.log").read_text(errors="replace")
    if "[SUCCESS]" not in build_log and "SUCCESS" not in build_log:
        raise ValidationError("build.log does not contain PlatformIO success evidence")

    receipt = {
        "schema": "hbnf-packet20-cloud-build-validation-v1",
        "status": "PASS",
        "github_repository": EXPECTED_REPOSITORY,
        "github_branch": EXPECTED_BRANCH,
        "github_commit": expected_commit,
        "github_run_id": provenance.get("github_run_id"),
        "wled_base_commit": EXPECTED_WLED_BASE,
        "platformio_core": EXPECTED_PLATFORMIO,
        "environment": EXPECTED_ENVIRONMENT,
        "diagnostic_source_sha256": EXPECTED_SOURCE_SHA256,
        "source_patch_sha256": EXPECTED_SOURCE_PATCH_SHA256,
        "animartrix_upstream_commit": EXPECTED_ANIMARTRIX_COMMIT,
        "animartrix_upstream_header_git_blob": EXPECTED_ANIMARTRIX_UPSTREAM_BLOB,
        "animartrix_clock_patch_sha256": EXPECTED_ANIMARTRIX_CLOCK_PATCH_SHA256,
        "animartrix_patched_header_sha256": patched_sha,
        "render_value_cache_patch_sha256": render_cache_patch_sha,
        "generated_ui_sha256": dict(EXPECTED_GENERATED_UI_SHA256),
        "firmware_sha256": firmware_sha,
        "firmware_bytes": firmware_bytes,
        "ota_slot_bytes": EXPECTED_OTA_SLOT_BYTES,
        "ota_headroom_bytes": EXPECTED_OTA_SLOT_BYTES - firmware_bytes,
        "required_files_verified": list(REQUIRED_FILES),
        "next_gate": (
            "PROMOTE firmware/provenance to Drive release capsules and registry; "
            "then read live updater high-water once before any signing/publish/install decision"
        ),
    }
    return receipt


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--artifact-dir", required=True)
    ap.add_argument("--expected-commit", required=True)
    ap.add_argument("--output")
    args = ap.parse_args(argv)
    try:
        receipt = validate_artifact_dir(pathlib.Path(args.artifact_dir), args.expected_commit)
    except ValidationError as exc:
        print(json.dumps({"status": "FAIL", "error": str(exc)}, indent=2), file=sys.stderr)
        return 2
    rendered = json.dumps(receipt, indent=2, sort_keys=True) + "\n"
    if args.output:
        pathlib.Path(args.output).write_text(rendered)
    print(rendered, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

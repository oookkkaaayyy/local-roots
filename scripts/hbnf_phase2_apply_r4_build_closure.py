#!/usr/bin/env python3
"""Apply the already-qualified R4 FastLED closure to a temporary WLED build copy."""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import re
import subprocess

EXPECTED_HEADER = "bd9d146e2ce5fde991a895ccc2ad2773df1cc77cb815381679c17c6425d7bbe8"
EXPECTED_R4_HEADER = "a2bc03b5196dbaacb39e56885ed9301106b15c4916e0b906f86c02db1601ec1b"
FASTLED_COMMIT = "adedfc40e73fb80f8e930318781036d8fe1dbd9f"
ENV = "hbnf_matrix_wled16_max"  # owns the shared, materialized libdeps/header path
DIAGNOSTIC_ENV = "hbnf_matrix_wled16_packet20_diag"
UPSTREAM_BUS_MANAGER_SHA256 = "3b56b570c148a8364edba92aa2d5dbb4c8147bb441131b38083f4c8372710b23"
TELEMETRY_PATCH_SHA256 = "3000796a0d9e1b2df56ddde7f5b08ee325035c2d0bdcdb436de170cef50633e3"
HOOKED_BUS_MANAGER_SHA256 = "0dee93bd5fb281e5f3760feceda7d8cdf42448bda3a6a2fd8c2b1dd9c95ed1c5"


def sha(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def apply_telemetry_hooks(wled: pathlib.Path) -> tuple[str, str]:
    """Apply the bounded, diagnostics-only hooks to pinned WLED bus dispatch."""
    patch = pathlib.Path(__file__).resolve().parents[1] / "firmware/phase2/integration-r3/packet20-frame-timing.patch"
    bus = wled / "wled00/bus_manager.cpp"
    if not patch.is_file() or not bus.is_file():
        raise SystemExit("pinned WLED source or telemetry hook patch is missing")
    patch_sha = sha(patch)
    if patch_sha != TELEMETRY_PATCH_SHA256:
        raise SystemExit(f"telemetry hook patch SHA mismatch: {patch_sha}")
    before = sha(bus)
    if before == UPSTREAM_BUS_MANAGER_SHA256:
        subprocess.run(["patch", "--batch", "--fuzz=0", "-p1", "-i", str(patch)], cwd=wled, check=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    elif before != HOOKED_BUS_MANAGER_SHA256:
        raise SystemExit(f"unexpected pinned WLED bus_manager.cpp input: {before}")
    after = sha(bus)
    if after != HOOKED_BUS_MANAGER_SHA256:
        raise SystemExit(f"telemetry hook output SHA mismatch: {after}")
    return patch_sha, after


def verify_compiled_telemetry(firmware_bin: pathlib.Path, firmware_map: pathlib.Path, build_log: pathlib.Path) -> dict:
    """Prove diagnostics were compiled, linked, and callable in the candidate."""
    raw = firmware_bin.read_bytes()
    log = build_log.read_text(errors="replace")
    map_text = firmware_map.read_text(errors="replace")
    if not re.search(r"-o\s+\.pio/build/" + re.escape(DIAGNOSTIC_ENV) + r"/lib[^\s]*/hbnf_foundation_v1/usermod_hbnf_foundation_v1\.cpp\.o.*-DHBNF_PACKET20_DIAGNOSTICS", log):
        raise SystemExit("compiled usermod command lacks the diagnostics define in the exact diagnostic environment")
    for symbol in ("hbnfPerfDdpStart", "hbnfPerfDdpEnd", "hbnfPerfFrameEnd"):
        # The linker's cross-reference table must show both the defining usermod
        # object and the pinned WLED bus dispatcher as references.
        pattern = re.compile(r"(?m)^" + re.escape(symbol) + r"\s+\.pio/build/" + re.escape(DIAGNOSTIC_ENV) + r"/lib[^\s]*/hbnf_foundation_v1/usermod_hbnf_foundation_v1\.cpp\.o\s*\n\s*\.pio/build/" + re.escape(DIAGNOSTIC_ENV) + r"/src/bus_manager\.cpp\.o\s*$")
        if not pattern.search(map_text):
            raise SystemExit(f"linked map does not prove WLED bus_manager call/reference for {symbol}")
    contracts = (
        b"packet20Diagnostic", b"foundationTelemetry", b"wholeFrameUs",
        b"lastCommandAccepted", b"largestFreeBlockBytes", b"frameMsP95",
    )
    missing = [key.decode() for key in contracts if key not in raw]
    if missing:
        raise SystemExit("compiled firmware binary lacks required telemetry output contract: " + ", ".join(missing))
    return {
        "status": "PASS_COMPILED_TELEMETRY_CONTRACT",
        "environment": DIAGNOSTIC_ENV,
        "compile_define": "HBNF_PACKET20_DIAGNOSTICS",
        "linked_wled_callers": ["BusNetwork::show -> hbnfPerfDdpStart/hbnfPerfDdpEnd", "BusManager::show -> hbnfPerfFrameEnd"],
        "binary_output_markers": [key.decode() for key in contracts],
        "firmware_sha256": hashlib.sha256(raw).hexdigest(),
        "map_sha256": sha(firmware_map),
        "build_log_sha256": sha(build_log),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--wled-root", required=True, type=pathlib.Path)
    ap.add_argument("--fastled-root", required=True, type=pathlib.Path)
    ap.add_argument("--verify-compiled-telemetry", action="store_true")
    ap.add_argument("--firmware-bin", type=pathlib.Path)
    ap.add_argument("--firmware-map", type=pathlib.Path)
    ap.add_argument("--build-log", type=pathlib.Path)
    args = ap.parse_args()
    wled = args.wled_root.resolve()
    fastled = args.fastled_root.resolve()
    if subprocess.check_output(["git", "-C", str(wled), "rev-parse", "HEAD"], text=True).strip() != "29b389df1c1aaec6ff53aea742d17063b985906c":
        raise SystemExit("WLED source commit mismatch")
    if subprocess.check_output(["git", "-C", str(fastled), "rev-parse", "HEAD"], text=True).strip() != FASTLED_COMMIT:
        raise SystemExit("FastLED source commit mismatch")
    if args.verify_compiled_telemetry:
        if not all((args.firmware_bin, args.firmware_map, args.build_log)):
            raise SystemExit("compiled telemetry verification requires --firmware-bin, --firmware-map, and --build-log")
        print(json.dumps(verify_compiled_telemetry(args.firmware_bin, args.firmware_map, args.build_log), indent=2, sort_keys=True))
        return 0
    header = wled / ".pio/libdeps" / ENV / "animartrix/ANIMartRIX.h"
    config = wled / "platformio_override.ini"
    project_config = wled / "platformio.ini"
    if not header.is_file() or not config.is_file():
        raise SystemExit("expected materialized ANIMartRIX header and platformio_override.ini")
    before = sha(header)
    if before not in (EXPECTED_HEADER, EXPECTED_R4_HEADER):
        raise SystemExit(f"unexpected ANIMartRIX input header: {before}")
    if before == EXPECTED_HEADER:
        subprocess.run([
            "python3", str(pathlib.Path(__file__).with_name("hbnf_packet20_r4_fastled_backport.py")),
            "--header", str(header), "--fastled-root", str(fastled), "--apply",
        ], check=True)
    after = sha(header)
    if after != EXPECTED_R4_HEADER:
        raise SystemExit(f"R4 output mismatch: {after}")
    content = config.read_text()
    old = "[env:hbnf_matrix_wled16_max]\nextends = env:esp32dev\n"
    if old not in content:
        raise SystemExit("expected Phase 2 max environment header not found")
    start = content.index(old) + len(old)
    end = content.find("\n[env:", start)
    if end < 0:
        end = len(content)
    block = content[start:end]
    flag = f'build_flags = ${{env:esp32dev.build_flags}} -I"{fastled / "src"}"'
    lines = [line for line in block.splitlines() if not line.startswith("build_flags =")]
    lines.append(flag)
    content = content[:start] + "\n".join(lines) + content[end:]
    config.write_text(content)
    diagnostic = f"[env:{DIAGNOSTIC_ENV}]\nextends = env:{ENV}\nbuild_flags = ${{env:{ENV}.build_flags}} -DHBNF_PACKET20_DIAGNOSTICS"
    if diagnostic not in content:
        raise SystemExit("diagnostic environment must inherit the R4-scoped environment and define HBNF_PACKET20_DIAGNOSTICS")
    patch_sha, hooked_sha = apply_telemetry_hooks(wled)
    pio_text = project_config.read_text()
    old_cache = "build_cache_dir = ~/.buildcache"
    isolated_cache = f"build_cache_dir = {wled / '.hbnf-clean-build-cache'}"
    if old_cache in pio_text:
        pio_text = pio_text.replace(old_cache, isolated_cache, 1)
    elif re.search(r"(?m)^build_cache_dir\s*=\s*.*\.hbnf-clean-build-cache\s*$", pio_text):
        pio_text = re.sub(r"(?m)^build_cache_dir\s*=\s*.*\.hbnf-clean-build-cache\s*$", isolated_cache, pio_text, count=1)
    elif isolated_cache not in pio_text:
        raise SystemExit("expected stock or prior isolated build cache setting not found")
    project_config.write_text(pio_text)
    print(f"wled_commit=29b389df1c1aaec6ff53aea742d17063b985906c")
    print(f"fastled_commit={FASTLED_COMMIT}")
    print(f"animartrix_header_before={before}")
    print(f"animartrix_header_after={after}")
    print(f"fastled_license_sha256={sha(fastled / 'LICENSE')}")
    print(f"fastled_include={fastled / 'src'}")
    print(f"override_sha256={sha(config)}")
    print(f"isolated_build_cache={wled / '.hbnf-clean-build-cache'}")
    print(f"project_config_sha256={sha(project_config)}")
    print(f"build_environment={DIAGNOSTIC_ENV}")
    print(f"telemetry_hook_patch_sha256={patch_sha}")
    print(f"telemetry_hooked_bus_manager_sha256={hooked_sha}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

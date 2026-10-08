#!/usr/bin/env python3
"""Apply the already-qualified R4 FastLED closure to a temporary WLED build copy."""
from __future__ import annotations

import argparse
import hashlib
import pathlib
import subprocess

EXPECTED_HEADER = "bd9d146e2ce5fde991a895ccc2ad2773df1cc77cb815381679c17c6425d7bbe8"
EXPECTED_R4_HEADER = "a2bc03b5196dbaacb39e56885ed9301106b15c4916e0b906f86c02db1601ec1b"
FASTLED_COMMIT = "adedfc40e73fb80f8e930318781036d8fe1dbd9f"
ENV = "hbnf_matrix_wled16_max"


def sha(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--wled-root", required=True, type=pathlib.Path)
    ap.add_argument("--fastled-root", required=True, type=pathlib.Path)
    args = ap.parse_args()
    wled = args.wled_root.resolve()
    fastled = args.fastled_root.resolve()
    if subprocess.check_output(["git", "-C", str(wled), "rev-parse", "HEAD"], text=True).strip() != "29b389df1c1aaec6ff53aea742d17063b985906c":
        raise SystemExit("WLED source commit mismatch")
    if subprocess.check_output(["git", "-C", str(fastled), "rev-parse", "HEAD"], text=True).strip() != FASTLED_COMMIT:
        raise SystemExit("FastLED source commit mismatch")
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
    pio_text = project_config.read_text()
    old_cache = "build_cache_dir = ~/.buildcache"
    isolated_cache = f"build_cache_dir = {wled / '.hbnf-clean-build-cache'}"
    if old_cache in pio_text:
        pio_text = pio_text.replace(old_cache, isolated_cache, 1)
    elif isolated_cache not in pio_text:
        raise SystemExit("expected stock build cache setting not found")
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
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

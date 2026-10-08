#!/usr/bin/env python3
"""Regression fixture: Phase 2 build closure must carry the exact R4 source and compiler scope."""
import hashlib
import importlib.util
import json
import pathlib
import re
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
script = (ROOT / "scripts/hbnf_phase2_apply_r4_build_closure.py").read_text()
phase2_patch_r4 = (ROOT / "firmware/phase2/integration-r4/usermod_hbnf_foundation_v1.patch").read_text()
binding = json.loads((ROOT / "firmware/phase2/integration-r4/SOURCE_BINDING.json").read_text())
hooks = (ROOT / "firmware/phase2/integration-r4/packet20-frame-timing.patch").read_text()
helper_path = ROOT / "scripts/hbnf_phase2_apply_r4_build_closure.py"
spec = importlib.util.spec_from_file_location("phase2_r4_closure", helper_path)
m = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(m)
backport = (ROOT / "scripts/hbnf_packet20_r4_fastled_backport.py").read_text()
source = (ROOT / "firmware/packet20/seq39-tail250/usermod_hbnf_foundation_v1.cpp").read_text()
assert "EXPECTED_R4_HEADER = \"a2bc03b5196dbaacb39e56885ed9301106b15c4916e0b906f86c02db1601ec1b\"" in script
assert "bd9d146e2ce5fde991a895ccc2ad2773df1cc77cb815381679c17c6425d7bbe8" in script
assert "adedfc40e73fb80f8e930318781036d8fe1dbd9f" in script
assert "render_value_fp_from_float" in backport
assert "FL_FAST_MATH_BEGIN" in backport and "FL_OPTIMIZATION_LEVEL_O3_BEGIN" in backport
assert '#pragma push_macro("R")' in backport and '#pragma pop_macro("R")' in backport
assert 'fastled / "src"' in script
assert ".hbnf-clean-build-cache" in script
assert hashlib.sha256(source.encode()).hexdigest() == "31126d341bf0a3e54a33d87de0856c5f68e79f20dd05653ae1d5df3270a9bc9d"
assert "hbnf-cart2-phase2-offline-wow-r4-20261008" in phase2_patch_r4
assert "hbnf-cart2-phase2-offline-wow-r3-20261008" not in phase2_patch_r4
assert binding["build_environment"] == m.DIAGNOSTIC_ENV
assert hashlib.sha256((ROOT / binding["patch_path"]).read_bytes()).hexdigest() == binding["patch_sha256"]
assert hashlib.sha256((ROOT / binding["telemetry_hook_patch_path"]).read_bytes()).hexdigest() == binding["telemetry_hook_patch_sha256"] == m.TELEMETRY_PATCH_SHA256
assert binding["telemetry_hooked_wled_source_sha256"] == m.HOOKED_BUS_MANAGER_SHA256
for marker in ("hbnfPerfDdpStart();", "hbnfPerfDdpEnd();", "hbnfPerfFrameEnd();", "#if defined(HBNF_PACKET20_DIAGNOSTICS)"):
    assert marker in hooks
assert "HBNF_PACKET20_DIAGNOSTICS" in source
assert "verify_compiled_brightness_codegen" in script
assert "PASS_COMPILED_BRIGHTNESS_HOT_PATH_INLINE" in script
assert 'h.createNestedObject("packet20Diagnostic")' in source
assert 'h.createNestedObject("foundationTelemetry")' in source
assert 'timing["wholeFrameUs"]' in source
assert "lastCommandAccepted" in source
assert "hbnf_matrix_wled16_packet20_diag" in script
brightness = (ROOT / "firmware/phase2/brightness-r1/hbnf_brightness_output.h").read_text()
assert "always_inline" in brightness
assert "scaleChannel(gammaCorrected.r, scale)" in brightness

# The existing R4 build-closure gate also verifies the emitted candidate,
# requiring effective compile flags, linked WLED call sites, and firmware bytes.
with tempfile.TemporaryDirectory() as td:
    td = pathlib.Path(td)
    fw = td / "firmware.bin"
    map_file = td / "firmware.map"
    log_file = td / "build.log"
    fw.write_bytes(b"candidate packet20Diagnostic foundationTelemetry wholeFrameUs lastCommandAccepted largestFreeBlockBytes frameMsP95")
    env = m.DIAGNOSTIC_ENV
    map_file.write_text("\n".join(
        f"{symbol}  .pio/build/{env}/lib999/hbnf_foundation_v1/usermod_hbnf_foundation_v1.cpp.o\n"
        f"                .pio/build/{env}/src/bus_manager.cpp.o"
        for symbol in ("hbnfPerfDdpStart", "hbnfPerfDdpEnd", "hbnfPerfFrameEnd")
    ) + "\n")
    log_file.write_text(
        f"xtensa-esp32-elf-g++ -o .pio/build/{env}/lib999/hbnf_foundation_v1/usermod_hbnf_foundation_v1.cpp.o -c -DHBNF_PACKET20_DIAGNOSTICS\n"
        f"xtensa-esp32-elf-g++ -o .pio/build/{env}/src/bus_manager.cpp.o -c -DHBNF_PACKET20_DIAGNOSTICS"
    )
    result = m.verify_compiled_telemetry(fw, map_file, log_file)
    assert result["status"] == "PASS_COMPILED_TELEMETRY_CONTRACT"
    map_file.write_text(map_file.read_text().replace("src/bus_manager.cpp.o", "src/unrelated.cpp.o", 1))
    try:
        m.verify_compiled_telemetry(fw, map_file, log_file)
        raise AssertionError("missing compiled hook call was accepted")
    except SystemExit as exc:
        assert "bus_manager call/reference" in str(exc)
    map_file.write_text("\n".join(
        f"{symbol}  .pio/build/{env}/lib999/hbnf_foundation_v1/usermod_hbnf_foundation_v1.cpp.o\n"
        f"                .pio/build/{env}/src/bus_manager.cpp.o"
        for symbol in ("hbnfPerfDdpStart", "hbnfPerfDdpEnd", "hbnfPerfFrameEnd")
    ) + "\n")
    log_file.write_text(log_file.read_text().replace("-DHBNF_PACKET20_DIAGNOSTICS", ""))
    try:
        m.verify_compiled_telemetry(fw, map_file, log_file)
        raise AssertionError("missing compile definition was accepted")
    except SystemExit as exc:
        assert "lacks the diagnostics define" in str(exc)
print("PASS: Phase 2 source binding preserves R4 source and embeds unique WOW-r4 identity")
print("PASS: clean-room closure requires the exact R4 FastLED transformation, diagnostics environment, telemetry hook patch, and empty local object cache")
print("PASS: existing build gate fails closed unless the compiled binary, effective macro, and linked WLED hook references satisfy the telemetry contract")

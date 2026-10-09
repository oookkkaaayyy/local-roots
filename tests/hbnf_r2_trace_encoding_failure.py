#!/usr/bin/env python3
"""Preserve the exact R2 serialization defect classification from target evidence."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
evidence = ROOT / "evidence/cart2-r7-performance-repair-20261009/R2_LIVE_DIAGNOSTIC_TRANSACTION"
result = json.loads((evidence / "R2_DIAGNOSTIC_RESULT.json").read_text())
diagnosis = json.loads((evidence / "R2_TRACE_ENCODING_DIAGNOSIS.json").read_text())
source = (ROOT / "firmware/phase2/integration-r7/usermod/usermod_hbnf_foundation_v1.cpp").read_text()
sdkconfig = (Path.home() / ".platformio/packages/framework-arduinoespressif32/tools/sdk/esp32/sdkconfig").read_text()
formatter = source.split("static void hbnfFormatTraceRecord", 1)[1].split("static bool hbnfTailSetEnabled", 1)[0]

assert result["status"] == "INCONCLUSIVE__MALFORMED_TRACE_RECORDS"
assert result["trace"]["parsed_record_count"] == 0
assert len(result["trace"]["records_raw"]) == 5
assert all(row.startswith("lu,") and len(row.split(",")) == 16 for row in result["trace"]["records_raw"])
assert "%llu" not in formatter and "hbnf_u64_format::formatTraceRecord" in formatter
assert '#include "hbnf_u64_format.h"' in source
assert "CONFIG_NEWLIB_NANO_FORMAT=y" in sdkconfig
assert diagnosis["evidence"]["formatter_source_sha256"] == "6d6ed64ae6c35c75ee79484c06bb2d4357d67bcb91541d8ac3d72d651ffb4c43"  # historical defective build
assert diagnosis["classification"] == "DIAGNOSTIC_SERIALIZATION_DEFECT_CONFIRMED"
assert diagnosis["installed_r4_sha256"] == "338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c"
assert diagnosis["live_authority"].startswith("Consumed.")
print("PASS: historical trace corruption matches unsupported target %llu formatter; corrected bounded formatter is wired; no old stage attribution accepted")

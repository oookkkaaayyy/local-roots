#!/usr/bin/env python3
"""Regression fixture: Phase 2 build closure must carry the exact R4 source and compiler scope."""
import hashlib
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
script = (ROOT / "scripts/hbnf_phase2_apply_r4_build_closure.py").read_text()
patch = (ROOT / "firmware/phase2/integration-r2/usermod_hbnf_foundation_v1.patch").read_text()
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
assert re.search(r'hbnf-cart2-phase2-offline-wow-r2-20261008', patch)
assert "hbnf-cart2-phase2-offline-r1-20261007" not in patch
assert hashlib.sha256(source.encode()).hexdigest() == "31126d341bf0a3e54a33d87de0856c5f68e79f20dd05653ae1d5df3270a9bc9d"
print("PASS: Phase 2 source binding preserves R4 baseline and embeds unique WOW-r2 identity")
print("PASS: clean-room recipe requires exact R1 input, R4 output, pinned FastLED commit, and scoped include path")

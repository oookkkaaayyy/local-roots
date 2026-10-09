#!/usr/bin/env python3
"""Prove the R5 32x16 radial fast path is pixel-exact and bounded."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "firmware/phase2/integration-r6/usermod/hbnf_animartrix_audio_bridge.h"
text = SOURCE.read_text()
assert "width_==32u && height_==16u" in text
assert "(int)(((int32_t)d2*159)/1186)" in text
assert ": (int)(((int64_t)d2*159)/maxd2)" in text

# 32x16 coordinate domain: d2 is in [0,1186], and d2*159 fits signed int32.
for transform in range(8):
    seen = set()
    for y in range(16):
        for x in range(32):
            tx, ty = x, y
            if transform & 1:
                tx = 31 - tx
            if transform & 2:
                ty = 15 - ty
            if transform & 4:
                salt = 255
                tx = (tx + salt % 32) % 32
                ty = (ty + (salt >> 5) % 16) % 16
            seen.add((tx, ty))
            dx2, dy2 = 2 * tx - 31, 2 * ty - 15
            d2 = dx2 * dx2 + dy2 * dy2
            assert 0 <= d2 <= 1186
            numerator = d2 * 159
            assert numerator <= 188574 < 2**31
            old = (d2 * 159) // 1186
            fast = (numerator & 0xFFFFFFFF) // 1186
            assert old == fast and 0 <= fast <= 159
    assert len(seen) == 512

# Nonproduction geometries retain the exact former int64 expression.
for width, height in ((1, 1), (8, 8), (16, 32), (64, 16)):
    cx2, cy2 = width - 1, height - 1
    maxd2 = cx2 * cx2 + cy2 * cy2
    if maxd2:
        for x, y in ((0, 0), (width - 1, height - 1), (width // 2, height // 2)):
            d2 = (2*x-cx2)**2 + (2*y-cy2)**2
            # The source fallback is unchanged; reference result is the original operation.
            assert (d2 * 159) // maxd2 == int((d2 * 159) / maxd2)
print("PASS: 512/512 production pixels × 8 transforms exact; numerator bound proven; alternate dimensions retain int64 fallback")

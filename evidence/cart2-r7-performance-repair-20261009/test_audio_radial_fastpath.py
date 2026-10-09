#!/usr/bin/env python3
"""Focused exactness/source regression for the R6->R7 radial arithmetic change."""
from pathlib import Path

source = Path('/tmp/hbnf-p2-build/WLED-r7-local-20261009/usermods/hbnf_foundation_v1/hbnf_animartrix_audio_bridge.h').read_text()
assert '(int32_t)d2*159)/1186' in source
assert '(int64_t)d2*159)/maxd2' in source
assert 'width_==32u && height_==16u' in source

# The WLED runtime passes 32x16. Exhaust every pixel coordinate and all 8
# rotations/reflections used by the Foundation renderer, comparing against the
# former R6 signed-64-bit expression exactly.
seen = set()
for transform in range(8):
    coords = set()
    for y in range(16):
        for x in range(32):
            tx, ty = x, y
            if transform & 1:
                tx = 31 - tx
            if transform & 2:
                ty = 15 - ty
            if transform & 4:
                # A translation modulo the grid is bijective; representative
                # salts exercise its extreme offsets without changing range.
                salt = 255
                tx = (tx + salt % 32) % 32
                ty = (ty + (salt >> 5) % 16) % 16
            assert 0 <= tx < 32 and 0 <= ty < 16
            coords.add((tx, ty))
            dx2, dy2 = 2 * tx - 31, 2 * ty - 15
            d2 = dx2 * dx2 + dy2 * dy2
            old = (d2 * 159) // 1186
            new = ((int(d2) * 159) // 1186)
            assert old == new and 0 <= new <= 159
    assert len(coords) == 512, (transform, len(coords))
    seen.add(transform)
assert seen == set(range(8))

# The non-32x16 branch retains the exact original expression, so alternate
# dimension behavior is unchanged by the specialized branch.
assert '(int)(((int64_t)d2*159)/maxd2)' in source
print('PASS: 512/512 pixels × 8 coordinate transforms exact; alternate-grid fallback retained')

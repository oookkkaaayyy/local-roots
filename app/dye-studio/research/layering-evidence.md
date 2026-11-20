# Layering and blending evidence (public sources, qualitative)

Used to constrain the engine and encoded in scripts/test.mjs. No source gives measured spectra for disc overlaps; magnitudes are model estimates.

## Dyer reports (dgcoursereview, allthingsdiscgolf, rarediscgolf, udisc)
- Dye the darkest color first, lighter after: lighter dye over dark changes it little. Black overpowers any other color.
- Red overpowers yellow plastic if dyed dark enough; yellow on a red disc gives a darker red-orange.
- Complementary pairs layered or mixed turn gray or brown; red over blue shifts both.
- Blue on yellow plastic gives green or gray; dyed deeply enough, the dye color wins over the plastic color.
- Orange plus red dyed together on yellow plastic stayed true to their own colors.
- With masking (vinyl), order of colors does not matter.
- Champion (translucent) takes dye as a weaker plastic color than Star; Star and Champion rate best for dye uptake.
- iDye Poly is disperse dye (SDS: Disperse Yellow 54 in #447 Yellow). Disperse dye sorption on polypropylene is near-linear with a low saturation level (published PP/clay isotherm work).

## Photo checks (Google Images result pages, viewed 2026-11-19)
- Yellow plastic dyed orange/red: gradients yellow to orange to red; orange and red read as clean saturated colors, not muddy.
- Blue over yellow: muted to bright green and teal where blue is thin, olive/dark green where thick; separately masked blue and yellow regions stay blue and yellow.

## Open items
- Neon yellow plus neon orange emission split (absorption vs glow) is not identifiable from one swatch per dye; needs one overlap photo with known dyes.
- Champion two-dye overlaps are the least validated case.

## dgcoursereview 148993 (glue bed, iPoly)
- Red on green Star: deep red overwrites the green (sampled about #8d241c). Engine: red-dominant, darker.
- DX/base plastic is not offered in the tool.
- Clear F2: light dyes weak, dark dyes needed.

## Threads 61923, 65307, 124584, 110989 and image results
- Dyers: dye darkest first then lighter; black/red/orange/yellow stack without changing much; blue over red shifts.
- Red overpowers yellow plastic if dark enough; dark blue holds; light blue goes green; dye is translucent, black near opaque.
- Neon yellow with red dye lines (Tri-Fox photo): red-orange about #9d2711; engine Fire Red within test tolerance.
- Open: red on green Star darker in engine than photo (plastic shade unknown).

## Veil
- Champion dark dyes clip to pure channels; photos show a floor. Veil .008 linear fit against measured champion anchors (5.39 to 5.22 dE2000); larger veils worsened anchors.
- Blue on orange photos show vivid blue; engine dark teal. Not changed: source disc unknown, possibly stripped or painted.

## Image color coverage test
- 54 Google Images thumbnails (dip dye, glue bed), 3-cluster colors per disc; each darker cluster tested against best engine dye (Star or Champion, strength .5-1.3) on each lighter cluster as base.
- 38 of 54 within dE 8, median 6.4. Worst cases are vivid blue on lime, mint and yellow plastics (photo brighter than engine).
- Base reflectance floor 0, .05, .10: coverage 38, 34, 31 of 54 and Champion anchors 5.22, 5.57, 5.89. Floor rejected.

## Image residual by hue (scripts/image_coverage.mjs, research/image-clusters.txt)
- 169 discs, 3-cluster colors from Google Images thumbnails; dye strengths .1 to 1.3; Champion uses UI transmission color.
- Overall bias dL +0.0, dC near 0. Per-hue mean best-fit dE 4.7 to 9.1; blue (270 deg) worst at 9.1 with n=10; light blues fit only at low strength.
- Global parameter sensitivity (star Sx, champion kT, gT): no meaningful change. No global recalibration justified.

# Dye engine: public dataset, evaluation and 2026-11-22 changes

## Dataset
`app/dye-studio/research/dataset/observations.json` lists 19 public sources and three row types: measured films (6, groundtruth.json), measured Champion zone colors (6 anchors), photo-sampled points (2) and 14 direction-of-shift cases with hue and lightness windows. Image thumbnails (169 discs, `research/image-clusters.txt`) give a coverage test: for each disc, the best engine dye and strength against the photo's dyed cluster.
No source gives measured spectra for overlaps. Almost all online evidence is qualitative text, so direction and coverage tests are the usable signal. No private owner photos are included.

## Reproduce
`cd app && node dye-studio/scripts/eval_dataset.mjs --coverage` (also run by `npm run test:studio`). Set `LEGACY_TRANS=1` to reproduce the pre-change Champion transmission heuristic.

## Results (dE2000, before to after)
| set | before | after |
|---|---|---|
| films (n=6) mean / p95 | 0.37 / 1.18 | 0.37 / 1.18 |
| Champion anchors (n=6) mean / median / p95 | 6.15 / 5.64 / 13.36 | 6.15 / 5.64 / 13.36 |
| photo-sampled (n=2) mean | 11.29 | 11.29 |
| image coverage (n=169) mean / median / p95 | 3.67 / 3.38 / 7.56 | 3.75 / 3.25 / 7.77 |
| direction cases | 13 of 14 | 14 of 14 |
Quantitative sets are unchanged within noise; the gain is structural (direction, plastic awareness, confidence). Direction criterion: lightness cap at full strength, and the hue window must be reachable at some strength from 0.01 to 1 (the UI always uses full strength, where blue on yellow Champion is near black).

## Changes
- Champion default transmission color is now the base spectrum raised to 0.38 after a 0.08 floor (Beer-Lambert thinner path) instead of lightening the hex toward white, which injected blue into yellow plastic and turned thin blue dye violet. Single anchor check: 4.5 vs 5.3 dE2000 against the measured transmission color. A user-set transmission color is still honored.
- Plastic table (`DE.PLASTICS`, `DE.plasticOf`): optical family plus uptake multiplier from the r/discdyeing wiki 1-5 ratings (DX, Prime 2; EchoStar, Pro 4; Star, GStar, Champion, Fuzion 5; Glow unrated). Used when a spec has `plastic`. The UI still offers Star, Champion, Glow only (owner decision).
- Confidence: predictions carry `evidence` flags (translucent multi-dye, overlap, estimated dye, unrated plastic, gamut); the UI lowers the Accuracy label one step when flagged.
- Band-width ablation (fit cap 95, 70, 55, 45 nm): no change in direction results; kept 95. Champion transmission exponent and floor grid (0.3 to 0.5, 0.04 to 0.08): coverage flat within 0.05 dE.

## Not resolved
UV Blast Green daylight look (model yellow-green, close to the one measured anchor) cannot be separated from real discs without a photo of that dye on a known plastic. Layering vs blending keeps the additive-baths model; no public quantitative overlap data exists.

## Update 2 (same day): fluorescence priors, bigger source set
Sources now 40 (see observations.json). New evidence read: plastic-uptake forum threads and guides (UDisc, Prodigy, discountdiscgolf, dgcr 52170/140438/146551/3763963/129659), Dyers Guild formulas and color vault, Pro Chemical dose guidance, fluorescent colorant literature (JAIC, FSU Day-Glo, Rhodamine 6G/B), Kubelka-Munk and Mixbox references. Reddit, several dgcr threads and prochemicalanddye.com were not fetchable; swatch and gallery photos could not be read as pixels.

Finding: the fitter placed pink, cerise, magenta and purple dye emission at 430 nm (nearest wavelength to a magenta hue has no meaning), and red at 690 nm. Under UV365 hot pink rendered dark violet and blue rendered near black. `research/dataset/fluor_priors.json` now sets emission by hue class from the literature (pink and red 600 to 625 nm, orange 595, yellow-green 528 to 552, blue 470) and a separate UV quantum yield (`uvphi`). The catalog was refit.

| set (pre-313 engine to now) | before | after |
|---|---|---|
| UV365 emission hue classes (n=8) | 4 of 8 | 8 of 8 |
| direction cases (n=18) | 17 of 18 | 18 of 18 |
| image coverage mean / median / p95 (all catalog dyes, n=169) | 3.02 / 2.64 / 6.45 | 3.00 / 2.41 / 6.74 |
| films mean | 0.37 | 0.47 |
| Champion anchors mean | 6.15 | 6.47 |
Films and anchors got slightly worse (fit trade-off against the corrected emission bands); the Champion rim zone residual (Blaze Orange rim 13.9) is unchanged.

Plastic ratings conflict across sources (wiki 5 for Champion; UDisc and Prodigy call it workable or poor). Champion and Fuzion are now rated 4 and the uptake multiplier is relative to the family reference, so Star and Champion are unchanged.

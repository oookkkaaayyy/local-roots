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

## Update 3: agent datasets merged (forums, photo base colors, science parameters)
Files in `app/dye-studio/research/dataset/`: `forum_observations.json` (96 labelled forum rows, qualitative, no stated hex), `photo_base_colors.csv` (2,300 retail-photo color rows, plate and rim sRGB medians, derived numbers only, no images; one retailer, exposure not normalized), `science_params.json` (diffusion, Kubelka-Munk, plastic optics, fluorescence parameters and PhotochemCAD peak/QY table; raw PhotochemCAD spectra are NOT in the repo, license unclear) and the three READMEs. `/home/claude/dye_research` is ephemeral; the repo copy is the durable one.

Changes
- Champion rim: base transmission exponent scales with optical path, `(path/0.74)^0.52`. The 0.52 comes from the photo data, not from the anchors (330 Champion-family discs: raising the plate spectrum to the 1.4 power best matches the rim, equivalent to 0.52 at the rim path ratio). Undyed rim error on those photos: median 9.15 to 7.35 dE2000 (mean 14.0 to 12.2); the two dyed anchor rims improved slightly (Blaze Orange rim 12.8 to 12.1).
- UV emission is now a separate `uvem`/`uvphi` pair per dye. Daylight `em` stays an effective fitted parameter, because changing it changed measured films (0.37 to 2.35 mean dE2000). Sanity bound: PhotochemCAD median Stokes shift of 21 visible fluorophores is 22 nm (IQR 17 to 35).
- Practitioner rules from the forum rows are evidence flags that lower the UI Accuracy label: low-uptake plastic (DX, Prime), dark base, black dye hue varies (plus the earlier translucent multi-dye, overlap, estimated dye). Layer order, plastic uptake ratings and Champion slowness were already encoded.

Final metrics (original engine at 4d6f7f47 to now): films mean 0.37 to 0.37; Champion anchors mean 6.15 to 6.09; image coverage mean/median/p95 3.02/2.64/6.45 to 2.99/2.64/6.31; UV365 hue classes 4/8 to 8/8; direction cases 17/18 to 18/18.

Not done: leave-one-source-out cross-validation (the only quantitative dyed sources are the 6 films and 6 anchors from one owner disc, and the 97 factory-dyed photo rows have no recipe); per-plastic N_sat fit (no dye-on-plastic recipe data to fit it); base-color replacement table per plastic (retail photo exposure is not normalized; absolute lightness unreliable, so photo_base_colors.csv is validation data only; the Glow default base has r:g:b ratios inside the spread of the 8 Glow Champion photo rows).

## Update 4: blending-model cross-validation on recipe-to-swatch data
Data: `research/dataset/mixing_rows.json` (890 rows; derived numbers only; `MIXING_README.md` has caveats). Rit swatches are flat digital fills (exact colors but renderings), cup assumed 48 tsp, Procion photos noisy, wool ramps noisy. Scripts: `scripts/fit_mixing.py` (5-fold CV), `fit_mixing_lodo.py` (leave-one-dye-out), `fit_ramps.py`. Each model fits per-dye absorbance (7-knot smooth spectrum) plus one saturation constant per class by least squares in Lab; dE2000 on held-out rows.

| model | polyester DyeMore (n=194, 14 dyes) mean / median | cotton Rit (n=529, 48 dyes) | Procion (n=77, noisy) | leave-one-dye-out polyester (n=330) |
|---|---|---|---|---|
| KM single-constant additive K/S | 5.74 / 4.97 | 5.64 / 4.63 | 15.25 | 9.26 |
| KM + competitive Langmuir uptake | 5.84 / 4.93 | 5.64 / 4.64 | 11.76 | n/a |
| Beer-Lambert additive absorbance | 8.10 / 7.41 | 8.17 / 6.48 | 16.13 | 18.66 |
| spectral.js-style weighted geometric | 7.51 / 6.60 | 6.91 / 5.51 | 12.44 | 16.90 |
| per-channel RGB subtractive | 8.54 / 7.87 | 8.22 / 6.83 | 15.12 | 15.19 |
| linear RGB average | 9.91 / 9.10 | 8.18 / 7.05 | 17.35 | n/a |
Binary and ternary classes behave alike (polyester KM 5.37 binary, 5.91 ternary). Winner: Kubelka-Munk additive K/S (about 2.4 dE2000 better than Beer-Lambert on scattering substrates). The engine's opaque (Star) path already adds dye K/S to the base K/S, so the blend law is confirmed rather than changed; a test pins this. Competitive uptake is neutral (so the Langmuir competition term is kept but not evidence-backed). Procion results are too noisy to rank. Leave-one-brand-out is not possible: brands share no dye identities.

Concentration response (11 Osborn acid-dye ramps, 0.25 to 3 percent owf): K/S grows sub-linearly, power exponent median 0.75 (IQR 0.53 to 1.09); relative MSE power 0.125, exp 0.134, Langmuir 0.136, linear 0.183. The engine's Langmuir dye strength curve has an effective exponent of about 0.66 over a 4x range, consistent with the ramps; no change. The UI has no strength slider (owner decision).

Not applicable: replacing estimated catalog dyes with fitted spectra. None of the Rit, Procion, Jacquard or CHT dyes in the data is chemically the same product as a studio catalog dye (iDye Poly, ProChem, UV Blast), so the 'estimated dye' flags stay. Per-plastic saturation (TOTCAP) stays global: no dye-on-plastic recipe data exists to fit it.

UV Blast Green daylight look: unchanged (yellow-green on white Star, about #8DE82F, consistent with the one measured Champion anchor and with forum statements that worm-dye greens read as chartreuse or fluorescent green). No public swatch of that dye on a known plastic was found.

## Update 5: attempts to improve the disc previews further
Tried and rejected (no gain, recorded so they are not retried):
- Dye path exponent at the Champion rim (dye diffusion depth proxy, rim path factor 1 to 3.5): Blaze Orange rim got worse (13.6 to 15.9 dE2000), mean of the six anchors worse (6.09 to 6.48). The residual is a hue problem (observed rim #57090D has almost no green; model gives brown), not a thickness problem. Rim base exponent 0.52 to 3: orange rim 13.6 to 17.6.
- Preset base-color hue nudges from the 829 plastic-by-color medians (blue +12 deg, green -9, purple +7, yellow +5): unmeasurable without ground truth and the retail photos have uncontrolled exposure and mixed neon/pastel stock under one name (n is 11 to 14 per color); not applied. Chroma in the photos is lower than the presets in every color, consistent with photo exposure, not evidence about plastic.
- Per-dye refit by hue class: no Rit, Procion, Jacquard or CHT dye matches a catalog dye chemically, so a refit would just move estimates; not done.
Applied: plastic table expanded from 9 to 41 plastics from the r/discdyeing wiki rating table (the full table, including Opto, Lucid, Neutron, K1, VIP, Tournament, C-Line, S-Line, Z FLX, Titanium; 1 for Retro, K3, Electron, Prodigy 300/350, D-Line, Pro-D, Megasoft), with translucent grades in the Champion family. This affects `DE.predict({plastic})` only; the Dye lab UI still offers Star, Champion, Glow.
Sources checked with no quantitative yield: reddit mirror listing (18 posts, no stated hex), UDisc and Prodigy guides, Rit official PDF (same formulas), Jaffer AATCC dye names (no spectra), YouTube search listings (titles only). Blocked: web.archive.org, ritdye.com pages. Not parsed: Dianix XF2 and Bemacron SEL/SEB cards (flat swatch PDFs not yet extracted).
Disc-tool metrics are unchanged by this update: films 0.37, anchors 6.09, UV365 8/8, direction 18/18.

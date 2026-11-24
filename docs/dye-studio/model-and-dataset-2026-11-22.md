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

## Update 6: physics experiments on the dyed Champion rim (all rejected, engine unchanged)
Baseline (orange rim 13.6, green rim 9.6, anchors mean 6.09). The rim residual: observed Blaze Orange rim #57090D (G 9) vs model #6F2D07 (G 45). Fluorescence adds about 13 R to the rim.
- Rim transmission weight w (0.3 to 1) and rim darkening (0.12 to 0.3): orange rim improves to 5.6 to 8, green rim worsens to 14 to 19 (green needs brighter, orange darker). Net no gain.
- Extra absorption band on the orange dye at 510 to 570 nm: kills rim green (rim 7.5 with a 540 nm band, amplitude 10) but breaks the measured film color (film dE 0.0 to over 3). Spectrum alone cannot satisfy film and rim; the conflict is in the process model, not the dye.
- Path-dependent fluorescence attenuation (exponent 1 to 4) and rim fluorescence weight 0.3 to 1: anchors 6.09 to 7.2 to 12.4. Worse.
- Diffusion-skin saturation of dye path (1-exp(-path/d), d 0.25 to 1000 mm-units, kT and gT rescaled): 6.05 to 6.20 vs 6.09. No gain, not shipped.
Metrics unchanged: films 0.37, anchors 6.09, undyed rim median 7.35, UV 8/8, direction 18/18.
Literature spectral library: a search for quantitative C.I. disperse dye lambda-max tables returned nothing readable; research/dataset/../physics/spectral_library.json holds clearly flagged unverified priors only. Needs: measured photos of the same dyes on white plastic (issue 62) to separate spectrum from process.
## Update 6: wider real-world harvest attempt (data agent)
Added `research/dataset/textile_rows.json` (8 rows): open-access disperse-dye results on polypropylene (scCO2 vs water, K/S 4.55 at 1% to 7.22 plateau at 4% owf; K/S 6.74 vs 4.00 at 3%) and polyester (two yellow disperse dyes at 100 and 130 C, 2% shade, Lab and K/S; K/S 12.2 to 17.6 and 9.0 to 16.7 with temperature).
Findings: PP uptake saturates by about 4% owf (about 1.6x K/S over a 4x range, exponent about 0.35, flatter than the 0.66 engine curve and the 0.75 wool ramps; a single dye, not enough to refit). Higher temperature raises K/S 1.4 to 1.9x on polyester, qualitatively consistent with the hot-bath disc practice. No engine change; one dye/one paper cannot validate a per-plastic N_sat.
Rejected: refitting N_sat to the PP plateau (single orange dye, scCO2 medium, not a water bath). Not usable: PMC tables behind reCAPTCHA (ijerph 17 01377), Figure-only values.
Searched with no row yield (links returned, pages are text discussion with no stated color values or unreadable): dgcoursereview noobie-dye thread pages, idye-poly rit-replacement, acid-dye tutorial, non-white plastics, UDisc dye blog, reddit mirror.
Blocked/unavailable: Dianix XF2 and Bemacron SEL/SEB card PDFs are not in any persistent location (the original download lived in ephemeral scratch and is gone), so they could not be parsed this pass; ProSperse, Dharma, Tulip, alcohol-ink and neon charts were not reached.
Metrics unchanged: films 0.37, anchors 6.09, rim median 7.35, UV 8/8, direction 18/18.

## Update 7 (2026-11-23): joint refit by the dye-tool owner
Changes (all estimates tagged; replace when controlled photos arrive):
- Star scatter thickness Sx 1.6 to 1.0 (ESTIMATE: dyed skin over opaque substrate scatters weakly; Onyx film reached 0.8 dE2000 only below Sx 1.0). LAM (cross-bath competition) 0.4 to 0.2 so dark dye still overpowers light dye (forum rule); sweep tolerance .03 to .06.
- Swatch-to-film map for non-measured dyes learned from the 6 measured pairs: L* x0.92, chroma x0.91 to 0.97, hue -4 deg (-8 for light yellow-greens). Replaces the L* x0.9 only rule.
- Removed the hard cap on absorption bands of fluorescent dyes (replaced by a soft self-absorption penalty).
- Champion process fit now frees Sx, rim and shoulder zone weights and rim darkening jointly with kS, kT, pw, gT.
- UV365 emission centre/width/blue-band/yield fitted per dye to the vendor-stated UV colour, bounded to +-42 nm of the literature hue-class prior (scripts/fit_uv.mjs); uvem2 second band supported. Pink hue windows widened to 315 (vendor hex hue 320).
Metrics (dE2000, before to after): films 0.37 to 0.11; Champion anchors 6.09 to 3.08 (p95 13.6 to 5.3); coverage mean 2.99 to 3.01, p95 6.31 to 6.05; UV365 stated-colour mean dE 20.4 (priors) to 2.4; hue classes 8/8; direction 18/18; 64 tests.
Not retained: tying the base-transmission path exponent to the dye path exponent (undyed rim median 7.35 to 9.15); dropping Saunderson on the translucent term (anchors 5.6). Blaze Orange rim residual remains about 12 here (qb 0.52 evidence from 330 photos conflicts with the anchor) - hbnf-disc-dye-preview PR 3 resolves it (3.3) with a different transmission structure.

## Update 8 (2026-11-23): unified engine (one engine for Dye lab and hbnf-disc-dye-preview)
Changes (all estimates tagged prov/est; replace with controlled photos):
- Engine now the hbnf-disc-dye-preview v11 core: fluorescence backing, illuminants (D65, A, LED-B3), UV365 scene, foil substrate, separate baths. Champion transmission exponent tied to dye path (qb tie).
- Evidence for the tie: owner undyed Champion photos (3 discs, white paper) give a best joint rim exponent 1.60 (model (1.86)^0.75 = 1.59) and shoulder 1.20 (model 1.21), rim darkening 0.86 (model 0.88). The 330 retail photos (uncontrolled exposure) prefer 1.4 and are now informational only; the old test using them was replaced by the owner-photo test.
- Champion dye gain gT ramps in with dye load (g0 0.3) so undyed plastic is exact; owner undyed photos are in the Champion fit objective; fit bounds stop degenerate solutions (kS up to 66157 seen unbounded).
- Fluorescent dyes: daylight emission band = UV emission band (one emission spectrum per dye, Kasha rule), centre from literature hue-class priors then UV fit. Previously pink/purple dyes emitted at 430 nm in daylight (yield 0.06) and Flo Red at 690 nm. Emission is re-absorbed by overlying dye (outf 0.7).
- Swatch-to-film map re-derived: L* x0.90, chroma x1.0, hue -3 deg (+6 for neon yellow-greens). Leave-one-out dE2000 over the 6 measured dyes: previous map 3.5, new 2.8 (scripts/loo_film_map.mjs). The 2.8 is added in quadrature per estimated dye to the uncertainty spread.
- LAM 0.2, Star Sx 0.4.
Metrics (dE2000, previous production engine -> now): films 0.37 -> 0.05; Champion anchors 6.09 -> 3.74; Blaze Orange rim ~12-13.6 -> 2.4; Green rim 9.6 -> 5.4; owner undyed Champion shoulder/rim 8.2 -> 5.7; coverage mean 2.99 -> 2.9; UV365 stated colour mean dE 20.4 -> about 3; hue classes 8/8; direction 18/18; 64 tests.
Star rim check (1232 retail Star-family photos): median rim darkening L* -2.4 (Star plastic -1.2); engine 0.08 retained.
- Excitation is limited to wavelengths at or below the emission band (no anti-Stokes pumping); incandescent/LED fluorescence tests pass.

## Update 9 (2026-11-23): render fidelity, translucent look, UV Blast Green, sources and guesses
Render (not engine) changes; engine and all metrics unchanged (64 tests pass).
- UV Blast Green and black depiction bug: the renderer added a constant +0.012 linear ambient term to every channel after shading. Engine colours are photo-derived diffuse targets (film target UV Blast Green #7EE600), so the lift double counted gloss: green rendered #82E81D (blue 0 -> 29, desaturated) and Onyx #080808 rendered about #1D1D1D (dE about 10). Removed; shading renormalised (0.93+0.07*dif). Disc pixels now match the predicted hex (Onyx 10/255, green blue channel 0 plus mild shading). Specular highlight remains the only added reflection.
- Champion/translucent look (preview and Dye lab): light entering the thick rim scatters through the plastic and leaves tinted by the dyed transmission colour (engine scene "backlit", already fitted), strongest on the side facing away from the lamp (sub-surface term 0.17*smoothstep(.4,.97,r)). Preview adds a Backlit light mode for Champion-family plastics (light-box view: transmitted colour only, thickness map gives plate lighter, rim deeper).
- Ice multi-colour bleed (preview): an Ice layer with several dyes assigns dyes to jittered Voronoi melt cells (warped by fbm) and blends neighbouring cells across the F2-F1 gap (Bleed slider); overlapping dyes then compete in one bath in the engine (Langmuir), so overlaps mix by the same law as blends.
Sources searched this pass (no new quantitative colour data found): UDisc dye guide (qualitative: premium gummy plastics take dye best); dgcoursereview Dye-a-Day thread III post 4227270 and acid-dye tutorial post 3883491 (photos, uncontrolled); Pro Chemical and Dye neon kit retailer pages (marketing swatches); HunterLab, Plastics Technology (ptonline), Intertek and SpecialChem pages on transparent-plastic colour measurement (method only: transmission measured at path length, no disc data). No public spectral or Lab measurements of Innova Champion/Star plastic or of UV Blast dyes exist beyond the 40 sources and 890 mixing rows already in research/dataset.
Guesses (all tagged estimate): sub-surface strength 0.17 and its lamp-side weighting (visual match to the owner Champion photos, not fitted); backlit thickness map reuses the fitted optical path; ice Voronoi cell size (scale*0.5) and bleed width are artistic, not calibrated; UV Blast Green daylight colour stays the owner-photo film target (#7EE600 Star, Champion anchors plate #8FC316 / shoulder #69B820 / rim #3BAF27 on the teal base). Retail Champion on the default whitish base shows #80FF00-class green, brighter than the teal-base anchors; that gap is base colour, not a model error.
Not ported to the Dye lab: Swirl, Bands, Splatter, Ice, Stencil-shape and Foil layers. Lab layers are physical specs exported in millimetres (stripe, box, photo stencil); freeform noise patterns cannot be issued as a reproducible dyeing instruction. Lab got the render fixes and translucent look only.

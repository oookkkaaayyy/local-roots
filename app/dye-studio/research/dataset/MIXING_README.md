# Quantitative dye-mixing dataset (harvest 2026-11-22)

File: `mixing.json` (890 rows). Fields: source_url, brand, substrate, dyes[{name, share_or_percent (+parts / liquid_tsp)}], conc_or_depth, conc_pct (ramps), ramp_id, time_min, temp_c, result_srgb, result_lab (D65 CIELAB), hex_if_stated, kind, notes, confidence. Only derived numbers stored; source images/PDFs kept in scratch (outside git).

## Counts
By kind: {'single_ramp': 95, 'binary_mix': 475, 'ternary_mix': 306, 'single_point': 13, 'named_formula': 1}
By brand: {'Rit All-Purpose': 529, 'Rit DyeMore': 194, 'Jacquard Procion MX': 77, 'Jacquard Acid Dye': 12, 'Jacquard Acid Dye (labelled Dharma)': 66, 'CHT Bemacron SMART EE (disperse)': 12}
Single-dye ramp series: 25 (66 rows Osborn six-level wool ramps = 11 series; 12 rows CHT two-level polyester = 6 series; remainder are Rit single-dye formulas that happen to span 2+ volumes, a coarse proxy ramp).
Binary+ternary mixes: 781.

## Sources and quality
1. **Rit / Colorit Formula Guide** (Nakoma, 2018; hosted at oxlades.com.au). 723 formulas with named Rit liquid dyes in cups/Tbs/tsp per 1 lb fabric in 3 gal; swatches are flat digital fills (sd 0), so colour is exact but is a rendered depiction, not a measurement. Standard: All-Purpose on white cotton 140F/30 min; DyeMore on white polyester 200F/30 min (DyeMore is the disperse/disc-relevant one: 194 rows). Cup = 8 fl oz = 48 tsp assumed for "bottle" and cup.
2. **Jacquard Procion MX Color Formula Guide** (65 formulas, parts + tsp, swatch photos of batch-dyed textured cotton, poppler CMYK to sRGB, no white ref) and **Procion Color Wheel chart complex ratios** (12, flat swatches).
3. **Jacquard acid dye complex ratios** (12, flat swatches, page 4 of the acid dye instruction PDF).
4. **Osborn Fiber "Dye School Part 1: DOS testing"** (blog photos): 11 Jacquard acid dyes (Sun Yellow, Golden Yellow, Cherry Red, Fire Red, Hot Fuchsia, Pink, Violet, Brilliant Blue, Turquoise, Navy, Jet Black) on 1 g Corriedale top at 0.25, 0.5, 1, 1.5, 2, 3 percent owf. Photos through plastic sleeve, hand-placed sample boxes, white-balanced on paper; real saturation curves but noisy (rows where lightness rises with concentration are flagged 7). Time/temp not stated.
5. **CHT Bemacron SMART EE shade card** (disperse dyes on polyester): 6 dyes, two depths each. Percent-to-swatch mapping assumed (larger percent = darker swatch). Bemacron SEL/SEB card downloaded but not parsed (parser found no clean columns).

## Caveats for modelling
- Rit/Procion recipe rows give hue/chroma of mixtures, not absorbance; use them as mixing validation targets (dE) not spectra.
- Ramp rows give L* and chroma vs concentration: fit saturation (e.g. L = L_inf + (L0-L_inf)exp(-k c) or KM K/S = a c). Osborn is acid dye on wool, not plastics; CHT is the only polyester disperse ramp and has just two points.
- Procion swatches are tie-dye style textured (sd 16-44 across channels), treat as low precision.

## Not harvested / blocked
- ritdye.com Color-Formula-Guide PDFs: 404 on direct download; ritdye.com formula pages not fetched (guide above covers the same range).
- tienchiu.com (dye cubes, concentration series): Cloudflare challenge on WebFetch; not circumvented.
- Dharma acid dye instruction PDF, Lanaset chart, Interdye brochure, Jacquard ProcionMX_ColorInfo: 404/HTML error pages.
- Not reached: ProChem/ProSperse, Dharma polyester charts, iDye/iDye Poly (only text instructions, no swatches), sublimation, Tulip, Wilton/food dye, alcohol ink/Pylam/Sharpie, fluorescent/neon charts, Greener Shades. DyStar Dianix XF2 card (one 1/1 depth swatch per dye with percent) downloaded but not yet sampled.

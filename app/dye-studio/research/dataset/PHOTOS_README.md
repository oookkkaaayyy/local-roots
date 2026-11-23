# Photo-sampled disc color dataset

Data: photos.json (2532 rows). Analysis use only: numbers derived from images; no images stored in any repo or redistributed. Source images were downloaded to a scratch dir outside git.

## Counts
- Total rows 2532; 1514 distinct plastic x stated-color combos.
- kind: base_stock 2414, base_blank_dyeable (white, listed as dyeable/blank) 21, dyed_factory 97.
- confidence: high 1011, medium 1289, low 232.
- Plastics covered (rows): ESP 315, Z Line 149, Neutron 134, Star 118, Z Swirl 115, Plasma 87, Champion 84, Proton 83, Titanium 82, Big Z 66, Fission 65, Halo Star 64, K1 62, Electron 61, Cosmic Neutron 58, Ethos 57, Jawbreaker 55+47 (Z FLX), Opto 54, Lucid 51, GStar 50, Fuzion 47, DX 44, ESP FLX 43, Prime Burst 43, Pro 40, VIP 35, Tournament 30, Proto Glow Champion 25, Halo Champion 23, Eclipse 23+20, Champion Glow 18, Glow 13, Z Glo 13, DX Glow 4, ESP Glo 1. No Opus or Neo rows (not present in the catalog filter; not searched elsewhere).

## Method
1. Source: public Shopify catalog JSON of discrepublic.ca (retail product photos, white/grey studio background, disc top-down, one disc per frame). Variant title gives "Color / Plastic / weight", variant featured image gives the photo. Up to 2 products per plastic x color x dyed-flag.
2. Image resized to 400 px. Background = median of border pixels. If background is bright (L>80) and near neutral (chroma<12), per-channel gains set background to neutral (gray-world on background); gains recorded in lighting_notes. Exposure is NOT normalised (background brightness varies 165-222), so L is only approximate.
3. Disc found by background difference mask; center and radius from mask extent. Sample region: flight-plate annulus r = 0.60-0.80 R (srgb, lab), and rim annulus r = 0.92-0.985 R (rim_srgb, rim_lab). Pixels with min channel >= 243 (specular, white print) or L<12 (black print) removed; median of pixels in the 25th-75th L percentile. Lab is D65 sRGB.
4. Confidence: counts mask ok, WB applied, bg mean >= 190, non-swirl; 4 high, 3 medium, else low.

## Caveats
- Dyed-result rows are FACTORY dyes (Innova I-Dye, Discraft Fly Dye, DyeMax, etc.). Recipe and method are unknown (marked assumed). There are NO hobbyist recipe rows (dye brand + concentration + time) and NO true before/after pairs. Reddit and dgcoursereview were not readable via allowed tools; udisc and discountdiscgolf tutorial pages have images with no stated plastic, base color or dye. This part of the mission is not met; sources that state recipes (dyer portfolios, Etsy, Instagram) remain to be mined with Chrome tools.
- Color labels are retailer variant names; the variant-to-image mapping is trusted, not verified. Some rows are visibly inconsistent with the label (e.g. a "Pink" Tournament sampled grey-mauve); no automatic label check. Use medians per plastic x color and reject outliers.
- Swirl, burst, Halo, Jawbreaker, Nebula and Cosmic plastics are multicolor; the median is not a single base color (flagged by sd_ab or in notes).
- White and clear/translucent discs on a white background: mask can fail (low confidence; geometry assumed). Translucent plastic color depends on backlight/background, so values are not intrinsic to the plastic.
- Stock photos have unknown white balance beyond background neutralisation; several have bluish or warm backgrounds (not corrected, flagged).
- Glow plastics were photographed in daylight (not charged); no glow-emission data.
- Single retailer: one photographer/lighting rig, so systematic bias is shared across rows (useful for relative comparison, less for absolute accuracy).

## Update (second pass)
- Added Neo (Discmania): 260 rows (Neo 163, Evolution Neo 50, Soft Neo 22, Neo Lumen glow 20, Neo Horizon 5) from discmania.net, discrepublic.ca and rareairdiscs.com. Total rows now 2792. Opus: no Opus-plastic products found in the catalogs checked (latitude64.com, discrepublic.ca, rareairdiscs.com), so zero Opus rows.
- photos_clean.json: rows (all, with flags), medians (829 plastic x stated-color groups; 17 with 3+ usable rows). Exclusions from medians: low confidence, swirl/multicolor, flagged rows, and outliers (dE76 > max(12, 2.5 x median distance)). Flags: label_mismatch (hue more than 50 deg from the median hue of that color name, or achromatic sample for a chromatic label) 106, black_label_light_sample 25, white_label_chromatic_sample 10, outlier_vs_group_median 9. Most groups have only 1-2 rows, so medians are mostly single samples.
- Hobbyist recipe rows: 0. Etsy dyer shops render in Chrome (e.g. PepperDyeWorks) but listings state only plastic, weight and "hand-dyed", with multicolor patterns and no dye brand, base color or time, and photos on non-standard backgrounds. True before/after pairs: 0. Not met.

# Owner Champion photos on white background (2026-11-21)
Three undyed Champion discs (Innova Daedalus orange, Boss red, Air Force glow), DNG, photographed on white paper. Normalized so the paper background median is white per channel (exposure was low, so absolute lightness is approximate; hue and plate-to-rim relationships are the usable part).

| disc | plate | shoulder | rim |
|---|---|---|---|
| orange | #FF971A | #FC8528 | #FF722F |
| red | #E18172 | #EA7C6C | #BE4043 |
| glow (daylight) | #FCF9D4 | #F0E2C1 | #E6D9AF |

Findings
- Rim is more saturated and hue-shifted toward the long wavelengths (orange 33 deg to 18 deg, red pinkish to deep red) than the plate. Thicker path gives a deeper, redder color, as the engine's path model assumes.
- Glow plastic is nearly neutral cream; the rim only darkens slightly.
- These are base plastics, not dyes, so they do not calibrate the dye absorbance bands. They do not contradict the zone model.
- Test: adding a path-dependent exponent on the base transmission (T0^(1+b*path^pw)) made the 6 HBNF anchors worse for every b tried (mean 6.15 at b=0 to 10.6 at b=3), so it was rejected. Engine unchanged.
- Open: Champion rim residuals on dyed discs (UV Blast Green rim 6 to 10, Blaze Orange rim 13 to 14) still need photos of the same dyes on a known plastic.

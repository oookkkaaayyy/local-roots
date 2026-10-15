# Dye Studio accuracy audit (2026-10-14)

Result: no new public photograph meets the controls necessary to fit numerical dye colors, two-layer overlaps, or UV/glow coefficients. Maintain the current predictor unchanged until independent physical color outcomes are available.

Earlier evidence incorrectly identified the pictured Dyers Guild Personal Dye Library chart as a physically dyed disc. The photograph does not establish any particular disc substrate. This is an unqualified color reference, not numeric ground truth.

Useful real-disc reports include [a white Star Dart with ProChem Pinkish Red in a 24-hour clear-glue bed](https://www.reddit.com/r/discdyeing/comments/sn1bow), and [white Star F2 Floetrol-bed experiments](https://www.reddit.com/r/discdyeing/comments/v2inel). Neither provides calibrated color results for direct-acetone block painting. A [white/yellow Champion qualitative comparison](https://www.reddit.com/r/discdyeing/comments/1cb2xrp) suggests blue can appear greener on yellow plastic; the exact mixture and physical controls are unverified. No numeric model changes are justified.

For future cases, require original physical-disc images, known original substrate and color, identified dye shade(s) and carrier, concentrations, time/heat, pre- and post-dye color references with controlled light, isolated A/B/A+B for overlaps, and an independent holdout. Count one author's reused photo/multiple crop as one correlated physical case.

The next defensible improvement is to preserve the camera-estimated color of an undyed photographed blank in its daylight preview, avoiding a second speculative translucent-plastic tint. This narrow fix is implemented on the associated branch and preserves dyed-region, UV/glow and backlit model outputs.


Verification: 33/33 integration and 10/10 optical model tests passed on candidate source in isolated JS. No public photographs were promoted into numerical calibration. Original source claims and strict admission controls remain documented above. Actual native build and production still require their existing checks.

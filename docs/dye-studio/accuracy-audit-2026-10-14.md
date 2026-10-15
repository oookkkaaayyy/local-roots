# Dye Studio accuracy audit (2026-10-14)

Result: no new public photograph meets the controls necessary to fit numerical dye colors, two-layer overlaps, or UV/glow coefficients. Maintain the current predictor unchanged until independent physical color outcomes are available.

Source correction (2026-10-14): the previously reviewed crop did not reveal the disc edge, but the original [uncropped Personal Dye Library photograph](https://dyersguild.co/wp-content/uploads/2025/01/2025PersonalDyeLibrary_1.jpg) visibly shows a white circular disc. The earlier statement suggesting it might not be a disc was too strong. The plastic family, application carrier, shade doses, meaning of the timed columns and calibrated imaging remain unverified. Therefore the swatches are potential *within-disc qualitative comparisons*, NOT absolute RGB dye outcomes or a verified Innova-plastic model target.

Useful real-disc reports include [a white Star Dart with ProChem Pinkish Red in a 24-hour clear-glue bed](https://www.reddit.com/r/discdyeing/comments/sn1bow), and [white Star F2 Floetrol-bed experiments](https://www.reddit.com/r/discdyeing/comments/v2inel). Neither provides calibrated color results for direct-acetone block painting. A [white/yellow Champion qualitative comparison](https://www.reddit.com/r/discdyeing/comments/1cb2xrp) suggests blue can appear greener on yellow plastic; the exact mixture and physical controls are unverified. No numeric model changes are justified.

For future cases, require original physical-disc images, known original substrate and color, identified dye shade(s) and carrier, concentrations, time/heat, pre- and post-dye color references with controlled light, isolated A/B/A+B for overlaps, and an independent holdout. Count one author's reused photo/multiple crop as one correlated physical case.

The next defensible improvement is to preserve the camera-estimated color of an undyed photographed blank in its daylight preview, avoiding a second speculative translucent-plastic tint. This narrow fix is implemented on the associated branch and preserves dyed-region, UV/glow and backlit model outputs.


Verification: 33/33 integration and 10/10 optical model tests passed on candidate source in isolated JS. No public photographs were promoted into numerical calibration. Original source claims and strict admission controls remain documented above. Actual native build and production still require their existing checks.


## Expert owner plastic identification (2026-10-14)
The disc-plastic-knowledgeable owner identifies Kateri's white disc from the full photograph as **Innova Star** and confirms all handwriting denotes **dye-color names**, not plastic type. This is an owner-expert visual assessment, **not** a statement from Kateri or independent manufacturing provenance. Maintain `exactPlastic: false` in the numerical training gate until independently confirmed; physical method, strength, time and colorimetry also remain unverified. Preserve the owner's practical expertise as a resource for source assessment.

## Recovered offline safeguard: passive opaque absorption ceiling (2026-10-14)

The previous incomplete/errored work left a local patch and a detailed private
owner Wraith/Tern physical-source metadata record. The Wraith/Tern owner photos were
recovered via existing private Google Drive records, not added to this repository:
the same-session photographs show a navy blue and pink direct-acetone application
on Proto Glow Champion against the owner's matched original light-yellow blank.
They provide **qualitative** support for the contrast and overlap, but dye names,
coats, and controlled colorimetry are missing. No physical numerical targets were fitted.

**Genuine prediction defect exposed:** On opaque black Innova Star/GStar,
the released predictor previously returned lightish nonfluorescent colors such
as `#0C1542` for iDye Poly Blue or `#450F1D` for Crimson from a `#000000`
starting substrate. A transparent, purely absorbing dye cannot add daylight
radiance absent from an unchanged substrate. [Scholarpedia color-mixture physics]
(https://www.scholarpedia.org/article/Color_mixture) describes subtractive
mixtures removing light (with known exceptions for scattering). Experienced
practitioners report the same limitation for dark discs:
https://www.reddit.com/r/discdyeing/comments/xy8v0z and
https://www.reddit.com/r/discdyeing/comments/1jvy7rf . **Fluorescent
colorants are exempt** because emission can brighten under suitable excitation.

Scoped correction applies channelwise ceilings to **nonfluorescent dye on opaque
plastic in daylight only**, using the untouched blank and identical simulated
rim shading. Existing optical dye tint/hue and strength logic remain otherwise
unchanged. Champion/translucent, UV365, charged glow, zero dye, and fluorescent
cases retain existing outputs. This is a physical plausibility safeguard, **not**
an empirical ΔE accuracy certification or source-image-based pigment calibration.
Future scattering/colorimetric source data can supersede this conservative
assumption if supported by actual measurements.


## Black-underlay overprint consistency (2026-10-14)
Original practitioner reports describe a correctly set black stencil remaining visually black through later nonfluorescent color application, e.g. https://www.reddit.com/r/discdyeing/comments/18h4tel and https://www.reddit.com/r/discdyeing/comments/1c1rmtj . Existing opaque preview could change ProChem Onyx already dyed black into blue when the next ordinary dye was applied because geometric interpolation adopted the second pigment's lighter swatch. A narrow passive black-underlay bound has been added for Star/GStar/Proto Glow Star; it does not change standalone dye responses, nonblack overlaps, fluorescent stacks, Champion translucent optics or UV/glow modes. This encodes a practitioner-backed qualitative invariant, not a measured two-color calibration. Real acetone solvent reworking/bleeding and fluorescence can invalidate a perfect-overprint approximation; numerical physical model accuracy remains open.

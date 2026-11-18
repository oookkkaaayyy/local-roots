# Branding unification audit (2026-11-18)

Internal working document. Not public.

## Measured state

| Surface | Canvas | Panel | Text | Accent | Heading font | Body font | Source |
|---|---|---|---|---|---|---|---|
| Local Roots app | #f7f0e4 (light) | #fff8ee | #2a211b | clay #a7623a, sage #8c956a | Georgia | Inter | app/src/styles.css `:root` |
| HBNF live pages | #292119 (dark) | #352b20 | #f4e9d6 | #b4c58f | Cabin 700 | Cabin 400 | worker /live inline CSS, hbnf-bone-ink-theme.css |
| LR theme-color | #3a2618 | | | | | | app/index.html |
| HBNF theme-color | #292119 | | | | | | worker /live |

## Findings

1. Two palettes share one hue family (brown and sage) but differ in polarity: LR light, HBNF dark.
2. Two type systems: Georgia and Inter (LR), Cabin (HBNF).
3. LR defines nine color variables in one place; HBNF pages define colors per page, with a shared theme file only partly applied.
4. Focus rings and 44 px targets exist in HBNF only through the pilot in PR #192; LR has accessibility.css.
5. D&U surfaces (du-admin.css, DyedUnattachedPage) reuse the LR tokens.

## Plan (no public copy, labels only)

1. Keep polarity per product (LR light, HBNF dark). Unify through shared semantic token names: canvas, panel, ink, muted, accent, line, focus.
2. Map LR variables to the token names without changing values: root to ink-strong, cream to panel, clay to accent, sage to ok, line to line.
3. Map the HBNF values in PR #192 to the same names.
4. Adopt one body font per product only after checking font loading cost; do not change fonts in the token step.
5. Add a token check script that fails when a page uses a hex color outside the token file.

## D&U color prediction review

Predictions are recorded against observed color in `du_dye_calibration_samples` (predicted_rgb, observed_rgb, delta E76 in `du_calibration_export`). No predictor change is justified until observed rows exist. Direction-of-shift cases are in docs/dye-studio/direction-of-shift-widened-2026-11-18.md on PR #214.

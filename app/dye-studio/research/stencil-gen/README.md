# Generative stencil trials (ChatGPT image model, 2026-11-19)

Reference style images: gallery pairs (s0, s4 = finished stencils). Photos cropped from gallery-v2 sprite rows.
Compile gate: `compile-check.mjs` (feed 0-255 luminance; 0-1 floats pass trivially and are invalid).

Prompt base (v1, bold, first attempt): pure black ink on pure white vinyl stencil portrait, head and shoulders, background removed, flat two-tone, bold clean shapes, deliberate eyes/nose/mouth/fur strokes, face focal, Cricut cuttable. Result: good but cartoonish and symmetrical on straight-on, chest-heavy framings.

v2 (fine hatching, "high-contrast ink portrait"): too etched, compile FAIL. Do not use.

v3/d (best so far): v1 plus: crop tight on head with little neck and no wide chest; keep the photo's real head angle and depth (cheek planes, near and far muzzle side, overlapping ears), do not flatten to symmetrical front view; natural eye size; no fine hatching or stippling.

e: d plus min detail 1/100 of width and no large solid black blobs. Cat failed compile; do not use.

f: d plus line-weight hierarchy (heavy outer contour, medium features, thin tapered fur strokes), black only where the photo is dark or on real features, no blob marks. Good on light coats, over-detailed and compile FAIL on a dark poodle.

Eye rule: if an eye is squinted or half closed in the photo, draw it naturally open, keeping real shape, color pattern and gaze.

Conclusion: no single prompt fits every coat. Generate 2-3 style variants per request, gate with the compiler, rank by fidelity change and island count.

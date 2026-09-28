# HBNF Foundation V1 — Renderer Evidence Review

This document separates WLED-derived behavior from HBNF-specific adaptation.
No production firmware uses this yet.

## Exact source base

WLED 16.0.1 commit:
29b389df1c1aaec6ff53aea742d17063b985906c

Primary source: wled00/FX.cpp
Audio source: usermods/audioreactive/audio_reactive.cpp

## Proven WLED primitives worth reusing

### 2D GEQ — FX_MODE_2DGEQ (139)

Source behavior:
- Requires a 2D matrix.
- Reads fftResult directly from AudioReactive.
- Maps matrix columns to selected FFT bands.
- Maps each band magnitude directly to bar height.
- Uses palette position for color.
- Holds a simple previous peak height and decays it explicitly.

Why it is useful:
- Cause/effect is obvious: frequency energy -> visible height.
- Low/mid/high separation is visually legible.
- Minimal hidden state.

Do not blindly copy:
- WLED's effect-specific slider semantics.
- Its independent peak-height state as a global cart control.

HBNF adaptation:
- Use its direct FFT-to-geometry principle for a Spectrum renderer family.
- Matrix and Companion consume the same band values.
- Motion remains phase/time rate, not repurposed as fade.

### Funky Plank — FX_MODE_2DFUNKYPLANK (160)

Source behavior:
- Requires a 2D matrix.
- Reads fftResult directly.
- Each band supplies hue and brightness.
- Writes a new row and scrolls previous rows through the matrix.
- Speed controls row advance timing.

Why it is useful:
- It creates a music-history trail without long-term adaptive normalization.
- Rhythm and timbre remain visibly connected to recent audio.
- The visual memory is explicit pixel history, not an invisible signal baseline.

Do not blindly copy:
- Hue = raw FFT magnitude is not a stable cart palette language.
- Number-of-bands slider is effect-specific.

HBNF adaptation:
- Reuse the explicit scrolling-history idea.
- Color comes from scene palette + band identity; magnitude controls intensity.
- Companion uses the same newest audio row as a traveling 22-pixel phase/trail.

### Ripple Peak — FX_MODE_RIPPLEPEAK (148)

Source behavior:
- Uses AudioReactive samplePeak.
- Uses FFT_MajorPeak to select ripple color.
- On a peak, starts a ripple and expands it over explicit steps.
- Old pixels fade.

Why it is useful:
- Strong musical transients generate discrete, comprehensible events.
- Peak event lifetime is explicit.

Do not blindly copy:
- Random ripple position for every event.
- Effect-specific max-volume/bin controls.

HBNF adaptation:
- Use WLED samplePeak as an event lane, not our old novelty detector.
- Peak event origin/direction derives from canonical VisualState so Matrix and Companion react together.
- Companion receives the same peak event timestamp/phase.

### 2D Swirl

Source behavior:
- Uses WLED volumeSmth and volumeRaw.
- Uses beatsin motion to place multiple moving points.
- Uses palette colors and explicit blur.
- Audio controls point brightness/color phase.

Why it is useful:
- Established FastLED/WLED moving-point + trail technique.
- Organic motion without random kernel switching.

Do not blindly copy:
- Six separately timed points with unrelated divisors can become visually busy.
- Raw volume scaling can saturate.

HBNF adaptation:
- Use the moving-point/trail primitive for a Flow family.
- Use one canonical phase and direction with bounded offsets.
- Companion uses the same phase and palette, mapped around its 5/6/5/6 topology.

### Freqwave / Freqmatrix / Rocktaves

Source behavior:
- Use FFT_MajorPeak and magnitude/volume.
- Dominant frequency maps to hue/color.
- Motion is explicit pixel shifting or beatsin placement.

Why they are useful:
- Pitch/timbre can affect color without inventing a second spectral analyzer.

HBNF adaptation:
- Dominant frequency may influence palette position in some scenes.
- It must not completely replace the scene palette or cause unrelated colors.

## Rejected old HBNF design choices

### 28-kernel randomized scene generator

The old generator randomized effect kernel, family, palette, transform, secondary warp, phase salt, speed, profile, style and amount.

That maximized statistical non-repeat but weakened coherent visual identity.

V1 rule:
- 3–4 renderer families maximum during commissioning.
- Scene identity remains stable.
- Variation changes explicit parameters inside a family, not the renderer family itself.

### Second adaptive audio-normalization layer

The old HBNF bridge maintained short/long moving baselines, novelty, transient budget, band focus and a shared lane budget on top of WLED AudioReactive.

V1 rule:
- consume WLED's already-processed audio data.
- any additional envelope is fixed-time-constant and explicit.
- no slowly adapting reference level that changes the meaning of the same sound.

### Framebuffer sampling for AUX

Rejected.

V1 rule:
- companion pixels are directly rendered from the same AudioFrame + VisualState.
- they are not averaged/sampled from the Matrix result.

## Initial commissioning renderer set

Not yet accepted for production; this is the evidence-backed shortlist.

1. Spectrum
   - derived from WLED 2D GEQ direct FFT geometry.
   - strongest diagnostic scene for audio correctness.

2. Trail
   - derived from Funky Plank's explicit scrolling audio history.
   - strong rhythm/timbre continuity.

3. Flow
   - derived from WLED/FastLED Swirl moving-point + blur/trail technique.
   - organic, less literal music visualization.

4. Impact
   - derived from Ripple Peak's samplePeak event/ripple behavior.
   - highly obvious transient response.

These four provide distinct visual languages without random kernel replacement.

## Control invariants across all families

- Matrix Brightness: only Matrix final output scale.
- Underglow Brightness: only Companion final output scale.
- Motion: only time/phase velocity.
- Audio Response: only audio-derived modulation depth.
- Variation: only bounded spatial/palette variation inside current family.
- Scene: chooses renderer family.
- Mic Gain/Squelch: native WLED AudioReactive calibration only.

No control silently changes another control's quantity.

## Validation plan

For each family:
- feed identical recorded/synthetic AudioFrame sequence twice; frames must match exactly.
- low-only, mid-only, high-only and peak inputs must have documented distinct output signatures.
- sweep Audio Response 0..100; output delta from no-audio baseline must be monotonic.
- sweep Motion 0..100; phase advance per second must be monotonic.
- set AUX brightness 0; all 22 companion RGB values must be exactly 0 before DDP.
- assert same frame sequence/timestamp drives Matrix and Companion.

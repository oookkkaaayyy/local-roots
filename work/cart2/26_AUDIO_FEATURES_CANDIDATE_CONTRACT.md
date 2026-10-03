# HBNF Cart 2.0 — AudioFeatures Candidate Contract

STATUS: CANDIDATE FOR INTERFACE FREEZE. NOT APPROVED. SOURCE-INDEPENDENT CONTRACT ONLY.

## Goal

Expose one small, stable, local AudioFeatures layer that every approved Vibe can interpret artistically without:
- inventing a second realtime audio architecture;
- making each renderer re-derive its own inconsistent audio semantics;
- requiring internet/cloud metadata;
- coupling Vibes to raw microphone configuration;
- adding another FFT unless the qualified-foundation source audit proves the existing data is insufficient.

## Evidence boundary

Official WLED AudioReactive is part of current official WLED releases and supports local sound processing, Squelch, Gain and AGC. Its AudioReactive palettes are recalculated every frame from FFT-derived data; the Spectrum palette uses all 16 GEQ channels, and Ratio uses broad sub-bass / mid / upper-mid information.

This proves that a sufficiently rich local audio representation exists in WLED's AudioReactive system in general. It does NOT prove the exact field names, buffers, update cadence, normalization, or source locations present in the eventual qualified HBNF foundation.

Official evidence:
- https://kno.wled.ge/advanced/audio-reactive/
- https://kno.wled.ge/interfaces/json-api/

## Candidate semantic features

The interface should expose artistic semantics rather than raw FFT-bin ownership.

Candidate fields:

### Overall energy
- `energy_short`
- `energy_medium`
- `energy_slow`

Purpose:
Give Vibes separate transient, phrase-scale and atmosphere-scale response without each renderer inventing its own smoothing.

### Low-frequency structure
- `low_pressure`
- `low_transient`

Purpose:
Separate sustained bass/body from a fast kick/sub impact.

### Mid-frequency body
- `mid_body`
- `mid_change`

Purpose:
Support vocals/instruments/body/morph behavior rather than treating all non-bass energy as brightness.

### High-frequency detail
- `high_detail`
- `high_transient`

Purpose:
Support percussion/spark/detail behavior without mapping treble directly to full-frame flashing.

### Spectrum shape / change
- `spectral_brightness`
- `spectral_change`

Purpose:
Describe where energy sits in the spectrum and whether the spectral balance is changing, without claiming genre recognition.

### Silence / confidence
- `activity`
- `silence_confidence`

Purpose:
Allow quiet music to remain visually alive while preventing microphone noise from creating fake musical activity.

## Candidate value contract

Unless source evidence strongly justifies a different representation, each feature should present a bounded normalized value suitable for artistic mapping.

Do NOT freeze yet:
- exact 0..1 or integer representation;
- FFT/GEQ bin indices;
- attack/release constants;
- smoothing windows;
- onset detector equations;
- spectral-flux equations;
- silence thresholds;
- update cadence.

Those are SOURCE/MEASUREMENT DEPENDENT and must be frozen only after the qualified-foundation source map and reference-audio replay.

## AGC / squelch relationship

Do not create a second competing automatic-gain system by default.

WLED AudioReactive already exposes Squelch, Gain and AGC modes intended to stabilize sound response. The candidate HBNF layer should derive its normalized features from the accepted existing audio stream after understanding where WLED's gain/noise-floor processing occurs.

Required behavior:
- ordinary music playback should not require constant sensitivity babysitting;
- silence/noise floor must not produce fake beats;
- a volume increase must not simply pin every feature at maximum;
- HBNF feature normalization must not fight or oscillate against WLED AGC.

If source/replay evidence later shows WLED AGC is unsuitable for this hardware/use case, change it only through a measured challenger, not assumption.

## Motion/manual authority

AudioFeatures provide musical evidence. They do not own global animation speed or erase owner intent.

Candidate rule:
- Motion remains an owner-level artistic control;
- audio may modulate movement/composition within the Vibe's allowed envelope;
- audio does not silently overwrite persistent owner Motion;
- AUTO may use longer-timescale AudioFeatures as evidence for Vibe selection/bias, with hysteresis.

## Vibe-specific interpretation

All committed Vibes consume the SAME AudioFeatures interface.

They must not produce the same response with different palettes.

Examples of intended interpretation:
- HEAVY: `low_transient` may drive structural compression/rebound; `high_detail` is restrained.
- COSMIC: `low_pressure` may alter depth/parallax; `high_detail` may create distant micro-activity.
- PSYCHEDELIC: `mid_change` may deform symmetry/topology; bass may stretch scale.
- GROOVE: `low_transient` may accelerate directional flow; mids may bend/travel.
- CHILL: slower energy features may breathe density/space; fast transients remain subdued.

These are candidate mappings, not frozen equations.

## AUX relationship

Current project architecture keeps Matrix as the realtime audio/visual authority and AUX as companion/follower.

Do not introduce a second independent AUX microphone/FFT/AudioFeatures implementation merely for Cart 2.0.

If AUX requires audio-correlated output, derive it from the accepted Matrix-render/DDP/follower architecture or another already-proven shared representation after source audit.

## Reference replay required before freeze

Use the shared acceptance corpus:
- sparse sub/kick-heavy;
- dense rock;
- vocal/mid-forward;
- electronic build/drop;
- quiet ambient;
- rapid high-frequency percussion;
- acoustic/high-dynamic-range;
- compressed loud master.

Synthetic:
- silence -> onset;
- isolated kick/sub impulse;
- sustained bass;
- low-mid sweep;
- mid swell;
- high-frequency transient burst;
- steady broadband;
- silence.

Capture for each:
- raw existing WLED/HBNF audio observables;
- candidate AudioFeatures;
- chosen normalization;
- frame/runtime cost;
- representative Vibe consequences.

## Challenger gates

The candidate interface fails if:
- two or more features are effectively redundant across the corpus;
- bass/mid/high separation collapses under ordinary music;
- volume changes dominate more than musical structure;
- quiet material becomes dead or noisy;
- feature extraction materially harms frame pacing;
- renderers need raw FFT internals anyway because semantic features omit essential information;
- every Vibe maps the features into essentially the same pulse/brightness behavior.

## Qualified-foundation source audit must resolve

Before interface freeze:
1. exact AudioReactive/WLED version and enabled usermod source in the qualified artifact;
2. exact existing audio buffers/variables available without duplicate FFT;
3. where Squelch/Gain/AGC are applied;
4. update cadence and thread/render ownership;
5. cost of deriving candidate features;
6. safe ownership/lifetime of the feature snapshot;
7. whether current release lineage already contains useful custom HBNF audio derivations;
8. whether any network/audio-sync code is active or irrelevant to Matrix-authoritative local capture.

## Freeze output

Only after source/replay evidence, freeze:
- exact field names/types/ranges;
- derivation equations;
- smoothing/attack/release constants;
- source locations/owners;
- performance budget;
- deterministic synthetic-trace fixtures.

Do not freeze implementation details from this source-independent document.

## Current conclusion

The source-independent direction is strong enough to avoid architecture churn:
- one local shared semantic AudioFeatures layer;
- reuse WLED AudioReactive information first;
- no duplicate FFT by default;
- no genre recognition;
- no realtime cloud dependency;
- Vibe-specific interpretation;
- Motion remains owner-authoritative;
- numeric details wait for the qualified foundation.

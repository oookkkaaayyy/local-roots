# HBNF Cart 2.0 — Vibe / Guest Language Candidate Spec

STATUS: CANDIDATE FOR SCOPE LOCK. NOT YET APPROVED.

## Problem being fixed
Course Flow / Field Mix / HBNF Signature / Quiet Cosmos are not sufficiently self-explanatory or perceptually distinct.

Guest-facing choices must describe an experience the user can anticipate.

## Candidate Vibes

### CHILL
Guest subtitle:
Smooth · spacious · low-key

Visual grammar:
- lower density
- large negative space
- fluid continuity
- slower palette movement
- gentle contrast

Audio grammar:
- sustained bass breathes space
- mids produce slow morph
- highs add sparse detail
- minimal transient punch

### GROOVE
Guest subtitle:
Rhythmic · flowing · beat-driven

Visual grammar:
- directional movement
- repeating-but-evolving flow motifs
- medium density
- stronger warm/cool contrast

Audio grammar:
- bass drives body/pulse
- mids drive travel/morph
- percussion accents direction/speed without flashing

### HEAVY
Guest subtitle:
Dark · powerful · bass-forward

Visual grammar:
- high contrast
- concentrated structures
- large black regions
- stronger compression/expansion

Audio grammar:
- bass creates structural pressure
- transient hits deform geometry
- highs restrained to preserve weight

### PSYCHEDELIC
Guest subtitle:
Kaleidoscopic · saturated · warped

Visual grammar:
- symmetry
- geometric deformation
- controlled saturation
- richer topology changes

Audio grammar:
- mids highly expressive
- bass stretches symmetry/scale
- highs disturb fine detail

### COSMIC
Guest subtitle:
Deep · atmospheric · spatial

Visual grammar:
- sparse field/particle structures
- depth/parallax cues
- slow drift
- large black regions

Audio grammar:
- bass changes depth
- mids curve trajectories
- highs create distant micro-activity

### AUTO
Guest subtitle:
Let the cart choose

Behavior:
- characterize energy, bass dominance, transient density, brightness/dynamics;
- select or bias Vibe behavior using long dwell/hysteresis;
- no internet requirement;
- no claim of genre recognition.

## Hard differentiation gate
For every pair of committed Vibes:
- unlabeled clips from the same reference tracks;
- same brightness/Motion baseline;
- viewers should identify a distinct motion/composition/audio-response grammar without relying on palette alone.

If a pair fails before scope lock, redesign it.
After scope lock, failure requires improving the committed Vibes, not silently removing one.

## Guest card behavior
Each card shows:
- Vibe name
- plain-language subtitle
- short animated preview if performance allows on iPad/phone
- no internal effect IDs

Guest can choose only permitted Vibes.
Owner retains deeper Motion/Audio/brightness controls.

## 2026-10-03 challenger refinement

### Differentiation must survive palette removal
Add a palette-normalized challenger pass:
- compare same-track clips with palette differences neutralized as much as practical (same palette or grayscale capture);
- ask whether motion, composition, density, topology and audio-response grammar still distinguish the Vibes.

If identity collapses when color is neutralized, the pair is not sufficiently differentiated.

### Cross-track identity
For each candidate Vibe:
- run at least three materially different reference tracks;
- the Vibe should remain recognizably itself across tracks while still visibly reacting differently to each track.

This prevents a Vibe from being a single animation that merely happens to look different when the music changes.

### Pairwise test matrix
Every committed pair must be challenged, not just adjacent-looking modes:
- CHILL vs GROOVE
- CHILL vs HEAVY
- CHILL vs PSYCHEDELIC
- CHILL vs COSMIC
- GROOVE vs HEAVY
- GROOVE vs PSYCHEDELIC
- GROOVE vs COSMIC
- HEAVY vs PSYCHEDELIC
- HEAVY vs COSMIC
- PSYCHEDELIC vs COSMIC

AUTO is evaluated differently: whether its chosen/bias behavior changes appropriately and avoids twitchy mode-hopping, not whether AUTO has a unique static visual grammar.

### Audio-causality replay
Use the same synthetic feature traces for every candidate Vibe:
- silence -> onset;
- isolated kick/sub impulse;
- sustained bass;
- mid-band swell;
- high-frequency transient burst;
- dense broadband passage.

Pass condition is not identical numerical response. The same event should produce a Vibe-specific visual consequence consistent with that Vibe's grammar.

The current WLED AudioReactive stack already derives local sound features from microphone/line input and supports realtime audio-reactive behavior; this supports exhausting the existing local signal path before considering a new realtime architecture.

Evidence:
- https://kno.wled.ge/advanced/audio-reactive/

### Within-Vibe variety
Differentiation may not be achieved by making each Vibe one repetitive signature loop.
Each committed Vibe must retain enough donor/parameter variation that:
- no obvious short loop dominates normal viewing;
- the Vibe grammar remains identifiable across variants;
- different tracks produce visibly different performances.

### AUTO anti-flapping
AUTO candidate behavior must include:
- long dwell/hysteresis;
- confidence/hold behavior around ambiguous transitions;
- no claim of genre recognition;
- manual Vibe selection immediately overrides AUTO when the owner/guest has authority to select.

Exact thresholds remain source/replay dependent and are not locked here.


# HBNF Cart 2.0 — Text / Moment Compositor Candidate Spec

STATUS: CANDIDATE FOR SCOPE LOCK. NOT YET APPROVED.

## Goal
Text must feel like part of the current animation system, not a separate cheap LED-sign mode.

## Challenger conclusion
Do NOT make a FastLED version upgrade or new TrueType dependency a prerequisite merely to obtain text.
Newer FastLED versions expose TrueType rendering and alpha-capable glyph bitmaps, and established FastLED matrix libraries support frame-based text overlays, but the accepted HBNF source/toolchain must first be audited.
First choice should be a small custom bitmap/mask renderer compatible with the accepted stack unless the source audit proves a newer existing renderer is already safely available.

## Rendering contract

### Layers
1. Base Vibe frame.
2. Optional contrast-management layer.
3. Glyph/moment mask.
4. Optional halo/detail layer.
5. Final brightness/current limiting.

### During readable hold
- glyph geometry is stable;
- no audio-driven glyph wobble;
- underlying Vibe may continue moving/reacting;
- audio may affect halo/background/detail only within bounded limits.

### Entry/exit
Vibe-aware:
- reveal through existing image;
- carve negative space;
- brighten scene inside glyph mask;
- particle/field convergence;
- dissolve back into scene.

No hard cut to generic black marquee unless explicitly required for emergency readability.

## Text classes

### CLASS A — HERO WORD
Examples:
ACE
WINNER
SKINS
GLOW

Target:
- full-screen visual moment;
- very high legibility;
- 1–2 lines max.

### CLASS B — NAME
Examples:
ANDREW
JASON
TEAM 4

Target:
- compact custom font;
- phrase paging if width exceeds safe measure.

### CLASS C — NUMBER / VALUE
Examples:
$187
25 FT
30 SEC
#12

Target:
- large numerals;
- timer/value gets priority over decorative detail.

### CLASS D — DIRECTIVE
Examples:
25 FT
STATION 4
READY
GO
REST

Target:
- designed for IRL Directive Engine;
- instant comprehension at several feet.

### CLASS E — SHORT ANNOUNCEMENT
Examples:
BACK 9
ACE POT
NEXT UP

Target:
- two-stage phrase paging preferred over tiny scroll.

### CLASS F — LONG FREE TEXT
Fallback behavior:
1. break into readable phrase pages;
2. hold each page;
3. smooth Vibe-aware transitions;
4. scroll only if phrase paging cannot communicate the content.

## Font strategy
Prepare at least:
- headline bitmap face optimized for 16px height;
- condensed uppercase face for names/directives;
- large numeral set.

Do not assume generic 5x7 is aesthetically sufficient.

## Semantic moment API candidate
VisualMoment:
- type
- primary_text
- secondary_text
- value
- duration
- urgency
- allow_audio_accent
- return_behavior

The compositor, not each feature, determines the Vibe-specific presentation.

## Acceptance
Text fails if:
- first-time viewer cannot read it quickly;
- it visibly looks like a cheap scrolling LED sign;
- it kills the underlying visual language;
- glyphs deform with audio;
- it requires a new fragile rendering stack solely for typography.

Human aesthetic acceptance required.

## 2026-10-03 challenger refinement

### No-scroll readability classes
The following classes should never require marquee scrolling in their normal supported input envelope:
- HERO WORD;
- NUMBER / VALUE;
- DIRECTIVE;
- the approved maximum NAME length if it can be handled by condensed face or phrase paging.

SHORT ANNOUNCEMENT should page before scrolling.
LONG FREE TEXT is the only class where scrolling remains an allowed last fallback.

### Stable-reading rule
During the readable hold:
- glyph mask geometry is invariant frame-to-frame;
- audio does not move, shear, pulse or rescale glyph geometry;
- background/halo treatment may react within bounded contrast limits;
- text contrast management must not globally erase the Vibe unless needed for an emergency/readability mode explicitly approved later.

### Phrase-page contract
When a message exceeds the safe line width:
1. tokenize into semantically coherent phrase pages where possible;
2. choose the largest readable face that fits each page;
3. use consistent dwell based on page length;
4. preserve reading order;
5. use Vibe-aware page transitions;
6. scroll only if paging cannot preserve the message.

### Replay corpus corrections
Current recommended directive corpus should include:
- 25 FT
- STATION 4
- READY
- GO
- REST
- NEXT UP
- ACE
- WINNER
- $187
- player/team names
- BACK 9
- ACE POT

Remove STANCE / CHALLENGE from the required first-release replay corpus unless a later user-approved scope decision reintroduces a mode that needs those semantics.

### Acceptance evidence
For each committed text class:
- exact framebuffer replay where practical;
- quiet audio and contrasting bass/mid/high traces;
- at least one visually busy Vibe and one sparse Vibe;
- entry / hold / page transition / exit;
- return-to-base-state verification;
- human readability/aesthetic acceptance at actual cart viewing distance.

A text implementation that is technically legible but reads as a generic cheap LED marquee fails the product requirement.



## Prior HBNF physical evidence — reuse before reinvention

AKS HBNF canonical preserves a proven prior text-rendering result on this same 32×16 Matrix lineage:
- three metric-identical 12px WBF fonts were generated for foreground / 1px inner halo / 2px outer halo;
- layered custom-font overlays physically passed while the underlying animation remained moving;
- one-pass marquee timing was previously constrained to avoid partial repeated passes.

This is historical evidence, not proof that the exact release07/qualified-foundation source still contains the same implementation.

Foundation source audit must therefore:
1. locate or disprove the presence of the proven WBF/font/stencil primitives;
2. reuse them where compatible;
3. preserve their known readability/overlay lessons;
4. avoid adding a new FastLED/TrueType/font dependency merely because historical source location changed;
5. only replace the proven primitive when measured/aesthetic evidence shows it cannot satisfy the approved premium compositor contract.

This narrows the text audit from "invent a renderer" to "recover/reuse the strongest proven local primitive, then extend it into the Vibe-aware compositor."

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

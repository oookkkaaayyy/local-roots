# HBNF Cart 2.0 — P2 Text/Moments Offline Render Contract

STATUS: OFFLINE PREP COMPLETE / NOT A SHARED-INTERFACE FREEZE / NOT DEPLOYED

## Authority boundary
This lane consumes the existing candidate `VisualMoment` and `VibeSelection` shapes. It does not add, remove, rename, freeze, or require any shared-interface field.

## Premium compositor invariants
1. Base Vibe remains the visual substrate.
2. Contrast management is bounded and moment-local.
3. Glyph/moment mask geometry is invariant during readable hold.
4. Audio may influence background/halo/detail, never glyph position, shear, scale, or topology.
5. Entry/exit inherit Vibe language.
6. Phrase paging precedes marquee behavior.
7. Marquee is never the normal path for HERO_WORD, NAME, NUMBER_VALUE, DIRECTIVE, or SHORT_ANNOUNCEMENT.
8. Return behavior is explicit and must restore the required base state at integration.
9. A technically legible treatment still fails if it looks materially cheaper/jankier than the active visual system.

## Host planning classes
HERO_WORD, NAME, NUMBER_VALUE, DIRECTIVE, SHORT_ANNOUNCEMENT, LONG_FREE_TEXT.

Planner character limits are fixture/planning limits, not frozen renderer dimensions. Exact glyph widths, font metrics, framebuffer masks, current/brightness cost, and timing remain qualified-foundation/source dependent.

## Vibe-aware treatment intent
Host intent covers CHILL, GROOVE, HEAVY, PSYCHEDELIC, COSMIC, and AUTO. Unknown/unfrozen Vibes safely fall back to AUTO/VIBE_INHERIT rather than creating a new interface value.

## Proven prior primitive
Historical physical evidence on the same 32×16 Matrix lineage records metric-identical 12px WBF foreground + 1px inner halo + 2px outer halo overlays while underlying animation continued. Integration must recover/reuse that primitive when compatible before adding a typography dependency.

## Not claimed offline
Exact qualified-foundation font primitive location; exact framebuffer/mask implementation; exact glyph metrics/max name length; exact contrast/current budget; transition timings; runtime performance on qualified Foundation; physical readability/aesthetic acceptance; shared-interface freeze.

These remain deferred to Foundation qualification + P2_INTERFACE_FREEZE/legal Phase 2 integration.

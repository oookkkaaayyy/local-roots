# HBNF Cart 2.0 — Lane Goal Templates

STATUS: TEMPLATE ONLY. Replace placeholders from the APPROVED scope contract before implementation.

Every lane must read:
- canonical Cart 2.0 scope/change-control authority;
- canonical no-rediscovery release protocol;
- final golden release capsule;
- approved scope contract;
- acceptance matrix;
- lane contracts;
- integration DAG.

Universal rule:
If a committed requirement is blocked, report the blocker. Do not reduce scope, defer it, substitute it, or weaken acceptance criteria without explicit user approval.

## Lane A — Visual / Audio

OUTCOME
Implement the approved Vibe/Audio Expression scope on the accepted golden baseline.

COMPLETE ONLY WHEN
- all approved Vibes exist;
- each passes approved unlabeled differentiation tests;
- approved AudioFeatures exist;
- bass/mid/high and multi-timescale behavior meets scope;
- reference-audio corpus replay evidence exists;
- champion/challenger comparison completed;
- frame timing, heap, flash and AUX coherence meet non-regression gates;
- no realtime cloud/network dependency added.

BOUNDARIES
- do not change OTA/network architecture;
- do not reduce Vibe count or quality;
- do not replace nuanced audio mappings with generic amplitude/brightness behavior;
- no physical flash until integration authorization.

## Lane B — Text / Moments

OUTCOME
Implement the approved Vibe-aware text/moment compositor.

COMPLETE ONLY WHEN
- every approved semantic moment is supported;
- approved fonts/glyph strategy implemented;
- reveal/hold/dissolve inherits active Vibe;
- readable hold keeps glyph geometry stable;
- underlying visuals/audio behavior remains coherent;
- long-message behavior matches scope;
- acceptance corpus passes;
- no generic marquee becomes the default through fallback.

BOUNDARIES
- do not create a second visual architecture;
- consume frozen VisualMoment/compositor interfaces;
- do not simplify visual quality for implementation convenience.

## Lane C — Games

OUTCOME
Implement all approved IRL directive games and digital arcade games on the shared runtime.

COMPLETE ONLY WHEN
- exact approved game list is present;
- directive games materially reduce cognitive/bookkeeping load;
- timers/sounds/progression/elimination behaviors match scope;
- arcade controls work on approved devices;
- interruption/restart/exit behavior passes corpus;
- exiting Game Mode restores prior visual state;
- licensing/assets requirements satisfied.

BOUNDARIES
- no trivia/filler unless explicitly approved;
- no new input hardware requirement unless explicitly approved;
- do not remove games because one implementation is harder than expected.

## Lane D — Mission Control / Guest

OUTCOME
Implement the approved owner and guest experience.

COMPLETE ONLY WHEN
- approved owner controls exist;
- guest join flow works;
- Vibe cards are understandable without technical knowledge;
- guest permissions are enforced;
- approved game/event participation flows work;
- iPad target compatibility passes;
- offline/local-first behavior passes;
- admin/network/update controls remain protected.

BOUNDARIES
- no realtime-cloud dependency;
- do not silently hide or omit controls because an underlying lane is incomplete.

## Lane E — Reliability / Integration

OUTCOME
Integrate completed lanes onto the accepted golden baseline while preserving release-engineering guarantees.

COMPLETE ONLY WHEN
- no-rediscovery gates pass;
- source/dependency/generated-input provenance remains valid;
- all lane tests pass together;
- self-healing/diagnostics scope is implemented;
- rollback is verified;
- one coherent candidate capsule exists;
- physical preflight package is complete;
- integrated candidate meets all non-regression gates.

BOUNDARIES
- integration does not have authority to redesign or reduce feature scope;
- do not "solve" conflicts by deleting behavior;
- no live install without explicit authorization.

## Coordinator Goal

OUTCOME
Deliver the complete approved Cart 2.0 release from the proven golden baseline.

ITERATION POLICY
Continue safe work across independent lanes without waiting for repeated user prompts. Parallelize wherever frozen interfaces permit. Use challenger review before integration decisions.

STOP / REPORT ONLY WHEN
- a committed requirement requires scope change;
- missing evidence genuinely requires user/hardware;
- a safety/reliability gate fails and cannot be resolved without changing approved scope;
- all non-hardware gates are complete and physical authorization is required.

DO NOT STOP merely because:
- one lane finishes;
- one test reveals a fixable defect;
- one implementation attempt fails;
- a known solved problem recurs and its documented fix has not yet been reapplied.

# Cart 2.0 — PR #46 Postmortem Ingestion Gate

Cart 2.0 implementation may not begin merely because release 04 installed.

Before scope-lock implementation:
- all PR #46 MUST-before-next-firmware-update controls must be incorporated into the release foundation;
- the active low/jittery-FPS release-04 defect must be resolved and regression-covered;
- release 04 (or its corrected successor) must have separate install-health and physical-feature acceptance evidence;
- a real clean-room local-materialized baseline build/equivalence must pass;
- the resulting accepted baseline becomes the source for capacity, visual/audio, text, game and integration audits.

## What may proceed while the FPS defect is still being diagnosed
SAFE NOW:
- external research
- acceptance-corpus refinement
- scope-lock decision preparation
- release-engineering tooling that does not depend on the renderer implementation
- postmortem action implementation in isolated tooling
- guest/game/text UX research that does not assume exact frame budget

WAIT FOR FIXED BASELINE:
- final CPU/RAM/frame-budget audit
- final AudioFeatures source map
- final donor-kernel inventory
- visual/audio implementation
- compositor integration against live renderer
- clean-room golden promotion
- physical acceptance

## Rationale
The active defect appears at ~172 seconds after cold boot and may affect core render-loop behavior. Treating current release 04 as the performance baseline before the defect is resolved risks calibrating Cart 2.0 against a known-bad runtime.

This is a dependency gate, not a scope reduction.

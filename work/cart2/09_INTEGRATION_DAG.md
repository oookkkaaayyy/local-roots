# HBNF Cart 2.0 — Parallel Integration DAG

STATUS: PREPARED / PATHS TO BE BOUND TO FINAL ACCEPTED SOURCE.

## Prerequisite P0 — Golden baseline
Must pass before implementation:
- accepted source lineage;
- fully local immutable snapshot;
- dependency closure;
- generated-input policy;
- clean-room rebuild/equivalence;
- rollback verified.

## P1 — Freeze interfaces
Freeze:
- AudioFeatures
- VibeSelection
- VisualMoment
- GameState / GameDirective
- HealthState

No lane begins implementation before its consumed/produced interfaces are frozen.

## Parallel lanes after P1

### A — Visual/Audio
Depends on: AudioFeatures, VibeSelection.
Outputs: VibeRenderer, transition behavior, performance evidence.

### B — Text/Moments
Depends on: VisualMoment + a small compositor contract from A.
Can proceed using mock framebuffer before A is complete.
Outputs: fonts, masks/layers, moment renderer.

### C — Games
Depends on: GameState/GameDirective.
Can proceed independently with mock renderer/input.
Outputs: directive state machines, arcade runtime, control abstraction.

### D — iPad/Guest UX
Depends on: stable API contracts only.
Uses mocked endpoints until integration.
Outputs: Mission Control/guest flows.

### E — Reliability/Integration
Runs continuously:
- build/release gates;
- source/build provenance;
- diagnostics;
- regression harness;
- final integration.

## Integration milestones
I1: A + B compositor integration.
I2: C + D game/input integration.
I3: A/B/C/D into accepted platform baseline.
I4: full host/replay/regression pass.
I5: one coherent physical candidate.
I6: acceptance or rollback.

## Anti-serialization rule
Do not block B/C/D waiting for final visual tuning when their frozen interface is sufficient.
Do not block A on games/UI.
Do not let E rewrite feature behavior merely to simplify integration.

## Anti-contention rule
Any shared-file edit not anticipated by the frozen interfaces must be treated as an interface-change request, not casual cross-lane editing.

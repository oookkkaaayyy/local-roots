# HBNF Visual Lab — Phase 2 integration

Status: STAGING ONLY. No production mutation.

## Purpose

Replace parameter-first cart tuning with an operator UI that shows what the cart is supposed to do, what each device actually confirmed, and a live visual approximation of Matrix + AUX behavior.

This work is intentionally isolated from the current renderer/scene overhaul.

## Fixed inputs

- Phase 2 staging base: `hbnf-cart-phase2-readiness-verified-20260926` @ `b779fe01d5b26f981270c5b12716e366e3f75720`
- Active renderer work observed during staging: `hbnf-generative-projection-v4-20260927` @ `7103f8c2a84e48f5418049780df963213b3e2e33`
- Do not modify, reset, cherry-pick into, or otherwise interfere with the active renderer branch while it is in progress.

The renderer SHA above is an observation, not a merge authority. Final integration must bind to the renderer branch/commit explicitly accepted after the parallel work finishes.

## Operator model

Normal field control should expose semantic controls: Energy, Audio response, Motion, Variation, Palette, Matrix/AUX coupling mode, Matrix brightness, and AUX brightness. Raw WLED/effect parameters belong under an Advanced surface only.

## Required state distinction

The UI must keep three layers separate:

1. REQUESTED — the operator's current intent.
2. DESIRED — canonical cart state accepted by hbnf-cart-control.
3. CONFIRMED — latest device acknowledgement for Matrix and AUX.

A command is not shown as successful merely because the HTTP request was accepted.

## Preview model

The Visual Lab contains a 32×16 Matrix preview, AUX strip/ring preview, audio semantic bands, requested-vs-confirmed badges, per-device acknowledgement timestamps, and an explicit degraded/not-confirmed state.

The preview is an operator aid. It is not allowed to claim physical confirmation unless the device adapter acknowledgement says so.

## Phase 2 integration

Visual Lab is an additional controller surface. It does not replace canonical desired-state ownership, fence/revision checks, Phase 2 guest bridge isolation, game DDP ownership rules, global OFF dominance, or UV fail-dark behavior.

Target after acceptance: a private paired route on hbnightflyers.com linked from the permanent cart controller. Guest HBNF-Play keeps simplified LIGHTS controls and does not expose Visual Lab tuning.

## Renderer contract

The final renderer must provide a stable semantic contract independent of WLED effect IDs. Minimum telemetry: scene/visual family, palette, energy, audio response, motion, variation, bass/mids/treble/onset, Matrix preview sample, AUX preview sample, renderer revision, and per-device applied revision/timestamp.

If full preview frames are too expensive to stream continuously, the contract may expose a deterministic preview seed plus semantic telemetry, with periodic sampled hardware frames.

## Coupling modes

- LOCKED — Matrix and AUX derive from one authoritative render timeline/frame source.
- RELATED — same semantic source/palette/audio, separate spatial renderers.
- INDEPENDENT — deliberate separate looks.

The UI must never label RELATED as frame-synchronized.

## Promotion gates

Do not merge/deploy until all are true:

1. Parallel renderer work is finished and an accepted commit is identified.
2. Visual contract adapter binds to that accepted renderer without changing its physical behavior.
3. Phase 1 final handoff / Phase 2 execution gate is satisfied.
4. Requested/desired/confirmed state is distinguishable in UI.
5. Matrix and AUX acknowledgement timestamps are visible.
6. Preview continues when a device is offline and clearly marks it unconfirmed.
7. Existing OFF/ON/NEXT/brightness behavior remains intact.
8. Guest bridge and game lease rules remain intact.
9. Physical phone check passes.
10. Physical Matrix+AUX check passes.

## Fast path

1. Build Visual Lab independently against mock telemetry.
2. Freeze the final renderer branch.
3. Add one renderer-to-Visual-Lab adapter.
4. Rebase/cherry-pick Visual Lab onto the final Phase 2 integration branch.
5. Bind to canonical paired controller auth.
6. Deploy private route.
7. Perform one physical acceptance pass.

This avoids rebuilding the UI every time the renderer changes during the active scene overhaul.

# HBNF Cart 2.0 — Scope-Lock Packet

STATUS: PREPARED / NOT APPROVED / NO IMPLEMENTATION AUTHORITY.

Purpose: make the user's scope-approval turn short and decisive after feasibility audits complete.

## Scope-lock rule
Only items explicitly moved into COMMITTED after user approval become binding release scope.
No committed item may later be removed, simplified, substituted, deferred, merged away, or downgraded without an evidence-backed change request and explicit user approval.

## Decisions to resolve before lock

### Vibes / visual system
- Exact guest-facing Vibe set and names.
- Auto mode: ship in first release or not.
- Time-of-day modulation: first release or later.
- Exact differentiation acceptance method.
- Minimum retained visual variety within each Vibe.
- Exact scene-transition behavior/limits.

### Audio expression
- Final shared AudioFeatures list.
- Which features are mandatory for every Vibe vs optional.
- Motion/manual-authority relationship.
- Auto-gain/adaptation requirements.
- Reference-audio corpus acceptance criteria.
- Performance budget relative to accepted baseline.

### Text / moments
- Exact short-form text classes.
- Exact long-text fallback behavior.
- Font strategy.
- Required Vibe-aware reveal/hold/dissolve treatments.
- Whether guest-entered text is permitted and under what permissions.

### IRL directive games
- Exact first-release game list.
- Required directives/timers/sounds.
- Persistence/resume behavior.
- Manual input ceiling: what is acceptable vs too much bookkeeping.

### Digital arcade
- Exact first-release game list.
- Required controls.
- High-score/persistence behavior.
- Whether sound is mandatory per game.
- Original naming/assets/licensing plan.

### Mission Control / guest UX
- Exact tabs/sections.
- Guest permissions.
- Join flow.
- Which controls are owner-only.
- Offline behavior.

### Reliability/platform
- Exact self-healing behaviors allowed.
- Diagnostic retention period/detail.
- Recovery/restore controls.
- Golden-release gate state required before implementation.

### Physical convenience
- Whether any power/startup hardware changes belong in first release.
- If not, explicitly exclude without blocking later work.

## Approval output
The approved scope contract must state:
- COMMITTED
- EXPLICITLY EXCLUDED
- DEFERRED BY USER APPROVAL
- ACCEPTANCE CRITERIA
- NON-REGRESSION CRITERIA
- PARALLEL LANE OWNERSHIP
- INTEGRATION ORDER

No other status is allowed.


## Detailed candidate specifications now prepared
Before presenting the final approval packet, read:
- 13_IRL_INTERACTIVE_MODES_CANDIDATE_SPEC.md
- 14_DIGITAL_ARCADE_CANDIDATE_SPEC.md
- 15_TEXT_MOMENT_COMPOSITOR_CANDIDATE_SPEC.md
- 16_VIBE_GUEST_LANGUAGE_CANDIDATE_SPEC.md

Important refinement:
- scorekeeping-heavy IRL modes are rejected as current candidates because they add user work;
- strongest IRL candidates are Shuffle Call, Pressure Clock, and Sequence Run, all designed for zero or near-zero ongoing input;
- Rapid Fire remains challenger-only, not recommended for commitment yet;
- digital arcade candidate pack is seven shared-runtime games pending accepted-source capacity audit;
- text strategy is Vibe-aware compositing using bitmap/mask rendering first, without making a FastLED upgrade a prerequisite;
- Vibe names/subtitles are guest-intuitive and must pass unlabeled differentiation tests.

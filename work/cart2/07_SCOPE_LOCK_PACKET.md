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
- 17_GUEST_PLATFORM_PRODUCT_CONTRACT.md
- 18_GUEST_PWA_ACCEPTANCE_AND_SMOKE_TEST.md
- 24_MISSION_CONTROL_CANDIDATE_SPEC.md
- 26_AUDIO_FEATURES_CANDIDATE_CONTRACT.md

Important refinement:
- scorekeeping-heavy IRL modes are rejected as current candidates because they add user work;
- strongest IRL candidates are Shuffle Call, Pressure Clock, and Sequence Run, all designed for zero or near-zero ongoing input;
- Rapid Fire remains challenger-only, not recommended for commitment yet;
- digital arcade candidate pack is seven shared-runtime games pending accepted-source capacity audit;
- text strategy is Vibe-aware compositing using bitmap/mask rendering first, without making a FastLED upgrade a prerequisite;
- Vibe names/subtitles are guest-intuitive and must pass unlabeled differentiation tests.


## 2026-10-03 decision-readiness split

### Can be decided from source-independent product evidence
These may be presented as explicit user choices once the packet is consolidated:
- guest-facing Vibe names/language and desired candidate count;
- whether AUTO is desired in first release, subject to later feasibility/performance validation;
- preferred IRL candidate set: Shuffle Call / Pressure Clock / Sequence Run; Rapid Fire remains challenger-only;
- desired Arcade candidate set, with final technical commitment conditional on accepted-foundation capacity;
- whether guest short text/moments are allowed and under what owner permission;
- owner Mission Control navigation/priority model;
- whether physical gamepad support is desired as a committed requirement or an optional enhancement after validation.

### Must remain source/foundation-dependent
Do not ask the user to guess these before evidence exists:
- exact firmware memory/headroom budget;
- final number of simultaneous retained visual donors/variants;
- exact AudioFeatures implementation and numeric envelopes;
- exact controller latency threshold;
- exact renderer/frame-time budgets per new feature;
- whether all seven Arcade candidates fit simultaneously without compromising foundation performance;
- whether any dependency/toolchain upgrade is actually needed;
- final local API bindings and source file ownership.

### Scope-lock presentation rule
The eventual approval turn should distinguish:
- PRODUCT CHOICE: user preference/value decision;
- TECHNICAL CONDITION: commitment permitted only if measured foundation capacity supports it without violating quality/reliability requirements;
- NOT YET DECIDABLE: evidence still missing.

A technical condition is not permission to silently drop a user-approved product choice. If the condition later fails, return with evidence and alternatives under the existing change-control rule.

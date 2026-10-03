# HBNF Cart 2.0 — Next Codex Handoff

STATUS: CURRENT SOURCE-CONNECTED HANDOFF POINTER.

Do not use the older PR #46/release04 audit sequence as the next execution path.

## Current state
- lifecycle: DIAGNOSTIC_ACTIVE
- installed firmware: hbnf-matrix-coordinated-v1-20261002-07
- release07 role: DIAGNOSTIC_BASE / PERFORMANCE_REJECTED
- foundation: FOUNDATION_UNQUALIFIED — PERFORMANCE_OPEN
- exact release07 source identity: UNVERIFIED
- Phase 2 firmware-dependent implementation: NOT AUTHORIZED
- source-independent planning/acceptance refinement: permitted

## Required read-first
1. root AGENTS.md
2. work/cart2/23_LENGTH_LIMIT_MIGRATION_HANDOFF_20261003.md
3. config/HBNF_CONTROL_MODEL.json
4. config/HBNF_CONTROL_STATE.json
5. evidence/hbnf-phase2-migration-20261003/CONTINUATION_COORDINATOR_CHECKPOINT.json
6. work/cart2/20_FOUNDATION_PERFORMANCE_SWEEP_EXECUTION.md
7. work/cart2/21_CLASS_LEVEL_PERFORMANCE_FIX_EXECUTION_TEMPLATE.md
8. work/cart2/22_FOUNDATION_QUALIFICATION_EXECUTION_TEMPLATE.md

## Exact next source-connected execution
Run work/cart2/20_FOUNDATION_PERFORMANCE_SWEEP_EXECUTION.md.

That task must:
- run every applicable AGENTS.md static/unit/architecture check locally;
- prove exact release07 source/build identity;
- discover the ACTUAL release07 diagnostic endpoint and safe snapshot/select/restore path from source/runtime;
- construct the tiny argv adapter;
- dry-run it;
- verify expected release07 through read-only telemetry before first visual mutation;
- execute exactly one complete 28-kernel DIAGNOSTIC sweep;
- rank/group pathological kernels by shared primitive/class;
- verify exact pre/post visual-state restoration;
- stop before firmware edits.

Do not use GitHub Actions merely to substitute for the required source-connected execution unless the user separately authorizes that expenditure.

## After packet 20
Only if complete sweep evidence exists:
- instantiate packet 21;
- fix measured performance classes/shared primitives, not serial kernels;
- build/package one corrected forward candidate;
- do not install without the required live authorization.

## After corrected candidate install + basic health
Instantiate packet 22.

Only an exact artifact passing packet 22 becomes:
PHASE 2 FOUNDATION — QUALIFIED.

## After foundation qualification
Use:
- work/cart2/25_SCOPE_LOCK_DECISION_READY_DRAFT.md
- completed source/capacity/visual/text/game audits
- current acceptance corpus
to present only genuine user product decisions for explicit scope lock.

Then freeze the approved interfaces and begin parallel implementation.

No prose handoff, successful build, successful OTA, or newest branch HEAD may bypass this sequence.

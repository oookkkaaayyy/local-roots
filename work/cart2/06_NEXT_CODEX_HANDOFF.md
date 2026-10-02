# HBNF Cart 2.0 — Next Codex Handoff

## When current PR #46/source-reconciliation work reaches a clean checkpoint
Use this prompt in a NEW Codex thread/worktree. It is read-only.

---
Continue HBNF Cart 2.0 readiness work in repo oookkkaaayyy/local-roots.

FIRST:
1. Read work/cart2/00_READ_FIRST.md.
2. Read work/cart2/03_FEASIBILITY_AUDIT_PROMPTS.md.
3. Read work/cart2/04_READY_TO_IMPLEMENT_GATE.md.
4. Read config/HBNF_CART2_STAGING_GATES.json.
5. Read work/release-engineering/00_READ_FIRST.md.
6. Read work/release-engineering/MATERIALIZATION_GENERATED_INPUTS_GATE.md.
7. Treat a completed golden baseline, local materialization, dependency closure, generated-input policy, and clean-room rebuild/equivalence as prerequisites rather than optional cleanup.
5. Identify the final accepted coordinated-release/source baseline from the current project authority before treating any source tree as canonical.

GOAL:
Make the Cart 2.0 planning package fully ready for user scope lock and immediate implementation. Complete every safe READ-ONLY audit in 03_FEASIBILITY_AUDIT_PROMPTS.md that the available evidence permits. Do not stop merely because one audit completes; continue until all audits are complete or a blocker genuinely requires missing evidence/hardware/user scope approval.

BOUNDARIES:
- no source implementation;
- no deployment;
- no firmware flash;
- no router/network/hardware mutation;
- no merge;
- no GitHub Actions;
- no scope reduction;
- no guessed source lineage;
- no recommendation without challenger analysis and current authoritative/expert research.

OUTPUTS:
Populate work/cart2/audits/ with the named audit reports. Update config/HBNF_CART2_STAGING_GATES.json only for gates proven by evidence. End with one concise status:
READY FOR SCOPE LOCK / BLOCKED
and list only genuine blockers.
---

## After user explicitly approves the scope contract
Use this prompt in the implementation coordinator thread.

---
Read the approved HBNF Cart 2.0 scope contract, 00_READ_FIRST.md, 02_PARALLEL_EXECUTION_PLAN.md, 04_READY_TO_IMPLEMENT_GATE.md, 05_ACCEPTANCE_MATRIX.md, all completed audits, and the final accepted coordinated-release baseline.

Do not alter the approved scope. Do not silently reduce, substitute, defer, or simplify any committed requirement.

Before code changes:
1. prove READY_TO_IMPLEMENT gates;
2. create isolated worktrees/branches for each approved independent lane;
3. freeze the shared interfaces;
4. assign file ownership to prevent contention;
5. define lane-local tests;
6. confirm integration/rollback order.

Then implement lanes in parallel where independent. Keep the realtime visual/audio path local. Avoid new architecture unless the approved scope/evidence explicitly requires it. Prefer reuse of proven WLED/FastLED/ANIMartRIX/project primitives.

A lane is complete only when its own tests and the shared acceptance criteria pass. If any committed requirement is blocked, stop that requirement and report the blocker; do not downgrade it.

Do not deploy/flash until the integrated candidate has passed all non-hardware gates and the user explicitly authorizes the physical rollout.
---

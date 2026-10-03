# OPERATIONAL AUTHORITY — READ THIS FIRST

For release/Cart 2.0 promotion state, DO NOT infer status by combining this document with other prose/gate files.

The only operational promotion authority is:
- `config/HBNF_CONTROL_MODEL.json`
- `config/HBNF_CONTROL_STATE.json`
- `scripts/hbnf_control.py`

Required startup command in any future coordinating/Codex task:
`python3 scripts/hbnf_control.py status`

All other AKS docs, postmortems, runbooks, gate JSON, acceptance matrices, and solved-problem records are evidence/reference/domain inputs. They may not independently advance lifecycle state.

If a new instruction appears to require "another rule", first classify it as implementation detail, evidence for an existing transition, or a genuinely new transition/invariant. Do not create another parallel control plane.

# HBNF Cart 2.0 — READ FIRST

## Canonical AKS authority
Before any Cart 2.0 recommendation, scope decision, implementation plan, Codex handoff, or integration change, read:
- CANONICAL — HBNF CART 2.0 SCOPE, CHANGE CONTROL & IMPLEMENTATION READINESS — READ FIRST — 2026-10-01
- Drive ID: 105J0xKbNFD26NOGChN9MssOVjbJ9Q2p6LYhz2Ky7EgM
- Canonical Registry record: AKS-REC-000118

If this repository planning package and that AKS authority diverge, the explicit current user instruction / canonical AKS source controls until reconciled.

Before any firmware/controller/router/software implementation or rollout planning, also read:
- CANONICAL — HBNF RELEASE ENGINEERING & NO-REDISCOVERY PROTOCOL — 2026-10-02
- Drive ID: 1bw_VUNt2mEZ4JdKuRsQq7ZS1Bc4KeC8kMVABVK2OdgE
- Canonical Registry record: AKS-REC-000119

That protocol controls source/build provenance, golden release capsules, solved-problem reuse, readiness claims, and rollout discipline.

## Purpose
This branch is a planning/audit staging lane only. It exists to make the next implementation phase start immediately once the current coordinated-release/source-reconciliation work is complete.

## Nonnegotiable governance
1. No implementation begins until an explicit scope contract is approved by the user.
2. No silent scope reduction, substitution, downgrade, deferral, or "fallback" is allowed after scope lock.
3. If a committed requirement proves infeasible or materially riskier than represented, stop and return to the user with evidence and options. Do not quietly ship less.
4. Recommendations require challenger analysis plus current authoritative/expert research.
5. Existing live/release work must not be modified by this staging lane.
6. Parallel development is required wherever interfaces can be frozen safely.
7. One lane may not consume another lane's quality, reliability, or schedule budget.
8. No production deploy, firmware flash, router mutation, hardware mutation, merge, or GitHub Actions run is authorized by this branch.

## Branch relationship
Created from PR #46 head snapshot:
- source branch: hbnf-coordinated-release-20261001
- source snapshot: 0c01d0c7f065264e2b9fd8127f1c48cc96a73b56

This is intentionally a snapshot. The current PR #46 lane may continue changing independently.

Before implementation:
- reconcile/rebase/port this planning package onto the final accepted coordinated-release baseline;
- do not assume this snapshot is the accepted firmware source lineage.

## "Fully ready for instant implementation" means
All of the following are complete:
- current accepted source identity is known;
- feasibility audits are complete;
- exact scope is approved;
- lane interfaces are frozen;
- acceptance tests are written;
- performance/reliability budgets are written;
- implementation prompts are prepared;
- each lane has a bounded worktree/branch plan;
- integration order is defined;
- rollback path is defined;
- remaining user input is limited to explicit scope approval or unavoidable physical acceptance.

Anything else is not "ready."

# HBNF / Cart Upgrades — Repository Agent Instructions

For any task touching HBNF release engineering, firmware promotion, Cart 2.0 integration, deployment, or acceptance:

1. Run:
   `python3 scripts/hbnf_control.py status`

2. Treat only these files as operational lifecycle authority:
   - `config/HBNF_CONTROL_MODEL.json`
   - `config/HBNF_CONTROL_STATE.json`
   - `scripts/hbnf_control.py`

3. Do not infer lifecycle state from prose, recency, successful compilation, successful installation, postmortems, READ FIRST docs, AKS, or legacy gate JSON.

4. Do not add free-floating governance rules. New information must be classified as:
   - implementation detail;
   - direct evidence for the current stage receipt; or
   - a deliberate lifecycle-model revision.

5. Preserve the V2 complexity budget:
   - 6 states maximum;
   - 5 forward transitions maximum;
   - exactly one outgoing transition per nonterminal state;
   - one self-contained receipt per transition;
   - no branching, cycles, nested receipts, or receipt-to-receipt references.

6. Before finalizing any repository change that touches HBNF control/release logic, run:
   - `python3 tests/hbnf_control.py`
   - `python3 tests/hbnf_guarded_run.py`
   - `python3 scripts/hbnf_architecture_fitness.py`
   - `python3 tests/hbnf_runtime_qualify_static.py`
   - `python3 tests/hbnf_kernel_sweep_report.py`
   - `python3 tests/hbnf_source_tree_identity.py`
   - `python3 tests/hbnf_live_kernel_sweep.py`
   - `python3 tests/hbnf_packet20_http_adapter.py`
   - `python3 tests/hbnf_packet20_build_validate.py`

7. Do not perform live mutation unless the control plane and the task's explicit user authorization both permit it.

## Artifact continuity and storage

8. Local Codex/worktree paths are temporary workspace, never durable handoff authority.

9. Before any later phase depends on a newly validated HBNF artifact, perform this sequence:
   **validate -> SHA-256 -> register -> promote -> read-back verify -> continue**.

10. Promotion destinations:
   - buildable/deployable source, workflows, manifests, and release metadata -> GitHub;
   - durable binaries, exact recovery companions, decisive diagnostics, and compact evidence -> Google Drive;
   - current routing/state and artifact identities -> AKS.

11. First-stop Drive authority for Cart 2.0:
   - `AKS — HBNF CART 2.0 — CURRENT FILE AUTHORITY`
   - Drive ID `1GwvPv_nihqoIj83WsO6VcvyujRkt8HnnULvLv717OHc`
   - Canonical project folder `HBNF CART 2.0 — ACTIVE`, Drive ID `1E5u4gEUVi0cwTEZP8j0vqUF78tWrU-Pc`
   - Global artifact registry: `AKS — ARTIFACT & SOURCE REGISTRY — CURRENT`, Drive ID `18VsUYIYr62fYVaEqynM1kbMmfQpei-3H3rBgrw8S96k`

12. Do not broadly search Drive or local worktrees for an artifact until the current file authority and artifact registry have been consulted.

13. Retention discipline:
   - keep the current diagnostic/candidate, exact recovery companion, and last accepted field baseline;
   - keep extra milestone binaries only when they have unique rollback/provenance value;
   - do not retain build caches, dependency trees, repository clones, `node_modules`, or PlatformIO caches in Drive;
   - routine raw logs/captures are temporary; retain compact decisive evidence instead;
   - superseded reproducible intermediates are deletion-eligible after GitHub/registry provenance is verified.

14. When an artifact is superseded, mark/route it as superseded immediately. Never allow an obsolete file whose title says CURRENT to remain in the active path.

15. Before ending a task that created or materially changed a meaningful artifact, update the artifact authority/registry so the next task never has to rediscover it.


16. GitHub Actions is an explicitly authorized execution/cost boundary. Repository Actions was intentionally shut down on 2026-09-29 when included usage was near its limit. Never enable, trigger, dispatch, or rerun GitHub Actions without explicit current user authorization for that exact bounded run. One approved run never implies approval for a retry or unrelated workflow.

These instructions exist to prevent governance drift, artifact loss, repeated rediscovery, and storage bloat across Codex tasks and chats.

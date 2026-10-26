# HBNF / Cart Upgrades — Repository Agent Instructions

## CURRENT FIELD-RELIABILITY PROGRAM (OWNER DIRECTIVE — 2026-10-25; supersedes 2026-10-20 priority note)

This is a **project priority and source routing note**, not a change to the operational lifecycle model. Continue to enforce the actual `config/HBNF_CONTROL_MODEL.json`, `config/HBNF_CONTROL_STATE.json`, and `scripts/platform.py` commands below. Do not rebuild or replace these files.

- **Active P0: Cart UV integration, issue #116 and draft PR #130.** Make the two 5V USB UV strips follow Matrix/AUX rhythm automatically by default; the Main and Short sliders set independent brightness caps. Detached/manual behavior is secondary. Preserve existing Cart/Matrix/underglow behavior. Continue bounded source, firmware, packaging, and recovery work toward a safe install.
- **Frozen by owner: score-on-Matrix and UDisc-to-HBNF implementation.** Do not start, resume, or require issue #115 scoring work as a prerequisite for UV. Preserve current scoring data and workflows; resume this lane only when the owner asks.
- Keep UV outputs fail-dark until the established electrical and physical gates pass. Source work may proceed while those gates are open; do not energize, install firmware, or change production/device state without the required release authorization and safety evidence. Use the hardware specifications already provided; do not request duplicate photos/labels unless a specific unresolved fact cannot be established from those records.
- **Expert-led behavior:** Questions, observations and proposed ideas from the owner are inputs to challenger analysis, **not automatic instructions** to interrupt existing work. Test against current evidence, production identity, risks and simpler alternatives; state adopt/defer/reject. Change agreed direction only on an explicit owner decision or a verified urgent incident.
- Do not confuse GitHub source availability with installed-device source/version parity. This branch contains genuine Cart control files, but on-course installed Opal and firmware must still be matched to exact verified releases. The separate Local Roots main-branch source-routing candidate is https://github.com/oookkkaaayyy/local-roots/pull/117 (DRAFT and **not accepted production authority**).
- Keep the owner informed only of substantive results, not prompt chains. At every handoff state UV source/package status, exact next acceptance evidence, and any genuine owner-only physical/manual gate. No live scoring/Cart mutation merely from this note.

Controlling evidence/priority: https://docs.google.com/document/d/1mydpAPHSuHu7Z75MedZ683s2FoFJVgSi2jLPVGKaYpQ/edit
Missing-round evidence: https://docs.google.com/document/d/1a0K5wvfnHT-hn9TPxd-ze2vpqM3sPIQcpD5zPSxVt8s/edit


## Mandatory platform front door

For substantial HBNF implementation, build, deployment, diagnostic, recovery, or acceptance work:

1. Run `python3 scripts/platform.py doctor`.
2. Select the appropriate golden path from `platform/workflows/`.
3. Create a self-validating execution capsule with `python3 scripts/platform.py capsule ...`.
4. Validate it with `python3 scripts/platform.py check-capsule ...`.
5. For worker execution, compile the directive with `python3 scripts/platform.py directive ...`.
6. Do not perform a paid or mutating step unless the capsule validates and every mandatory prelive stage is closed.

The platform layer does not replace the HBNF lifecycle control model. It enforces the engineering path used to reach the next lifecycle receipt.

For any task touching HBNF release engineering, firmware promotion, Cart 2.0 integration, deployment, or acceptance:

1. `python3 scripts/platform.py doctor` already runs `python3 scripts/hbnf_control.py status`. Review that emitted status as the required control-state check; do not invoke the same status check a second time unless investigating a new state change.

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


## HBNF anti-spin execution rules

17. During an active Packet/live-execution lane, completed prerequisites are immutable unless a specific state-changing event invalidates them. Do not repeat release-state reads, updater preflights, artifact verification, signatures, build provenance, or control status for reassurance.

18. A failed live or host step creates exactly one current blocker: the smallest evidence-backed cause of that failed step. Correct that blocker and resume from the failed step. Do not fan out into adjacent archaeology.

19. No paid/limited remote build or GitHub Actions run may be used diagnostically. Before any authorized build, source/dependency/vendor/generated-input closure must be reconciled offline/read-only. One authorized run never implies a retry.

20. After two consecutive host/process/tooling blockers with no new Matrix diagnostic evidence, stop execution and simplify the lane before attempting a third mechanism.

21. During Packet20/21/22 execution, do not create new governance layers, handoffs, or policy artifacts unless needed to preserve a decisive result or prevent loss. Existing control-state + one durable delta are sufficient.

22. Use the canonical repository checkout for live runners. Temporary runner/adapter copies are forbidden unless every dependent input path is explicit and verified. Never rely on implicit relative paths from /tmp or another disposable workspace.

23. User involvement is a last resort. Never use the user as a Terminal relay. When a user-only action is unavoidable, request exactly one action with one expected result and one stop condition.

24. Coordinator success metric is forward evidence: installed candidate, completed sweep, exact restore, qualified candidate, or accepted feature. Preparatory checks do not count as progress unless they close a previously unproven prerequisite.

25. Same-mechanism retry rule: no retry after a failure unless new evidence materially changes why that retry should succeed.

26. For every engineering change, create a record using the applicability classes in `config/HBNF_CONTROL_MODEL.json` and validate it with `python3 scripts/hbnf_control.py check-change --change <record-or-manifest.json>`. Store decision records as evidence, not as policy. Unknown impact fails closed; architecture, new dependencies, subjective design, and bespoke replacement require the evidence defined by the control model. T4 progression requires the validated `evidence/engineering-governance/T4_ENGINEERING_GOVERNANCE_MANIFEST.json` artifact.

27. Before each PlatformIO build, reuse the last successful pinned release capsule and record the exact command, environment, dependency closure, source identity, and cache state. Set a diagnostic budget and measurable phase outputs before starting. Judge progress from stage/log changes, object counts and timestamps, process CPU/RSS, memory pressure, and disk—not elapsed time alone. After 30 minutes without measurable progress, preserve the log and build tree, classify the failure/stall, then make at most one evidence-supported mechanism change. Do not repeat dependency archaeology unless new evidence invalidates the recorded closure; do not change LDF, packages, or compiler flags without proof.

28. Use the existing 15-minute Live Status heartbeat during active work. Before a long operation record its start and expected checkpoint; update after it completes or its state materially changes. Include current task, last accomplishment, next checkpoint, actual blocker, source branch/head, timestamp, and live-mutation state. Never let heartbeat work interrupt a critical build, and never leave a stopped worker marked ACTIVE.

These instructions exist to prevent governance drift, artifact loss, repeated rediscovery, storage bloat, and execution wheel-spinning across Codex tasks and chats.

## Single-capsule execution model

For any live, deployment, diagnostic, or high-cost task:

- The coordinator must prepare exactly one execution capsule before the worker acts. The capsule consists of the exact repository ref/commit, exact scripts/configs, exact durable artifacts, required hashes, expected terminal outputs, and stop conditions.
- Use indexed authority first, not archaeology first. Resolve needed material from the current file authority, artifact/source registry, AKS pointers, canonical GitHub paths, and indexed Drive records before searching older local workspaces or historical sources.
- Before retrieval, state the expected identity, first-stop index/authority, named sources, and stop condition. Keep a compact ledger of each source, exact query/selection, pagination or listing bound, and result. Inspect each named source once; advance pagination only with its returned cursor. Do not repeat equivalent searches with reworded queries or relist the same scope.
- Use precise dispositions: `FOUND`, `NOT FOUND WITHIN CHECKED SCOPE`, or `INCOMPLETE ACCESS`. A capped/partial listing never proves global absence and is not a reason to search the same scope indefinitely. Expand only for a new pointer, a genuinely different authoritative source, or a materially changed retrieval capability.
- Once the indexed pass is complete, take one predeclared recovery step: reproduce from exact source plus pinned inputs and compare the expected hash. If exact inputs are unavailable or the hash differs, stop that recovery lane, record the specific gap, and continue independent safe work. Ask the owner only for a concrete known backup/build location, never a speculative broad hunt.
- Do not forbid genuine rediscovery. If indexed authority does not contain what is genuinely needed, broaden the search deliberately to prior Drive items, GitHub history, archived evidence, prior handoffs/chats, or local workspaces as appropriate. The problem is repeated unindexed archaeology, not evidence retrieval itself.
- Anything plausibly reusable later must be preserved before the task ends and made easy to retrieve: exact source/config/helper identity, decisive evidence, accepted/rejected artifacts when uniquely informative, recovery companions, hashes, provenance, and the pointer needed to find them.
- Preservation destinations remain role-based: GitHub for canonical/buildable source and scripts; Drive for durable binaries/evidence/recovery artifacts; AKS/registries for searchable routing, metadata, identities, and pointers. Local Codex paths are workspace only unless no durable copy exists yet.
- All runtime paths must be explicit. Do not rely on cwd-sensitive defaults or temporary /tmp-relative paths.
- A capsule must be self-validating before mutation: required files exist, expected hashes/identities match, and all non-network/pure tests required for that lane pass.
- Live evidence must be promoted to durable authority immediately after the run. No decisive result may remain local-only after the task returns.
- One run -> one result -> one durable delta. Do not create extra handoffs, summaries, or authority copies unless context loss makes one necessary.
- If the capsule is incomplete, stop before mutation and repair the capsule offline using indexed retrieval first, then broader evidence recovery if genuinely required.
- Once a capsule has passed validation and begun execution, the worker may not silently substitute another adapter, helper, config, checkout, or artifact.

## Mandatory standard-engineering execution contract

This section governs every future implementation, build, deployment, release, diagnostic, recovery, and hardware-validation prompt/process in this project.

### Absolute installed-baseline and rollback invariant — all components and future releases

This is a mandatory release invariant, not a recommendation. Enforce it at three independent gates:

1. **Authoritative baseline record:** maintain one per-component record binding the physical/logical target, installed release and source identity, installed artifact SHA-256 (or an explicit `UNAVAILABLE` state with evidence and recovery plan), exact rollback artifact ID/location/hash, candidate source commit/hash, and install/readback receipt. Never infer installed bytes from a version label or build marker.
2. **Build/package admission:** a package may be labeled `INSTALLABLE` only when the baseline record is current, exact rollback bytes match the recorded installed image, the rollback is durably retained and read-back verified, and candidate/source/package identities agree. Otherwise the only permitted disposition is `REVIEW_ONLY`; never call that package ready to install.
3. **Mutation and closeout:** immediately before writes, re-read the target identity/baseline and compare with the admitted record; abort before mutation on missing or mismatched evidence. After writes, verify the installed candidate identity and durably write/read back the receipt, then atomically advance the authoritative baseline while retaining the exact prior image for the next rollback.

Automated checks must reject missing, stale, mismatched, replayed, or non-durable baseline/rollback evidence at every applicable gate. Compile success, matching version/build labels, owner reports, and earlier tests are not substitutes. If firmware bytes cannot be read from a device, accept only the repository's explicitly supported source/build witness bound to the exact install transaction; if that cannot establish identity, keep installation blocked and continue independent work. This rule applies to every coordinator and worker. Never ask the owner to locate project-created artifacts.

- Do not treat the project as exploratory unless the unknown is genuinely irreducible runtime/physical behavior. Source identity, dependencies, generated inputs, credentials, API/consumer contracts, mutable-pointer semantics, publication behavior, timeout budgets, rollback paths, and cloud deployment mechanics are deterministic prerequisites and must be closed before live/paid mutation.
- Before any risky mutation, prove the **entire transaction** end to end in preview/staging/simulation or deterministic fixtures: prepare -> publish/deploy -> actual consumer reads the exact path/role/identity -> execute -> verify -> rollback/recovery -> restore exact prior cloud/device state.
- Recovery is a prerequisite, not an incident task. The exact last-known-good artifact/version, exact consumer path, exact rollback command/path, and acceptance checks must be proven before the first risky mutation.
- Mutable aliases such as `latest`, `stable`, or role pointers are discovery conveniences only. Once a target is selected, execution must be bound to exact signed/versioned identity and hash. If a consumer is pinned to a mutable alias, the alias transition itself must be rehearsed and reversible before mutation.
- Capture exact current production/device/deployment identity before changing it. Where the provider supports immutable versions/previews, create and verify a new version first, deploy that exact verified version, and roll back by exact prior version identity rather than reconstructing production state.
- Paid/quota-limited builds are never source archaeology. Complete source/dependency/vendor/generated-input closure first. A failed paid run does not authorize another.
- A worker directive must come from a validated execution capsule or equivalent complete preflight package. Once mutation begins, do not improvise new helpers, configs, artifacts, URLs, credentials, publication routes, or recovery mechanisms.
- Any deterministic prerequisite discovered during live execution is a **process defect**. Stop the lane, fix the offline contract, add a regression test that would have caught it, and do not resume until the full transaction rehearsal passes.
- Progress means a terminal product outcome or closed acceptance criterion. Documentation, rediscovery, prompt iteration, or preparation alone do not count.
- Do not provide unsupported ETAs. Estimates require a validated path plus measured stage durations; explicitly separate irreducible runtime uncertainty.
- User interaction is last resort. Every copy/paste action must be supplied as one single fenced block. Every site/file/folder/artifact the user is told to open or use must include a direct link or exact path. Use regular macOS Terminal, not iTerm.
- Never use the user as a relay between tools/workers when the backend can perform or preserve the step directly.

For HBNF/Cart 2.0 specifically, a diagnostic install is forbidden unless the exact recovery artifact **and the actual updater/publication/manifest path required to consume it** have already been proven end-to-end and the exact prior cloud deployment can be restored without reconstruction.

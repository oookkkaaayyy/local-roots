# Local Roots Events — Agent Instructions

## Scope
This repository contains the Local Roots website and event system.

For event work, the authoritative requirements are:
- `docs/PRODUCT_SPEC.md`
- `docs/DATA_CONTRACT.md`
- `docs/SOURCE_RULES.md`
- `docs/ACCEPTANCE_TESTS.md`
- `docs/PHASE_1_AUDIT.md`

## Hard rules
- Never scrape PDGA or UDisc.
- Do not build unapproved automated Disc Golf Scene extraction.
- Do not commit secrets.
- Do not bind fields by spreadsheet column position.
- Do not publish unvalidated source candidates.
- Manual overrides outrank automated source updates while active.
- A scheduled job running is not evidence that data is healthy.
- A zero-record parse after a nonzero baseline is an anomaly.
- Preserve last known-good public data on source failure.
- Write/adjust tests whenever behavior changes.
- Do not change requirements silently; update the applicable docs when a deliberate product decision changes them.

## Work style
- One bounded milestone at a time.
- Avoid unrelated refactors.
- Run tests before completion.
- Report commands and test results.

## Anti-spin execution discipline

These rules apply to substantial implementation, debugging, deployment, and repair work:

- Define the shortest valid path to the requested terminal outcome before execution. Optimize for completed user-visible output, not number of checks performed.
- A failed step may create only the smallest evidence-backed blocker needed to explain that failure. Fix that blocker and resume from the failed step; do not reopen completed prerequisites.
- Once a prerequisite is proven and no state-changing event invalidates it, mark it closed. Do not re-verify it for reassurance.
- Never use paid/limited remote execution as source archaeology or trial-and-error. Reconcile inputs/dependencies locally or with read-only evidence first, then spend at most one authorized execution attempt.
- Do not retry the same mechanism after a failure unless new evidence changes the expected outcome.
- After two consecutive process/tooling blockers that produce no new product evidence, stop the lane and simplify the workflow before a third attempt.
- Do not create new governance documents, handoffs, registries, or abstractions during an active execution lane unless they are strictly required to preserve a decisive result or prevent data loss.
- Prefer one canonical checkout/workspace. Temporary copies must not rely on implicit relative paths; all external inputs must be explicit and verified before live execution.
- Do not make the user a command/output relay. Ask for at most one genuinely user-only action at a time.
- Progress is measured by completed deliverables, live evidence, or closed acceptance criteria—not by preparation activity.

## Single-capsule execution model

For any live, deployment, diagnostic, or high-cost task:

- The coordinator must prepare exactly one execution capsule before the worker acts. The capsule consists of the exact repository ref/commit, exact scripts/configs, exact durable artifacts, required hashes, expected terminal outputs, and stop conditions.
- Use indexed authority first, not archaeology first. Resolve needed material from the current file authority, artifact/source registry, AKS pointers, canonical GitHub paths, and indexed Drive records before searching older local workspaces or historical sources.
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

## Local Roots × HB Night Flyers website integration and redesign

For work that changes, audits or coordinates the Local Roots/HBNF site integration, unified public navigation, visual identity or design system, **first read** `docs/LR_HBNF_SITE_INTEGRATION_CHARTER.md`, especially its most recent **VISUAL DESIGN PROCESS RESET — OWNER REJECTION (2026-10-17)** and prior **OWNER-CORRECTED DESIGN MANDATE**, and the current AKS/router/project sources it identifies. The owner requires comprehensive expert-quality visual and UX refinement for BOTH LR and HBNF—not a recolor/navigation patch or generic templates. The Bone Ink PDF approves a starting **color direction only**; its fonts/layout/components are not accepted. The owner also explicitly rejects the latest three code-first LR/HBNF visual prototypes and forbids serif, retro/mono computer-like typography, oversized boxed headings, random cards and inconsistent component scales. Before any Codex site-building, research real-world visual references and choose a coherent sans-serif art direction from actual reviewed design materials; use a dedicated design tool first, code only once visually approved. The three generic visual mockups and seven-page follow-up PDF were explicitly rejected, and no visual approach is approved by silence. Apply the mandatory evidence-first challenger review, authentic brand assets, mobile/desktop detail design, independent HBNF operational boundary, owner visual approval and non-production exploration gates. This section does not alter unrelated active Local Roots event-source, D&U or HBNF scoring/Cart release authorities. 

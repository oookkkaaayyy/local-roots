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


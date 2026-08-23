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

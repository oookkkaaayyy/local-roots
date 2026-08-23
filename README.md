# Local Roots

Local Roots is a Southern California disc-golf community hub.

The first production feature being developed is the Local Roots Events calendar.

## Event system status

Phase 1 specification/forensic audit and Milestone 1 database/domain implementation are complete.

Milestone 1 is live in the Local Roots/D&U Supabase project under isolated `lr_` objects. The transactional regression suite passes, public access is restricted to published event/result fields, and production event tables remain empty until permitted real-source ingestion begins.

Next: Milestone 2 — source-neutral normalization, validation, matching/deduplication, anomaly detection, and review-queue logic using fixtures only.

Production scope:
- Ventura County
- Los Angeles County
- Orange County
- Riverside County
- San Bernardino County
- San Diego County

Read first:
- `AGENTS.md`
- `docs/CONTINUITY_BRIEF.md`
- `docs/PRODUCT_SPEC.md`
- `docs/DATA_CONTRACT.md`
- `docs/SOURCE_RULES.md`
- `docs/ACCEPTANCE_TESTS.md`
- `docs/CODEX_BUILD_PLAN.md`

Do not implement a live third-party source adapter until its permission/access path is documented. PDGA is optional to the core product and remains disabled pending licensing/data-use clarification.

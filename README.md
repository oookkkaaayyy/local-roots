# Local Roots

Local Roots is a Southern California disc-golf community hub.

The first production feature is the Local Roots Events calendar.

## Event system status

Completed and verified:
- Phase 1 product specification / forensic audit
- Milestone 1 database and domain model
- Milestone 2 normalization, validation, matching/deduplication, review, and source-health engine
- Milestone 4 organizer submissions and authenticated admin operations
- Milestone 5 public `/events` web application and `/admin/events` operations UI

The Local Roots event backend is live in the existing Local Roots/D&U Supabase project under isolated `lr_` objects. Two Edge Functions are active: public event submissions and JWT-protected event administration.

The deployable React/TypeScript/Vite application lives in `app/`. GitHub CI runs both the domain test suite and production web build; the final deployable-state verification passed.

Production event/submission/review/result tables remain intentionally empty until real source data is approved or entered. The six-county scope profile and Local Roots submission source are the only seeded event-system records.

### Next external step

Create the staging Cloudflare Pages deployment from this repository using `docs/STAGING_DEPLOYMENT.md`. No Cloudflare environment variables are currently required.

After staging exists, bootstrap the first authorized admin via Supabase magic-link authentication, then perform end-to-end staging QA and real-data population.

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
- `docs/STAGING_DEPLOYMENT.md`

Do not implement a live third-party source adapter until its permission/access path is documented. PDGA is optional to the core product and remains disabled pending licensing/data-use clarification.

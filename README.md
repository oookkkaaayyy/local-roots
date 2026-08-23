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
- Cloudflare Pages staging deployment: `https://local-roots.pages.dev/`
- initial Local Roots admin authentication/authorization on staging
- first permitted automated production source: user-controlled HB Night Flyers

The Local Roots event backend is live in the existing Local Roots/D&U Supabase project under isolated `lr_` objects. HBNF remains on a separate backend and is read through a dedicated first-party adapter; no HBNF credential values or full raw league-state payloads are stored in Git.

Active Edge Functions:
- `lr-submit-event`
- `lr-admin`
- `lr-sync-hbnf`

The HBNF adapter is scheduled from 05:00 Pacific with bounded automatic retry at 06:00/07:00 after an unhealthy attempt. Its corrected v2 live run processed 31/31 valid records with zero rejections, and an immediate repeat created zero duplicates (31/31 matched). Current canonical data contains 31 published HBNF events, including 10 upcoming events, plus 9 verified Glow result rows.

The first v1 HBNF run failed closed on a provenance timestamp-order constraint. Nothing was published without provenance; the failure remains in source-run history and the corrected v2 implementation passed subsequent live and idempotency verification.

The deployable React/TypeScript/Vite application lives in `app/`. GitHub CI runs the domain test suite and production web build. Live browser requests to `lr_public_events` and authenticated requests to the protected admin function have returned HTTP 200 from staging.

The staging URL remains a QA surface, not final product acceptance.

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

Do not implement another live external source adapter until its permission/access path is documented. PDGA is optional to the core product and remains disabled pending licensing/data-use clarification.

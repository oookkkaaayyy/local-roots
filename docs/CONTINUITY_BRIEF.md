# Local Roots Event Tracker — Continuity Brief

Updated: 2026-08-23

## Current goal
Replace the unreliable Google Sheet event tracker with a production-quality `/events` page on the future Local Roots website, with minimal ongoing labor and carefully controlled implementation scope.

## Current decision
The existing Sheet is not the production foundation. It is a requirements/history/regression-test source.

## Existing live Sheet
ID:
`1cyhmc_Q_XIwcXz1Eu0ITQ-XU9D0GgTXqvPqiQsKfZHs`

Title:
`!CURRENT All SoCal`

## Current infrastructure
- HBNF has its own Supabase backend; leave separate.
- The existing Dyed & Unattached Supabase project is also the Local Roots umbrella backend. Local Roots event-domain objects are isolated with the `lr_` prefix.
- Private GitHub repository `oookkkaaayyy/local-roots` on `main` is the current software/source-control authority for this build.

## Confirmed old-Sheet failures
- public month tabs empty;
- scheduler reports success despite no new listings;
- Event_Database column/schema drift;
- results parser accepted wrong-column values as valid;
- renderer expects older schema;
- no semantic validation;
- unsafe direct promotion replaced the earlier review gate.

## Product requirements preserved
- chronological events;
- month/date behavior;
- registration link;
- course;
- rounds/format;
- TD/club;
- sanctioned/tier;
- top-three results;
- manual overrides;
- audit/provenance;
- daily refresh;
- Local Roots styling later.

## Source/compliance rule
Do not recreate prohibited scraping. Use permissioned APIs/feeds, organizer submissions, permitted club sources, and manual/admin review. PDGA is an optional future enrichment/discovery adapter rather than a dependency of the core product.

## Geographic scope — DECIDED 2026-08-23
Production counties:
- Ventura
- Los Angeles
- Orange
- Riverside
- San Bernardino
- San Diego

Excluded by default:
- Santa Barbara
- Imperial
- Kern
- San Luis Obispo

Scope remains configuration-driven so explicit exceptions or future expansion do not require adapter rewrites.

## Milestone 1 — COMPLETE 2026-08-23
Implemented the isolated Local Roots event-domain database, provenance, review queue, manual overrides, six-county scope, publication safeguards, restricted public access, and regression protections. Transactional acceptance tests passed and production event tables remained clean after rollback fixtures.

GitHub Issue #1 is closed as completed.

## Milestone 2 — COMPLETE 2026-08-23
Implemented and verified the source-neutral ingestion decision layer:
- named-field adapter boundary; positional rows are rejected;
- deterministic normalization and structural validation;
- configuration-driven geography evaluation and explicit exceptions;
- stable external IDs and canonical registration URLs outrank fuzzy similarity;
- same-name events on different dates remain distinct;
- ambiguous/similar conflicting matches route to review;
- source-authority-aware material-change handling;
- event change audit history;
- scheduler, fetch, parse, validation, and data-health states are independent;
- HTTP success/zero-record and severe-collapse anomalies cannot silently clear canonical data;
- repeated disappearance routes to review;
- last-known-good canonical data is preserved through unhealthy source runs;
- exact old-Sheet corruption (`Event Name = 2`, month-like Event ID, `Course = Yes - C-Tier`) is rejected.

Verification:
- TypeScript fixture suite: 29/29 passing;
- live Supabase rollback regression: passed;
- database rollback acceptance suite: passed after catching and repairing pg_trgm schema qualification, county canonicalization, and UUID-ranking defects;
- no live external source adapter, PDGA integration, UDisc/DGS scraping, or frontend work was added;
- Supabase advisor cleanup fixed the safe pre-existing D&U RLS/index warnings plus Milestone 2 change-log FK indexing;
- remaining advisor notices are INFO-level: intentionally private RLS tables with no allow policy and indexes not yet used because the relevant tables have little/no production traffic.

GitHub Issue #2 (`Milestone 2 — Normalization, matching, validation engine`) is complete and should remain the stopping point until the next milestone is explicitly initiated.

## PDGA status
No PDGA agreement or communication is required for the core build. Do not implement a PDGA production adapter until licensing/data-use questions are resolved. Specifically clarify commercial-context use, persistent storage/caching, and results access before enabling PDGA ingestion.

## Next implementation step — Milestone 3
The next bounded step is the first **permitted** production source adapter. Do not start it automatically. Choose a source whose access/reuse basis is documented, then connect it through the Milestone 2 adapter/health/review pipeline without weakening the validation gates.

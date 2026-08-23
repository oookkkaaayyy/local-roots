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
- The existing Dyed & Unattached Supabase project is now also the Local Roots umbrella backend. Existing D&U application tables remain untouched; Local Roots event-domain objects are isolated with the `lr_` prefix.
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

## Important compliance finding
Do not recreate automated website scraping:
- PDGA terms prohibit automated scraping; authorized API route requires applicable permission/license.
- UDisc terms prohibit scraping.
- Disc Golf Scene automated/commercial reuse should not be assumed permitted.

Use permissioned APIs/feeds, organizer submissions, permitted club sources, and manual/admin review. PDGA is an optional future enrichment/discovery adapter rather than a dependency of the core product.

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
Live Local Roots/D&U Supabase now contains:
- `lr_sources`
- `lr_source_runs`
- `lr_source_candidates`
- `lr_events`
- `lr_event_sources`
- `lr_results`
- `lr_manual_overrides`
- `lr_review_queue`
- `lr_scope_profiles`

Implemented safeguards include:
- named-object candidate validation to prevent positional spreadsheet-schema drift;
- date, URL, event-name, and course-field validation;
- publication requires current verification, in-scope geography, and provenance;
- sanctioned published events require an explicit sanction-basis provenance source;
- deterministic manual-override precedence and release behavior;
- restricted public `lr_public_events()` RPC with RLS and column-level grants;
- internal confidence/notes/source payloads/review/admin data unavailable to anonymous readers;
- foreign-key indexes identified by Supabase performance review;
- six-county scope seeded as the one active scope profile.

Verification:
- full transactional Milestone 1 regression suite passed after final security hardening;
- test fixtures rolled back cleanly;
- production Local Roots event/source/result/review/override tables remain empty pending real ingestion;
- Supabase security advisor has no Local Roots WARN findings;
- performance advisor has no remaining Local Roots unindexed-foreign-key findings; unused-index INFO notices are expected while tables are empty.

GitHub Issue #1 (`Milestone 1 — Database and domain model`) is closed as completed. Migrations, tests, and typed domain models are committed to `main`.

## PDGA status
No PDGA agreement or communication is required for the core build. Do not implement a PDGA production adapter until licensing/data-use questions are resolved. Specifically clarify commercial-context use, persistent storage/caching, and results access before enabling PDGA ingestion.

## Next implementation step — Milestone 2
Build the source-neutral normalization/matching/validation engine using fixtures only:
- adapter interface without live third-party fetching;
- normalized candidate validation;
- deterministic identity/deduplication logic;
- source-run health/anomaly states;
- review-queue generation for ambiguity;
- regression fixtures reproducing old Sheet corruption and duplicate/event-change cases.

Do not build live PDGA/UDisc/DGS scraping or the public event UI in Milestone 2.

# Local Roots Event Tracker — Continuity Brief

Updated: 2026-08-23

## Current goal
Replace the unreliable Google Sheet event tracker with a production-quality `/events` page on the future Local Roots website, with minimal ongoing labor and carefully controlled implementation scope.

## Current decision
The existing Sheet is not the production foundation. It is a requirements/history/regression-test source.

## Existing live Sheet
ID: `1cyhmc_Q_XIwcXz1Eu0ITQ-XU9D0GgTXqvPqiQsKfZHs`

Title: `!CURRENT All SoCal`

## Current infrastructure
- HBNF has its own Supabase backend; leave separate.
- The existing Dyed & Unattached Supabase project is also the Local Roots umbrella backend. Local Roots event-domain objects are isolated with the `lr_` prefix.
- Private GitHub repository `oookkkaaayyy/local-roots` on `main` is the current software/source-control authority for this build.
- Local Roots browser app: React + TypeScript + Vite under `app/`.
- Cloudflare Pages staging: `https://local-roots.pages.dev/`.

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
- Local Roots public presentation.

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
- zero-record/severe-collapse anomalies cannot silently clear canonical data;
- repeated disappearance routes to review;
- last-known-good canonical data is preserved;
- exact old-Sheet corruption regressions are rejected.

Verification caught and repaired pg_trgm schema qualification, county canonicalization, and UUID-ranking defects before production ingestion.

## Milestone 3 — DEFERRED
The first third-party production adapter is intentionally deferred until a source with a documented permission/reuse basis is selected. PDGA is not required for the core product.

## Milestone 4 — COMPLETE 2026-08-23
Implemented the operational/review layer without any third-party ingestion dependency:
- `lr_admin_users` authorization registry;
- `lr_event_submissions` with private submitter contact fields;
- public submission -> validation/scope/matching -> review pipeline;
- explicit approve-new / merge / reject workflow;
- canonical provenance on approved/merged submissions;
- manual field overrides and explicit release;
- generic non-submission exception resolution;
- source-health dashboard data;
- admin event-detail API;
- manual event creation backend path.

Active Edge Functions:
- `lr-submit-event`: public submission endpoint; no JWT required; service-role access remains backend-only.
- `lr-admin`: JWT-protected admin endpoint; verifies user and active Local Roots admin/reviewer before privileged actions.

Rollback-only Milestone 4 database acceptance suite passed. It caught and repaired a temporary match-method contract mismatch before any real data was stored.

## Milestone 5 — CODE COMPLETE / BUILD VERIFIED 2026-08-23
Implemented the deployable Local Roots website application:
- public `/events` page;
- chronological event cards;
- month, county, sanction and event-type filtering;
- registration/results links;
- status and stale-verification indicators;
- public organizer/community submission form;
- Local Roots mobile-responsive visual system;
- `/admin/events` magic-link authentication screen;
- pending submission queue;
- approve / merge / reject controls;
- source-health and exception views;
- manual override/release controls.

The browser uses a Supabase publishable key only. Secret/service-role credentials remain exclusively in Supabase Edge Function environments.

GitHub CI:
- root domain tests pass;
- web dependencies install cleanly;
- TypeScript/Vite production build passes;
- final deployable-state verification passed.

## Cloudflare staging — DEPLOYED 2026-08-23
Staging URL: `https://local-roots.pages.dev/`.

The user supplied the live URL after completing the Git-backed Pages setup. Subsequent Supabase API logs recorded live browser requests to `lr_public_events` returning HTTP 200, verifying that the deployed public frontend can reach the public backend read path.

Deployment/connectivity is established. This does not by itself establish final visual/functional acceptance.

## Current data state
- canonical events: 0
- public submissions: 0
- open review items: 0
- source runs/candidates: 0
- event provenance/results: 0
- Local Roots admins: 0
- seeded source registry contains the Local Roots submission source;
- one active six-county scope profile remains.

No fake test event data was left in production.

## Advisor state
The earlier D&U performance/RLS warnings were cleaned up where actionable. Current remaining notices are informational only:
- intentionally private RLS tables have no allow policy;
- indexes on new/empty tables are reported unused because production traffic has not begun.

## PDGA status
No PDGA agreement or communication is required for the core build. Do not implement a PDGA production adapter until licensing/data-use questions are resolved, especially commercial-context use, persistent storage/caching, and results access.

## CURRENT BLOCK / REQUIRED USER STEP
The staging deployment blocker is closed. The next step requires creating the first Supabase Auth user through the normal magic-link flow so that the user can be added to `lr_admin_users` without manually manufacturing an Auth identity.

User action:
1. Open `https://local-roots.pages.dev/admin/events`.
2. Enter an email the user controls and request the magic link.
3. Open the received magic link and complete sign-in.
4. Report only that sign-in is complete; do not send the email, link, code, password, or any authentication material in chat.

After that, continue autonomously with:
1. identify the newly created Auth user and add it to `lr_admin_users` as the initial active admin;
2. verify the protected admin dashboard path;
3. run end-to-end staging QA;
4. test the public submission path;
5. populate/backfill permitted real event data;
6. proceed into source integration and launch-soak/acceptance gates.

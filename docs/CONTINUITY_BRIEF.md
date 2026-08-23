# Local Roots Event Tracker — Continuity Brief

Updated: 2026-08-23

## Current goal
Replace the unreliable Google Sheet event tracker with a production-quality `/events` page on the Local Roots website, with minimal ongoing labor and carefully controlled source permissions.

## Current production foundation
- The old Google Sheet is requirements/history/regression evidence only.
- Current software authority: private GitHub repository `oookkkaaayyy/local-roots` on `main`.
- Browser app: React + TypeScript + Vite under `app/`.
- Staging: `https://local-roots.pages.dev/`.
- Local Roots/D&U backend: Supabase project with isolated `lr_` event-domain objects.
- HBNF remains on its separate Supabase backend and is consumed only through the first-party adapter described below.

## Geographic scope
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

Scope remains configuration-driven.

## Completed milestones
### Milestone 1 — database/domain model
Complete and regression-tested: canonical events, provenance, results, manual overrides, review queue, scope profiles, RLS/public surface, publication safeguards and old-Sheet corruption regressions.

### Milestone 2 — normalization/matching/health
Complete and regression-tested: named-field normalization, deterministic validation, geography evaluation, strong-ID-first matching, fuzzy ambiguity routing, authority-aware change application, source-run health/anomaly logic and last-known-good behavior.

### Milestone 4 — submissions/admin operations
Complete: public submissions, authenticated admin authorization registry, approve/merge/reject workflow, overrides/release, exception resolution, source health, event detail and manual creation paths.

Active functions:
- `lr-submit-event`
- `lr-admin`

### Milestone 5 — public/admin web application
Code complete, CI/build verified and deployed to Cloudflare Pages staging. Public `/events` and protected `/admin/events` are live.

## Staging/auth status — VERIFIED
Staging URL: `https://local-roots.pages.dev/`.

Verified evidence:
- live browser requests to `lr_public_events` return HTTP 200;
- Supabase magic-link redirect allowlist now includes `https://local-roots.pages.dev/admin/events` without changing the shared project's global Site URL;
- first Local Roots Auth user is confirmed and registered as an active Local Roots admin;
- the protected `lr-admin` Edge Function returned HTTP 200 from the authenticated live staging session.

Do not store or reproduce the admin email, magic links, user tokens or other authentication material in project docs/AKS.

## First permitted production adapter — HBNF LIVE
HB Night Flyers is the first real automated production source. It is allowed because it is first-party/user-controlled; this does not authorize scraping or reuse from PDGA, Disc Golf Scene or UDisc.

Source registry key: `hbnf_internal_schedule`.

The adapter:
- reads HBNF's user-controlled `league_state` through the HBNF application's public Supabase API;
- normalizes Skins and Glow Doubles weeks into the Local Roots canonical model;
- keeps HBNF's backend separate;
- stores only normalized event/provenance/results data needed by Local Roots, not the full HBNF state payload;
- uses source external IDs for idempotent matching;
- creates provenance before publication;
- routes source disappearance to review rather than deleting canonical events;
- imports finalized Glow top results with dense ranking and all entries tied at the third-place cutoff;
- records scheduler/fetch/parse/validation/health independently.

### Schedule
`pg_cron` job `local-roots-hbnf-hourly-gate` runs hourly, but the database gate only starts a sync at 05:00 Pacific. If that attempt is unhealthy, it may retry automatically at 06:00 and 07:00 Pacific. A healthy/warning or currently-running attempt suppresses retries. Time-zone evaluation uses `America/Los_Angeles`, so DST is handled without hard-coded UTC offsets.

Scheduler credentials and the HBNF application key are stored in Supabase Vault only. No credential values belong in Git, AKS or user-facing documentation.

### First-run failure and repair
The first `hbnf-direct-v1` live run failed closed when provenance insertion hit `lr_event_sources_seen_order_check`: the client-supplied `last_seen_at` could precede Postgres' generated `first_seen_at` by milliseconds. Publication safeguards prevented any event from becoming public without provenance.

`hbnf-direct-v2` explicitly uses one timestamp for new provenance `first_seen_at`/`last_seen_at`. The failed v1 run is retained as audit evidence; its unpromoted candidate is marked superseded. Source-run finalization was also corrected so fetch/parse failures report validation as `skipped`, not `ok`.

### Verification results
First corrected v2 run:
- records seen: 31
- valid: 31
- rejected: 0
- review required: 0
- canonical HBNF events reconciled: 31
- results rows: 9
- health: healthy

Immediate repeat/idempotency run:
- records seen: 31
- valid: 31
- created: 0
- matched: 31
- rejected: 0
- review required: 0
- missing: 0
- results rows: 9
- health: healthy

Current production event-domain state after the repeat verification:
- canonical/published events: 31
- upcoming events: 10
- completed events: 21
- provenance rows: 31
- result rows: 9
- source runs: 3 (one retained failed v1 plus two healthy v2 verification runs)
- source candidates: 63 (failed-run candidate retained as superseded)
- open review items: 0
- submissions: 0
- active Local Roots admins: 1
- enabled sources: 2 (Local Roots submissions + HBNF)

The 2026-08-22 Glow result correctly includes all third-place-cutoff entries: first place, both second-place ties, and third place.

## Source/compliance rule
Do not recreate prohibited scraping. Use permissioned APIs/feeds, organizer submissions, user-controlled club systems and manual/admin review.

PDGA remains optional. Do not implement a PDGA production adapter until commercial-context use, persistent storage/caching and results rights are clarified in writing under an acceptable agreement/path.

## Advisor state
Current Local Roots database security notices for private `lr_` tables are informational `RLS enabled/no allow policy` findings and are intentional deny-by-default behavior.

Performance notices are currently unused-index INFO findings; do not remove new/foreign-key indexes merely because traffic is still low.

Supabase also reports the project-level Auth warning `Leaked Password Protection Disabled`. Local Roots admin authentication is passwordless magic-link based, so this does not block the Local Roots admin path; review it separately if password-based D&U accounts are used.

## Next work
No user action is currently required for the backend/source layer. Continue with:
1. public staging QA against real HBNF data;
2. public submission end-to-end QA using disposable test data with exact cleanup;
3. protected admin workflow QA;
4. identify additional permitted organizer/club data sources across the six counties;
5. backfill/regression checks and launch-soak preparation;
6. only later, custom-domain/public-launch decisions and optional PDGA communication/integration.

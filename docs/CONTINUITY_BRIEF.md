# Local Roots Event Tracker — Continuity Brief

Updated: 2026-08-23

## Current goal
Replace the unreliable Google Sheet event tracker with a production-quality `/events` page on the future Local Roots website, with minimal ongoing labor and carefully controlled Codex usage.

## Current decision
The existing Sheet is not the production foundation. It is a requirements/history/regression-test source.

## Existing live Sheet
ID:
`1cyhmc_Q_XIwcXz1Eu0ITQ-XU9D0GgTXqvPqiQsKfZHs`

Title:
`!CURRENT All SoCal`

## Existing infrastructure
- HBNF has its own Supabase backend; leave separate.
- Dyed & Unattached has an existing Supabase project with currently empty application tables and is the candidate to become the broader Local Roots backend rather than creating a third active project.
- Private GitHub repository `oookkkaaayyy/local-roots` is created and the ChatGPT/Codex GitHub connector has admin/push access.

## Confirmed existing failures
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

Use permissioned APIs/feeds, organizer submissions, permitted club sources, and manual/admin review.

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

## Required user actions later
1. Complete the PDGA Developer Program registration/license flow while logged into the PDGA account linked to the current membership.
2. Obtain PDGA review/clarification for the Local Roots use case before launch, because the standard REST API page states that no-cost access is for non-commercial use.

## Next implementation step
Finish Milestone 0 without Codex where practical:
- complete repository documentation package;
- scaffold environment/ignore structure;
- establish Supabase linkage without secrets;
- then use one bounded Codex task for Milestone 1 (database/domain model only).

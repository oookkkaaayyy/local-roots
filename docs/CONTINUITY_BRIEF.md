# Local Roots Event Tracker — Continuity Brief

Updated: 2026-08-23

## Current goal
Replace the unreliable Google Sheet event tracker with a production-quality Local Roots `/events` product: broad six-county coverage, low ongoing labor, explicit provenance and source permissions, and failure modes that are visible instead of silently corrupting the public calendar.

## Current production foundation
- Old Google Sheet: requirements/history/regression evidence only; never production source authority.
- Software authority: private GitHub repo `oookkkaaayyy/local-roots` on `main`.
- Browser app: React + TypeScript + Vite under `app/`.
- Staging: `https://local-roots.pages.dev/`.
- Local Roots/D&U backend: Supabase `wtymjxscneufjlkkywyg`, isolated `lr_` event-domain objects.
- HBNF remains on separate Supabase backend `phcpbvuqibyarpfrftgx` and is consumed only through the permitted first-party adapter.

Production counties: Ventura, Los Angeles, Orange, Riverside, San Bernardino, San Diego. Default exclusions: Santa Barbara, Imperial, Kern, San Luis Obispo. Scope is configuration-driven.

## Completed milestones
- **Milestone 1:** canonical event domain, provenance, results, overrides, review queue, scope, RLS/public surface, publication safeguards and old-Sheet corruption regressions.
- **Milestone 2:** normalization, validation, strong-ID matching, fuzzy ambiguity review, field authority, source health/anomalies and last-known-good behavior.
- **Milestone 4:** public submissions, authenticated admins, approve/merge/reject, overrides/release, exception resolution and source-health operations.
- **Milestone 5:** public `/events`, protected `/admin/events`, protected `/admin/readiness`, Cloudflare staging and CI/build verification.

Active Local Roots Edge Functions include `lr-submit-event`, `lr-admin`, `lr-sync-hbnf`, `lr-launch-readiness`, `lr-sync-socal-rss`, and `lr-integrity-watch`.

## Current canonical event state — VERIFIED
- **64 published real events**.
- **17 current/future events** at latest Pacific-time snapshot.
- **0 unpublished canonical events**.
- **0 published events without provenance**.
- **0 sanctioned published events without sanction-basis provenance**.
- **0 stale current/future events** under the 14-day freshness gate.
- 9 HBNF Glow result rows.
- 3 deliberate medium source-conflict reviews remain open.
- 1 active Local Roots admin.

A Pacific-time structural audit of the 64 published rows currently reports:
- 0 missing counties;
- 0 missing cities;
- 0 missing course/venue fields;
- 0 unknown sanction statuses;
- 0 past/future status-date mismatches;
- 0 future rows without verification timestamps;
- 0 duplicate normalized name+date groups;
- 1 sanctioned row without a tier: **Fling XXIX**, intentionally null because its tier is under explicit source-conflict review.

Current future county coverage:
- Ventura 0
- Los Angeles 3
- Orange 10
- Riverside 1
- San Bernardino 2
- San Diego 1

Historical county coverage is broader after the 26-event SoCal backfill. The remaining coverage problem is current/future first-party depth, not total historical representation.

## Staging/auth — VERIFIED
- Public staging is live at `https://local-roots.pages.dev/`.
- Public data is exposed only through the restricted `lr_public_events()` surface; anon/authenticated roles have no direct SELECT on `lr_events`, provenance or review tables.
- First Local Roots admin is active.
- Magic-link auth redirects through live staging.
- Protected admin requests returned HTTP 200.
- `/admin/readiness` exposes launch gates, future-event freshness and county coverage.

Latest public `/events` behavior on `main`:
- default upcoming mode hides every event whose end date is before the current **Pacific** date, independent of stale canonical status labels;
- month choices show only current/future months unless `Show past events` is enabled;
- a selected historical month resets safely when past mode is turned off;
- host and TD labels are distinct (`Hosted by … · TD: …` vs `TD: …`).

Exact-state CI verification passed in workflow run `32678204818`; temporary PR #12 was closed unmerged. Cloudflare then deployed a bundle containing all of those current markers, verified independently by `lr-integrity-watch` v3.

Never store admin emails, magic links, tokens, Vault values or credentials in Git/AKS/docs.

## HBNF first-party production adapter — LIVE
Source key: `hbnf_internal_schedule`.

- user-controlled/first-party;
- reads only application state required for Local Roots;
- normalizes Skins and Glow Doubles;
- stable IDs `hbnf:<mode>:<date>`;
- provenance precedes publication;
- disappearance routes to review, not deletion;
- finalized Glow results preserve third-place ties;
- scheduler/fetch/parse/validation/health remain distinct.

Schedule: 05:00 America/Los_Angeles; bounded 06:00/07:00 retry after unhealthy attempts. Post-retry health watch creates one bounded high-severity exception for a missing/unhealthy required production day.

Verified v2 state:
- 31/31 valid;
- 31 HBNF events/provenance rows;
- 9 Glow result rows;
- repeat after strong-ID hardening: 31 matched, 0 created, 0 rejected.

The real **14-day production soak** starts with first expected day 2026-08-24. At the latest Aug. 23 Pacific check, `daily_run_due=false`, 0/14 days had accrued, and no missed/unhealthy day existed. Do not infer soak progress from manual/test runs.

All production-support cron jobs were verified active, including the HBNF gate, post-retry source-health watch, public-integrity watch, future-event freshness watch and SoCal RSS discovery sentinel.

## SoCal DGC manual factual source — LIVE
Source key: `socal_dgc_manual_calendar`  
URL: `https://socaldiscgolfclub.com/upcoming-events/`

The source states event facts are supplied by tournament directors and compiled/updated by SoCal DGC volunteers. Local Roots uses limited manually verified factual metadata only; it does not crawl linked PDGA/DGS/UDisc pages.

Current state:
- 33 canonical events have SoCal manual provenance.
- 26 missing Feb–Aug in-scope 2026 tournaments were backfilled across all six counties.
- Public corpus expanded from 38 to 64.
- all 33 SoCal provenance rows now use the one real aggregate calendar URL;
- all 33 retain distinct source-scoped external IDs;
- historical backfill migration: `20260823233959_register_socal_manual_source_and_backfill_2026_history`;
- aggregate provenance correction: `20260824010103_allow_shared_provenance_urls_for_aggregate_sources`.

### Important series-year rule
The SoCal page is a **series-year** calendar, not necessarily a calendar-year list. November/December entries can precede January while belonging to the prior calendar year. Never infer the event year from the page title alone. This rule prevented the Dec. 20 Cowtown Christmas Classic listed at the top of the 2026 Series page from being falsely created as a Dec. 2026 future event; a January 2026 SoCal update already described that event as having been played.

### Backfill failure / provenance-model correction
The first 26-event bulk insertion reused the one real SoCal source page while the original schema incorrectly treated `(source_id, source_url)` as unique. Only the first provenance row was accepted, and the publication trigger correctly left the other 25 events unpublished. No unproven event leaked publicly.

A provisional repair used Local Roots-only `#lr-...` URL fragments to satisfy the mistaken uniqueness rule. A later provenance audit correctly identified those fragments as synthetic rather than genuine source anchors. The model was then corrected instead of preserving fake deep links:
- `(source_id, external_id)` remains the unique source-scoped identity key;
- `source_url` is provenance/location, not identity;
- aggregate/calendar sources may legitimately reuse the same actual page URL for many events;
- the source-URL unique index was replaced with a non-unique lookup index;
- all synthetic SoCal fragments were replaced with the actual shared calendar URL.

Rollback regression `supabase/tests/socal_backfill_provenance_acceptance.sql` now proves:
- publication fails closed without provenance;
- distinct source external IDs can share one real aggregate provenance URL;
- a duplicate source-scoped external ID is still rejected.

A later completeness pass filled the SoCal Amateur Championships course field from the permitted source as `Brengle Terrace, Kit Carson, and TBD 3rd Course` and recorded the source-backed change in `lr_event_change_log`.

## SoCal RSS sentinel — LIVE REVIEW ONLY
Source key: `socal_dgc_rss`.

- official WordPress RSS endpoint;
- every six hours;
- zero authoritative fields;
- cannot publish/modify events;
- excluded from production launch soak and authoritative health gates;
- baseline/repeat/401/idempotency QA passed;
- latest scheduled run remained healthy at 10/10 valid, with 0 new items and 0 alerts.

A San Diego Aces RSS endpoint exists but is stale; no scheduler was installed.

## Direct organizer provenance / pending regional sources
### DiscGolfVR360 — live manual provenance
Source key `discgolfvr360_manual`. Current verified use: 2026 Sky High Showdown organizer page confirms Aug. 22–23, Pro B / Am C and Inland Flight Club host.

### Disabled pending direct sources
These registry entries intentionally have `enabled=false`, no authoritative fields and no scheduler:
- `ventura_disc_golf_club_direct` — official Lake Casitas confirms VDGC manages disc-golf events there; current event dates still require a direct club source.
- `conejo_disc_golf_club_direct` — official CRPD confirms CDGC partnership at Rabbit Flats/Sapwi; needed especially for Sapwi conflict resolution.
- `san_diego_aces_direct` — official club identity/contact path, but displayed schedule is stale; direct current source needed.
- `dog_haus_disc_golf_direct` — Mast Park organizer/concession source candidate; storefront lacks reliable current calendar.
- `riverside_parks_martha_direct` — City of Riverside Parks operates Martha McLean and documents a disc-golf-tournament use category; this is a first-party routing path only and does not establish current dates or automation permission.

## Open source conflicts — DO NOT GUESS
1. **Fling XXIX tier:** SoCal says C-Tier; separate registration/sanction observations conflict. Event is public with tier intentionally null.
2. **Sapwi Trails dates:** SoCal says Sep. 26–27; another current listing observed Sep. 26 only. Not published pending direct/permitted verification.
3. **Castaic lineage:** SoCal's July 27 post listed Oct. 3–4 while its maintained current schedule now lists Oct. 17; other registration/search snapshots also disagree on name/date. Retain this schedule-change/conflict history and keep the event unpublished until the clean current organizer verification required by the review item exists.

## Integrity/watch system — VERIFIED
`lr_integrity_watch` is a Vault-secret-gated Edge worker invoked by the database schedule. Version 3 checks the actual Cloudflare deployment rather than treating HTTP 200 as sufficient:
1. fetch Cloudflare staging HTML;
2. verify Local Roots shell/title;
3. extract and fetch the deployed JS bundle;
4. require current readiness markers plus `/events` markers (`Show past events`, `All visible months`, `Hosted by`, `TD:`);
5. check public event/provenance/sanction counts;
6. record a daily integrity snapshot and create bounded anomaly reviews.

Latest forced v3 check after the public-events UI update:
- HTTP 200;
- shell OK;
- bundle `https://local-roots.pages.dev/assets/index-BmliYL6y.js` fetched successfully;
- all required frontend markers present;
- 64 public events;
- 0 provenance gaps;
- 0 sanction-basis gaps;
- 0 integrity anomalies.

The separate future-event freshness watch creates a review if a current/future event exceeds the 14-day verification window and closes the exception after reverification. Current stale future events: 0.

## Launch readiness
`lr_launch_readiness()` controls launch readiness; staging admins consume it through protected `lr-launch-readiness`.

Required gates include:
- HBNF 14 consecutive healthy final daily production runs;
- no high/critical blocking review;
- no published event without provenance;
- no sanctioned event without sanction-basis provenance;
- no stale current/future event under the 14-day gate;
- final mobile/desktop staging smoke check.

Current database/content gates pass except the real HBNF soak, which cannot be accelerated honestly.

## Security/advisor state
- Direct public/authenticated table access to private Local Roots data is denied.
- RLS-with-no-policy INFO findings on private tables are deliberate deny-by-default behavior.
- Duplicate event-source external-ID unique-index WARN was removed by migration `20260823234405_remove_duplicate_event_source_external_id_index`; one source-scoped external-ID uniqueness rule remains.
- Aggregate provenance URLs are intentionally non-unique after migration `20260824010103_allow_shared_provenance_urls_for_aggregate_sources`.
- Remaining performance notices are unused-index INFO findings on young/low-traffic structures; do not remove needed FK/support indexes merely due low current traffic.
- Supabase leaked-password protection WARN is a project/auth-plan feature. Do not incur cost or change shared D&U auth behavior without explicit approval.

## Source/compliance rules
- No PDGA production adapter until commercial-context use, storage/caching, results rights and applicable agreement are clarified.
- No automated Disc Golf Scene or UDisc scraping.
- Registration/results URLs supplied by permitted sources may be retained as outbound links without fetching the linked platform.
- Prefer first-party/user-controlled sources, direct organizer submissions, intentional structured feeds, limited factual manual verification and explicit permission.
- A technically valid but stale feed is not a production source.

## Pending outreach — UNSENT
Gmail contains draft-only outreach for SoCal DGC, San Diego Aces, Lake Casitas/VDGC, DiscGolfVR360, Conejo/CRPD, Dog Haus/Mast Park and City of Riverside/Martha routing. **Do not send without explicit user approval.**

## Autonomous continuation
User explicitly authorized continued safe progress without staying at the computer. The exact-hourly `Continue Local Roots` automation is enabled. Its guardrails prohibit PDGA/DGS/UDisc scraping, external email sends and paid commitments without approval; it may continue safe QA, source-independent implementation, permitted source work, cleanup, documentation and AKS writeback. The tool response after re-enabling it did not provide a concrete next-run timestamp, so no specific future execution time is claimed.

## Next work
1. Observe the real HBNF 14-day production soak beginning Aug. 24.
2. Strengthen current/future first-party coverage, especially Ventura, Riverside and San Diego.
3. Resolve Fling/Sapwi/Castaic only with stronger permitted/direct evidence.
4. Continue staging/mobile/accessibility/functional QA.
5. Keep source, publication, freshness and integrity behavior regression-tested.
6. Later decide custom-domain/public launch and optional PDGA outreach/integration.

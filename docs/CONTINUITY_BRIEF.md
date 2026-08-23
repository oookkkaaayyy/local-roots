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

The real **14-day production soak** starts with first expected day 2026-08-24. Manual/test runs do not count.

## SoCal DGC manual factual source — LIVE
Source key: `socal_dgc_manual_calendar`  
URL: `https://socaldiscgolfclub.com/upcoming-events/`

The source states event facts are supplied by tournament directors and compiled/updated by SoCal DGC volunteers. Local Roots uses limited manually verified factual metadata only; it does not crawl linked PDGA/DGS/UDisc pages.

Current state:
- 33 canonical events have SoCal manual provenance.
- 26 missing Feb–Aug in-scope 2026 tournaments were backfilled across all six counties.
- Public corpus expanded from 38 to 64.
- migration: `20260823233959_register_socal_manual_source_and_backfill_2026_history`.

### Backfill failure/recovery lineage
The first 26-event bulk insertion reused one source URL for all events. The database's unique source-URL invariant accepted only the first provenance row. The publication trigger then correctly kept the other **25 events unpublished**. No unproven event leaked publicly.

Repair:
- unique per-event SoCal provenance anchors;
- missing 25 provenance rows inserted;
- publication only after provenance existed;
- final state 64/64 published, 0 provenance gaps, 0 sanction-basis gaps.

Rollback regression `supabase/tests/socal_backfill_provenance_acceptance.sql` now proves:
- publication fails closed without provenance;
- duplicate same-source URLs cannot silently map to two canonical events;
- unique per-event provenance permits publication.

## SoCal RSS sentinel — LIVE REVIEW ONLY
Source key: `socal_dgc_rss`.

- official WordPress RSS endpoint;
- every six hours;
- zero authoritative fields;
- cannot publish/modify events;
- excluded from production launch soak and authoritative health gates;
- baseline/repeat/401/idempotency QA passed.

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

## Open source conflicts — DO NOT GUESS
1. **Fling XXIX tier:** SoCal says C-Tier; separate registration/sanction observations conflict. Event is public with tier intentionally null.
2. **Sapwi Trails dates:** SoCal says Sep. 26–27; another current listing observed Sep. 26 only. Not published pending direct/permitted verification.
3. **Castaic lineage:** current/older evidence conflicts on name/date history. Not published pending clean organizer/permitted verification.

## Integrity/watch system — VERIFIED
`lr_integrity_watch` is a Vault-secret-gated Edge worker invoked by the database schedule. Version 2 does not merely check for HTTP 200:
1. fetches Cloudflare staging HTML;
2. verifies Local Roots shell/title;
3. extracts the deployed JS bundle;
4. fetches that bundle;
5. requires markers for current readiness features (`Future-event freshness`, `Latest future event`, `Launch gate`);
6. checks public event/provenance/sanction counts;
7. records a daily integrity snapshot and creates bounded anomaly reviews.

Latest forced check after the backfill:
- HTTP 200;
- shell OK;
- deployed JS bundle OK;
- no required markers missing;
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
- Duplicate event-source unique-index WARN was removed by migration `20260823234405_remove_duplicate_event_source_external_id_index`; the original uniqueness constraint remains.
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
User explicitly authorized continued safe progress without staying at the computer. Native ChatGPT tasks cannot recur more than hourly. An hourly Local Roots continuation task has executed at least once; it may continue safe QA, source-independent implementation, permitted source work, cleanup, documentation and AKS writeback. It must not send external email, make paid commitments or use permission-gated sources without approval.

## Next work
1. Observe the real HBNF 14-day production soak beginning Aug. 24.
2. Strengthen current/future first-party coverage, especially Ventura, Riverside and San Diego.
3. Resolve Fling/Sapwi/Castaic only with stronger permitted/direct evidence.
4. Continue staging/mobile/accessibility/functional QA.
5. Keep source, publication, freshness and integrity behavior regression-tested.
6. Later decide custom-domain/public launch and optional PDGA outreach/integration.

# Local Roots Event Tracker — Continuity Brief

Updated: 2026-08-23

## Current goal
Replace the unreliable Google Sheet event tracker with a production-quality `/events` page on the Local Roots website, with minimal ongoing labor and carefully controlled source permissions.

## Current production foundation
- Old Google Sheet: requirements/history/regression evidence only; never production source authority.
- Current software authority: private GitHub repo `oookkkaaayyy/local-roots` on `main`.
- Browser app: React + TypeScript + Vite under `app/`.
- Staging: `https://local-roots.pages.dev/`.
- Local Roots/D&U backend: Supabase project with isolated `lr_` event-domain objects.
- HBNF remains on a separate Supabase backend and is consumed only through the permitted first-party adapter.

## Geographic scope
Production counties: Ventura, Los Angeles, Orange, Riverside, San Bernardino, San Diego.

Default exclusions: Santa Barbara, Imperial, Kern, San Luis Obispo. Scope remains configuration-driven.

## Completed implementation milestones
- **Milestone 1:** canonical database/domain model, provenance, results, manual overrides, review queue, scope, RLS/public surface, publication safeguards, old-Sheet corruption regressions.
- **Milestone 2:** normalization, validation, strong-ID-first matching, fuzzy ambiguity routing, authority-aware changes, source-run health/anomaly handling and last-known-good behavior.
- **Milestone 4:** public submissions, authenticated admin registry, approve/merge/reject, overrides/release, exception resolution, source-health/admin operations.
- **Milestone 5:** public `/events`, protected `/admin/events`, Cloudflare staging deployment and CI/build verification.

Active operational functions include `lr-submit-event`, `lr-admin`, `lr-sync-hbnf`, `lr-launch-readiness`, and `lr-sync-socal-rss`.

## Staging/auth — VERIFIED
- Public staging is live at `https://local-roots.pages.dev/`.
- Public `lr_public_events()` connectivity is verified.
- First Local Roots admin is active.
- Magic-link auth returns through the live staging redirect.
- Protected admin requests have returned HTTP 200.
- `/admin/readiness` is now a protected launch-status page backed by `lr-launch-readiness`.

Do not store admin emails, magic links, tokens, Vault values or other authentication material in Git/AKS/docs.

## HBNF first-party production adapter — LIVE
Source key: `hbnf_internal_schedule`.

Why permitted: HBNF is user-controlled/first-party. This does not authorize PDGA, DGS or UDisc harvesting.

Behavior:
- reads only the HBNF application state needed for Local Roots;
- normalizes Skins and Glow Doubles into canonical events;
- stores normalized event/provenance/results data, not full raw league state;
- uses `hbnf:<mode>:<date>` stable source IDs;
- provenance precedes publication;
- disappearance routes to review instead of deletion;
- finalized Glow results use dense ranking and preserve ties crossing third place;
- scheduler/fetch/parse/validation/health are distinct states.

Schedule: 05:00 America/Los_Angeles; automatic retry at 06:00/07:00 only after unhealthy attempts. A post-retry health watch evaluates the required production day and creates one bounded high-severity exception if the day is missing/unhealthy.

First live v1 run failed closed on provenance timestamp ordering. Publication safeguards prevented publication without provenance. v2 fixed the ordering, preserved the failed run as audit evidence, and corrected fetch/parse failure semantics so validation is `skipped` rather than `ok`.

Verified v2 state:
- 31/31 valid, 0 rejected;
- 31 HBNF canonical events/provenance rows;
- 9 Glow result rows;
- immediate repeat created 0 duplicates and matched all 31.

## Regional SoCal source state
### Manual SoCal DGC calendar
Source key: `socal_dgc_calendar_manual` / current registry equivalent.

The SoCal DGC calendar states its event information is provided by tournament directors and compiled/updated by volunteers. It is used as a **manual factual cross-check**, not a blind HTML crawler.

Current manual regional additions total seven, including:
- Sky High Showdown;
- Fling XXIX at Chavez Ridge;
- Nixon Open;
- NADGT Martha McLean;
- OG Mamas charity event;
- SoCal Championships — Amateurs;
- Billy Goat ~ Fallen Disc Golfers Memorial (2026-11-28, Yucaipa).

A registration URL supplied by this source may be retained as a link without authorizing crawling of the linked service.

### SoCal DGC RSS review-only sentinel — LIVE
Source key: `socal_dgc_rss`.

`https://socaldiscgolfclub.com/feed/` is an intentionally published WordPress syndication feed. It is used only as a low-impact **change detector**:
- runs every six hours;
- has no authoritative event fields;
- cannot publish, unpublish or alter canonical events;
- baseline run establishes the latest-item cursor and does not flood historical posts;
- stores only discovery metadata needed for review;
- relevant new items create review alerts only;
- cursor gaps create one bounded review rather than guessed changes;
- scheduler secret is Vault-backed.

Verified QA:
- baseline: 10/10 valid, healthy, 0 historical alerts;
- immediate repeat: healthy, 0 duplicate/new alerts;
- unauthorized invocation: HTTP 401;
- controlled rewind test: exactly one relevant discovery/review alert, cursor returned to the real latest item;
- disposable discovery/review rows removed afterward, leaving zero QA discovery items/open RSS alerts.

San Diego Aces also exposes a valid WordPress RSS endpoint, but its current feed is stale (last build March 2023), so no scheduler was installed. Direct-source outreach remains the appropriate path.

## Current event-domain state
- **38 published events**.
- At the most recent coverage snapshot, **17 were current/future**.
- 0 published events without provenance.
- 0 sanctioned published events without sanction-basis provenance.
- 3 deliberate medium source-conflict reviews remain open.
- Result rows: 9 HBNF Glow rows.
- Active Local Roots admins: 1.

Current future coverage is strongest in Orange County. Ventura currently has no published event in the canonical corpus; Riverside and San Diego are also sparse. Do not fill those gaps by prohibited scraping.

## Open source conflicts — DO NOT GUESS
1. **Fling XXIX tier:** SoCal says C-Tier; separate registration/sanction observations conflict. Event is public with tier intentionally null.
2. **Sapwi Trails dates:** SoCal says Sep 26–27; another current listing observed Sep 26 only. Not published pending clean permitted verification.
3. **Castaic lineage:** current/older evidence conflicts on name/date history. Not published pending a clean organizer/permitted current source.

## Public submission workflow — VERIFIED
Disposable live QA passed: HTTP 201 submission, valid/in-scope candidate, review routing, admin rejection, then exact cleanup with no QA event/candidate/review rows remaining.

## Launch readiness / production soak
`lr_launch_readiness()` is the controlling launch gate. Direct execution is restricted; staging admins consume it through protected `lr-launch-readiness`.

Launch requires, at minimum:
- configured scheduled production sources completing their required soak;
- no published event without provenance;
- no sanctioned published event without sanction basis;
- no blocking high/critical review item.

HBNF requires **14 consecutive healthy final daily production runs**. Manual/test runs do not count. A missing/unhealthy final required day breaks the streak. Current real soak began with the first expected HBNF production day on 2026-08-24; do not claim completion until the real gate reports it.

## Public/frontend QA — CURRENT
Recent staging hardening:
- current/past filtering uses `America/Los_Angeles`, not UTC;
- date-only labels are viewer-timezone-stable;
- completed/canceled events do not show active Registration buttons;
- stale verification copy says to confirm details before traveling;
- result division labels are normalized for display;
- mobile admin navigation retains Admin and Launch Status links;
- stale predeployment configuration copy was removed.

Full GitHub CI has passed against the current staging UI state (domain tests, TypeScript, production Vite build). Temporary verification PRs were closed unmerged.

## Security/advisor state
- Private Local Roots tables intentionally have RLS enabled with no public allow policy; Supabase reports these as informational `rls_enabled_no_policy` notices.
- Performance notices are currently unused-index INFO findings. Do not remove supporting/new foreign-key indexes merely because traffic is still low.
- Supabase reports project-level `Leaked Password Protection Disabled`. Local Roots admin uses passwordless magic links, so this does not block Local Roots. Because the project is shared with D&U, do not change this global auth setting without confirming the effect on any password-based D&U flow.

## Source/compliance rules
- No PDGA production adapter until commercial-context use, storage/caching, results rights and applicable agreement are clarified.
- No automated DGS/UDisc scraping.
- Prefer user-controlled systems, organizer submissions, intentional structured feeds, manual factual verification and explicit permission.
- A technically valid but stale feed is not worth scheduling.

## Pending outreach artifacts
Gmail contains unsent draft-only outreach for SoCal DGC, San Diego Aces, Lake Casitas/VDGC contact routing, and DiscGolfVR360/source-feed routing. **Do not send without explicit user approval.** Draft existence is not permission.

## Autonomous continuation
The user explicitly authorized continued safe progress without needing to remain at the computer. An hourly Local Roots continuation condition-watch is enabled. It may perform safe QA, source-independent implementation, permitted feed/source work, cleanup, documentation and AKS writeback. It must not send external email, make paid commitments, or use prohibited/permission-gated sources without the required approval.

## Next work
No user action is currently required. Continue with:
1. real 14-day HBNF production-soak observation and source-health monitoring;
2. broader permitted/direct organizer coverage, especially Ventura, Riverside and San Diego;
3. resolve the three conflicts only when stronger permitted evidence exists;
4. ongoing staging/mobile/accessibility/functional QA;
5. keep source/permission and launch-readiness behavior regression-tested;
6. later custom-domain/public-launch decision and optional PDGA outreach/integration.

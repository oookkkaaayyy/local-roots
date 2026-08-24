# Local Roots Events — Source Registry

Updated: 2026-08-23

This is a source/relationship registry, not blanket authorization to automate. Registration-platform URLs may be retained as outbound links when supplied by permitted sources, but PDGA, Disc Golf Scene, and UDisc are not fallback ingestion sources.

## Current verified corpus

- **64 published real events**.
- **17 current/future events** at the latest Pacific-time snapshot.
- **0 unpublished canonical events**.
- **0 published events without provenance**.
- **0 sanctioned published events without sanction-basis provenance**.
- **0 stale current/future events** under the 14-day freshness gate.
- 3 deliberate medium source conflicts remain open: Fling tier, Sapwi dates, Castaic lineage.

The public integrity worker independently verifies the Cloudflare shell, the currently deployed JavaScript bundle, required launch/readiness feature markers, public corpus counts and provenance/sanction invariants. Its latest forced check saw 64 events, HTTP 200, the expected deployed bundle, and zero anomalies.

## Live production / discovery sources

### HB Night Flyers — LIVE AUTOMATED / FIRST PARTY
Source key: `hbnf_internal_schedule`  
Coverage: Orange County HBNF events.

Why permitted: HBNF is user-controlled/first-party. HBNF remains on its separate backend; Local Roots stores only normalized event/provenance/result data needed for the calendar.

Verified:
- 31 canonical HBNF events and provenance rows;
- 9 Glow result rows;
- v2 adapter healthy;
- strong-ID repeat sync: 31/31 valid, 31 matched, 0 created, 0 rejected;
- 05:00 America/Los_Angeles production run with bounded 06:00/07:00 unhealthy-run retries;
- 14-day real production soak begins with first expected day 2026-08-24.

### Local Roots event submissions — LIVE DIRECT / REVIEW REQUIRED
Source key: `local_roots_submissions`.

- Public direct-submission path.
- Never authoritative until explicit admin review.
- Submission → validation → review → admin-decision workflow passed disposable end-to-end QA.

### SoCal Disc Golf Club manual calendar — LIVE MANUAL FACTUAL SOURCE
URL: https://socaldiscgolfclub.com/upcoming-events/  
Source key: `socal_dgc_manual_calendar`.

The calendar states that event information is provided by tournament directors and compiled/updated by SoCal DGC volunteers. Local Roots uses it for limited factual verification/backfill, not blind crawling.

Policy:
- no calendar-page crawler without separate permission or approved structured access;
- limited factual metadata + source/outbound links only;
- no article prose copying;
- linked PDGA/DGS/UDisc pages are not fetched as part of this source;
- source conflicts route to review;
- publication requires provenance first;
- the page is organized by **series year**, not necessarily calendar year. Opening November/December entries may belong to the prior calendar year. Never infer the calendar year from the page title alone; validate chronology before promotion. The Dec. 20 Cowtown Christmas Classic shown before January on the 2026 Series page had already occurred by the club's Jan. 21, 2026 update and must not be created as a Dec. 2026 future event.

Current verified state:
- **33 canonical events have SoCal manual provenance**;
- a 26-event Feb–Aug 2026 historical backfill expanded the public corpus from 38 to 64;
- historical additions span all six production counties: LA 9, Orange 1, Riverside 2, San Bernardino 6, San Diego 6, Ventura 2;
- all 33 SoCal provenance rows now point to the real shared calendar URL;
- all 33 have distinct source-scoped external IDs;
- historical backfill migration: `20260823233959_register_socal_manual_source_and_backfill_2026_history`;
- aggregate-provenance correction: `20260824010103_allow_shared_provenance_urls_for_aggregate_sources`.

### Backfill failure / provenance-model correction
The first backfill attempt reused the one real SoCal calendar URL for all 26 events while the schema incorrectly required `(source_id, source_url)` to be unique. Only one provenance row was therefore accepted, and the publication safeguard correctly kept the other 25 events unpublished. No unproven event leaked publicly.

The first repair restored publication by assigning Local Roots-only `#lr-...` fragments, but a later provenance audit correctly identified those fragments as synthetic rather than genuine page anchors. The **model** was then fixed instead of preserving fake deep links:
- `(source_id, external_id)` remains the unique source-scoped identity key;
- `source_url` is provenance/location, not identity;
- aggregate/calendar sources may legitimately reuse the same real page URL across many events;
- the unique source-URL index was replaced with a normal lookup index;
- all synthetic SoCal fragments were replaced by `https://socaldiscgolfclub.com/upcoming-events/`.

The rollback regression now proves both sides of the rule: publication fails closed without provenance; two distinct source external IDs may share one aggregate provenance URL; a duplicate source-scoped external ID still fails.

### SoCal Disc Golf Club RSS — LIVE REVIEW-ONLY SENTINEL
URL: https://socaldiscgolfclub.com/feed/  
Source key: `socal_dgc_rss`.

- Official WordPress RSS endpoint.
- Checked every six hours.
- Discovery-only with zero authoritative event fields.
- Cannot publish or modify events.
- Excluded from production launch soak and authoritative source-health gates.
- Baseline 10/10 valid and healthy; repeat idempotent; unauthorized request returned HTTP 401.
- Private cursor/discovery tables explicitly deny anon/authenticated direct table access in addition to RLS.

### DiscGolfVR360 — LIVE MANUAL DIRECT-ORGANIZER PROVENANCE
URL: https://discgolfvr360.com/  
Source key: `discgolfvr360_manual`.

Organizer-owned public event pages may be used for limited manual factual verification; no automated crawling or article-prose copying.

Current verified use:
- 2026 Sky High Showdown organizer page independently confirms Aug. 22–23, Pro B-Tier / Am C-Tier and Inland Flight Club host.

## Permission-gated / pending direct sources

These records intentionally exist in the source registry with `enabled=false`, zero authoritative fields and no scheduler. They document the correct acquisition path without pretending a feed exists.

### Ventura Disc Golf Club
Source key: `ventura_disc_golf_club_direct`  
Official operator reference: https://www.casitaswater.org/disc-golf

Lake Casitas states all disc-golf events there are managed by Ventura Disc Golf Club. This establishes organizer identity, not current event dates. Direct organizer submission/feed or explicit permission is still needed.

### Conejo Disc Golf Club
Source key: `conejo_disc_golf_club_direct`  
Official relationship reference: https://www.crpd.org/agreements

Conejo Recreation & Park District identifies CDGC as its partner for support, maintenance, operation and promotion of disc golf at Rabbit Flats and Sapwi Trails. This is the preferred direct path for Ventura coverage and the unresolved Sapwi date conflict.

### San Diego Aces
Source key: `san_diego_aces_direct`  
URL: https://sandiegoaces.com/

The official site provides club/contact identity and invites current event details, but its displayed Upcoming Events material is stale. No scheduler is installed. A direct current feed/submission is required.

### Dog Haus Disc Golf Shop / Mast Park
Source key: `dog_haus_disc_golf_direct`  
URL: https://doghausdg.com/

Dog Haus is the Mast Park concessionaire and a recurring local event organizer, but its storefront does not expose a reliable current calendar. Use a direct organizer source/submission; do not substitute DGS scraping.

### City of Riverside Parks / Martha McLean
Source key: `riverside_parks_martha_direct`  
URL: https://www.riversideca.gov/park_rec/

City of Riverside Parks, Recreation and Community Services operates Martha McLean Memorial Park and its published fee schedule includes a Martha McLean Disc Golf Tournament category. This establishes a first-party routing/venue-authority path only. The source is disabled until a direct organizer feed/submission or explicit permission exists; it does not establish current tournament dates.

## County coverage priorities

Current **future** public coverage:
- Ventura: 0
- Los Angeles: 3
- Orange: 10
- Riverside: 1
- San Bernardino: 2
- San Diego: 1

Historical coverage is materially broader after the SoCal backfill. The remaining problem is not whether those counties have ever been represented; it is establishing reliable **current/future first-party coverage**, especially Ventura, Riverside and San Diego.

### Riverside
Current future public event: Oct. 4 NADGT at Martha McLean, represented through the SoCal manual source. The disabled `riverside_parks_martha_direct` record now preserves the first-party City Parks route to the current Martha McLean organizer/club. An unsent routing draft exists; no direct feed is active.

### Los Angeles
Los Angeles Disc Golf Club / California Disc Golf Series remains an important repeat-organizer candidate. Its official series page is reachable, but current tooling does not reliably expose rendered event data. Do not reconstruct the series from registration-platform copies.

### San Bernardino
Current future coverage includes Sky High and Billy Goat. Yucaipa/Inland organizer relationships remain worthwhile direct-source candidates.

## Open source conflicts — DO NOT GUESS

1. **Fling XXIX tier:** SoCal says C-Tier; separate registration/sanction observations conflict. Event remains public with tier intentionally null.
2. **Sapwi Trails dates:** SoCal says Sep. 26–27; another current listing observed Sep. 26 only. Not published pending clean direct/permitted verification.
3. **Castaic lineage:** SoCal's July 27 post listed Oct. 3–4, while the maintained schedule now lists Oct. 17; registration/search snapshots have also disagreed on name/date. This is retained as an explicit schedule-change/conflict history and remains unpublished pending the clean current organizer verification already required by the review item.

## PDGA / Disc Golf Scene / UDisc

### PDGA Developer API — DISABLED
Potential sanctioned-event enrichment only; not the product backbone.

Do not build production ingestion under the stock public agreement until commercial-context use, persistent storage/caching, results access and appropriate program status are clarified in acceptable written terms.

### Disc Golf Scene / UDisc
Do not scrape or treat these services as fallback production sources. A permitted source may provide a registration/results URL that Local Roots displays as an outbound link without fetching the linked service.

## Current outreach drafts — UNSENT
Do not send without explicit user approval.

- SoCal DGC — permission/feed request
- San Diego Aces — current source/feed request
- Lake Casitas — route to current Ventura Disc Golf Club source
- DiscGolfVR360 — preferred first-party event source/feed request
- Conejo Recreation & Park District — route to current Conejo Disc Golf Club source
- Dog Haus Disc Golf Shop — Mast Park event-source request
- City of Riverside Parks — route to current Martha McLean club/organizer source

## Reliability rules

- A non-null external ID is a strong identity key within one source. `(source_id, external_id)` is unique.
- `source_url` is provenance/location, not identity; a real aggregate/calendar URL may support multiple canonical events.
- Never fabricate URL fragments merely to satisfy a database uniqueness rule.
- Provenance must exist before publication.
- Sanctioned publication requires sanction-basis provenance.
- Source omission does not silently delete canonical events.
- Discovery-only sources cannot satisfy production soak or authoritative health gates.
- A technically valid but stale feed is not worth scheduling.
- Series-year pages must not be interpreted as calendar-year pages without event-level date validation.
- Missing organizers are explicit coverage gaps, not invisible parser failures.

## Source onboarding order

1. HBNF — live first-party automated source
2. Local Roots organizer submissions — live direct source
3. SoCal DGC — live manual factual source + review-only RSS
4. Direct Ventura/VDGC + Conejo sources
5. San Diego Aces + Dog Haus/Mast Park
6. Riverside/Martha direct organizer source
7. Yucaipa/Inland organizers
8. Los Angeles/CDGS organizer network
9. NADGT / other repeat organizers
10. PDGA only if acceptable written terms are obtained
11. Other organizers as discovered

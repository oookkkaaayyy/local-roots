# Local Roots Events — Seed Source Registry

Updated: 2026-08-23

This is a source/relationship registry, not blanket authorization to automate. Registration-platform URLs may be retained as outbound links when supplied by permitted sources, but PDGA, Disc Golf Scene, and UDisc are not fallback ingestion sources.

## Current production / discovery sources

### HB Night Flyers — LIVE AUTOMATED / FIRST PARTY
Source key: `hbnf_internal_schedule`  
Coverage: Orange County HBNF events

Status:
- user-controlled/first-party production source;
- HBNF remains on its separate backend;
- Local Roots stores normalized event/provenance/result data only;
- authoritative scheduled source subject to launch soak.

Verification:
- 31 published HBNF events;
- 31 provenance rows;
- 9 Glow result rows;
- current v2 adapter healthy;
- repeat/manual sync after strong-ID hardening: 31/31 valid, 31 matched, 0 created, 0 rejected;
- daily 05:00 America/Los_Angeles schedule with bounded unhealthy-run retry at 06:00/07:00.

### Local Roots event submissions — LIVE DIRECT / REVIEW REQUIRED
Source key: `local_roots_submissions`

Status:
- public direct-submission path;
- never authoritative until explicit admin review;
- live submission → review → admin-decision workflow has passed disposable end-to-end QA.

### SoCal Disc Golf Club — LIVE MANUAL CROSS-CHECK ONLY
URL: https://socaldiscgolfclub.com/upcoming-events/  
Source key: `socal_dgc_manual_calendar`

The page states that event information is provided by tournament directors and compiled/updated by SoCal DGC volunteers. Local Roots therefore uses it for limited manual factual verification/backfill, not blind automated promotion.

Policy:
- no calendar-page crawler without separate permission or approved structured access;
- limited factual metadata + links only;
- no article prose copying;
- source conflicts route to review.

Verified manual backfill currently includes seven regional events, including Billy Goat / Fallen Disc Golfers Memorial on Nov. 28, 2026. Total public corpus is currently 38 events.

Current conflicts held for review:
- Fling XXIX tier;
- Sapwi Trails 2026 duration/date;
- Castaic 2026 name/date lineage.

### SoCal Disc Golf Club RSS — LIVE REVIEW-ONLY SENTINEL
URL: https://socaldiscgolfclub.com/feed/  
Source key: `socal_dgc_rss`

Status:
- official WordPress RSS syndication endpoint;
- checked every six hours;
- discovery-only with zero authoritative event fields;
- cannot publish or modify events;
- excluded from production launch soak and authoritative-source health gates.

QA:
- baseline 10/10 valid, healthy, zero historical alerts;
- repeat healthy/idempotent;
- unauthorized request HTTP 401;
- controlled alert test completed and cleaned up;
- private cursor/discovery bookkeeping tables now explicitly revoke all anon/authenticated table privileges in addition to RLS.

### DiscGolfVR360 — LIVE MANUAL DIRECT-ORGANIZER PROVENANCE
URL: https://discgolfvr360.com/  
Source key: `discgolfvr360_manual`

Status:
- organizer-owned public event pages may be used for manual limited factual verification;
- no automated crawling is enabled;
- no article prose is copied.

Current verified use:
- organizer page for the 2026 Sky High Showdown independently confirms Aug. 22–23, Pro PDGA B-Tier / Am PDGA C-Tier, and Inland Flight Club as host;
- attached as independent organizer provenance to the existing Sky High canonical event;
- canonical Sky High host is now `Inland Flight Club`; tier remains supported as `B/C`.

## Regional / official-data candidate

### PDGA Developer API — DISABLED
Potential coverage: all six counties, sanctioned events.

Status:
- optional enrichment only, not product backbone;
- disabled pending licensing/data-use clarification;
- do not build production ingestion under the stock public agreement.

Open issues include commercial-context permission, persistent storage/caching, results access, and appropriate Authorized Developer vs. Technology Partner treatment.

## Ventura County

Current future public-event coverage: **0**.

### Ventura Disc Golf Club / Lake Casitas
Official operator reference: https://www.casitaswater.org/disc-golf

Verified first-party facts:
- Lake Casitas says disc-golf events are managed by Ventura Disc Golf Club;
- the long-running Casitas relationship documents an annual Coyote Classic in October;
- the current 2026 closure page still lists Coyote Disc Golf Course closure dates as TBA, so it does not establish a specific 2026 tournament date.

Status:
- high-priority direct organizer source;
- do not fill the Ventura gap from DGS/PDGA alone;
- unsent Lake Casitas Gmail draft asks to route Local Roots to the current VDGC event contact/source.

### Conejo Disc Golf Club / Sapwi Trails / Rabbit Flats
Official relationship references:
- https://www.crpd.org/agreements
- https://conejorec.specialdistrict.org/sapwi-trails-community-park

Verified first-party facts:
- Conejo Recreation & Park District formally identifies Conejo Disc Golf Club as its partner for support, maintenance, operation, and promotion of disc golf at Rabbit Flats and Sapwi Trails;
- official pages do not currently expose an event calendar adequate to resolve the Sapwi 2026 conflict.

Status:
- high-priority direct club source;
- unsent CRPD Gmail draft requests the current CDGC contact/first-party event source.

## Los Angeles County

Current future public-event coverage: **3**.

### Los Angeles Disc Golf Club / California Disc Golf Series
Official series URL: https://losangelesdg.com/Losangelesdiscgol/shop/page/californiadiscgolfseries

Status:
- important repeat-organizer source;
- official series page is reachable but current tooling does not reliably expose rendered event data;
- do not reconstruct the series from registration-platform copies; pursue direct/structured organizer source.

### Discsports in Southern California / Chavez Ridge network
Status:
- candidate organizer/community sources;
- Fling XXIX is represented through manual SoCal verification with tier conflict held in review.

## Orange County

Current future public-event coverage: **10**.

HBNF supplies the current strong first-party local baseline. Additional Surf City/Huntington Beach and overlapping La Mirada/CDGS organizer relationships remain useful for broader tournament coverage.

## Riverside County

Current future public-event coverage: **1**.

### Martha McLean organizer network
Known organizer relationships include Martha McLean Disc Golf Club, Los Angeles Disc Golf Club/CDGS, NADGT, Dude Where's My Par?!, and other local league organizers.

Status:
- Oct. 4, 2026 NADGT event is currently published from manual regional verification;
- broader weekly/local activity exists, but UDisc/DGS are not approved ingestion sources;
- priority is a direct local club/organizer source.

Official City of Riverside Parks contact path:
- https://www.riversideca.gov/park_rec/info-contact/department-contacts
- `parks@riversideca.gov`

An unsent Gmail draft asks the City to route Local Roots to the current Martha McLean disc-golf club/organizer source.

## San Bernardino County

Current future public-event coverage: **2**.

### Yucaipa / Inland organizer network
Relevant organizer/event families include Yucaipa Open, Yucaipa Summer Slam, Billy Goat / Fallen Disc Golfers Memorial, Ice Bowl, and Innova Replay.

Status:
- Billy Goat / Fallen Disc Golfers Memorial is published through manual SoCal verification;
- DiscGolfVR360 now provides direct-organizer provenance for Sky High Showdown through Inland Flight Club;
- Yucaipa/other Inland organizer relationships remain worthwhile for direct submissions.

### Glen Helen organizer network
Status: candidate direct organizer source.

## San Diego County

Current future public-event coverage: **1**.

### San Diego Aces Disc Golf Club
URL: https://sandiegoaces.com/

Status:
- high-priority direct relationship/submission/feed source;
- current site is useful for club identity/contact, but its event/RSS material tested stale (latest feed state from 2023), so it is not scheduled;
- site explicitly invites ongoing event details, supporting a direct relationship model;
- unsent Gmail draft requests a current first-party calendar/feed/submission path.

### Mast Park / Dog Haus Disc Shop / City of Santee
Official references:
- https://www.cityofsanteeca.gov/our-community/parks-recreation/disc-golf
- https://www.cityofsanteeca.gov/our-community/parks-recreation/parks-fields-trails/mast-park

Verified first-party facts:
- City of Santee identifies Dog Haus as the Mast Park disc-golf concessionaire;
- city material says the concessionaire has hosted quarterly disc-golf tournaments;
- city publishes `doghausdiscshop@gmail.com` as the disc-golf contact;
- city pages do not provide current tournament dates sufficient for publication.

Status:
- promising direct first-party San Diego source;
- unsent Dog Haus Gmail draft requests its preferred current event calendar/feed/direct-submission path.

### Kit Carson / Escondido and Chingones networks
Status:
- organizer/direct-submission candidates;
- no independent current first-party structured source has yet been located;
- do not reconstruct current inventory from PDGA/DGS as a fallback.

## National / repeat organizer sources

### NADGT
Status:
- occasional regional organizer, especially Riverside;
- candidate direct/permissioned feed or organizer submission source;
- current Martha event remains represented through manual regional verification.

## Current outreach drafts — UNSENT
Do not send without explicit user approval.

- SoCal Disc Golf Club — permission/feed request
- San Diego Aces — current source/feed request
- Lake Casitas — route to current Ventura Disc Golf Club source
- DiscGolfVR360 — preferred first-party event source/feed request
- Conejo Recreation & Park District — route to current Conejo Disc Golf Club source
- Dog Haus Disc Shop — Mast Park event-source request
- City of Riverside Parks — route to current Martha McLean disc-golf club/organizer source

## Source onboarding order

1. HB Night Flyers — live first-party automated source
2. Local Roots organizer submissions — live direct source
3. SoCal DGC — live manual cross-check + review-only RSS sentinel
4. Direct Ventura/Conejo organizer paths — close Ventura gap
5. San Diego Aces + Dog Haus/Mast Park — strengthen San Diego local coverage
6. Riverside/Martha direct organizer path — strengthen Riverside local coverage
7. Yucaipa/Inland organizer network
8. Los Angeles/CDGS organizer network
9. NADGT / other repeat organizers
10. PDGA — only if acceptable written licensing/data-use terms are obtained
11. other organizers as discovered

## Reliability rule

A non-null external ID is a strong identity key **within one source**. The database enforces uniqueness of `(source_id, external_id)` so one source record cannot silently map to multiple canonical events.

## Why this is better than the old Sheet

The old Sheet treated a short URL list as if it represented complete coverage. The new system treats coverage as a measurable network of first-party sources, organizer submissions, manual regional verification, review-only discovery feeds, permissioned direct sources, optional authorized official data, provenance, health checks, and explicit review queues.

Missing an organizer is a visible coverage gap instead of an invisible parser failure.

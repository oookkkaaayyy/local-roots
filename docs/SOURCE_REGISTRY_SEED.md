# Local Roots Events — Seed Source Registry

Updated: 2026-08-23

This is a source/relationship registry, not blanket authorization to automate.

## Current production source status

### HB Night Flyers — LIVE AUTOMATED / FIRST PARTY
Coverage: Orange County HBNF events  
Source key: `hbnf_internal_schedule`

Status:
- permitted automated production source;
- first-party/user-controlled;
- HBNF remains on its separate backend;
- Local Roots stores normalized event/provenance/result data only.

Verification:
- 31 published HBNF events;
- 31 provenance rows;
- 9 Glow result rows;
- corrected v2 run healthy;
- immediate repeat matched all 31 and created zero duplicates;
- daily 05:00 America/Los_Angeles schedule with bounded unhealthy-run retry at 06:00/07:00.

### SoCal Disc Golf Club — LIVE MANUAL CROSS-CHECK ONLY
URL: https://socaldiscgolfclub.com/upcoming-events/  
Source key: `socal_dgc_manual_calendar`  
Coverage: regional series across the selected SoCal scope

The page states that event information is provided by tournament directors and compiled/updated by SoCal DGC volunteers. Local Roots therefore uses it for manual factual verification and limited factual backfill, not blind automated promotion.

Production policy:
- no calendar-page crawler without separate permission or approved structured access;
- store limited factual event metadata and links only;
- do not copy article prose;
- registration platforms may be retained as outbound links but are not unapproved ingestion sources;
- source conflicts route to review rather than being silently resolved.

Verified manual backfill currently includes seven regional events. The seventh is Billy Goat / Fallen Disc Golfers Memorial, Nov. 28, 2026 in Yucaipa. Total Local Roots public corpus is currently 38 events.

Current conflict handling:
- Fling XXIX remains public but `tier` is intentionally null while source evidence conflicts;
- Sapwi Trails 2026 remains held for review because the SoCal calendar currently describes Sep. 26–27 while stronger event-specific evidence conflicts on duration;
- Castaic 2026 remains held for review because event name/date lineage is inconsistent across available evidence.

This source is useful, but the observed conflicts demonstrate why it must not become a blind auto-promote adapter.

### SoCal Disc Golf Club RSS — LIVE REVIEW-ONLY SENTINEL
URL: https://socaldiscgolfclub.com/feed/  
Source key: `socal_dgc_rss`

Status:
- official WordPress RSS syndication endpoint;
- checked every six hours;
- discovery-only: zero authoritative event fields;
- can create review alerts for new relevant posts, but cannot publish or modify events;
- intentionally excluded from production launch-soak and authoritative-source health gates.

QA:
- baseline: 10/10 valid, healthy, zero historical alerts;
- repeat run: healthy, zero duplicates/new alerts;
- unauthorized request: HTTP 401;
- controlled alert-path test completed and disposable test state was removed.

## Regional / primary

### PDGA Developer API
Coverage: all six counties, sanctioned events

Potential role if separately authorized:
- sanctioned event discovery;
- event identity;
- date/location/tier/TD;
- registration URL when authorized and supplied.

Status:
- disabled pending licensing/data-use clarification;
- do not build production ingestion under the stock public agreement.

Important constraints/questions:
- current public agreement appears to prohibit caching/storing PDGA Data except record IDs for backend matching;
- commercial-context use requires clarification;
- public developer docs do not expose a documented event-results/standings endpoint;
- persistent event metadata/results use requires explicit written permission or alternate terms;
- PDGA membership alone is not treated as production authorization.

## Ventura County

Current future public-event coverage: **0**.

### Ventura Disc Golf Club / Lake Casitas
Official operator reference: https://www.casitaswater.org/disc-golf

Verified first-party facts:
- Casitas Municipal Water says Lake Casitas hosts tournaments/seasonal events with the Ventura disc-golf organization and that events are managed by Ventura Disc Golf Club;
- the long-running Casitas agreement identifies VDGC as the course sponsor/operator and describes the annual Coyote Classic as a three-day October event;
- the current 2026 Casitas closure page does not yet publish Coyote Disc Golf Course closure dates (`TBA`), so it is not sufficient to establish a specific 2026 tournament date.

Status:
- high-priority organizer/direct-submission source;
- do not fill the current Ventura gap from Disc Golf Scene/PDGA alone;
- unsent Gmail draft exists asking Lake Casitas to route Local Roots to the current VDGC event contact/source.

### Conejo Disc Golf Club / Sapwi Trails / Rabbit Flats
Official operator/relationship references:
- https://www.crpd.org/agreements
- https://conejorec.specialdistrict.org/sapwi-trails-community-park

Verified first-party facts:
- Conejo Recreation & Park District formally identifies Conejo Disc Golf Club as its partner for support, maintenance, operation, and promotion of disc golf at Rabbit Flats and Sapwi Trails;
- the official park page identifies CDGC as a Sapwi user group and gives CRPD park contact information;
- these official pages do not currently provide an event calendar adequate to resolve the Sapwi 2026 date conflict.

Status:
- high-priority direct club source for Ventura County;
- unsent Gmail draft exists to CRPD requesting the current CDGC contact or first-party event source.

## Los Angeles County

### Los Angeles Disc Golf Club / California Disc Golf Series
Official series URL: https://losangelesdg.com/Losangelesdiscgol/shop/page/californiadiscgolfseries

Status:
- important repeat-organizer relationship/submission source;
- official series page is reachable, but current tooling does not reliably expose its rendered event data, so Local Roots should not reconstruct the series from copies on registration platforms;
- pursue direct/structured organizer source before automating.

### Discsports in Southern California
Observed host relationship:
- The Fling at Chavez Ridge

Status:
- candidate organizer source;
- Fling XXIX is currently represented through the manual SoCal cross-check source with an open tier-conflict review.

### Chavez Ridge / Nothing But Chains
Status:
- candidate organizer/community source for Chavez Ridge local events.

## Orange County

### Huntington Beach / Surf City organizer network
Status:
- organizer source(s) should be identified/permissioned for unsanctioned/local events beyond HBNF;
- HBNF already supplies a strong first-party Orange County baseline.

### La Mirada / CDGS organizer network
Note: La Mirada is in Los Angeles County, but organizers and player community overlap heavily with Orange County.

Status:
- important repeat-series organizer source; see LADGC/CDGS above.

## Riverside County

Current future public-event coverage: **1**.

### Martha McLean / local organizer network
Observed organizer relationships:
- Los Angeles Disc Golf Club / CDGS
- National Amateur Disc Golf Tour
- Dude Where's My Par?!

Status:
- multiple organizer sources; use canonical dedupe;
- Oct. 4, 2026 NADGT event is currently published from manual regional verification;
- broader weekly/local activity is known to exist, but UDisc is not an approved ingestion source and must not be scraped;
- priority is a direct local organizer/club submission/feed relationship.

## San Bernardino County

Current future public-event coverage: **2**.

### Yucaipa Disc Golf Club / organizer network
Observed regional event families:
- Yucaipa Open
- Yucaipa Summer Slam
- Billy Goat / Fallen Disc Golfers Memorial
- Ice Bowl
- Innova Replay

Status:
- high-priority organizer relationship/submission source;
- Billy Goat / Fallen Disc Golfers Memorial is currently published through manual SoCal verification.

### Glen Helen organizer network
Status:
- candidate organizer relationship source.

## San Diego County

Current future public-event coverage: **1**.

### San Diego Aces Disc Golf Club
URL: https://sandiegoaces.com/

Status:
- high-priority direct relationship/submission/feed source;
- official site is useful for club identity/contact, but its event/RSS material tested stale (latest feed state from 2023), so it is **not scheduled** as a Local Roots source;
- the current site explicitly asks organizers to email ongoing doubles/club-event details, supporting a direct relationship model;
- unsent Gmail draft exists requesting a current first-party calendar/feed/submission path.

### Mast Park / Dog Haus Disc Shop / City of Santee
Official operator references:
- https://www.cityofsanteeca.gov/our-community/parks-recreation/disc-golf
- https://www.cityofsanteeca.gov/our-community/parks-recreation/parks-fields-trails/mast-park

Verified first-party facts:
- City of Santee identifies Dog Haus as the Mast Park disc-golf concessionaire;
- City budget material says Mast Park has supported quarterly disc-golf tournaments hosted by the concessionaire;
- City page publishes `doghausdiscshop@gmail.com` as the disc-golf contact;
- the official city pages do not provide the current tournament dates needed for automatic publication.

Status:
- promising direct first-party San Diego source;
- unsent Gmail draft exists asking Dog Haus for its preferred current event page/calendar/feed or direct-submission workflow.

### Kit Carson / Escondido organizer network
Status:
- candidate organizer/direct-submission coverage;
- do not reconstruct current event inventory from PDGA/DGS pages absent authorization.

### Chingones Disc Golf Club
Status:
- active San Diego-area organizer candidate;
- no independent current first-party structured source has yet been located;
- do not ingest its registration-platform inventory as a fallback.

## National/regional tour sources

### NADGT
Role:
- occasional regional event organizer, especially Riverside.

Status:
- candidate permitted feed/API/organizer submission source;
- Oct. 4 Martha McLean event currently represented through manual regional verification only.

## Current outreach drafts — UNSENT
Do not send without explicit user approval.

- SoCal Disc Golf Club — permission/feed request
- San Diego Aces — current source/feed request
- Lake Casitas — route to current Ventura Disc Golf Club event contact/source
- DiscGolfVR360 — preferred first-party event source/feed request
- Conejo Recreation & Park District — route to current Conejo Disc Golf Club event source/contact
- Dog Haus Disc Shop — preferred Mast Park event calendar/feed/direct source

## Source onboarding order

1. HB Night Flyers — live first-party automated source
2. Local Roots organizer submission form — live direct source
3. SoCal Disc Golf Club — live manual cross-check + live review-only RSS sentinel; pursue stronger direct relationship
4. Ventura/Conejo organizers — close Ventura future-coverage gap through VDGC/CDGC first-party paths
5. San Diego Aces + Dog Haus/Mast Park — close San Diego local-event gap through current first-party paths
6. Riverside local/Martha organizer network — broaden Riverside local/league coverage without UDisc scraping
7. Yucaipa / San Bernardino organizer network
8. Los Angeles/CDGS organizer network
9. NADGT / other repeat organizers
10. PDGA — only if acceptable written licensing/data-use terms are obtained
11. other organizers as discovered

## Why this is better than the old Sheet

The Sheet treated a short URL list as if it represented complete event coverage.

The new system treats coverage as a measurable network:
- first-party internal sources;
- organizer submissions;
- manually verified regional calendars;
- permissioned organizer/direct sources;
- review-only discovery feeds;
- optional authorized official data;
- source health, provenance and review queues.

Missing an organizer becomes a visible coverage gap instead of an invisible parser failure.

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

The page explicitly states that event information is provided by tournament directors and compiled/updated by SoCal DGC volunteers. Local Roots therefore uses it for manual factual verification and limited factual backfill, not automated crawling.

Production policy:
- no automated crawler without separate permission or an approved structured feed;
- store limited factual event metadata and links only;
- do not copy article prose;
- registration sites may be used as manual cross-checks/links, not as unapproved automated sources;
- source conflicts route to review rather than being silently resolved.

Initial verified manual backfill published six events:
- 2026 Sky High Showdown Presented by Innova Champion;
- The Fling XXIX at Chavez Ridge;
- 3rd Annual Nixon Open 2026;
- 2026 NADGT C Tier 2 Rounder @ Martha McLean;
- The OG Mamas 12th Annual Breast Cancer, Beat Cancer Charity 2026;
- 2026 SoCal Championships — Amateur weekend.

Initial conflict handling:
- Fling XXIX remains public but `tier` is intentionally null while SoCal's C-Tier listing conflicts with the current registration-page B-tier listing;
- Sapwi Trails 2026 is not published because SoCal lists Sep 26–27 while the current registration listing shows Sep 26 only;
- Castaic 2026 is not published because current search results and older cached registration evidence disagree on the event date/name lineage.

This source is useful, but the observed conflicts demonstrate why it must not become a blind auto-promote adapter.

## Regional / primary

### PDGA Developer API
Coverage: all six counties, sanctioned events
Potential role:
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

### Ventura Disc Golf Club
Public tournament presence:
https://www.discgolfscene.com/club/9208/ventura-disc-golf-club/tournaments
Observed events:
- Casitas Campout
- Coyote Classic
Status:
- candidate organizer relationship/submission source;
- public registration pages are useful for human verification; automation requires permitted access.

## Los Angeles County

### Los Angeles Disc Golf Club
Observed organizer/host presence on regional registration/event pages.
Observed events include:
- Los Angeles Open
- Mayhem at Martha McLean (outside LA County but same organizer)
Status:
- candidate organizer relationship/submission source.

### Discsports in Southern California
Observed host:
- The Fling at Chavez Ridge
Status:
- candidate organizer source;
- Fling XXIX is currently represented through the manual SoCal cross-check source with an open tier-conflict review.

### Chavez Ridge / Nothing But Chains
Observed host/source:
- Chavez Ridge Appreciation
Status:
- candidate organizer/community source.

## Orange County

### Huntington Beach / Surf City organizer network
Observed regional event:
- Surf City Open at Huntington Beach Central Park
Primary regional cross-check:
- SoCal Disc Golf Club calendar
Status:
- organizer source(s) should be identified/permissioned for unsanctioned/local events.

### La Mirada / CDGS organizer network
Note: La Mirada is in Los Angeles County, but organizers and player community overlap heavily with Orange County.
Observed:
- La Mirada Open
- La Mirada Amateur Championship
- La Mirada Summer Classic
- La Mirada league series
Status:
- important regional organizer source, particularly for repeat series.

## Riverside County

### Martha McLean / local organizer network
Observed hosts:
- Los Angeles Disc Golf Club / CDGS
- National Amateur Disc Golf Tour
- Dude Where's My Par?!
Observed events:
- Mayhem at Martha McLean
- NADGT events at Martha McLean
Status:
- multiple organizer sources; use canonical dedupe;
- the Oct 4, 2026 NADGT event is currently published from manual regional verification.

## San Bernardino County

### Yucaipa Disc Golf Club
Observed events:
- Yucaipa Open
- Yucaipa Summer Slam
- Billy Goat / Fallen Disc Golfers Memorial
- Ice Bowl
- Innova Replay
Status:
- high-priority organizer relationship/submission source.

### Glen Helen organizer network
Observed regional event:
- Rumble at the Rodeo
Status:
- candidate organizer relationship source.

## San Diego County

### San Diego Aces Disc Golf Club
URL:
https://sandiegoaces.com/
Role:
- county-wide club/community event source
Observed current activity:
- monthly/flex events continue to appear in 2026.
Status:
- high-priority direct relationship/submission/feed source.
Opportunity:
- the club site invites organizers to send ongoing event details, making direct structured submission/partnership preferable to scraping.

### Kit Carson / Escondido organizer network
Observed:
- Daniel Boe Memorial
- San Diego Aces $5 Flex Start series
Status:
- candidate organizer/direct-submission coverage.

### Other San Diego organizers
Observed:
- Dog Haus Birthday Bash (Santee)
- regional tournament directors using registration systems
Status:
- expand via organizer submissions/direct relationships after initial launch.

## National/regional tour sources

### NADGT
Observed in Riverside County.
Role:
- occasional regional event organizer
Status:
- candidate permitted feed/API/organizer submission source;
- Oct 4 Martha McLean event currently represented through manual regional verification only.

## Source onboarding order

1. HB Night Flyers — live first-party automated source
2. Local Roots organizer submission form — live direct source
3. SoCal Disc Golf Club — live manual cross-check; pursue permission/feed relationship
4. San Diego Aces — permission/feed/direct-submission relationship
5. Ventura Disc Golf Club — permission/submission relationship
6. Yucaipa Disc Golf Club — permission/submission relationship
7. Los Angeles/CDGS organizer network — permission/submission relationship
8. NADGT / other repeat organizers — permission/submission relationship
9. PDGA — only if acceptable written licensing/data-use terms are obtained
10. other organizers as discovered

## Why this is better than the old Sheet

The Sheet treated a short URL list as if it represented complete event coverage.

The new system treats coverage as a measurable network:
- first-party internal sources;
- organizer submissions;
- manually verified regional calendars;
- permissioned organizer/direct sources;
- optional authorized official data;
- source health, provenance and review queues.

Missing an organizer becomes a visible coverage gap instead of an invisible parser failure.

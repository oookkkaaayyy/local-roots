# Local Roots Events — Seed Source Registry

Updated: 2026-08-23

This is a discovery/relationship list, not blanket authorization to automate.

## Regional / primary

### PDGA Developer API
Coverage: all six counties, sanctioned events
Role:
- sanctioned event discovery
- event identity
- date/location/tier/TD
- registration URL when PDGA supplies it
Status:
- preferred automated source after Developer Program approval
Notes:
- current documented Event Search endpoint exists;
- public developer documentation currently exposes Event Search but does not document an event-results/standings endpoint;
- results access is an explicit question for PDGA.

### SoCal Disc Golf Club
URL: https://socaldiscgolfclub.com/upcoming-events/
Coverage: regional series across the selected SoCal scope
Role:
- regional schedule cross-check
- sanctioned and courtesy-listed event discovery
Status:
- candidate relationship/feed source; do not assume automated extraction permission
Observed 2026 coverage includes Oak Grove, Sylmar, Escondido, Thousand Oaks, Glen Helen, Huntington Beach, and other regional events.

## Ventura County

### Ventura Disc Golf Club
Public tournament presence:
https://www.discgolfscene.com/club/9208/ventura-disc-golf-club/tournaments
Observed events:
- Casitas Campout
- Coyote Classic
Status:
- candidate organizer relationship/submission source
- DGS page is useful for human verification; automation requires permitted access

## Los Angeles County

### Los Angeles Disc Golf Club
Observed organizer/host presence on Disc Golf Scene and regional events.
Observed events include:
- Los Angeles Open
- Mayhem at Martha McLean (outside LA County but same organizer)
Status:
- candidate organizer relationship/submission source

### Discsports in Southern California
Observed host:
- The Fling at Chavez Ridge
Status:
- candidate organizer source

### Chavez Ridge / Nothing But Chains
Observed host/source:
- Chavez Ridge Appreciation
Status:
- candidate organizer/community source

### HBNF / HB Night Flyers
Although based in Orange County, Local Roots directly controls this source.
Role:
- direct trusted internal feed for HBNF public events
Status:
- approved internal integration once Local Roots event schema is ready

## Orange County

### Huntington Beach / Surf City organizer network
Observed regional event:
- Surf City Open at Huntington Beach Central Park
Primary regional cross-check:
- SoCal Disc Golf Club calendar
Status:
- organizer source(s) should be identified/permissioned for unsanctioned/local events

### La Mirada / CDGS organizer network
Note: La Mirada is in Los Angeles County, but organizers and player community overlap heavily with Orange County.
Observed:
- La Mirada Open
- La Mirada Amateur Championship
- La Mirada Summer Classic
- La Mirada league series
Status:
- important regional organizer source, particularly for repeat series

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
- multiple organizer sources; use canonical dedupe

## San Bernardino County

### Yucaipa Disc Golf Club
Observed events:
- Yucaipa Open
- Yucaipa Summer Slam
- Billy Goat / Fallen Disc Golfers Memorial
- Ice Bowl
- Innova Replay
Status:
- high-priority organizer relationship/submission source
Additional signal:
- PDGA has recently highlighted Yucaipa DGC in its club program.

### Glen Helen organizer network
Observed regional event:
- Rumble at the Rodeo
Status:
- discover/identify organizer via SoCal calendar and PDGA source

## San Diego County

### San Diego Aces Disc Golf Club
URL:
https://sandiegoaces.com/
Role:
- county-wide club/community event source
Observed current activity:
- monthly/flex events continue to appear in PDGA data in 2026
Status:
- high-priority direct relationship/submission/feed source
Opportunity:
- the club's site explicitly invites organizers to send ongoing event details, which makes direct structured submission/partnership more realistic than scraping.

### Kit Carson / Escondido organizer network
Observed:
- Daniel Boe Memorial
- San Diego Aces $5 Flex Start series
Status:
- PDGA + San Diego Aces cross-source

### Other San Diego organizers
Observed:
- Dog Haus Birthday Bash (Santee)
- regional tournament directors using DGS/PDGA
Status:
- expand via organizer submissions after initial launch

## National/regional tour sources

### NADGT
Observed in Riverside County.
Role:
- occasional regional event organizer
Status:
- candidate permitted feed/API/organizer submission source

## Source onboarding order

1. PDGA API — if approved
2. Local Roots/HBNF internal events — direct
3. organizer submission form — direct
4. SoCal Disc Golf Club — permission/feed relationship
5. San Diego Aces — permission/feed relationship
6. Ventura Disc Golf Club — permission/submission relationship
7. Yucaipa Disc Golf Club — permission/submission relationship
8. Los Angeles/CDGS organizer network — permission/submission relationship
9. other organizers as discovered

## Why this is better than the old Sheet

The Sheet treated a short URL list as if it represented complete event coverage.

The new system treats coverage as a measurable network:
- official sanctioned source
- regional calendar
- organizer direct sources
- internal Local Roots events
- submission pipeline
- source health and coverage audits

Missing an organizer becomes a visible coverage gap instead of an invisible parser failure.

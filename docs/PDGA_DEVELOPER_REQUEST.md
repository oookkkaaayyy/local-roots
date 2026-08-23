# PDGA Developer Program — Local Roots Request Package

Updated: 2026-08-23

## Current official pathway

PDGA currently states:
- the REST API is available at no cost for non-commercial use by current PDGA members;
- the developer must have a pdga.com user account linked to the membership;
- the developer must read/sign the PDGA API license agreement;
- PDGA asks developers to email the Developer Program before launching so PDGA can review the implementation;
- PDGA requires attribution on screens containing PDGA data and links player/event/course names back to pdga.com;
- the PDGA Technology Partner Program specifically includes event-discovery platforms and says most relationships begin at the Authorized Developer level.

Because Local Roots may eventually include commercial sub-brands or monetization, do not assume that the standard non-commercial developer license automatically covers the eventual umbrella site. Ask PDGA to confirm the permitted structure before production launch.

## Intended Local Roots use

Local Roots Events is intended to be a Southern California disc-golf event discovery calendar.

Initial geographic scope:
- Ventura County
- Los Angeles County
- Orange County
- Riverside County
- San Bernardino County
- San Diego County

Proposed PDGA-data use:
- discover PDGA-sanctioned events in the geographic scope;
- display factual event metadata such as event name, dates, city, sanction/tier, TD, and PDGA event URL;
- after completion, display a compact top-results summary with a link back to the corresponding PDGA event/results page;
- comply with PDGA attribution and canonical-link requirements;
- not reproduce PDGA articles, descriptive editorial content, or unrelated player/course data;
- not scrape pdga.com HTML.

## Questions for PDGA

1. Is this event-discovery use permitted under the Authorized Developer program?
2. If the Local Roots umbrella site also links to commercial sub-brands or later contains advertising/store functionality, does the event calendar require a different license/Technology Partner arrangement even if PDGA data itself is not sold?
3. May PDGA Event Search API data be cached in the Local Roots database for reliability and deduplication, and if so, are there retention/freshness requirements?
4. The currently published REST service documentation appears to list Event Search but not an event-results/standings endpoint. Is there an API-supported endpoint or another approved method for retrieving division standings/results needed to show the top three places after an event?
5. Are there specific attribution/logo requirements beyond the published Developer Program guidance?
6. Are there rate limits or recommended polling intervals we should design around?
7. Event Search responses can include Disc Golf Scene registration URLs. Is using those returned registration URLs on Local Roots covered by the PDGA developer permission, and is there any approved method for discovering relevant unsanctioned Disc Golf Scene events?

## Draft message for PDGA Developer Program

Subject: Local Roots — Southern California event-discovery API use

Hello,

I’m a current PDGA member building Local Roots, a Southern California disc-golf community site. One of the primary features will be a regional event calendar covering Ventura, Los Angeles, Orange, Riverside, San Bernardino, and San Diego counties.

I’d like to use the PDGA API rather than scraping pdga.com. The intended PDGA-data use is fairly narrow: identify sanctioned events in the region; show factual details such as event name, dates, location, sanction/tier and TD; link users directly to the corresponding PDGA page; and, after an event, show a small top-results summary with the full results linked back to PDGA. I’ll follow the published PDGA attribution/link requirements.

Local Roots is being built as a broader community hub and may eventually link to commercial sub-brands or include other revenue-generating features. I therefore don’t want to assume the standard non-commercial API terms cover the eventual site structure.

Could you let me know whether this use fits the Authorized Developer program and, if not, what licensing/Technology Partner path you would recommend? I’d also appreciate guidance on whether event data may be cached for reliability, the preferred refresh frequency/rate limits, and the approved API method for retrieving event results/division standings.

I’m happy to provide a staging URL or implementation details for review before anything launches.

Thank you.

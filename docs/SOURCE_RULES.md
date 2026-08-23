# Local Roots Events — Source Rules

## Principle

No source adapter is allowed to bypass licensing/terms/permission requirements merely because its page is publicly viewable.

Each source must have an explicit `access_method` and `permission_basis` in the source registry.

## PDGA

### Allowed production path
Preferred:
- authorized PDGA REST API integration under an applicable license/permission.

Requirements before production:
- confirm the operator is eligible for API access;
- sign/accept applicable PDGA API terms;
- obtain required review/permission;
- confirm whether the Local Roots use case is permitted if the broader site is commercial;
- implement required PDGA attribution and canonical links.

### Forbidden
- production HTML scraping/crawling of PDGA pages.

### Authority
When authorized, PDGA is authoritative for:
- sanctioning;
- tier;
- official event identity;
- official divisions/results;
- PDGA player numbers.

## Disc Golf Scene

Use for:
- registration URLs;
- event registration status;
- organizer information;
- unsanctioned event discovery when permitted.

Production rule:
- do not build an unapproved automated scraper;
- obtain a permitted integration/data-access path or rely on organizer-supplied links;
- link to DGS rather than reproducing descriptive content.

## UDisc

Use for:
- course/event links supplied by organizers;
- permitted exports/integrations;
- manual verification.

Forbidden:
- automated scraping of UDisc pages.

## SoCal Disc Golf Club and other club/community websites

Create one registry record per source.

Before automation, record:
- terms/permission status;
- feed/API/RSS availability;
- whether the operator has granted indexing permission;
- fields considered authoritative.

Prefer:
- RSS/structured feeds;
- direct organizer data;
- public calendar feeds;
- explicit permission.

Only factual metadata needed for the calendar should be stored. Do not copy article prose/descriptions.

## Organizer submissions

A submission form is a first-class ingestion source, not a fallback.

Suggested required fields:
- event name
- dates
- course/venue
- city
- event type
- sanction/tier if applicable
- registration URL
- organizer/club
- contact email (private/admin only)
- source/verification URL

Submission states:
- received
- auto-validated
- needs review
- approved
- rejected
- superseded

Known/verified organizers can receive higher default confidence.

## Manual administrative entry

Allowed and necessary for:
- last-minute events;
- events from sources without permitted automation;
- corrections;
- source outages.

Manual entries require:
- provenance URL or note;
- verification timestamp.

## Source health

Every adapter must define an expected baseline:
- typical record count;
- minimum plausible count;
- maximum plausible count;
- expected fields;
- freshness expectation.

Examples of automatic warnings:
- prior run saw 40 records, current run sees 0;
- >50% record-count collapse;
- >20% candidates fail schema validation;
- all event dates parse into the past unexpectedly;
- geography distribution changes sharply;
- known sentinel event disappears before its date.

Never delete canonical events solely because a source omitted them once.

## Conflict precedence

Field-level authority, not source-level winner-take-all.

Example:
- sanctioned/tier/results: authorized PDGA source
- registration URL/status: permitted registration source or organizer
- date/course: organizer-confirmed source may supersede stale third-party listing
- manual override: always wins while active

Conflicts above confidence threshold enter review rather than being silently overwritten.

# Local Roots Events — Source Rules

## Principle

No source adapter is allowed to bypass licensing/terms/permission requirements merely because its page is publicly viewable.

Each source must have an explicit `access_method` and `permission_basis` in the source registry.

## HB Night Flyers — ACTIVE FIRST-PARTY SOURCE

HBNF is the first permitted automated production adapter because the system is user-controlled/first-party.

Production rules:
- HBNF remains on its separate Supabase backend;
- Local Roots reads the HBNF application state through the existing public application API using a key held only in Supabase Vault/runtime configuration;
- store only normalized Local Roots event/provenance/results fields, not the full raw HBNF league state;
- use stable external IDs (`hbnf:<mode>:<date>`) for idempotent matching;
- HBNF organizer-confirmed dates/format/course/club fields may act as authoritative fields for HBNF events;
- source disappearance routes to review instead of deleting canonical events;
- finalized Glow results may be imported from the first-party score state, using dense ranking and all entries tied at the third-place cutoff;
- the daily run starts at 05:00 America/Los_Angeles and may retry at 06:00/07:00 only after an unhealthy attempt.

Do not store Vault secret values, Auth tokens or HBNF credential values in Git, AKS or user-facing documentation.

## PDGA — DISABLED PENDING CLARIFICATION

Do not implement or enable a PDGA production adapter yet.

The stock/public API agreement appears incompatible with the planned persistent Local Roots canonical database in important respects, including restrictions on caching/storage and using PDGA Data to create/update another business-listing database. The Developer Program also describes no-cost access in non-commercial terms, while Local Roots may operate within a commercial umbrella.

Before production PDGA use, obtain written clarification or an alternate/applicable agreement covering at least:
- Local Roots event-discovery use;
- commercial-context use;
- which PDGA event fields, if any, may be persisted/cached and for how long;
- results/standings access and persistence;
- attribution and canonical-link requirements;
- rate limits/polling expectations;
- appropriate Authorized Developer vs Technology Partner treatment.

Do not rush to accept the stock agreement merely to unblock development. The source-neutral product can operate without PDGA.

Forbidden:
- production HTML scraping/crawling of PDGA pages;
- assuming PDGA membership alone authorizes Local Roots storage/commercial use.

If/when authorized, PDGA can be authoritative only for the fields expressly allowed by the applicable permission/terms.

## Disc Golf Scene

Use for:
- registration URLs supplied by organizers or other permitted sources;
- event registration status when an approved access path exists;
- organizer information when directly supplied/permitted;
- unsanctioned discovery only when permitted.

Production rule:
- do not build an unapproved automated scraper;
- obtain a permitted integration/data-access path or rely on organizer-supplied links;
- link to DGS rather than reproducing descriptive content.

## UDisc

Use for:
- course/event links supplied by organizers;
- permitted exports/integrations;
- manual verification where allowed.

Forbidden:
- automated scraping/data extraction without permission.

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
- public calendar feeds with reuse permission;
- explicit permission.

Only factual metadata needed for the calendar should be stored. Do not copy article prose/descriptions.

### Manual factual calendar source

The current SoCal DGC upcoming-events page states that its event information is provided by tournament directors and compiled/updated by club volunteers. It may be used for limited manual factual ingestion/cross-checking, subject to normal provenance/conflict review. A registration URL supplied by that permitted source may be retained as a link; that does not authorize crawling the linked registration service.

Do not blindly crawl the HTML calendar. Conflicting or ambiguous fields stay in review until a stronger permitted/current source resolves them.

### Review-only RSS sentinels

An intentionally published RSS/Atom feed may be used as a low-impact change detector when its normal purpose is syndication. This is distinct from scraping a website or treating the feed as an authoritative event database.

Rules for a review-only feed:
- registry `authoritative_fields` must remain empty unless separate authority is established;
- first successful run establishes a latest-item watermark and must not flood the queue with historical posts;
- repeated runs must be idempotent;
- only limited feed metadata needed for detection may be stored (stable item ID, title, URL, publication timestamp, seen/review state);
- article prose/content is not copied into the Local Roots database;
- a relevant new item creates a review/discovery alert only;
- the feed worker may not publish, unpublish, merge, alter sanction status, or otherwise mutate canonical events;
- cursor loss/gaps route to one bounded review rather than guessing at changes;
- secret-protected schedulers must fail closed;
- stale feeds should not be scheduled merely because the endpoint technically returns HTTP 200.

Current example: `socal_dgc_rss` uses SoCal DGC's public WordPress feed as a six-hour review-only sentinel. San Diego Aces also exposes a WordPress feed, but it was not scheduled because its current feed is stale (last build March 2023).

## Organizer submissions

The public submission form is a first-class ingestion source.

Typical fields:
- event name
- dates
- course/venue
- city/county
- event type
- sanction/tier if applicable
- registration URL
- organizer/club
- contact email (private/admin only)
- source/verification URL

Submission flow:
- received
- auto-validated/scope checked
- review required
- approved/merged/rejected
- superseded where appropriate

Known/verified organizers can later receive higher default confidence, but must not bypass core validation/publication safeguards.

## Manual administrative entry

Allowed and necessary for:
- last-minute events;
- events from sources without permitted automation;
- corrections;
- source outages.

Manual entries require provenance/verification evidence and a verification timestamp before publication.

## Source health

Every automated adapter must define an expected baseline:
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
- known event disappears before its date.

Scheduler, fetch, parse, validation and health are separate signals. If fetch/parse fails, validation is `skipped`, not `ok`. Never delete canonical events solely because a source omitted them once.

## Conflict precedence

Field-level authority, not source-level winner-take-all.

Examples:
- authorized sanctioning/results source: only fields authorized by its terms;
- registration URL/status: permitted registration source or organizer;
- date/course: organizer-confirmed source may supersede a stale lower-authority listing;
- active manual override: always wins until explicitly released.

Conflicts above confidence threshold enter review rather than being silently overwritten.

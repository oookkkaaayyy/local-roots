# Local Roots Events — Product Specification

## Product role

`/events` will be a primary Local Roots page and the canonical public calendar for the supported Southern California disc golf region.

The broader Local Roots site will eventually act as a hub linking Local Roots sub-brands/projects such as HBNF and Dyed & Unattached. The event tracker must therefore be built as a durable Local Roots product rather than a one-off spreadsheet port.

## Primary user jobs

A player should be able to:
- see what disc golf events are coming up;
- understand where and when they occur;
- distinguish sanctioned and unsanctioned events;
- see the organizer/club;
- reach the registration page quickly;
- filter the list by useful dimensions;
- see results after an event is completed.

An administrator should be able to:
- inspect source health;
- review only ambiguous changes;
- correct a field without having automation overwrite it;
- add/edit an event manually;
- see why a record is published;
- identify stale/unverified data;
- diagnose source failures without reading server logs.

## Public page: MVP

Route:
`/events`

### Default presentation
- mobile-first;
- upcoming events first;
- chronological;
- current month and future months easily navigable;
- completed events remain accessible;
- registration call-to-action is visually obvious;
- Local Roots brand styling, but UI work is a later milestone after data reliability.

### Public event card / row fields
Required:
- date or date range
- event name
- city
- course / venue
- event type
- rounds / format when known
- tournament director / club when known
- sanctioning/tier
- registration link when available
- status: upcoming / registration open / full / canceled / completed / date changed
- verification freshness indicator internally; public display only if stale/problematic

For completed events:
- selected division
- top three places
- player name(s)
- total score and relative-to-par when available
- results source link

### Filters
MVP:
- month/date
- county
- sanctioned vs unsanctioned
- event type

Later:
- course
- club/organizer
- registration status
- free/paid if reliable
- distance from user

## Inclusion policy

Default broad inclusion:
- tournaments
- flex starts
- leagues / league series
- doubles/team events
- putting events
- ace races / circuit challenges
- tag matches
- clinics/charity/community events when they are actual scheduled disc-golf events

Recurring casual play may be grouped as a recurring series rather than creating visually repetitive cards for every session.

## Geography

Geography must be configuration, not hard-coded parser behavior.

`scope_profile` should support:
- named counties;
- explicit course exceptions;
- explicit city exceptions;
- future expansion without migrations.

Production scope selected 2026-08-23:
- Ventura County
- Los Angeles County
- Orange County
- Riverside County
- San Bernardino County
- San Diego County

Excluded by default:
- Santa Barbara County
- Imperial County
- Kern County
- San Luis Obispo County

Explicit course/event exceptions may be added later without changing adapter code or database schema.

## Results policy

Default historical priority:
1. MPO
2. FPO
3. MP40
4. MP50
5. MA1
6. FA1
7. highest available division

Rules:
- selection logic is configuration-driven;
- if a tournament is division-restricted (e.g. women-only, juniors, age-protected), use the highest available meaningful division rather than returning no result;
- display first three places;
- include all players tied at a place crossing the third-place cutoff;
- preserve the original results source;
- do not infer missing scores.

## Manual correction precedence

Manual administrative corrections always win over automated imports until explicitly released.

Every override records:
- field;
- prior value;
- override value;
- reason;
- timestamp;
- active/released state.

Automation may update non-overridden fields on the same event.

## Review queue policy

Automatically publish:
- high-confidence new records from an approved source;
- high-confidence non-destructive updates;
- routine status/result enrichment that passes validation.

Require review:
- possible duplicate with ambiguous match;
- date changes;
- course/city changes;
- cancellation/reinstatement;
- source disagreement on sanction/tier;
- deletion/disappearance from source;
- implausible field changes;
- low-confidence organizer-submitted data;
- parser/source health anomaly.

The administrator should not review unchanged healthy records.

## Data freshness

Target:
- daily source refresh;
- more frequent refresh is unnecessary for MVP.

Each published event has:
- `last_verified_at`
- `last_changed_at`
- source provenance

The public site should continue serving the last known-good dataset when a source run fails.

## Launch gate

Do not publicly launch until:
- all automated tests pass;
- current/future corpus has been manually sampled against source truth;
- no known P0/P1 defects;
- 14 consecutive scheduled daily runs complete without silent data failure;
- a source returning zero or implausibly few records produces a warning/failure rather than a success;
- manual overrides survive refresh;
- backup/restore path is tested;
- mobile rendering is verified.

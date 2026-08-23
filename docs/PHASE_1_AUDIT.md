# Local Roots Event Tracker — Phase 1 Forensic Audit

Date: 2026-08-23

## Executive finding

The current Google Sheet should not be repaired into the production system. It is useful as a requirements archive, historical dataset, and regression-test source, but its ingestion/rendering architecture has failed in ways that can silently corrupt or erase public data.

The website rebuild should use a typed canonical database, source-specific adapters, hard validation gates, an exception review queue, and independent health checks for:
1. whether a scheduled job ran;
2. whether a source was successfully retrieved;
3. whether parsing produced structurally valid records;
4. whether the resulting dataset is plausible relative to prior runs; and
5. whether the public dataset is safe to publish.

## Live workbook inspected

Spreadsheet ID:
`1cyhmc_Q_XIwcXz1Eu0ITQ-XU9D0GgTXqvPqiQsKfZHs`

Title:
`!CURRENT All SoCal`

Relevant tabs:
- May 2026 through April 2027
- Source_Index
- Manual_Result_Overrides
- Results_Audit
- Apps Script Setup
- Refresh_Config
- Raw_Source_Snapshots
- Refresh_Log
- Event_Database

## Confirmed live failures

### 1. Public month tabs are empty
At audit time, August 2026 contained only the header row. May 2026 likewise contained only headers.

This means the public-facing system has effectively failed even though its scheduled automation continues to run.

### 2. False-positive health logging
Refresh_Log continued to report successful daily runs while also reporting:
`No new listing rows found. Existing database preserved.`

This continued for weeks. A successful scheduler invocation was being conflated with a healthy data pipeline.

### 3. Event_Database schema drift / column misalignment
The current Event_Database header contains 26 fields, including:
- Event ID
- Start Date
- End Date
- Month Tab
- Event Name
- City
- County
- Course
- rounds
- TD/Club
- registration
- sanctioning
- results
- top-three fields
- audit timestamps

But populated rows are shifted relative to those headers. Example symptoms include:
- a month name appearing where Event ID should be;
- dates appearing in the wrong semantic fields;
- course names and round counts shifted;
- source/status values occupying unrelated columns.

This is not a display-only issue. It invalidates downstream parsing and rendering.

### 4. Results parser accepted nonsense as valid
Results_Audit contains rows in which:
- Event Name = `2`
- Course = `Yes - C-Tier`
- Status = `OK`
- Message = `Top 3 parsed.`

This demonstrates that the pipeline lacked semantic schema validation. A structurally corrupted record could still pass all the way through as a successful result.

### 5. Renderer and database evolved independently
The Apps Script's `readEventDatabase_()` function expects an older positional layout. Its field indices no longer match the 26-column Event_Database.

This is a classic positional-schema failure. The new system must never bind business meaning to spreadsheet column offsets.

### 6. Geography drifted over time
Earlier canonical tracker files repeatedly specified:
- Los Angeles County
- Orange County
- San Diego County

A later Refresh_Config expanded scope to include additional counties and keyword-based exceptions.

Production decision made 2026-08-23:
- Ventura
- Los Angeles
- Orange
- Riverside
- San Bernardino
- San Diego

Santa Barbara, Imperial, Kern, and San Luis Obispo are excluded by default. The new system will make geography a named configuration/policy rather than embedding it in parser logic.

### 7. Original review gate was removed
Earlier versions deliberately routed discovered records into a review queue before promotion to the public dataset. Later versions attempted direct promotion.

The review queue was the safer design. It should return, but only low-confidence/ambiguous items should require human review.

## Historical requirements recovered

### Core public fields
- Date / date range
- Event name
- Course / venue
- Number of rounds or format
- Tournament director / club
- Registration link
- PDGA sanctioned? / tier
- Top-three names for completed events
- Top-three scores for completed events

### Broader underlying fields worth retaining
- stable Event ID
- start/end dates
- county/city
- event type / format
- event status
- source URL(s)
- PDGA event URL
- DiscGolfScene URL
- UDisc URL
- club / host
- TD / primary contact
- source confidence
- last verified / last updated
- review status
- manual override state
- results source

### Results rule recovered
Historical configuration:
`MPO > FPO > MP40 > MP50 > MA1 > FA1 > highest available division`

The intent was to show the highest-priority division offered, not always MPO.

Historical outputs sometimes included more than three names when a tie crossed the third-place cutoff. The proposed default is therefore:
- display the first three *places*;
- include all competitors tied at the third-place cutoff.

This remains configurable.

### Event types historically included
The tracker was broader than sanctioned tournaments. Historical public rows included:
- PDGA tournaments
- PDGA leagues / flex series
- unsanctioned tournaments
- circuit challenges
- ace-race-style events
- putting competitions
- tag matches
- local club events

Therefore the new schema should preserve event type and let the website filter rather than discard these categories at ingestion.

## Source-policy finding

The production system must not rely on unauthorized scraping.

### PDGA
PDGA website Terms of Use prohibit automated scraping/crawling. PDGA provides a REST API, but its public developer page describes it as available for non-commercial use by current PDGA members after signing the license agreement and contacting PDGA before launch.

Production rule:
- no automated PDGA HTML scraping;
- use an authorized API integration only after the applicable license/permission is confirmed;
- preserve required attribution and canonical PDGA links.

### Disc Golf Scene
Disc Golf Scene is operated by PDGA. Its terms restrict copying, republication, and commercial exploitation of site content.

Production rule:
- do not make an automated DGS scraper a launch dependency without permission;
- store/link factual metadata only under an approved data-access path;
- prefer organizer-supplied registration links or a permitted integration.

### UDisc
UDisc Terms explicitly prohibit scraping and exploitation of its data/content without prior written consent.

Production rule:
- no UDisc scraping;
- use organizer submissions, permitted exports, or written permission/integration.

### Club/community sources
These should be managed through a source registry. Each source should state:
- access method;
- permission basis;
- ingestion frequency;
- fields it is authoritative for;
- attribution/link requirements.

## What should be preserved from the Sheet

Preserve:
- the product requirements;
- historical known-good event rows;
- source hierarchy concepts;
- top-three logic;
- manual override concept;
- raw/source audit concept;
- Local Roots presentation intent;
- daily refresh intent;
- rolling event calendar;
- prior known failures as regression tests.

Do not preserve:
- positional spreadsheet schemas;
- Apps Script parser code;
- direct month-tab rendering as source of truth;
- a generic scrape-all-sources function;
- success logging that does not validate data;
- direct publishing of unvalidated candidates.

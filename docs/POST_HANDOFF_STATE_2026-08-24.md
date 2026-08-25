# Local Roots — Post-Handoff Verified State

Verified: 2026-08-25 Pacific

This file records live changes after `docs/CONTINUITY_BRIEF.md` and the frozen `Local_Roots_Handoff_2026-08-23.zip`. Where counts below differ from the frozen handoff/brief, this newer verified live state controls.

## Current live event state
- 67 published real canonical events.
- 18 current/future events at the verified 2026-08-25 Pacific-time snapshot.
- 0 published events without provenance.
- 0 sanctioned published events without sanction-basis provenance.
- 0 stale current/future events under the 14-day freshness gate.
- 0 high/critical blocking reviews.
- HBNF contributes 32 event/provenance rows and 9 Glow result rows.
- Three existing medium source conflicts remain open: Fling XXIX tier, Sapwi Trails dates, and Castaic name/date lineage.
- Latest forced staging integrity verification returned Cloudflare HTTP 200, `staging_ok=true`, 67 public events, zero provenance/sanction-basis gaps, and no anomalies.

## Population-first operating priority
The user explicitly approved an expedited path on 2026-08-25: make the public site safely as fully populated as possible ASAP while HBNF reliability evidence accrues separately. Event coverage must not wait for completion of the HBNF soak.

Restricted aggregators (PDGA, Disc Golf Scene and UDisc) remain prohibited as fallback production sources. They may be used only as discovery leads; facts discovered there must be independently corroborated by permitted first-party/organizer/venue/club/public evidence before publication. Provenance, sanction-basis, freshness, conflict and high/critical-review safeguards must not be weakened merely to increase event count.

The first new event added under this population-first pass was `The Helix Open`, Nov. 14–15, 2026, La Quinta / Palm Royal Country Club, from the permitted SoCal DGC 2026 calendar. It was inserted unpublished, assigned source-scoped provenance `socal:2026:the-helix-open`, and only then published, preserving the database publication guard. SoCal advertises C-Tier, but canonical `tier` remains null because tier is not currently an authoritative field for the SoCal manual-calendar source. The second advertised course is also omitted until specifically identified.

A second safe expansion resolved the previously conflicting `CALI FLWR Disc Fest` date without using a restricted aggregator as authority. A current organizer-managed Eventbrite listing for event ID `1992784825056` lists Sunday, Sept. 20, 2026 at Pico Rivera Golf Club, organized by Sammy Elliott; Nick Andrade's current public Linktree independently links that same Sept. 20 Eventbrite event. This stronger current evidence supersedes an older cached representation of the same Eventbrite ID that showed Oct. 17 / location TBD. The canonical event is therefore Sept. 20 at Pico Rivera Golf Club, registration open; `sanctioned` and `tier` remain null because the permitted sources do not establish them. Two manual-source identities preserve the evidence separately: `califlwr_eventbrite_manual` / `eventbrite:1992784825056` and `nick_andrade_linktree_manual` / `linktree:nickandradefitness:califlwr-2026`.

## HBNF provenance and first real production day
HBNF is a first-party aggregate source. Stable identity remains `(source_id, external_id)` using IDs such as `hbnf:<mode>:<date>`. `source_url` is provenance/location and uses the real public HBNF URL `https://hbnightflyers.com/` rather than fabricated Local Roots-only URL fragments.

Applied migration: `20260824041608_replace_hbnf_synthetic_provenance_fragments`.

The live `lr-sync-hbnf` Edge Function is parser version `hbnf-direct-v3`; GitHub main and the deployed function are aligned on this provenance behavior.

The first qualifying scheduled production run completed at the 05:00 Pacific production window with `scheduler_status=ok`, fetch/parse/validation all `ok`, health `healthy`, 32/32 valid records, and 0 new/changed/rejected/missing records. This is real production evidence and advances the launch soak to **1/5**. Manual/test runs remain excluded from the soak.

## Launch readiness
On 2026-08-25 the user approved replacing the conservative 14-day HBNF launch soak with an evidence-based **5 consecutive healthy real scheduled production days**, given the existing manual/failure-path/integrity QA. This changes only the scheduled-source reliability threshold; all other launch guards remain unchanged.

Applied migration: `20260825072249_shorten_hbnf_launch_soak_to_five_days`.
GitHub mirror commit: `d4a4123b34f3f9720e7045a15eb87784333700c4`.

`lr_launch_readiness()` remains `ready=false`. Current HBNF consecutive healthy production days: **1 of 5**.

All other currently implemented readiness gates remain clean: publication provenance, sanction-basis provenance, current/future freshness, and high/critical review blocking.

Do not claim public-launch readiness until the remaining consecutive healthy production days and remaining final launch gates pass. Do not delay safe event population while the reliability evidence accrues.

## Ventura direct-source evidence
The disabled `ventura_disc_golf_club_direct` routing source remains non-authoritative for event fields and has no automated retrieval enabled. Its official source identity is strengthened by permitted first-party/government sources:

- Lake Casitas / Casitas Municipal Water states that disc-golf events at Coyote Point are managed by Ventura Disc Golf Club and directs event questions to the club.
- A City of Ventura Parks & Recreation supplemental packet contains a Ventura Disc Golf Club board-member statement that the club signed an MOU with Casitas Municipal Water District in 2006 to operate and maintain Coyote Point, hosts two tournaments there each year, and identifies the Coyote Classic as its fall tournament.

This evidence establishes organizer/source identity and recurring-event lineage only. It does **not** establish a current date, tier, registration state, or permission for automated retrieval. Disc Golf Scene, PDGA, and UDisc remain prohibited as production fallback evidence.

Fresh no-contact research of official Ventura/Casitas, Conejo/CRPD, Riverside and Santee/Mast Park sources did not produce stronger current/future event facts sufficient to add records or resolve Fling/Sapwi/Castaic without falling back to restricted evidence. No restricted-source facts were promoted.

## Accessibility / foundation hardening
Accessibility work on GitHub `main` now includes:

- explicit keyboard `:focus-visible` treatment and reduced-motion handling;
- skip-to-main navigation and primary-navigation labeling;
- accessible live announcements for event loading, filtered-result counts, submission results, errors and empty states;
- filter controls grouped and labeled for assistive technology;
- protected launch-readiness loading/error semantics, launch-gate labeling, table captions/column scopes, and an explicit non-submit Refresh button.

Public event status/action rendering is now also date-aware. For events whose stored source status has not yet rolled forward, the public page derives `Completed` after the event end date in America/Los_Angeles while preserving explicit `canceled`/`completed` states. Registration links are suppressed once the event end date has passed even if source status metadata lags. This fixes the verified Sky High Showdown case, whose stored status remained `upcoming` after its 2026-08-23 end date while registration was already closed.

Source commits for this policy: `7c47c6d11c2fe665c2c4e0fb88400d88b7edb1ce` and deployment marker commit `d6132e2d62c75b827e672e9e6333f2dd99c9339b`. The integrity worker was upgraded to v5 in GitHub commit `0a0b8b301ef53542bcec7e71d8ffdf5252c7815f` and now requires the deployed `date-aware-v1` frontend marker. CI passed for all three commits, and a forced v5 integrity run verified the marker on staging with HTTP 200, `staging_ok=true`, 65 public events, zero provenance/sanction-basis gaps and no anomalies. Later forced integrity runs after adding The Helix Open and CALI FLWR verified HTTP 200, `staging_ok=true`, 67 public events, zero provenance/sanction-basis gaps and no anomalies.

Final human mobile/desktop visual smoke remains open.

## Source-control note
The HBNF migration was already live when post-handoff verification detected that GitHub main had briefly lagged the deployed state. Main was repaired to include the exact applied migration and corrected HBNF adapter source, then the adapter was redeployed from the aligned source.

The 5-day launch-readiness migration is also mirrored on GitHub using the exact live migration version, so the repository and applied database state remain aligned.

## Automation reliability
The exact-hourly `Continue Local Roots` task remains the main continuation automation. It has demonstrated real scheduled execution, but it subsequently self-disabled again after a later run. Direct inspection detected the stall and the task was re-enabled.

Because this disable behavior has recurred, a separate hourly condition-watch `Local Roots Watchdog` is enabled. It stays silent when the main continuation is healthy/recent; if the main continuation disables or stalls, it is instructed to re-enable it and continue the highest-value safe Local Roots work under the same project guardrails.

Both continuation prompts now explicitly prioritize safe current/future event population ASAP and recognize the 5-day real HBNF soak as the controlling reliability threshold.

The no-scraping/no-outreach-send/no-paid/no-destructive guardrails remain unchanged.

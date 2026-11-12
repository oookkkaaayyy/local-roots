# Source Policy v2 (2026-11-11)

Supersedes the first-party-only rule in SOURCE_RULES.md where they conflict. The authoritative copy lives in the database table `lr_publication_policy` (version 2).

## Trust tiers
- Tier 1: first-party pages (club, course, DGPT). Confidence 0.90-0.98. Re-verify every 14 days.
- Tier 2: organizer-authored platform listings (DGS, UDisc organizer pages). Confidence 0.75-0.85. 14 days.
- Tier 3: secondary sources. Confidence 0.50-0.70. 7 days.

## Scope
Ten counties: the original six plus Santa Barbara, San Luis Obispo, Kern, Imperial.

## Allowed acquisition
Editorial single-page reads and web search.

## Still forbidden
- Scripted or bulk crawling of PDGA, UDisc or DGS
- Copying descriptions or prose
- Republishing results
- Accepting licenses on the owner's behalf (PDGA API license stays owner-only)
- Inventing facts

## Unchanged hard gates
last_verified_at, in-scope county/city/course, a provenance row, and an is_sanction_basis source when sanctioned=true. Conflicts between sources resolve to the highest tier, then the most recent verification.

## Recurring series
`lr_recurring_series` supports verification_mode `page_evidence` (daily Edge Function check) and `editorial` (manual re-verification within valid_days). Extension runs daily.

Note for AGENTS.md: the never-scrape rule stands; editorial single-page reads are not scraping.

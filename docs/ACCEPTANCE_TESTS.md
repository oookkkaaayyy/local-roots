# Local Roots Events — Acceptance / Regression Tests

These tests should exist before production ingestion is enabled.

## Schema / type safety

1. Reject an event whose Event ID is a month name.
2. Reject an event whose event name is numeric-only (e.g. `"2"`).
3. Reject a course value that parses as a sanction/tier string.
4. Reject end_date < start_date.
5. Reject invalid HTTP(S) URLs.
6. Reject published event without provenance.
7. Reject sanctioned=true with no sanction basis.
8. Never map business fields using positional spreadsheet offsets.

## Geography

9. Event in active county is accepted.
10. Event outside active scope is held/excluded.
11. Explicit course exception overrides county exclusion only when configured.
12. Geography policy can change without altering adapter code.

## Deduplication

13. Same event from two approved sources becomes one canonical event with two provenance rows.
14. Same name on different dates remains two events.
15. Similar name/date at different venues enters review if ambiguity remains.
16. Stable external ID always outranks fuzzy name matching.

## Date changes

17. Organizer-confirmed date change updates canonical event and records audit history.
18. Conflicting date from lower-authority source enters review.
19. Multiday event preserves start and end dates.

## Missing/disappearing source data

20. Source run returning zero records after a healthy nonzero baseline cannot be `healthy`.
21. One missing run does not delete canonical events.
22. Repeated disappearance creates review/health alert.
23. Last known-good public data remains available during acquisition failure.

## Manual overrides

24. Active manual date override survives every refresh.
25. Active manual registration URL override survives every refresh.
26. Releasing an override allows approved source data to resume control.
27. Non-overridden fields on the same event may still update.

## Results

28. Completed event with authorized official results gets selected division.
29. Division preference obeys configured priority.
30. Restricted event with no preferred division uses highest meaningful available division.
31. First three places are shown.
32. Tie crossing third-place cutoff includes all tied players at that place.
33. Missing score stays null/unknown; no score is invented.
34. Results always retain source provenance.

## Source health

35. HTTP 200 + parser 0 records is not automatically successful.
36. Parser producing structurally invalid rows marks run unhealthy.
37. Large record-count collapse triggers warning.
38. Excess validation failures trigger warning.
39. Adapter exception is logged with source/run identifier.
40. Scheduler success is tracked separately from data health.

## Publication

41. Low-confidence candidate does not appear publicly.
42. High-confidence approved new event can auto-publish.
43. Cancellation requires authority/confidence check.
44. Public frontend only reads published canonical records.
45. Admin-only fields are never returned by public endpoint/view.

## Historical regressions from the Sheet

46. Prevent the exact old failure where `Event Name = 2`.
47. Prevent the exact old failure where `Course = Yes - C-Tier`.
48. Prevent a daily job from logging `OK` while all public month pages become empty.
49. Prevent a parser/schema update from shifting all later fields by one column.
50. Prevent a renderer from using an outdated schema contract.

## Launch soak

51. Run scheduled refresh for 14 consecutive days.
52. Every run produces explicit fetch/parse/validation/health states.
53. No silent public-data wipe.
54. Review queue remains bounded and understandable.
55. Manual sample of current events agrees with source truth.

## Structured-feed discovery and launch-readiness regressions

56. A newly enabled discovery-only RSS source establishes its current latest item as a baseline and creates no historical review flood.
57. Re-reading the same RSS feed creates no duplicate discovery items or review alerts.
58. An unauthorized RSS sync request is rejected and creates no source-run/event mutation.
59. A genuinely newer relevant RSS item creates one review alert and does not publish or modify an event.
60. If the prior RSS cursor disappears from the current feed, create one bounded cursor-gap review and do not infer event changes.
61. Discovery-only RSS sources have no authoritative event fields and cannot count as sanction basis merely by existing.
62. Launch readiness is false before every required scheduled source completes its configured healthy-run soak.
63. Fourteen consecutive healthy final daily production runs satisfy the HBNF soak gate.
64. A later unhealthy/missing final required run breaks the healthy streak and returns launch readiness to false.
65. Launch readiness is false if any published event lacks provenance, any sanctioned published event lacks sanction basis, or a high/critical review blocker exists.
66. Manual/test source runs do not count toward the production launch-soak streak.
67. Public current/past filtering uses the `America/Los_Angeles` calendar date rather than UTC, so a Southern California event is not hidden early in the local evening.
68. Date-only event labels render consistently regardless of viewer/browser timezone.
69. Completed or canceled events do not show an active Registration action.
70. Protected launch-readiness data requires an authenticated active Local Roots admin and is not directly public-readable.

## Access, strong identity and freshness regressions

71. Anonymous and authenticated clients may use the public event surface/public-safe `lr_events` columns, but cannot read internal event fields or directly query private Local Roots operational tables.
72. RSS cursor/discovery bookkeeping tables explicitly revoke anon/authenticated table privileges in addition to having deny-by-default RLS; the service-role RSS worker still functions afterward.
73. Every non-null `(source_id, external_id)` pair is unique in `lr_event_sources`; a duplicate strong source identity is rejected by the database.
74. HBNF remains idempotent under the source-external-ID uniqueness invariant: a repeat run matches all existing records and creates zero duplicates.
75. A published current/future event older than 14 days since `last_verified_at` increments `stale_future_events` and blocks launch readiness; refreshing verification clears the gate.
76. The scheduled future-event freshness watch creates at most one open review per stale event and auto-resolves that review after re-verification, unpublication, or the event becoming past.
77. Current production has zero stale future-event alerts before launch soak begins; disposable freshness-watch QA leaves no test review rows behind.

## Public event discovery and result-navigation regressions

78. `Upcoming` view includes only events whose end date is today or later in the Southern California calendar; `Results` view exposes historical events without changing source authority.
79. `Results available` recognizes an event with authorized inline `top_results` or an approved outbound `results_url` and does not manufacture result data.
80. Public event search matches event name, city, course/venue, host/club, and tournament-director names without querying non-public fields.
81. Event view/search/filter state round-trips through URL query parameters so a filtered view can be bookmarked or shared.
82. Known outbound results destinations are labeled accurately (PDGA, Disc Golf Scene, UDisc, HBNF); unknown destinations use a generic official-results label.
83. Destination-aware link labels do not authorize scraping, proxying, caching, framing, screenshots, or transcription of PDGA, Disc Golf Scene, or UDisc result pages.
84. Every published event card links to a stable canonical `/events/:slug` route, and that detail route resolves the event only from the public event RPC.
85. Direct navigation to a valid event detail URL renders the event without requiring prior navigation through `/events`; an unknown slug fails closed as not found rather than exposing private data.
86. Current/future non-canceled events offer `Add to Calendar`; completed or canceled events do not.
87. Calendar downloads use all-day iCalendar dates, with `DTEND` set to the day after the event end date because iCalendar all-day end dates are exclusive.
88. Calendar files include a stable event UID and canonical Local Roots event URL and do not embed or copy third-party results content.

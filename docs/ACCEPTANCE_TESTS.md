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

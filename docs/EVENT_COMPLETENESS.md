# Event completeness system (2026-11-22)

Goal: every listing is complete by default. Gaps are computed, visible and queued; evidence closes verification items.

## Schema
- `lr_event_field_requirements`: required or expected field groups per event class (`recurring`: league, doubles, tag_match, community; `tournament`: everything else). A group is satisfied by any listed field holding a value, or by a current `not_announced` or `not_applicable` evidence row that carries a source URL.
- `lr_event_completeness` (view): per event score (required groups weigh 2, expected 1), `missing_required`, `missing_expected`.
- `lr_event_gaps` (view): one row per missing group for published upcoming events.
- Views and tables are service-role only; nothing is added to the public RPC output.

## Functions (service role only)
- `lr_apply_event_facts(event_ids, source_key, source_url, facts, actor)`: fills only NULL fields, never overwrites a differing value (records a `conflicting` evidence row instead), attaches provenance (`lr_event_sources` link plus `lr_event_field_evidence`). Facts may be `{"status":"not_announced"|"not_applicable","ttl_days":n,"note":"..."}` when the source page states nothing. Stable geography fields get non-expiring evidence; volatile fields use the source verification_ttl.
- `lr_apply_series_facts(name, source_key, source_url, facts, page_dates)`: applies one page to every upcoming event of a series and verifies each date that appears on the page.
- `lr_enqueue_completeness_gaps()`: one `event_completeness_gap` review item per event, updated in place and auto-resolved when required groups are filled.
- `lr_enqueue_duplicate_alerts()` over `lr_possible_duplicates` (same date and place, similar name or same registration URL).
- Existing `lr_enqueue_event_field_reviews()` closes `event_field_verification` items as soon as evidence exists.

## Source policy
Editorial single-page reads only for UDisc, Disc Golf Scene and PDGA (see SOURCE_POLICY_V2.md). Automated re-fetch is limited to first-party club, course and agency pages and RSS or ICS feeds.

## Tests
`app/tests/event-completeness.test.mjs` (static, in `npm run build`) and `supabase/tests/event_completeness_acceptance.sql` (rollback-only).

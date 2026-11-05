# Local Roots Events source and field audit — 2026-11-01

Read-only production evidence from Supabase project `wtymjxscneufjlkkywyg`, queried 2026-11-01 UTC. Verified source baseline: GitHub `main` 5af8892d1bf19258bbcafba832708e84ace53735. Staged additive schema/API candidate: PR #163 at `7e74726bf21cbd9fac4898bb1742a15978a449bc`. Production schema remains pre-candidate.

## Coverage

- 122 published canonical events; 9 unpublished; 47 future/active public events by DB current date 2026-11-01.
- 26 source definitions captured with access mode, permission basis, and authoritative fields.
- `events-p0-published-events-2026-11-01.csv` records every published event, source keys, result count, and absent canonical value cues. Empty means not recorded, not proven absent or not applicable.
- `events-p0-upcoming-source-facts-2026-11-01.json` records source-attached facts and URLs for upcoming events.
- `events-p0-source-authority-2026-11-01.json` preserves each current source authority/permission definition.
- `events-p0-field-audit-2026-11-01.csv` covers all 131 events (122 published and 9 unpublished) across 37 fields (4,847 event-field rows). It is deliberately conservative: `verified` requires a direct captured fact from an enabled field-authoritative source; no field-level evidence table exists in current production, so a recorded value without direct source proof stays `unverified`. Blank values are not inferred to be `not_announced` or `not_applicable`.
- `events-p0-unpublished-candidates-2026-11-01.json` captures all nine unpublished event records and all 2,657 candidate dispositions. Eight unpublished records are completed HBNF history; one is the past Oak Grove Cancer Awareness entry dated October 18, still marked upcoming. It remains unpublished and unchanged.

## Directly observed upcoming-data defects

- Oak Grove recurring `published_time` text is currently stored as the `format` for Tuesday, Wednesday, and Friday rows. That is a semantic field error; the first-party page has no corresponding play-format detail for Tuesday, and names only establish the doubles format for Wednesday/Friday. The schedule must be normalized into `start_time_note` and `format` separately.
- Oak Grove Saturday/last-Saturday schedules publish check-in at 1 PM and start at 2 PM. Current rows lack structured times. The current page was checked on this audit date; don't reuse this capture after its field-specific freshness window.
- Rabbit Flats canonical `format` combines `Drop-In Program` with `10:00 AM`; CRPD publishes the program name and start separately. The event is first Saturday monthly at Rabbit Flats in Thousand Oaks.
- The Billy Goat source calendar has an internally inconsistent November date/weekday entry. The canonical November 28 date is retained; the candidate records the conflict for review instead of changing it.
- HBNF has eight upcoming schedule-confirmed Glow dates. Only three individually verified November organizer listings carry event-specific format, course, time, fee breakdown, and event URL facts. Remaining schedule dates stay date-only unless separately verified.

Field-audit classifications: 84 verified direct source matches, 36 missing despite a direct authorized fact, 35 conflicting, 167 stale direct facts, and 4,525 unverified. These describe the captured baseline and conservative audit rules; the normalized audit CSV was regenerated from the preserved snapshot after adding first-party authority mappings for structured times and format details. These are not claims that all unverified values are wrong. No production data was changed.

## Open queue by issue type

```json
{
  "source_coverage_gap": 1,
  "source_disappearance": 12,
  "scheduled_source_health": 7,
  "possible_duplicate_event": 1,
  "stale_event_verification": 3,
  "source_date_inconsistency": 1,
  "integrity_staging_unhealthy": 14
}
```

## Candidate work completed (not applied to production)

- PR #163 adds first-class event fields, source-specific evidence/expiry, null-safe authority-aware promotion, override conflict protection, public/admin/intake paths, and bounded/deduplicated upcoming-event completeness reviews. The existing hourly gate runs the review Edge Function at 08:00 Pacific; the existing `lr-integrity-watch` source invokes `lr_enqueue_event_field_reviews(60)` and reports failure visibly. No separate monitor service was added.
- A second ordered SQL migration reconciles all snapshot-matched Oak Grove recurring schedule rows through `lr_process_candidate`/`lr_apply_authoritative_candidate` and Rabbit Flats rows through the same pipeline. PGlite executes 34 Oak Grove and 3 CRPD rows. It preserves IDs/dates/publication, preserves active manual overrides, puts approximate time guidance in `start_time_note`, stores exact times separately, separates the CRPD program from 10:00 AM, and retains the prior Disc Swap hours in source-run/source-payload history while using the currently verified 8 AM–2 PM.
- PGlite verifies the schedule guard and review deduplication, plus stale/future evidence, event-field expiry, safe clearing, authorized field boundaries, event time/fee validation, and public RPC serialization. The HBNF adapter tests exercise the exact three listing facts and prove they do not flow to the five later date-only schedule rows.
- A bounded source-fact CSV/JSON audit covers 131 events × 37 fields; the published-event file covers all 122 published records. The preserved 9 unpublished candidates remain unpublished. Current `lr_public_events()` still returns eight upcoming HBNF dates but no structured detail columns exist in production before this candidate; production has not been mutated.

## Release order and current gate

1. Apply migration `20261101070000_event_detail_fields_and_provenance.sql` and verify the guard/publication behavior and unchanged historical/unconfirmed records.
2. Apply `20261101080000_reconcile_verified_schedule_fields.sql`; read back all 37 source-reconciled rows, source-run metrics, manual overrides and the predeclared event/data acceptance criteria.
3. Deploy the HBNF sync adapter and integrity-watch function candidate only after the schema is present; verify the three detailed Glow facts, five date-only later schedule events, all public records and scheduled monitor result.
4. Deploy/reconcile remaining sources and source-integrity automation in separate gated batches; verify each before expanding the boundary.

Production remains unchanged. The current durable recovery artifact is the private, exact prechange JSON data snapshot ZIP recorded in the existing release register. The current migration history and Edge Function identities are independently read back. A schema/field rollback SQL artifact that mechanically restores every modified function, schema object, grant, candidate/source-run/evidence row, and original changed canonical/source fields has not yet been admitted and read back under the shared two-phase receipt; therefore the database/function candidate stays review-only and no production mutation is authorized by a passing build alone.

## Limits

1. The live pre-candidate schema lacks first-class event time/check-in, venue address/course URL, fee breakdown, registration windows and field evidence statuses. PR #163 adds these through source normalization, API, admin/submission, and public presentation paths.
2. Current empty fields do not prove a permitted organizer announced the fact. Every upcoming event requires source-permission-aware review; conflicting or unavailable facts remain unresolved rather than guessed.
3. Historical public result counts are captured read-only; the per-result values and allowed result source evidence still need review.
4. No production records, source permissions, schema, or publication state were changed. The corrections above remain candidate-only until exact data baseline, reversibility, release admission, and same-manifest closeout requirements pass.

## Continuation handoff (2026-11-01)

- The candidate remains isolated on the existing `feat/events-p0-completeness-20261101` branch / draft PR #163. Production main remains `5af8892d1bf19258bbcafba832708e84ace53735`; production Supabase migration head remains `20261019174043`. No migration, Edge Function, or event data was applied.
- The integrity-watch candidate now enqueues completeness review before checking launch readiness. This ensures field review findings can still be recorded when a separate launch-readiness check fails. A regression asserts this ordering.
- Full repository `npm test` passed on the candidate: typecheck; M2 128/128; release-receipt 40/40; event adapters/contracts 19/19; PGlite PostgreSQL migration runtime 1/1. `npm run release:audit-workflows` passed for both workflow files. `git diff --check` passed. (An earlier direct invocation of the TypeScript watcher test from the checkout root used the wrong relative base; the supported compiled `npm test` path ran it successfully.)
- The exact source snapshot remains at `/Users/andrew/Code/checkpoints/events-db-baseline-20261101/`, with the prechange DB ZIP already stored privately in the existing Local Roots Drive folder (ID `1IL8ZzUYpxiB7e7Y8wHFBHFZIUGGNWwp7`, SHA-256 `8e80b053d1a043990ab0ecfe276fb8bc7f7be7e9b3418220f654252c217e5241`). It is a data snapshot, not a schema rollback image.
- Do not run either migration or deploy the sync/watch functions until a product-specific exact rollback package is built from the actual prechange schema/function definitions, source/data changes are mechanically reversible, the release-control target map is updated, and the same-manifest `release:admit` returns PASS after durable candidate and rollback download-back. The existing snapshot did not preserve full schema/function definitions or enough source-payload state to claim a complete rollback. No production release authorization is inferred from test success.
- Next continuation: use this branch/PR head and audit artifacts; independently author and execute PostgreSQL rollback tests against PGlite for every DDL/function/grant/source-data change; add precise reverse migration and data restoration artifact; verify the exact migration+function production deployment identities and target-map receipt; only then satisfy two-phase admission. If exact restoration of production source/data cannot be evidenced, keep the database/function change `REVIEW_ONLY` and do not mutate production. Separately, carry out source-by-source remediation and public consumer verification in bounded slices.

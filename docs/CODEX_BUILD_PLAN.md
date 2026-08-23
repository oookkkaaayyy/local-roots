# Local Roots Events — Codex Build Plan

## Goal

Use Codex for bounded implementation tasks, not product discovery.

Do not begin Codex implementation until this package is in the repository.

## Repository target

Recommended private repository:
`local-roots`

Recommended folders:
```text
/
  AGENTS.md
  docs/
    PRODUCT_SPEC.md
    DATA_CONTRACT.md
    SOURCE_RULES.md
    ACCEPTANCE_TESTS.md
    PHASE_1_AUDIT.md
    ARCHITECTURE.md
    SOURCE_REGISTRY_SEED.md
  supabase/
    migrations/
    functions/
  app/
  tests/
    fixtures/
    adapters/
    integration/
```

## Usage-conservation rules

1. One milestone per Codex task.
2. Do not ask Codex to rediscover requirements from chat history.
3. Give Codex exact files to read.
4. Require tests in the same task as implementation.
5. Use saved fixtures rather than repeatedly browsing sources.
6. Do not work on frontend styling while ingestion/schema is unstable.
7. Do not parallelize agents unless tasks have truly independent file ownership.
8. Start with the least-expensive model appropriate to the task; escalate only for difficult architecture/debugging.
9. Keep `AGENTS.md` short and operational.
10. End each milestone with a clean commit and test report.

## Milestone 0 — repository scaffold

Human/ChatGPT prep, minimal Codex:
- create repo;
- add this documentation package;
- create basic app/test structure;
- configure Supabase project linkage without committing secrets;
- create `.env.example`;
- add CI test command.

Exit:
- repo builds;
- no production source ingestion;
- no secrets committed.

## Milestone 1 — database and domain model

Codex task:
- create schema/migrations for source registry, runs, candidates, events, provenance, results, overrides, review queue, scope profiles;
- implement constraints;
- enable appropriate RLS;
- create public read view;
- generate typed client models;
- implement unit tests for constraints and override precedence.

No adapters.
No frontend beyond a health/test harness.

Exit:
- migration cleanly applies;
- can seed synthetic events;
- tests pass;
- Supabase advisors acceptable.

### Exact Codex prompt

Read:
- `docs/PRODUCT_SPEC.md`
- `docs/DATA_CONTRACT.md`
- `docs/SOURCE_RULES.md`
- `docs/ACCEPTANCE_TESTS.md`
- `AGENTS.md`

Implement Milestone 1 only: the Supabase/Postgres domain model and tests.

Requirements:
- Do not implement web scraping or external source adapters.
- Do not build the public event UI.
- Use migrations for the final schema.
- Add constraints that prevent the historical schema-corruption failures documented in `PHASE_1_AUDIT.md`.
- Implement RLS/public read isolation so raw payloads, review data, and admin fields are not exposed.
- Implement manual-override precedence in a deterministic, testable layer.
- Add automated tests covering acceptance tests 1–8, 24–27, 41, 44, and 45.
- Run the full test suite and fix failures before stopping.
- Finish with a concise summary of files changed, migration names, commands run, tests passed, and any unresolved blockers.
- Do not make unrelated refactors.

## Milestone 2 — normalization, matching, validation engine

Codex:
- adapter interface only;
- fixture-backed candidate ingestion;
- normalized candidate schema;
- dedupe/match scoring;
- review queue generation;
- source-run health states;
- anomaly detection;
- no live third-party fetching.

Use historical known-good/bad fixtures.

Exit:
- all fixture tests pass;
- exact Sheet corruption cannot pass validation.

## Milestone 3 — first permitted production adapter

Only after data-access permission is confirmed.

Preferred first adapter:
- authorized PDGA API, if Local Roots receives suitable permission.

Alternative:
- organizer submission ingestion / permitted club feed.

Codex:
- implement exactly one adapter;
- add captured fixtures;
- run adapter and integration tests;
- do not add a second adapter in same task.

## Milestone 4 — organizer submission + admin review

Implement:
- event submission form;
- authenticated admin review queue;
- approve/reject/merge;
- manual correction/override UI;
- source health dashboard.

This milestone is central to minimizing ongoing user labor.

## Milestone 5 — public `/events` page

Only after data layer is stable.

Implement:
- upcoming chronological view;
- month/date navigation;
- county/sanction/event-type filters;
- responsive event cards/table;
- registration actions;
- completed result display;
- Local Roots brand system.

Use the public read view only.

## Milestone 6 — backfill + QA

- import clean historical/canonical rows as fixtures/backfill;
- compare active event corpus with source truth;
- resolve discrepancies;
- verify results logic;
- verify all event links;
- test mobile/desktop;
- accessibility checks.

## Milestone 7 — launch soak

- daily schedules active;
- 14 consecutive healthy runs;
- health alerts working;
- no silent zero-record failures;
- backup/restore verified.

Then launch.

## Codex anti-patterns for this project

Do not prompt:
- “fix the event tracker”
- “build the whole Local Roots site”
- “scrape PDGA, DGS and UDisc and make it work”
- “look at the old sheet and recreate it”

Those prompts force Codex to spend tokens on discovery and encourage architectural coupling.

Prefer:
- “Implement Milestone 2 only. Read these five files. These tests must pass. Do not touch UI.”

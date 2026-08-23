# Milestone 2 — Normalization, Matching, Validation, and Source Health

Milestone 2 is source-independent. It must not fetch or scrape PDGA, UDisc, Disc Golf Scene, or any other third-party source.

## Deliverables
- candidate normalization/validation helpers;
- configuration-driven geography scope evaluation;
- deterministic strong-identifier matching before fuzzy matching;
- ambiguity routing to `lr_review_queue`;
- source-authority-aware date change handling with audit history;
- source-run health/anomaly evaluation independent of scheduler/fetch success;
- no destructive handling of canonical events when a source disappears;
- transactional regression fixtures for acceptance tests 9–23, 35–40, and historical regression protections relevant to this layer.

## Invariants
- stable source IDs outrank fuzzy similarity;
- same-name events on different dates are distinct;
- conflicting venue/date evidence routes to review rather than guessing;
- active scope lives in database configuration, not adapter code;
- HTTP success does not imply data health;
- zero-record or severe-collapse runs cannot silently wipe last-known-good public data;
- no live external adapter is added in this milestone.

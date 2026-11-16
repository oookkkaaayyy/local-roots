# HBNF Live Round / Season contract fixtures (review only)

This folder does not implement pages, run a sync, query the database or use a device. It exists only to make the accepted 2026-11-16 source-backed specification durable and executable outside chat.

Read the source specification in Google Drive: HBNF_Live_Season_Spec_2026-11-16_Coordinator, id 1tqH5CiwtDkoi3EIlvKOlpFmxzRQYdG06KBlczFkJv5I. Authority for final/award data remains existing scoring issues #115/#147 and HBNF PR #151; this review branch has no public-data feed.

Run: node --test tests/hbnf-live-season-contract.review.test.mjs

The tests exercise *reference-only model functions* for accepted rules, not the current HBNF app. Passing them is NOT proof of any production behavior or public-feed eligibility. The mobile navigation/device fixture is intentionally skipped until a real safe browser/auth harness exists. Do not change scores, tags, league_state, official UDisc sync, One-off or Cart state.

Before implementation: pin approved immutable final receipts/award/identity and calendar authority, wire these fixture expectations against actual production code in a review branch, then test an offline public projection and same-host navigation. No release/merge on the basis of these tests alone.

Reusable review-only pure model is now implemented in `scripts/review/hbnf-live-season/model.mjs` and exercised by `tests/hbnf-live-season-model.test.mjs` (5 behavioral groups). Run `npm run test:hbnf-live-season-model` from repository root. It handles strict final-only season filtering (with timezone and revision conflict rejection), certified competition ranks (1,1,3), score age independent of feed status, incomplete hole/par withholding, and resolved/unresolved Skins carries. It accepts ONLY caller-supplied approved records, does not read a live score source and does not imply permission to expose stored scores. The earlier synthetic spec tests remain independent. The eventual public adapter must validate real approved projection shape and coverage before using this model.

# HBNF Live Round / Season contract fixtures (review only)

This folder does not implement pages, run a sync, query the database or use a device. It exists only to make the accepted 2026-11-16 source-backed specification durable and executable outside chat.

Read the source specification in Google Drive: HBNF_Live_Season_Spec_2026-11-16_Coordinator, id 1tqH5CiwtDkoi3EIlvKOlpFmxzRQYdG06KBlczFkJv5I. Authority for final/award data remains existing scoring issues #115/#147 and HBNF PR #151; this review branch has no public-data feed.

Run: node --test tests/hbnf-live-season-contract.review.test.mjs

The tests exercise *reference-only model functions* for accepted rules, not the current HBNF app. Passing them is NOT proof of any production behavior or public-feed eligibility. The mobile navigation/device fixture is intentionally skipped until a real safe browser/auth harness exists. Do not change scores, tags, league_state, official UDisc sync, One-off or Cart state.

Before implementation: pin approved immutable final receipts/award/identity and calendar authority, wire these fixture expectations against actual production code in a review branch, then test an offline public projection and same-host navigation. No release/merge on the basis of these tests alone.

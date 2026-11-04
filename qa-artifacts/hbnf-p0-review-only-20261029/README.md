# HBNF Skins P0 review evidence (REVIEW_ONLY)

This overlay exists because the recovered source history at `b74c789b53860b79cf419c14da90047b7b6b8258` has no common ancestor with this repository’s GitHub `main`. The exact source branch remains separately published as `review/hbnf-skins-cold-reopen-b74c789`; its ancestry is `b74c789` → `376b31c` → `6b92348`. This review-only branch is based on `main` and includes that source history as a second parent, preserving both histories without merging product source.

All files in this directory are evidence only. No production code, workflow, deployment configuration, migration, database record, or Cart #116 file is changed. The exact candidate and baseline packages, source bundle, integration harness, screenshots, and receipts are in `evidence/` and the ZIP.

Result: local source regression 11/11 pass; native local Supabase/PostgREST and Chromium scenarios 17/17 pass; cross-writer audit FAIL_CONFIRMED: the separate Glow #147 full-root upsert overwrites a valid Skins score. Overall qualification: REVIEW_ONLY; not qualified for release admission until #147 is separately addressed and cross-writer integrity passes. No field acceptance. Production requests/writes: 0.

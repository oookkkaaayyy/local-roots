# HBNF Skins P0 — 2026-10-29 REVIEW_ONLY engineering evidence

This archive preserves the exact recovered candidate and its engineering evidence. It does not authorize or represent a production release.

## Exact source and baseline

- Candidate commit: `b74c789b53860b79cf419c14da90047b7b6b8258`; parent: `376b31ccf3be3fed06cb7a17810e7ad15ca0cb01`.
- Full Git bundle: `packages/source-history.bundle`; verified complete history and contains the exact commit.
- Candidate package: `packages/candidate-44-assets.zip`; 44 assets, 3,267,533 bytes, SHA-256 `3073023036a39dfda5ffc7afb6f1de4d8b13eacdb5fad92fdc2d8542da1540b1`.
- Candidate `skins.html`: 214,518 bytes, SHA-256 `c78d01d4ff1c90786ccf8cc15ec77b782bf30fd40b603ecdae2a7ad52dae80d9`; exact byte match to commit `b74c789`.
- Recovered baseline package: `packages/baseline-44-assets.zip`; 3,264,714 bytes, SHA-256 `29d3c6c2aa9038063c659a5361b932ce2c9819a481fd020b5172701450dc477a`.
- File-level comparison: all 44 candidate paths match baseline; only `skins.html` differs.

## Exact test results

- Candidate source-path regression: **11/11 PASS**.
- Pinned native Supabase `2.122.0` local database/API persistence: **PASS** for readback, two consecutive saves, and stale compare-and-swap no-overwrite. Isolated database fixture was restored.
- Chromium on the exact candidate package: **17 behavior checks PASS**, including browser-profile process close/relaunch with an unacknowledged offline edit, actual local PostgREST save/readback, forced failed readback, offline recovery, CAS conflict, quota failure status, cross-profile realtime, Front/Back preservation, Undo, and payout/ace/standings projections.
- Chromium layouts: **PASS** at 320, 390, 430, 768, and 1024 CSS-pixel widths; status landmark uses `role=status` and `aria-live=polite`. Evidence screenshots are included.
- Production requests during the browser run: **0**. No production database, Cloudflare, migrations, device storage, or historical scores were changed.
- Cross-writer test: **FAIL CONFIRMED**. In isolated PostgREST, a Skins CAS save succeeded, then the unchanged Glow source's stale full-root upsert erased that Skins value. This is tracked separately in GitHub issue #147.
- Overall scoring safety: **FAIL**. Candidate is not qualified for separate release admission. No field acceptance is claimed.

The machine-readable full run receipt is `integration/receipt.json`; test source, pinned package lock, and screenshots are included. `SHA256SUMS.txt` binds every archive member.

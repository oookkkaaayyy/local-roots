# UDisc → Glow rollout status

**Disposition: REVIEW_ONLY. No production change has been made.**

## Verified in this slice

- UDisc's public, event-specific `leaderboard/export` route returned a valid XLSX for the public HBNF test event. The workbook was 19,846 bytes; SHA-256 `7b5b50ee487161a72ba6299aee4ae86325c1bbe3b82d479c1112ed7a7718078d`.
- The local rehearsal route and the tested Worker handler return byte-identical exports for that event. No player names from the workbook are recorded here.
- The Worker handler accepts only a single HBNF-shaped event slug, rejects non-GET methods, foreign origins, redirects, non-XLSX responses, corrupt workbooks, and bodies over 12 MiB; it does not forward browser cookies and does not cache exports.
- The HBNF preview page at `https://446f1496-hbnf.azworker.workers.dev/udisc-glow-preview` currently serves the rehearsal page, but its `/api/udisc-glow/export` endpoint returns 404. Thus the visible page is not currently live-connected in the hosted preview.
- A fresh authenticated Safari read of Cloudflare's HBNF rollout history shows the latest P0 scoring repair version `3b019c24` at 100% (2026-10-29 UTC). The existing P0 release record still lists `be071e5e` as active, so its baseline is stale and must be reconciled before any further deployment. Read-only GETs to production confirmed `/api/udisc-glow/export` returns 404 and `/udisc-glow-preview.html` returns 404; no production writes were made.
- The local rehearsal rendered an HBNF-style **read-only proposal** through the earlier local proxy. After refactoring the local route to the Worker handler, that route returned the identical XLSX hash, but the browser click-through was not repeated against the refactored server. The page does not save scores into Glow, recalculate tags or payouts, or update established standings. The import confirmation function was not invoked.
- The rehearsal still asks for an event link; it does not discover the active Glow event automatically. The repository's UDisc access rule currently authorizes the event-bound export route, not schedule crawling.
- Four authentic-XLSX-derived event fixtures pass the existing contract checks for team order, ranks/ties, 18 hole values, changed partners, corrections, incomplete cards, and duplicates. The proposal tests also verify that identity suggestions are not automatic first-name matches.

## Changes in this review-only source slice

- Added a bounded, read-only Worker export handler under `source-snapshots/hbnf-worker-d1a5f936-20261024/src/index.js`.
- Routed the local rehearsal proxy through that same handler so the rehearsal exercises the code under review.
- Added focused handler tests and included the UDisc/Glow fixture suite in the repository's `npm test` command.

The Worker directory is still an **observed source snapshot**, not the verified canonical HBNF deployment source. It has not been uploaded to Cloudflare. The public export route also still needs an approved abuse/rate-control design before it is exposed on the public site.

## Required gates before rollout

1. Establish the canonical HBNF source/build path and bind the exact candidate to it. The current observed snapshot does not establish byte parity with all active assets.
2. Resolve how the app selects the active UDisc event without unauthorized schedule crawling, while keeping the start-of-round interaction to a few taps.
3. Complete the endpoint's public-access/rate-control review and test the same-origin hosted path against real HBNF events, including UDisc failure and in-progress score refresh behavior.
4. Integrate updates with the existing Glow scorecard and its acknowledged save/recovery flow. Preserve existing week data, tags, payouts, and standings; verify the scorecard after refresh/reopen. The active HBNF score-save repair remains a separate prerequisite for unattended live writes.
5. Build the full package from the exact approved source commit, retain and read back the exact rollback and candidate, and pass the same-manifest release admission gate against a fresh provider baseline.
6. Complete the established scorecard, tags/payouts, standings, Matrix refresh/reconnect, restore, and physical-device acceptance before live use; then write and verify the same-manifest closeout receipt.

The local tests and preview are source/preview evidence only. They do not satisfy hosted integration, production persistence, device acceptance, or release admission.

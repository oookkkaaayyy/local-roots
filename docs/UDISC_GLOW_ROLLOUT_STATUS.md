# UDisc → Glow rollout status

**Disposition: REVIEW_ONLY. No production change has been made.**

## Controlling sequence: data path before site behavior

The owner has clarified that the underlying automatic UDisc-to-Glow score path must be implemented, installed, and verified before any further HBNF site-behavior work. Treat the local picker and preview as frozen review aids until that gate passes.

- A current read-only Supabase function inventory for HBNF project `phcpbvuqibyarpfrftgx` contains no UDisc/Glow score-sync function. The existing `deploy-disc-glow-cloudflare` helper returns HTTP 410 and states it is disabled.
- The existing production `/glow` page has no UDisc score import path; production `/api/udisc-glow/export` and `/udisc-glow-preview.html` were previously verified as 404. Therefore automatic score delivery into the production Glow week is **not installed**.
- The verified UDisc route is a public event XLSX export. It can be read without a browser login for a known HBNF event; this proves source access and parsing feasibility, not automatic delivery or persistence. No official UDisc push/webhook has been established. A future flow must refresh the selected event from a server-side route while a round is active, then merge only that event's 18-hole scores into the established Glow week with concurrency protection and full provenance.
- The destructive `confirmQuickUdiscImport()` path is not acceptable for sync: it replaces all teams/scores in the selected week and invokes the whole-root save. Any integration must preserve other week data and avoid last-writer-wins overwrites; it must have idempotent correction handling, stale/error visibility, and readback verification.
- No further picker or presentation work is in scope before the underlying flow is implemented. The next code slice is the server-side fetch/parse/transaction-safe merge with tests against the four authentic-derived fixtures and no production writes. Installation remains blocked until the canonical HBNF source/deploy path and same-manifest release admission/rollback gates are verified.

## Verified in this slice

- **Fresh read-only source smoke check (2026-10-28):** the public HBNF schedule returned HTTP 200 and two Glow event links. The newest listed event was 2026-10-24. Its event-specific export returned HTTP 200 as an XLSX, 24,128 bytes. The workbook had five score rows, all 18 hole columns, and complete hole values. Player names and scores were not copied into this record. This verifies that the source path works now for a completed event; it does not prove that UDisc publishes in-progress score changes at a reliable interval.
- **Current baseline recovery (2026-10-28):** the current-first HBNF release index identifies active Cloudflare Worker version `3b019c24-0288-4c0d-bcc2-46cb6028d0f6` at 100%, the exact 44-asset rollback package (3,264,714 bytes; SHA-256 `29d3c6c2aa9038063c659a5361b932ce2c9819a481fd020b5172701450dc477a`), and source commit `376b31ccf3be3fed06cb7a17810e7ad15ca0cb01`. I independently downloaded and verified the ZIP and compared all 44 embedded assets against that source commit; all 44 match. This resolves the prior stale-package mismatch for static assets. The recovered config is static-assets-only; it does not contain an installed API Worker or score-sync path.

- Earlier verification retrieved a public HBNF test-event XLSX (19,846 bytes; SHA-256 `7b5b50ee487161a72ba6299aee4ae86325c1bbe3b82d479c1112ed7a7718078d`). The fresh event read above is separate evidence and has a different size and event date.
- The local rehearsal route and the tested Worker handler return byte-identical exports for that event. No player names from the workbook are recorded here.
- The Worker handler accepts only a single HBNF-shaped event slug, rejects non-GET methods, foreign origins, redirects, non-XLSX responses, corrupt workbooks, and bodies over 12 MiB; it does not forward browser cookies and does not cache exports.
- The HBNF preview page at `https://446f1496-hbnf.azworker.workers.dev/udisc-glow-preview` currently serves the rehearsal page, but its `/api/udisc-glow/export` endpoint returns 404. Thus the visible page is not currently live-connected in the hosted preview.
- Read-only GETs to production confirmed `/api/udisc-glow/export` and `/udisc-glow-preview.html` return 404; no production writes were made. The current-first release index and exact asset package resolve the previously stale rollback record for the active v343 baseline. No new candidate admission has been created.
- A bounded production HTTP readback captured 44 currently served baseline assets for `3b019c24` (all HTTP 200; 4,471,306 raw bytes). The private recovery ZIP is Drive file `19fSca5KLdCU7YgLavpnAZFPWFCxUApW7`, SHA-256 `5bf7643debee9a97a7ad91efcee1057aabb914833910cfd9f1fbff61e9d3ac4e`; the Drive download-back matched byte-for-byte. This is served-route evidence, **not** a provider asset export or verified deploy rollback. It remains `RECOVERY_EVIDENCE_REVIEW_ONLY`; the old 49-asset candidate differs on 16 of the 44 captured assets and omits the five UDisc preview assets, so it is stale.
- Follow-up source comparison established that all 44 response bodies and byte lengths match the readback manifest; 43 of 44 also match the observed Worker source snapshot. The remaining `skins.html` matches the separately verified active P0 scoring candidate SHA-256 `e8e1d0513f53b1c273b921e1ef5fbf42330f8ec9191693f33d066bd0e63e4a97`. The nine snapshot assets absent from the live routes are the preview/rehearsal files and fixture. This is strong route-level reconstruction evidence; it still does not prove Cloudflare's uploaded bundle or establish version lineage.
- A deterministic 44-asset Wrangler rollback-input package was built from that route readback and source-snapshot configuration. Its private Drive copy is `1Ka_mGLxX6Hs55MDhbpYBR8EnKnhg7zkJ`, 4,536,959 bytes, SHA-256 `b87ebcdd388adfab93ee0cd890d7526f04f2c7aa3e5f93676f22f83fe3b89c77`; the downloaded copy matched byte-for-byte, ZIP integrity passed, and all 44 embedded asset files matched the captured route hashes. It is explicitly `REVIEW_ONLY`, not an exact provider export or admitted rollback.
- The reconstructed package installs the pinned Wrangler 4.152.0 toolchain and passes `wrangler deploy --dry-run`; the dry run exited before upload. This validates the local static-assets input and config only, not provider source lineage or a release.
- A separate read-only request to the public HBNF UDisc league schedule returned HTTP 200 without browser cookies and exposed 20 event leaderboard links, including the Oct. 24 Glow Doubles event. The current local source now has a bounded schedule reader and simple Glow round picker: it fetches one public schedule page without cookies, pagination, or polling, then exports only after a round is selected. A real local rehearsal request returned two Glow event choices (Oct. 24 and Sep. 19, 2026). This source is not deployed; the pre-existing server on port 8767 still runs an older process, while the updated rehearsal is on port 8768.
- The local rehearsal rendered an HBNF-style **read-only proposal** through the earlier local proxy. After refactoring the local route to the Worker handler, that route returned the identical XLSX hash, but the browser click-through was not repeated against the refactored server. The page does not save scores into Glow, recalculate tags or payouts, or update established standings. The import confirmation function was not invoked.
- The picker lists Glow events from the public schedule, but does not identify which round is currently in progress or automatically select it. User selects the current round once; only then does the page request live scores and refresh while visible. The selector and schedule route remain local-only until access policy, canonical source, hosted route, and abuse/rate-control gates pass.
- Four authentic-XLSX-derived event fixtures pass the existing contract checks for team order, ranks/ties, 18 hole values, changed partners, corrections, incomplete cards, and duplicates. The proposal tests also verify that identity suggestions are not automatic first-name matches.

## Changes in this review-only source slice

- Added a bounded, read-only Worker export handler under `source-snapshots/hbnf-worker-d1a5f936-20261024/src/index.js`.
- Added a bounded one-page UDisc schedule parser, read-only events endpoint, and picker in the local review page.
- Added event-discovery fixtures and endpoint validation. `npm run test:udisc-glow` passes 30/30 tests; `git diff --check` and JavaScript syntax checks pass. The actual local endpoint returns two public Glow event choices and the page serves the picker markup.
- Routed the local rehearsal proxy through that same handler so the rehearsal exercises the code under review.
- Added focused handler tests and included the UDisc/Glow fixture suite in the repository's `npm test` command.

The recovered static assets are now independently matched to the indexed canonical source commit, but its deployed config is assets-only. Adding an API Worker and installing a safe sync writer still require a new, source-bound candidate and release receipt. The public export route also still needs an approved abuse/rate-control design before it is exposed on the public site.

## Required gates before rollout

1. Build the candidate from the recovered exact baseline and bind the API Worker code/config to that source commit.
2. Resolve how the app selects the active UDisc event without unauthorized schedule crawling, while keeping the start-of-round interaction to a few taps.
3. Complete the endpoint's public-access/rate-control review and test the same-origin hosted path against an active HBNF event, including UDisc failure and repeated in-progress score refresh behavior.
4. Integrate updates with the existing Glow scorecard and its acknowledged save/recovery flow. Preserve existing week data, tags, payouts, and standings; verify the scorecard after refresh/reopen. The active HBNF score-save repair remains a separate prerequisite for unattended live writes.
5. Build the full package from the exact approved source commit, retain and read back the exact rollback and candidate, and pass the same-manifest release admission gate against a fresh provider baseline. The indexed rollback package is recovered; no UDisc candidate manifest has been admitted.
6. Complete the established scorecard, tags/payouts, standings, Matrix refresh/reconnect, restore, and physical-device acceptance before live use; then write and verify the same-manifest closeout receipt.

The local tests and preview are source/preview evidence only. They do not satisfy hosted integration, production persistence, device acceptance, or release admission.

## Fixture-driven live-path implementation (2026-10-28)

The owner confirmed that acceptance must use fixture/simulation evidence and must not wait for another active Glow round. The new slice implements the server-side scheduled path while keeping the existing Glow card as the only score presentation:

- A Cloudflare Worker cron checks the public HBNF schedule every two minutes, selects a single Glow event dated today in Pacific time, fetches that event's public XLSX, and parses it server-side. No browser cookie or visible reconciliation screen is needed in the scoring workflow.
- The runner reads `league_state` id 1 through a server-side service-role credential, uses exact `glow.playerAliases` plus historical Glow names as evidence, and stops before writing if names remain unresolved or conflict. A first-name-only history hit is not treated as confirmation.
- A pure merge updates only the dated Glow week, preserving existing card/team IDs when identities match, hole order and scores, other week settings, payouts, tags, and unrelated state. It retains UDisc rank, row order, relative-to-par, stroke totals, correction history, and export provenance in `week.udiscSync`.
- A target-specific Postgres RPC locks `league_state` row 1 and compares the expected event week and active week before changing only `glow.weeks[date]` and `glow.activeWeek`. It rejects concurrent changes, locked weeks, finalized cards, invalid replacement data, and unresolved identity. It is executable only by `service_role`; the Worker has no public write endpoint.
- Repeated snapshots with the same score signature do not write. Changed snapshots update the same event and append bounded provenance history. No call to `confirmQuickUdiscImport()` or whole-root client save is used.

### Fixture acceptance matrix

| Gate | Result | Evidence |
|---|---|---|
| Authentic-derived event shapes, team order, tied ranks, 18 holes | PASS | Four anonymized workbook-derived fixtures in the repository |
| Correction/replay/incomplete-round behavior | PASS | Simulated scheduled runner applies a change, skips identical replay, and records correction history |
| Duplicate identities and changed partnerships | PASS | Exact alias identity preserved; ambiguous matches stop before RPC |
| Existing Glow fields, tags, payouts, notes, team IDs | PASS | Merge tests assert retained values; no replacement of unrelated scorecard fields |
| No destructive import / no production calls in fixtures | PASS | Runner tests use mocked UDisc and Supabase endpoints; existing import-isolation test passes |
| Production data state | NOT CHANGED | No migration or production write was run |
| Active-round UDisc partial-export behavior | NOT CHECKED | Fixture simulation covers incomplete rows; no active UDisc event was available, by owner direction this is not a reason to wait before code work |
| Focused local acceptance suite | PASS | `npm run test:udisc-glow` — 43/43 tests, including the scheduled runner and compressed XLSX fixture path |
| Production install and current Glow readback | BLOCKED | Supabase production reads have timed out in the preceding bounded check; no exact candidate admission/closeout receipt or provider-backed Worker rollback has been established |
| Field/Matrix acceptance | NOT CHECKED | Requires a temporary scorecard through supported scoring, live Matrix refresh/reconnect, delete/restore, and device baseline verification |

### Remaining install gate

This source is still **REVIEW_ONLY**. The observed production deployment remains static-assets-only, so this Worker cron, its server-side Supabase credential, and the atomic RPC are not installed. The SQL file is a proposed migration, not applied. The package builder now includes Worker source, exact dependencies, static assets, and the migration in one candidate input; however, the candidate package has not been built or validated with Wrangler, and the current package builder does not implement the two-phase release receipt. The shared release-control kit also requires the exact installed target, candidate, rollback bytes, durable readback, and same-manifest admission/closeout; the indexed static asset rollback alone does not prove the exact running Worker script. The next integration gate is to recover the live Supabase read and provider Worker version/rollback evidence, wire the candidate through a fail-closed two-phase receipt path, then run provider-backed readback before any field test.

## Follow-up hardening and current target read (2026-10-28)

- The exact feature branch is `7262764b49860e9c492a43031d41ac66f019a02c`; GitHub independently returned a changed Worker source file at this revision. The focused suite passed 44/44 after the active-week guard changes.
- A fresh, read-only Supabase query succeeded. `league_state` id 1 reports 39 non-empty player aliases, 15 dated Glow weeks, and active week `2026-10-28`. The latest public HBNF Glow schedule event is dated `2026-10-24`; its 24,128-byte export parsed locally as six complete 18-hole rows. This is completed-round evidence only. No names or scores are copied here.
- The event-date mismatch exposed a safety case: a delayed export must not switch Glow's active week, and sync must not create a week with missing HBNF defaults. The runner now stops unless the event date is already the active, initialized Glow week. The RPC independently checks both conditions under the row lock, updates only that dated week, and no longer changes top-level `activeWeek`. Regression tests cover wrong active date and absent week.
- Package validation found 53 static files in the source snapshot while the reconstructed production baseline has 44. Four files are review/rehearsal-only. The package builder now permits the exact 44 baseline assets plus the two Worker-imported parser modules; the curated candidate package has not yet been built after this adjustment.
- Existing local candidate/admission/release receipts bind older review commits and cannot be reused. An authenticated Cloudflare dashboard readback on 2026-10-29 confirms production is on Worker version `343`, ID `3b019c24-0288-4c0d-bcc2-46cb6028d0f6`, at 100% traffic (created 2026-10-28 23:02 UTC). Version metadata identifies direct asset serving and no explicit bindings. The authenticated GET for the script returned HTTP 204, so exact deployed source/package bytes were not obtained from this readback. The CLI identity check timed out after 25 seconds; no provider mutation was attempted. The open HBNF rehearsal is an older preview and is not evidence for this commit.
- **Current disposition remains REVIEW_ONLY.** The database function is absent in production. The current deployment identity and traffic are now confirmed, but an exact provider rollback package and durable byte readback remain missing. The candidate plus rollback still need fresh same-manifest readbacks, and the project needs an executable repository-native two-phase release gate for the actual Worker and migration path. No installation or production write has occurred.

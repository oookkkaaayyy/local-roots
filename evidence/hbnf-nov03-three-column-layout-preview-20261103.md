# November 3 HB Glow Doubles — attributed 18-hole conditional three-column preload

> **OWNER PAR59 LAYOUT SUPERSESSION — 2026-11-03 (latest evidence; no production write).** The historical `UNKNOWN` comparison table later in this file was a prior checkpoint; it is now **superseded for layout source values only**, NOT proof the actual UDisc Round 1 has this layout selected. Source: [#115 owner original 18-hole screenshot transcription](https://github.com/oookkkaaayyy/local-roots/issues/115#issuecomment-6617174574), immutable [event-scoped PAR59 JSON fixture](../tests/fixtures/authentic-udisc/2026-11-03-layout-150408.json). Still **REVIEW_ONLY**; do not upload this table directly into `league_state` or overwrite scoring history.

## Owner-transcribed UDisc layout 150408 — HB Glow Dubs 11.3.26

Actual event slug `hb-glow-doubles-tAP8Y5`; [caddie book](https://udisc.com/courses/huntington-beach-central-park-A9Fe/layouts/150408/caddie-book); photographed layout labelled Active, `All safari layout.`, **18 holes**, **par 59**, header **6,022 ft**. Individual displayed rounded hole lengths total **6,023 ft** (one-foot rounding mismatch; retain both reported figures). The selected **Round 1** layout association remains **unverified** from organizer event configuration; title/date of this layout and screenshot event badge are not sufficient to claim attachment. No registered player/team mapping is required before round start.

**Exact top rule:** `NO INTENTIONAL THROWS OVER PARKING LOT. If you throw over the parking lot on purpose you will be DISQUALIFIED. Other than that, no OBs or mandos.`  
**Unresolved rule interpretation:** Hole 17 explicitly says `double mando`, while global rule says no mandos. Preserve both and obtain organizer ruling before applying a penalty. Holes 8/9 have explicitly truncated source target labels; do not invent their suffixes.

| Hole | Tee → basket/target (owner screenshot) | ft | Par | Hole note |
|---:|---|---:|---:|---|
| 1 | Parkinglot → B on hole 7 | 196 | **3** | Parking near pad 10 → 7 |
| 2 | Short → B on hole 18 | 274 | **3** | 7 short → 18 |
| 3 | Short → B on hole 12 | 249 | **3** | 17 short → 12 |
| 4 | Short → A on hole 14 | 260 | **3** | 16 short → 14 |
| 5 | Main → B on hole 10 | 573 | **4** | 18 main → 10 |
| 6 | Short → A on hole 15 | 237 | **3** | 16 short → 15 |
| 7 | Main → New 16 on hole 16 | 250 | **3** | 15 main → 16 |
| 8 | PathBy16Long → Practice 1 (shop) on hole Glo… [UI truncated] | 270 | **3** | Path by basket 16 → Practice 1 |
| 9 | Main → Practice 3 (long) on hole Glo… [UI truncated] | 212 | **3** | 1 main → Practice 3 (CTP) |
| 10 | Main → New 16 on hole 16 | 233 | **3** | 8 main → 16 |
| 11 | Main → A on hole 5 | 660 | **4** | 12 main → 5 |
| 12 | Main → A on hole 15 | 308 | **3** | 14 main → 15 |
| 13 | Short → B on hole 6 | 230 | **3** | 15 short → 6 |
| 14 | Main → B on hole 7 | 365 | **3** | 18 main → 7 |
| 15 | Main → A on hole 14 | 536 | **4** | 8 main → 14 |
| 16 | Short → B on hole 10 | 309 | **3** | 16 short → 10 |
| 17 | Main → C on hole 17 | 396 | **4** | 12 main → 17 (double mando) |
| 18 | Main → New 16 on hole 16 | 465 | **4** | 18 main → 16 |

**Actual Nov3 organizer XLSX first observation:** `hb-night-flyers-hb-glow-doubles-2026-11-03.xlsx`, 15,783 bytes, single `Event results` sheet, dimension `A1`, empty `sheetData`; **no score/header/team rows**, expected before scoring. This is `EMPTY_EXPORT_NO_SCORES`, not failed UDisc card setup or evidence of missing participant. The review source now refuses to fabricate hole1/teams/status writes/Cart intent on empty and roster-only exports. Genuine participant/alias crosswalk begins only when UDisc exposes scored event rows at play.

**Current release source status:** UDisc branch has corrected late team ID allocator, scored-partnership review gate, empty/no-score early exits, and PAR59 fixture native source/projection tests; Scoring P0 solely owns production metadata and score mutation, Controls solely owns Cart/Matrix delivery. No vendor polling permission or actual field admission. See latest #115 integration receipt.

---

**Decision: NOT IMPORT READY; zero authorized Nov 3 par, card, or hole-note entries verified.** This preview is an explicit no-write comparison, NOT a row list to paste into `glow.html`. Historical 3-column contract is `card | par | hole_notes` from `HBNF_UDisc_3_Column_Import_Template.xlsx` / archived Apps Script workflow. Preserve that existing importer; do not reconstruct it.

### Event-specific authority

- **Actual Nov 3 event**: [UDisc about](https://udisc.com/events/hb-glow-doubles-tAP8Y5/about) confirms Huntington Beach Central Park, Tuesday Nov 3, 5:30 PM PST, but does **NOT** supply the selected round layout ID, tee/basket assignments or hole-by-hole pars/notes in the accessible public record. Its [schedule URL](https://udisc.com/events/hb-glow-doubles-tAP8Y5/schedule) did not return independently readable layout metadata at this source checkpoint. That is the **precise missing authoritative source**: the Nov 3 event admin/round-selected UDisc layout and hole table, or contemporaneous explicitly confirmed event rules.
- **Comparison only**: [Oct 24 UDisc course stats](https://udisc.com/events/hb-night-flyers-hb-glow-doubles-ZUDJEk/leaderboard?round=1&view=course-stats) and [Oct 30 owner TEST ONLY](https://udisc.com/events/hb-night-flyers-hb-glow-doubles-test-only-F7DOx3/leaderboard?round=1) both identify **HB Glow Dubs 10.24.26**, 18 holes, 5,722 ft, **par 58** with matching distances and pars below. [Nov 17 schedule](https://udisc.com/events/hb-glow-doubles-C1mFl8/schedule) repeats the name. This evidence does **not** establish Nov 3's selected layout, starting tee, pad/basket geometry or any hole note.
- **Current HBNF production** (authenticated read-only Supabase `league_state.id=1`): active `2026-11-03`, baseline revision `2026-11-01 22:33:40.372437+00`, state MD5 `ec15053c2bde3c28fa252ee804c07623`; **0/18 event pars, 0/18 event hole notes**. Historical Jun 20 named layout template has 18 entries but is a distinct dated layout and must not be copied into Nov 3. Existing 3 rehearsal teams/1 card are not evidence of course hole assignments.

### Hole-by-hole comparison with explicit import values withheld

| Hole index | Oct24 + Oct30 **comparison** distance | Oct24 + Oct30 **comparison** par | Nov 3 `card` / selected tee→basket | Nov 3 `par` | Nov 3 `hole_notes` | Release/entry decision |
|---:|---:|---:|---|---|---|---|
| 1 | 378 ft | 3 | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | HOLD: no Nov 3 selected-layout evidence |
| 2 | 260 ft | 3 | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | HOLD: no Nov 3 selected-layout evidence |
| 3 | 495 ft | 4 | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | HOLD: no Nov 3 selected-layout evidence |
| 4 | 230 ft | 3 | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | HOLD: no Nov 3 selected-layout evidence |
| 5 | 274 ft | 3 | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | HOLD: no Nov 3 selected-layout evidence |
| 6 | 249 ft | 3 | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | HOLD: no Nov 3 selected-layout evidence |
| 7 | 309 ft | 3 | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | HOLD: no Nov 3 selected-layout evidence |
| 8 | 572 ft | 4 | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | HOLD: no Nov 3 selected-layout evidence |
| 9 | 173 ft | 3 | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | HOLD: no Nov 3 selected-layout evidence |
| 10 | 144 ft | 3 | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | HOLD: no Nov 3 selected-layout evidence |
| 11 | 208 ft | 3 | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | HOLD: no Nov 3 selected-layout evidence |
| 12 | 212 ft | 3 | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | HOLD: no Nov 3 selected-layout evidence |
| 13 | 256 ft | 3 | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | HOLD: no Nov 3 selected-layout evidence |
| 14 | 660 ft | 4 | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | HOLD: no Nov 3 selected-layout evidence |
| 15 | 308 ft | 3 | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | HOLD: no Nov 3 selected-layout evidence |
| 16 | 260 ft | 3 | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | HOLD: no Nov 3 selected-layout evidence |
| 17 | 465 ft | 4 | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | HOLD: no Nov 3 selected-layout evidence |
| 18 | 270 ft | 3 | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | HOLD: no Nov 3 selected-layout evidence |

**Comparison total:** 5,722 ft / par 58 from UDisc Oct24/Oct30 ONLY. **Nov 3 par total: UNKNOWN.** The 18 par entries above are **not** authorized to import into today's event. Do not use them as implicit par-3 defaults. The source-backed Nov 3 per-hole geometry and notes remain 18/18 missing.

### Exact supported preload → server acceptance gate (after Scoring P0 admission only)

1. Confirm the **Nov 3 UDisc event Round 1 selected layout identity**, including its tee/pad/basket assignments and all 18 hole values. If it exactly matches the Oct24 layout, document an explicit same-layout ID/identity comparison **before** populating historical columns; otherwise enter verified event-specific values individually. Use the existing three-column import *only if the currently admitted production Glow UI demonstrably exposes the import control*; current released source evidence supports **manual Scorecards editing**, not deployed three-column import.
2. Sole scoring owner completes original same-manifest five-target P0 release and guarded rehearsal cleanup, then re-reads the installed Glow application's actual save route. Do not try metadata preload through an unadmitted whole-root writer.
3. In admitted `Glow → Scorecards → 2026-11-03`, select **Enable Scorecard Editing**. Enter **confirmed** `par-N` (UI permits digits 1–9) and `hole-N` for holes 1–18; use the existing historical import only if it is proven installed and validated to map those same fields. Disable edit mode when done. A local “saved” indicator does not prove cloud durability.
4. The **Scoring P0** mutation owner obtains authoritative `league_state.id=1` with the event's `glow.weeks['2026-11-03'].scorecardText` and `updated_at`; verify all 18 expected pars + notes exactly, the matching saved revision, rehearsal cleanup scope, preserved aliases/tags/payouts/history and no unrelated loss. Close/reopen the approved scorer and compare values to the independent server read. Abort and restore conditionally if conflicting or missing.
5. Only then allow approved UDisc scheduled score CAS→independent complete week readback→service-role-only Cart intent; Controls' **native-overlay admission remains false** until Track A/C proves WOW MAX60 nondestructive operation. A server HTTP 202 is at most `PENDING_OPAL_PULL`, not Matrix/device/visual PASS.

**Missing owner-only fact if public sources remain insufficient:** the Nov 3 selected UDisc Round 1 layout (name/ID and the actual 18 tee→basket/par/notes assignments). No new scraper/importer/credential exposure, score mutation or assumed geometry is authorized here.

---

## 2026-11-03 event-day source and safe export/import decision

**Authority and decision:** This appendix qualifies the **read-only organizer export and event-specific release gates**, not a live imported score, score-save, player reconciliation or device command. Earlier 18-row `UNKNOWN` fields are still controlling until the **Nov 3 Round 1** Caddie Book/layout is observed. Treat 2026-10-24 and test-only 2026-10-30 par-58 as comparisons ONLY.

### What UDisc actually supports (verified external product-owner guidance)

- A named administrator of UDisc's official forum, Scott Smerchek, explicitly described the **event leaderboard XLSX** as downloadable both through the UI and **programmatically by appending `/leaderboard/export` to the exact event URL** (Mar 10, 2025): https://forum.udisc.com/t/request-public-api/375?page=2 ; moderator/admin identity: https://forum.udisc.com/about . This confirms a deliberate export URL. It does **not** specify an unattended polling rate, continuously updated partial-event export, service-level agreement, or a general event API.
- The **newer** Jul 21, 2026 UDisc staff reply warns the export is **not a formal API**, and specifically advises reading spreadsheet **column names**, not positional indices: https://forum.udisc.com/t/changes-to-export-file/742613 . This supersedes any assumption of a fixed header order. Product help (Jul 24, 2026) explicitly documents organizer `Event tools → Leaderboard → Actions → Export` and XLSX columns including `Name`, `Username`, and hole scores: https://help.udisc.com/en/articles/10859468-how-can-i-export-results-after-an-event-finishes .
- UDisc's Jul 24, 2026 league-operation guide confirms live leaderboards **during play**, but places ordinary result exports under **after the event**. Thus live leaderboard != proven in-progress export endpoint: https://help.udisc.com/en/articles/13605808-running-your-weekly-league-ongoing-operations .
- General UDisc Terms limit artificial access and data retrieval absent permission by site features. The staff-described export is a specific supported feature; **repeated production polling cadence, active-round partial availability and reuse scope are not expressly settled**. Keep `UDISC_GLOW_ACCESS_APPROVED` off pending explicit clarification or specifically admitted event-authorized use: https://udisc.com/terms .
- An existing unsent **owner Gmail DRAFT** (subject `HB Night Flyers: permitted live event score export / integration questions`, dated Oct 29) asks exactly about in-progress partial export, permitted frequency and supported APIs. It is **not an approval or UDisc response**. Do not send it without explicit owner authorization.
- The authentic organizer-created **Oct 30 TEST ONLY** XLSX, connected Drive `1HcTGlyfa0J3aYV3pMgC48PfGqRKqY1J7`, contains actual `hole_1`–`hole_3` cells for three experimental teams and blank `hole_4`–`hole_18` cells with status DNF. Therefore **a UDisc-issued spreadsheet can preserve a partially scored scorecard**. It does **not** prove that a subsequent export can be fetched *while the event is actively under way*, or that it comes with authoritative Nov3 selected layout, hole notes or team identities.

### Live event facts and absence of evidence

- Actual official event: https://udisc.com/events/hb-glow-doubles-tAP8Y5/about , Nov 3 2026, Round1 GEN R1 5:30–9 PM PST, doubles / individual sign-up, Huntington Beach Central Park. Public about page confirms date/venue/format; the accessible public search record does **not** provide Nov3 selected layout ID/name, tee/basket geometry or registered real team crosswalk. Do not rely on Nov17/Nov24 scheduled layout identity or Oct24/test-only event layout.
- Fresh connected HBNF Supabase **read-only** 2026-11-03 day-of inspection project `phcpbvuqibyarpfrftgx`, `league_state.id=1`: `updated_at=2026-11-01 22:33:40.372437+00`, `md5(state_json::text)=ec15053c2bde3c28fa252ee804c07623`; activeWeek Nov3; `3` existing **rehearsal** player rows and one rehearsal card (NOT real-event player identity proof); `0/18` pars and `0/18` notes; `43` stored alias keys but **no Nov3 `udiscSync` evidence**. Alias count does not validate real Nov3 participant identity. No SQL write.
- Authentic 18-hole tee/basket/par/notes must be taken from **this event's selected layout** under `League tools → Events → [Nov3] → Edit event` and `Event tools → Caddie book layouts`. Official selection guide notes that a round layout **locks after any scores exist**: https://help.udisc.com/en/articles/10705040-how-to-choose-or-create-a-layout-for-your-league-or-event . Capture event layout ID/name/selected tees+baskets, each 18 hole par and note. Absence of a hole note must be explicitly owner-confirmed as blank, not guessed.

### SAFETY: existing Glow quick-import is destructive and is not this incremental fallback

P0 exact source `public/glow.html`, Git blob `89fc1e80b157cd331119d7016674773399f23f9a` (verified PR151 `f014104c2a067de98444d78f24a6eb31eb5a82e8`), has `quickImportConfirmBtn` caption **Confirm Import + Update Tags**. Its `confirmQuickUdiscImport` handler **replaces** `w.cards` and `w.players`, generates fresh `QI_${Date.now()}` player IDs, clears `scoresLocked`, may clear winners and calls `ctx.pushRoot()`. It does **NOT** call the reviewed `prepareGlowWeekSync` incremental merge / guarded `hbnf_apply_udisc_glow_week` RPC / independent complete-week readback; reimport can replace manual corrections and shift teams/tags. Also `udiscRowsToImportRows` fabricates hole 1 from the aggregate total when all per-hole cells are blank. **Do not click Confirm Import + Update Tags with actual scores**, even after P0 admission, without a P0-owned separately source-tested safe replacement. The preview button is only a visual preview; it does not make the destructive confirm safe. This is a named P0 source blocker, not a license for the UDisc lane to mutate P0 assets.

Existing source `public/udisc-glow-reconcile.html` and `udisc-glow-preview.mjs` support **local read-only XLSX/CSV** parse and `PROPOSED_ONLY_NOT_DELIVERED` identity review without touching Supabase; whether the installed live Worker actually serves the same exact assets is **not accepted**. Read-only proposal is not a save.

### Minimal supported owner export → guarded P0-only import → Controls-only presentation

1. **Before scores:** verify Nov3 selected Round1 layout/tees/baskets, 18 pars and any notes in the event's own Caddie Book; verify the actual UDisc participants/teams/handles once check-in and cards are published. Do **not** infer Oct24 identities, accept the current 3 rehearsal players as real, or auto-assign aliases by similar name. Preserve layout proof/identity decisions for Scoring P0.
2. **During event when hole scores exist:** organizer may view the official live UDisc Leaderboard. Try the **documented UI export** at `Event tools → Leaderboard → Actions → Export` (no fabricated API call or scheduled polling). A successful XLSX whose 18 hole columns contain partial scores is acceptable as **source-file evidence**; missing/delayed export means the fallback waits until UDisc actually supports export, and the live public leaderboard itself remains the score reference. Upload the authentic XLSX as a local file or to existing authorized Drive (not an arbitrary URL scraper). Keep exact file hash and acquisition time. Never assume exported file's name or `start_time` alone proves event identity because exported columns do not necessarily include event slug/layout ID.
3. **No-write preflight:** bind the manual file to **Nov3 event slug `hb-glow-doubles-tAP8Y5`** only after organizer export/context proof; reject any other date, event or round; parse by header name; require one `hole_1`–`hole_18` set, clear numerical strokes only, and distinguish blanks as **not yet entered**, not 0 or a fake total. Reject missing/duplicate teams, mismatched columns, invalid strokes, impossible source totals, ambiguous usernames and unreviewed identity associations. Preserve DNF and incomplete-card status as source observations; do not treat DNF as a blank source wipe. Build candidate via the **existing** `parseUdiscAoA` / `buildGlowProposal` / `prepareGlowWeekSync` implementation, never the destructive quick-import confirm; unresolved identities stay **REVIEW_ONLY**, not invented.
4. **P0 write gate, only after P0's five-target release and owner approval:** independently re-read `league_state.id=1` activeWeek, full Nov3 week, revision and locked/finalized fields; compare exact source team+hole map to stored week. Preserve manual overrides, previous accepted scores when a partial XLSX leaves a hole blank, cards, payouts, history, bag tags and metadata; skip `prepared.changed=false` entirely without CAS. For a changed proposal, use **only** `hbnf_apply_udisc_glow_week` guarded CAS (never direct root `ctx.pushRoot`), then independently re-read the **complete** saved week, signature and microsecond revision. On conflict, stale source, missing authority, malformed XLSX, or timeout, stop with no retry mutation and no Cart offer until independently resolved. No revival of suspended original Nov3 cleanup.
5. **Controls gate:** after successful saved/re-read and confirmed pars for **all scored holes**, call service-role-only canonical `glow_scoreboard_intent` only once the **same Controls native overlay release** is admitted. Validate exact Cart fingerprint/source revision/202 `COMMITTED|DUPLICATE` and `PENDING_OPAL_PULL`. Treat 202 as **pending relay**, not visible display; Controls/Opal must establish overlay challenge-ID, Matrix projection/readback, Owner precedence and preset/audio/FX/brightness/AUX original restoration in its own accepted device lane. Offline, no backing RPC or backend 503 are **fail closed**.
6. **One correction/re-export:** reprocess a new authentic XLSX only after fresh source hash/revision read and explicit identity decision; the existing `prepareGlowWeekSync` preserves manually corrected values and imported blanks. Exact same signature leads to **zero additional scoring CAS**; a previously denied Cart intent may retry against a fresh independently reread source **without scoring mutation**, subject to 10-minute freshness and Controls admission. This is review-source behavior with CI, **not installed field proof**.

**Exact owner-only evidence required:** From authenticated Nov3 UDisc Event tools, share (a) Round1 selected Caddie Book/layout ID/name plus all 18 tees→baskets, pars and notes and (b) a genuine Nov3 organizer-generated XLSX once the event has real scored holes, with organizer-confirmed usernames/teams. The user already has a UDisc Support DRAFT for optional approval of unattended polling; **do not send** it without authorization. Until evidence arrives, the full score/Cart automatic outcome and any live scoring mutation remain **BLOCKED**, not accepted.

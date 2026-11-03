# November 3 HB Glow Doubles — attributed 18-hole conditional three-column preload

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

# November 3 Glow metadata: 18-row read-only pre-round preview

**Status:** NOT IMPORTABLE / NO PRODUCTION WRITE / NO INVENTED EVENT LAYOUT.

**Authoritative persisted observation:** `public.league_state.id=1`, active Glow week `2026-11-03`; revision `2026-11-01 22:33:40.372437+00`, state fingerprint `ec15053c2bde3c28fa252ee804c07623`. Event-specific `scorecardText.holePars` has **0/18 confirmed values** and `holeNotes` **0/18 confirmed values**. Three player rows and one rehearsal card are **not reliable November 3 event-layout metadata**. Existing June 20 template with pars and notes is a different round and is NOT evidence of matching layout.

**Historical import contract:** `card | par | hole_notes`, documented in the existing `HBNF_UDisc_3_Column_Import_Template.xlsx` and `UDisc_AutoFill_GoogleAppsScript_v3.gs` package. The archived script was documented as deriving card/par from a UDisc leaderboard link **after human review**, not as a guaranteed source for hole notes; its original `.gs` file and current production import control have not been qualified. This is a **preview with a hole-number index**, not an XLSX import, a proposed script, or an instruction to paste placeholders.

| Hole | card (3-column) | par (3-column) | hole_notes (3-column) |
|---:|---|---|---|
| 1 | UNVERIFIED | MISSING | MISSING |
| 2 | UNVERIFIED | MISSING | MISSING |
| 3 | UNVERIFIED | MISSING | MISSING |
| 4 | UNVERIFIED | MISSING | MISSING |
| 5 | UNVERIFIED | MISSING | MISSING |
| 6 | UNVERIFIED | MISSING | MISSING |
| 7 | UNVERIFIED | MISSING | MISSING |
| 8 | UNVERIFIED | MISSING | MISSING |
| 9 | UNVERIFIED | MISSING | MISSING |
| 10 | UNVERIFIED | MISSING | MISSING |
| 11 | UNVERIFIED | MISSING | MISSING |
| 12 | UNVERIFIED | MISSING | MISSING |
| 13 | UNVERIFIED | MISSING | MISSING |
| 14 | UNVERIFIED | MISSING | MISSING |
| 15 | UNVERIFIED | MISSING | MISSING |
| 16 | UNVERIFIED | MISSING | MISSING |
| 17 | UNVERIFIED | MISSING | MISSING |
| 18 | UNVERIFIED | MISSING | MISSING |

**Missing exact evidence:** November 3 event-specific actual card/layout assignment (18 rows as required by the historical template), **18 pars**, **18 tee-to-basket hole notes**. The prior June 20 template is not a substitute. No authorized UDisc partial event export has yet been observed. If event-specific metadata becomes available, a qualified reviewer must replace these labels with source-linked values; do not save labels or assumed par-3 values to the app.

**Smallest existing source-backed manual entry route (not cloud-accepted):** Glow → Scorecards → select `2026-11-03` → **Enable Scorecard Editing** → enter hole 1–18 `par-N` (installed input accepts 1–9) and `hole-N` notes using **confirmed** tee/basket layout → disable editing. The existing HTML source saves locally and schedules a cloud push, but this alone is **NOT** independent Supabase save/close/reopen proof. The Scoring P0 owner must admit and verify the production save path before relying on that route.

**Protected adjacent state:** team IDs, manual score overrides, payouts, ace pot, bag tags, aliases, score/correction history, hole notes and pars must survive later UDisc partial-score merges. The qualified reviewed `prepareGlowWeekSync` already clones the week and retains those fields, subject to the original guard/CAS and post-save readback. Cart source-gates actual scored holes lacking confirmed pars so its v35 fallback to par 3 is not represented as an accurate relative score.

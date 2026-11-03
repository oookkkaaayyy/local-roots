# HBNF Nov 3 automatic UDisc→Glow→Cart: provider compatibility and field acceptance gate

**Authority:** GitHub #115 (UDisc/Glow scoring), #116 (Cart Controls/Networking/Matrix); this file is a **review-only** source/evidence companion. It does not authorize modifying Supabase, Cloudflare, Cart, Opal, UDisc, scores, tags or installed firmware.

## Fresh read-only installed evidence, Nov 2, 2026

| Boundary | Exact source/readback | Consequence |
|---|---|---|
| UDisc Worker | Prior authenticated Worker `hbnf` v `48ffa87e-3c83-46d0-a6ca-db7bf0b064e6`; event Nov 3 eligible within its configured window | No observed actual poll/import |
| League state | `league_state.id=1`, `2026-11-01 22:33:40.372437+00`, MD5 `ec15053c2bde3c28fa252ee804c07623`, Nov 3 active/unlocked with three teams | Rehearsal rows may **not** be deleted without explicit separate owner approval; one partner is non-test-named |
| Matrix control | `hbnf_matrix_control_state.id=1`: `mode=showcase`, `auto_live=false`, `library_revision=hbnf-wow-r3-max-2026-09-21-v3`, `show_preset=resume_preset=60` | Currently disallows automatic overlay |
| Scheduled Matrix cycle | Authenticated `cron.job`: `hbnf-matrix-live-cycle` active `*/2 * * * *`, invokes `hbnf-matrix-sync3` **only** when `mode='event' AND auto_live=true` | A scheduled job does **not** confirm an actual function run or visual display |
| Deployed Matrix Edge | `hbnf-matrix-sync3` ACTIVE v42, bundle SHA-256 `f6fab60e61c1ecc2353d03eb1408e00b5ae214b0a9a02a2895213450c25588c6`; installed `index.ts` accepts `library_revision=hbnf-native-organic-2026-09-19-v11` or `hbnf-flow-2026-09-19-v10`; legacy resume additionally restricts presets to 50–55 | Cannot run on installed WOW MAX library/preset without a new admitted compatible implementation |
| Actual overlay-claim RPC | Authenticated `pg_get_functiondef(public.hbnf_claim_matrix_live_overlay)`: `library_revision = 'hbnf-host-safe-2026-09-15-v3'`, `mode=event`, `auto_live=true`, returns row if claim succeeds | **Empty intersection** with the Edge v42 accepted library revisions. Merely setting `auto_live=true` or switching to either Edge revision would still not satisfy the RPC |
| Matrix queue | `hbnf_matrix_vnext_live_queue.id=1`: `pending`, fingerprint `ec15053c2bde3c28fa252ee804c07623` matches league row | Queue capture observed; independent consumption, relay delivery and render **not** proven |
| Relay transport | Edge v42 publishes WLED/MQTT to `hbnf/cart/wled1/api` by default; `hbnf-cart-control` Edge ACTIVE v35 has a distinct HTTP `X-HBNF-Relay-ID` endpoint | No independently observed MQTT→Opal/WLED subscriber and no demonstrated equivalence to canonical HTTP relay; do **not** assume bridge delivery |

**Proof limitation:** Edge v42 returns HTTP success after `EdgeRuntime.waitUntil` starts asynchronous MQTT publish. That response is not publish success, device readback or visual acceptance. The separate Cart `live_status` read returns a score projection, not a physical command.

## Smallest defensible correction path

1. **Do not flip `auto_live`.** The installed Edge and RPC have conflicting hard-coded accepted library revisions, while the saved Matrix WOW MAX library/preset must be preserved. Expanding the RPC allowlist alone is unsafe and insufficient. Likewise changing the database library value to old v3/v10/v11 would discard accepted current Matrix configuration and break restoration.
2. Matrix/Controls coordination must choose a **single already supported command path** to the installed Matrix, with actual transport and owner-precedence readback. Either prove the existing MQTT subscriber path end-to-end or use the existing canonical Cart relay contract under a new independently qualified implementation. No unobserved bridge, MQTT subscriber or firmware capability is presumed.
3. In one review branch, align the chosen live-cycle source, claim RPC and installed Matrix library/preset/geometry. Include exact source versions, current provider readback, rollback source and durable recovery. Tests must reject incompatible versions, race/override regression and an unsupported baseline. A new one-time release manifest and independent provider/device admission are mandatory before deployment. This review-only gate **does not** implement that release.
4. With a separately identified temporary scorecard and source-controlled accepted scoring transaction (never the preserved November 3 rehearsal by default), prove a normal supported score write, Glow saved readback, live selector, event trigger, actual queued/issued command, Opal relay receipt, WLED Matrix readback and **human visual scoreboard**. Record times and exact score/team differences; do not count a 202/200 response as delivery.
5. Exercise refresh/reconnect of supported iPad/iPhone control and WLED/Opal transport without disrupting ongoing equipment; verify owner priority over a transient score overlay and return to the previous playlist/effect/brightness and normal controls. Then delete the temporary test scorecard using the supported operation and independently read back restoration of permanent stats, tags and device baseline. Preserve the original backup and exact conditional rollback route; never overwrite concurrent scoring updates.
6. Field acceptance is separately owner-confirmed. UV stays OFF. No configuration, relay command, score mutation, UDisc network request or device test occurred in this source-only pass.

## Focused test evidence

`node --test tests/hbnf-auto-display-provider-compat-gate.test.mjs` evaluates the exact **timestamped**, non-sensitive provider fixture in `tests/fixtures/hbnf-auto-display-installed-20261102.json`. It is a **compatibility/recovery acceptance guard**, not a simulated UDisc importer, Matrix renderer or physical device. The guard refuses mismatched Edge/RPC versions, mode/off state, unsupported legacy resume preset, unverified queue/relay transport, and missing hash-addressed acceptance receipts. Even synthetically complete receipt-shaped evidence returns `EVIDENCE_PRESENT_REQUIRES_INDEPENDENT_ACCEPTANCE`, never an automatically accepted field result.

**Status:** `SOURCE_PROVIDER_INCOMPATIBILITY_CONFIRMED; REVIEW_ONLY`. Remaining acceptance relies on admitted compatible relay/provider code, actual scoring data flow, device/visual evidence, refresh/reconnect and exact restoration.

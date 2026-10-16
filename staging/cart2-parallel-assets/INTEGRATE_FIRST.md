# Cart 2.0 — reuse these finished parallel deliverables (2026-10-16)

**Status:** Independent staging only; none of the parallel work in this directory is installed. Live Guest QR release is owned by the other active worker. **Read this before rebuilding the icon, scoring navigation, UV scaffolding, or games.**

## Approved Mission Control icon: exact deliverable, not a mockup

Owner accepted the flat **green/lime pixel-wave on near-black** matrix artwork. Reject disc/cart illustrations, multicolor equalizers and cross-like designs.

- Exact v2 ZIP available **inside this Git branch** as `icon/HBNF_Mission_Control_APPROVED_Icon_Patch_20261016_v2.zip.base64`.
- Independently established ZIP **SHA-256** `1c59583f94dffdd0547d6a09e989039ce66bd77c4cc66a5fe476c650554f9e92` and size **1,231,881 bytes**.
- Original backed up at [Drive ZIP](https://drive.google.com/file/d/1nZzuNIEITXC6sZF45rEcJ32GmUQE87xU/view), also ChatGPT Library `/Cart 2.0/`. Git branch is canonical for **Codex** reuse, so Codex needs neither ChatGPT Library nor fresh image generation.
- Recover on the Mac **from this branch's checkout**:
  ```sh
  base64 -D < staging/cart2-parallel-assets/icon/HBNF_Mission_Control_APPROVED_Icon_Patch_20261016_v2.zip.base64 > /tmp/HBNF_Mission_Control_APPROVED_Icon_Patch_20261016_v2.zip
  shasum -a 256 /tmp/HBNF_Mission_Control_APPROVED_Icon_Patch_20261016_v2.zip
  unzip -l /tmp/HBNF_Mission_Control_APPROVED_Icon_Patch_20261016_v2.zip
  ```
  Expected digest above; **do not install if it differs**.
- ZIP includes three iOS/PWA PNG sizes 180, 192, 512, approved original PNG, `ICON_RELEASE.json`, `install.sh`, `rollback.sh`, and concise README. It modifies only local Owner PWA icon assets and cache URLs, not HBNF scoring logo/icon or guest controls.
- Its v2 installer was previously tested on a disposable Owner subtree for first install, idempotent retry, tamper rejection and exact rollback; **not physically installed or accepted**. Preserve current live baseline when installing; then iPad homescreen icon may require remove/re-add.

## Separate completed small changes: do not remake

- [Owner direct Skins/Glow navigation PR #85](https://github.com/oookkkaaayyy/local-roots/pull/85) and [Guest navigation PR #84](https://github.com/oookkkaaayyy/local-roots/pull/84) were independently developed and static-checked (8/8 and 6/6). **Now SUPERSEDED for normal scoring navigation** by the worker's deployed Opal Owner PWA v1.0.2 package commit `74b09988ef3cf8a07c460aa09c303b92d9f0474e`: source already links both `https://hbnightflyers.com/skins.html` and `https://hbnightflyers.com/glow.html` in Owner Scores and Guest footer. **DO NOT cherry-pick/merge #84 or #85 merely to re-add these links.** Their separate source remains preserved in case a later UX change warrants it. In-app iOS 12 navigation behavior is not yet physically verified.
- [UV guard + older Owner navigation PR #78](https://github.com/oookkkaaayyy/local-roots/pull/78): `hbnf-final-controller/hbnf-cart-uv.mjs` and 11 deterministic tests previously PASS. It is a **pure module**, not a wired UV dimmer. UV must remain isolated until SP803E output configuration, 5V-vs-12V load, branch protection, underglow/ DD P isolation, and boot-off checks are physically verified. Prefer #85 Owner navigation over the older version in #78.

## Product/live state and ownership

- **Do not touch the active worker's branch, deployed guest Supabase function, Opal, firmware, live scoring, or release fence from this staging branch.**
- Guest QR acceptance remains cellular-only, **without guest phones joining Opal or owner's hotspot**. Opal itself may use owner's phone hotspot for WAN. Require an actual guest phone (Wi-Fi OFF) to change Matrix, followed by owner Guest Mode OFF.
- Local Owner PWA v1.0.1 Matrix and AUX brightness were physically accepted; preserve exact rollback and automatic Skins relay.
- No additional money, external messages, unnecessary approvals, or resource-intensive rebuilds.

## Cheapest merge/integration order after guest is accepted

1. Start from the *actually deployed* Guest/Owner source, not this staging branch. Verify live source identities before merging.
2. **Skip navigation merges:** latest Owner PWA v1.0.2 already contains Owner and Guest Skins/Glow links. Inspect the actual deployed link behavior and only adjust if a real UX gap is demonstrated.
3. Decode the already-approved icon ZIP, verify the exact digest, and use the included reversible icon-only patch against the current live Owner subtree. Do **not** recreate art.
4. Focused checks, install, iOS 12 visual check. Reaccept only changed behavior. Preserve original HBNF scoring icon.
5. Later: reuse the tested IRL putting game module below or historical six-game engine; do not pull old router/firmware schemes into current architecture.

## Established game reuse, do not reconstruct

- Existing GitHub branch `hbnf-phase2-game-router-hardening-20260927` has `hbnf-game-adapter/{game_core.h,ddp_frame.h,remote_input.h,session_lifecycle.h}`, `bridge/HBNF_GameBridge` and existing tests. It contains six offline 32×16 games; staged, **not cart-playable**.
- Its *old* `HBNF-Play` local Wi-Fi captive guest design is incompatible with the newer **cellular-only** guest requirement. Reuse vetted game logic/packetization where possible, **not** its guest-network plan or unverified board assumptions. Cellular gaming latency likely needs separate testing and should not hold up lighting guest QR.
- S4 IRL putting games are separate from the seven digital arcade candidates; a deterministic challenge module can run in the phone and display short directions through the existing Matrix text overlay after guest release, without real-time controller streaming.

**Only this handoff index and its referenced exact code/assets should be treated as staged implementation evidence.** Any new integration must verify real installed behavior before claiming field acceptance.

## Newly completed independent S4 game foundation (reusable, source already in this branch)

- Pure deterministic and side-effect-free implementation at `hbnf-irl-challenges/engine.mjs` with paired `hbnf-irl-challenges/engine.test.mjs`.
- Implements **Putting Gauntlet** (same distance/stance for each player per round) and **Pressure Ladder** (advance on make, repeat distance on miss; equal turns at finish). Fixed 10/15/20/25/30/35 ft progression and three stances, up to 12 players, one-turn-per-player, fair scoring/standings, safe bounded ≤63-character Matrix prompts. Revision-bound results reject accidental duplicate taps; JSON snapshots support resume with validation.
- Companion Node tests **12/12 PASS** on original source; these exact source and test bytes were mirrored to this branch and compared with the source used in the completed test run. No runtime browser field testing or integration was conducted.
- Can be integrated into future HBNF Owner/Guest play UI locally without touching Skins scoring or firmware, then optionally drive the existing `OVERLAY_START` text API (subject to cloud/Opal command acceptance and overlay arbitration); cannot claim Matrix integration yet.
- Reuse existing guest identity/permission/command path after acceptance. No second guest backend or games network. Independent of the old six-game real-time bridge.

## S4 game now has a playable standalone phone UI (2026-10-16 independent continuation)

- Existing pure Gauntlet / Pressure Ladder engine remains unchanged.
- NEW reusable files beside it:
  - `hbnf-irl-challenges/index.html` — responsive, high-contrast touch UI, game selection/player entry, make/miss, Undo, standings, reset.
  - `hbnf-irl-challenges/app.mjs` — browser-local session adapter using existing pure engine, revision guard, 600ms tap debounce, localStorage save/reload with malformed-data and storage-denied handling.
  - `hbnf-irl-challenges/app.test.mjs` and `page.test.mjs` — focused regression suites.
- **22/22 Node tests PASS** on source byte-identical to committed GitHub blobs (12 existing engine + 8 new app + 2 new page tests). JavaScript syntax checked.
- **Not field accepted:** browser GUI interaction test could not run: the available container Chromium blocks localhost with `ERR_BLOCKED_BY_ADMINISTRATOR`. Real iOS12 / browser behavior and physical usability remain unverified. App intentionally avoids Safari14-only `Element.replaceChildren` per MDN browser compatibility.
- Standalone app requires all `index.html`, `app.mjs`, `engine.mjs` at the *same URL directory*. Serve these three static files through the existing website / static host when appropriate. **No new backend**, scoring mutation, network join, cloud guest authorization, or Cart firmware changes; current version does NOT send Matrix overlays. It can operate without further network calls after first load, but has no Service Worker and cannot claim first-load offline access.
- Shortest later acceptance: open a staging static URL on actual phone/iPad, start a 2-player Gauntlet, Make/Miss, reload (verify resumed state), Undo, complete one round, confirm no scoring or lighting command. Then decide whether to expose from existing Owner/Guest `Play` tab and reuse accepted text-overlays. **Do not rebuild the engine or guest transport.**

## S1 / B5.03 club-moment producer: verified source-only delivery (2026-10-16)

- Reuse newly committed `club-moments/moments.mjs` and companion `club-moments/moments.test.mjs` (**14/14 Node tests PASS**, Git blobs `57511592366d65540471c0be870acc4936a9c040` and `80f83a7d13e3d9cc7b3dda43b2b05364ebbf6250`; exact source bytes checked).
- Reads paired **confirmed authoritative** `skins_score_state` snapshots matching the existing `staging/coordinated-backend/hbnf-cart-control/skins_scoring.ts` projection. Emits candidates only for newly awarded holes, tiebreakers and aces—not score corrections, clears, bulk imports, new cards, stale updates, initial loads, or repeated reads. Distinct event IDs enable ack-based replay prevention.
- `planClubMomentOverlay` only produces the existing `OVERLAY_START` **text intent** (priority 40, 5.5/7.5-second TTL, ≤31 display characters). Explicit gates require current authoritative read, observed Matrix readiness, qualified relay, owner opt-in, no game or active overlay, and explicit guest/cloud transport qualification. Caller must *still send and verify physical Matrix acknowledgement* before persisting the event ID.
- No API calls, no score writes, no timers, no production integration, no new backend. Existing text overlay contract at `hbnf-cart-control/guest-command.ts` (text ≤63, priority 1–100, TTL 1–30s) and `matrix-relay-projection.ts` verified before implementing.
- Integration after Guest acceptance: pair successive confirmed snapshots in existing app/backend, require actual scoreboard delivery health, use only the qualified canonical `OVERLAY_START` route and its existing arbitration; never auto-trigger while manual text or games are active. First observed snapshot creates baseline only.
- **Existing backend blocker independently corroborated:** Supabase SQL endpoint returned `Connection terminated due to connection timeout` on *both* trivial `SELECT 1, now()` and canonical context calls (2026-10-16). This points to database/connectivity availability, not proof that Guest HTML or overlay code is defective. Avoid repeated status queries or stale fencing/reconciliation while DB unavailable; return to the interrupted relay installation once a fresh DB read is responsive. No production action performed.

### Verified Supabase diagnostic refinement (read-only; 2026-10-16)

- Management API `get_project` returned `ACTIVE_HEALTHY` for `phcpbvuqibyarpfrftgx` (region us-west-2). That is **NOT** proof PostgreSQL queries are responsive.
- Supabase database SQL client timed out on `SELECT 1, now()` and on the cart canonical RPC; Supabase performance-advisory API separately failed its project-user DB check with the same connection timeout.
- Independent ClickHouse log service worked and showed **multiple recent PostgreSQL `canceling statement due to statement timeout` entries on Oct 15**. This supports an ongoing database-side performance/availability problem but does *not* identify a root query or show an outage of all Supabase regions. Supabase public status page reported broadly operational.
- Supabase's official [exact-error guidance](https://supabase.com/docs/guides/troubleshooting/failed-to-run-sql-query-connection-terminated-due-to-connection-timeout) says the error *typically* reflects database overload; priority checks are Dashboard Database Reports CPU, RAM, swap, disk I/O and connection usage. Database restart is disruptive and potentially temporary; **do not restart or upgrade blindly**, especially while HBNF scoring uses the same DB.
- Worker should stop repeating the same SQL probe while it continues to fail; use read-only available logs/metrics, isolate real DB pressure if observably possible, and retry a single cheap DB health check after a meaningful condition changes. After recovery, renew the expired source/freshness admission and install the existing Opal relay with precise guarded rollback; physical Matrix/AUX state is authoritative and must not be overwritten to satisfy stale cloud targets.

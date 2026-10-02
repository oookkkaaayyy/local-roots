# HBNF Coordinated Rollout Runbook — 2026-10-01

Goal: one bounded, reversible update cycle with no re-seeding, no second cart-state owner, and no throwaway firmware.

## Current production facts — read-only capture
Cloud control plane and Matrix firmware have different release identifiers. Do not conflate them.

Canonical cart control plane:
- fence ACTIVE
- fence epoch: 2
- release_id: hbnf-cart-foundation-v1-20260925
- desired state exists; captured revision: 117
- captured desired power: on
- captured scene: field-mix
- captured paletteId: ocean
- Matrix brightness: 34
- AUX brightness: 255
- last desired-state update: 2026-09-29T01:34:41Z

The observed rows captured while the cart was not running are stale/offline evidence, not a reason to seed state again.

Accepted Matrix firmware / OTA baseline:
- release ID: hbnf-matrix-v1-1-current-20260930
- firmware SHA-256: 0aeb668e58cad3bae5b636fdc79573a263c3d0e911903ed48af0bbc2e5681f61
- HBNF candidate: hbnf-integrated-rc-visual-audio-continuity-2026-09-30
- WLED 16.0.1
- Matrix MAC: 70:4b:ca:5b:34:5c

Current live backend source has been captured exactly under:
evidence/live-production-20261001/

Important live versions:
- hbnf-cart-control v16 · EZBR 3e4816988a9ac0b33f5b660ccefedf27e0249c7e7f5e11b1a8622a3c59fbd80d
- hbnf-cart-reconcile v11 · EZBR 4f400b2ee1d733f07a90baa231c843990802a3a72aedb507e6963a78685a1d93
- hbnf-matrix-adapter-foundation v2 · EZBR 4925765bdad4726e3eda85d1d781813c783c64d2d425f0aafe572bf918fbcdb1
- hbnf-aux-adapter v8 · EZBR 85e8b8c18ee0cf4c31d5fd854d8cc0d41cc7e75fccc538c8271a866d78466fd8
- hbnf-matrix-control v172 · EZBR f49d087a3a6a77b2167d9892817f3dfcf36960cdb42fbb93e835f3c130c80aa7

## Phase A — complete before hardware interaction
Already staged on the isolated coordinated branch:
- iOS-12 compatibility cleanup across the complete controller source.
- Named saved-look library.
- shared Skins/Glow live read path + bounded cache fallback.
- signed OTA status + install-result return path.
- exact-current backend source snapshots.
- browser mutations routed through the canonical cart owner; direct feature-UI POST /json/state mutation removed.
- exact-live-v16-based OVERLAY_START/OVERLAY_EXPIRE candidate reducer.
- exact-live-v2-based Foundation adapter contract for canonical palette + overlay projection.
- deterministic Opal updater rebuilder with old-OpenWrt compatibility fixes.
- synthetic updater-package regression test.
- source-identity collector for the accepted Audio V1.1 local workspace.
- source bundle + CI gates.

No production deployment occurs in Phase A.

## Phase B — local source identity/build gate
Before publishing firmware:
1. Verify the accepted Audio V1.1 candidate binary hashes to:
   0aeb668e58cad3bae5b636fdc79573a263c3d0e911903ed48af0bbc2e5681f61
2. Recover the exact V1.1 source tree and local /hbnf source with:
   tools/hbnf-source-identity-preflight.py
3. Reconcile the coordinated controller and firmware contract onto that exact source lineage.
4. Firmware must implement the new HBNF contract without changing accepted visual/audio timing:
   - canonical palette spec
   - canonical overlay spec
   - overlay expiry returns to CURRENT base state
   - Matrix remains visual/audio master
   - AUX remains Matrix-owned DDP follower
5. Run all source/build gates.
6. Build one candidate only.
7. Preserve the accepted V1.1 binary as rollback.

If exact lineage cannot be proven, stop before build/publish.

## Phase C — corrected immutable Opal updater
Before the first new firmware OTA, rebuild the updater from the exact known 1.2.3 IPK using:
tools/hbnf-rebuild-opal-updater.py

Required incorporated fixes:
- parent directories included in package
- old-Nixio string modes/umask
- private compat stat helper / no nonexistent BusyBox stat dependency
- BusyBox-safe MAC normalization
- Safari same-origin read-only check handling
- Matrix-origin read-only result CORS
- config conffile preservation

Verify package/container regression tests before any Opal reinstall. Preserve current live updater/config and trusted-iPad authorization.

## Phase D — physical preflight
Before you start:
- Power: Opal + Matrix + AUX.
- Network: Mac and mounted iPad on HBNF-Cart.
- Do not change LuCI/Wi-Fi/router settings.
- Keep the accepted V1.1 rollback binary available.
- Do not seed cart state or alter the fence.

Require:
1. Matrix at 192.168.77.10 with expected MAC.
2. AUX at 192.168.77.11 / expected DDP follower identity.
3. Current /hbnf loads.
4. Existing Motion + Audio Response still operate.
5. Signed OTA check succeeds and recognizes the accepted V1.1 current baseline.
6. Canonical state reads successfully; do not replace revision 117 with defaults.
7. Current live backend versions still match the captured manifest before deploying backend candidates.

## Phase E — one coordinated release
1. Publish one immutable signed Matrix candidate built from the reconciled V1.1 source.
2. Use the trusted Opal updater for exactly one OTA.
3. Wait for reboot + health result.
4. Deploy only the two changed canonical backend candidates, based on exact live source:
   - hbnf-cart-control (v16 base + overlay intents)
   - hbnf-matrix-adapter-foundation (v2 base + palette/overlay projection)
   Leave reconciler v11, AUX adapter v8, and matrix-control v172 unchanged unless a verified contract mismatch requires a specific change.
5. Reload /hbnf.
6. Run one acceptance sequence.

If firmware health fails, do not deploy the backend/UI changes; roll Matrix back to accepted V1.1.

## Phase F — consolidated acceptance
Verify once, in this order:
1. Matrix reconnect.
2. AUX/DDP reconnect.
3. /hbnf reload + lock/wake reconnect.
4. Matrix brightness.
5. AUX brightness.
6. Motion.
7. Audio Response.
8. Auto / Next / Lock.
9. Show selection.
10. Palette.
11. Solid color.
12. Saved look save/apply/delete.
13. Manual text.
14. Skins/Glow live refresh.
15. Scoreboard.
16. Ace pot.
17. Overlay expiry restores CURRENT canonical base state.
18. Signed update result shows the newly accepted release.
19. iPhone + iPad state convergence.
20. Cold reboot and reconnect.

Freeze the new known-good release only after all required items pass.

## Separate router-startup gate
The intermittent HBNF-Cart SSID cold-start issue remains separate. Do not mix router changes into the coordinated firmware/controller release.

## Stop conditions
Stop with one targeted diagnostic for:
- accepted source/hash mismatch
- wrong Matrix MAC
- signed-release verification failure
- updater package verification failure
- firmware health failure
- current live backend source/version drift
- canonical desired-state/fence inconsistency
- missing rollback artifact

Do not re-seed canonical state. Do not reactivate an already active fence. Do not create a second writer.

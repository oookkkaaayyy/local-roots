# HBNF Offline-Work Checkpoint — 2026-10-01

This checkpoint supersedes earlier assumptions that canonical state was unseeded or the fence was inactive.

## Completed without touching live cart hardware
- Current production canonical database state re-read directly.
- Current fence is active at epoch 2; desired state exists at captured revision 117. No seeding/reactivation is required.
- Exact live backend source captured under evidence/live-production-20261001/.
- Current live backend function versions/hashes pinned in MANIFEST.json.
- Coordinated UI mutations now route through one canonical browser bridge.
- Direct feature-UI POST /json/state mutation removed.
- Legacy hbnf-matrix-control use in the new feature module is constrained to read-only live_status.
- Exact-live-v16 cart-control candidate staged with canonical OVERLAY_START / OVERLAY_EXPIRE intents.
- Exact-live-v2 Foundation adapter candidate staged to pass canonical palette + overlay specs to firmware.
- Skins/Glow shared live/cache path staged.
- Named saved-look library staged.
- signed OTA check/result UI staged.
- full-controller iOS-12 static compatibility cleanup staged.
- deterministic Opal updater rebuilder + synthetic regression test staged.
- source identity collector now knows the exact V1.1 output/rollback workspaces and the exact canonical backend recovery workspace.
- release CI now checks controller syntax, iOS-12 hazards, canonical single-writer rules, exact-live backend staging, release gates, and updater rebuild regression.
- rollout runbook corrected to current active production state.

## Remaining gates that genuinely require the local build workspace or powered hardware
1. Recover/verify the exact accepted Audio V1.1 firmware source and local /hbnf source.
2. Implement the firmware side of the canonical palette/overlay contract on that exact lineage.
3. Run the complete local build/test suite.
4. Rebuild the corrected immutable Opal IPK from the exact known 1.2.3 package.
5. Build/sign/publish one coordinated Matrix candidate.
6. Run one physical preflight + OTA + backend cutover + consolidated acceptance.
7. Handle SSID cold-start reliability separately after the coordinated release.

## Important current production state
Do NOT:
- seed canonical state
- activate the fence
- replace current desired state with defaults
- deploy the historical authenticated-only cart-control source over current paired-device/no-login v16
- deploy direct local WLED mutations from the new feature UI
- deploy an overlay implementation that restores a stale pre-overlay snapshot

The next local action is source identity recovery, not production mutation.

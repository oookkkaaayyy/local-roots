# HBNF Offline-Work Checkpoint — 2026-10-01

This is the handoff point after exhausting useful work that does not require the powered cart or the user's local V1.1 build workspace.

## Completed offline on PR #46
- Standing execution rules persisted so safe work continues without repeated user prompting.
- Required coordinated visible scope staged: looks, color, palettes, saved looks, manual text, Skins/Glow live data, scoreboard, ace pot, existing Motion/Audio Response, signed OTA status, trusted-installer handoff, rollout preflight.
- Dynamic WLED palette discovery uses /json/pal.
- Look/color/palette mutation now snapshots state, verifies readback, and restores prior state on failed verification.
- Skins/Glow read-only live status reuses existing liveInfo()/chooseLive path.
- Live-data cache fallback added for WAN failure.
- Matrix-local origin added to matrix backend CORS staging.
- Read-only live_status no longer depends on the general Matrix-control-state read.
- OTA install result/progress UI and return polling staged for Matrix-origin read-only result access.
- Full staged controller source cleaned of optional chaining, nullish coalescing, and crypto.randomUUID; legacy copy fallback added.
- Broader iOS-12 static audit added.
- Package completeness updated so the new feature module cannot be omitted.
- Dedicated CI source gates, release-readiness gates, synthetic updater-package test, and self-contained source bundle configured.
- Machine-readable release gate state lives in config/HBNF_COORDINATED_RELEASE_GATES.json.
- Deterministic physical rollout runbook exists.
- Exact accepted V1.1 artifact lineage and recovery procedure recorded.
- Deterministic Opal IPK rebuilder added. It verifies the exact known 1.2.3 base SHA before patching and refuses unknown input.
- Opal rebuilder stages:
  - required parent directories,
  - old-Nixio mode/umask compatibility,
  - a private compatibility PATH/stat helper rather than relying on missing BusyBox stat,
  - BusyBox-safe MAC normalization,
  - Safari same-origin check handling,
  - Matrix-origin read-only result CORS without relaxing challenge/install authority,
  - config conffile preservation,
  - versioned replacement package output.

## Intentionally NOT claimed complete
- Exact live V1.1 firmware/local-dashboard source identity has not yet been reconciled to the staged branch.
- The deterministic updater rebuilder has not yet been run against the actual immutable 1.2.3 IPK from the user's Mac, because that artifact is not available in the current runtime.
- The rebuilt replacement updater IPK has not been installed on the Opal.
- Full iOS-12 behavior still needs the real mounted iPad acceptance after exact live-source reconciliation.
- No new signed Matrix candidate has been built/published from the accepted V1.1 source lineage.
- No first real OTA of a newer release has occurred.
- HBNF-Cart cold-start/SSID reliability remains a separate router issue.

## Next time local Mac/build workspace is available
1. Run work/HBNF_SOURCE_IDENTITY_RECOVERY.md read-only.
2. Recover/verify the exact V1.1 source tree and live /hbnf source.
3. Reconcile the coordinated changes onto that exact lineage.
4. Run all source gates.
5. Feed the known immutable 1.2.3 IPK into tools/hbnf-rebuild-opal-updater.py.
6. Run the resulting replacement package through container/static checks before any Opal reinstall.
7. Build one coordinated Matrix candidate from the accepted source.
8. Sign/publish only after every non-hardware gate passes.

## Next time cart is powered
Follow work/HBNF_ROLLOUT_RUNBOOK_20261001.md. Do not invent a new troubleshooting flow unless a specific gate fails.

# HBNF Coordinated Rollout Runbook — 2026-10-01

Goal: make the next physical session short, deterministic, and reversible.

## Phase A — complete before hardware is touched
- All required visible scope exists in the isolated candidate.
- iOS-12-targeted controller code passes syntax/compatibility gates.
- Matrix-local origin is allowed on the existing matrix backend.
- Look/color/palette writes have readback verification and automatic rollback on failed verification.
- Skins/Glow live status reuses existing liveInfo()/chooseLive logic and has cached fallback.
- OTA check is read-only, retry-bounded, and installer handoff remains on the trusted Opal origin.
- Current Opal live compatibility fixes are incorporated into immutable updater source/package before any updater reinstall.
- Candidate package contains every referenced controller module.
- No private signing key or trusted-iPad token exists in repository artifacts.
- Accepted Audio V1.1 rollback identity is pinned.

## Phase B — source identity gate
Before publishing a firmware candidate, prove that the build input is descended from/reconciled to the accepted live firmware:
- accepted firmware SHA-256: 0aeb668e58cad3bae5b636fdc79573a263c3d0e911903ed48af0bbc2e5681f61
- accepted HBNF candidate: hbnf-integrated-rc-visual-audio-continuity-2026-09-30
- accepted WLED: 16.0.1

If that evidence is missing, do not publish or install a firmware candidate.

## Phase C — physical preflight
Required powered devices: Opal, Matrix, AUX.
Required iPad network: HBNF-Cart.
Do not change LuCI/network settings.

On the Matrix-local /hbnf dashboard:
1. Run rollout preflight.
2. Require Matrix API PASS.
3. Require signed OTA PASS.
4. Matrix/AUX truth should report connected/ready; if either does not, refresh once before any install.
5. Live-data WAN failure is a warning, not a local-control blocker.

If Matrix API or signed OTA is FAIL, stop before install.

## Phase D — first real OTA
1. Publish one immutable signed candidate only after source/build gates pass.
2. On trusted iPad, Check signed update.
3. Confirm the expected release ID and Matrix MAC before opening installer.
4. Start exactly one install.
5. Do not power-cycle while updater reports active work.
6. Wait for updater health result.

Automatic rollback or manual rollback is used only if the candidate fails defined post-install health.

## Phase E — post-install acceptance
Verify, in this order:
1. Matrix reconnects.
2. AUX reconnects / DDP follower health returns.
3. /hbnf reconnects after reload and lock/wake.
4. Matrix brightness.
5. AUX brightness.
6. Motion.
7. Audio Response.
8. Auto / Next / Lock.
9. Look selection.
10. Color.
11. Palette.
12. Saved look save/apply.
13. Manual text.
14. Skins/Glow live refresh.
15. Scoreboard.
16. Ace pot.
17. Signed update status shows the newly accepted current release.
18. iPhone + iPad state convergence.

If all pass, freeze the new known-good release.

## Separate router-startup gate
HBNF-Cart SSID cold-start reliability is not part of the firmware acceptance above and must not be silently marked solved.
Run a separate true cold boot later:
- all cart network hardware off
- wait 15 seconds
- power on
- measure SSID appearance/join behavior
- resolve only if the known intermittent startup defect reproduces.

## Stop conditions
Do not improvise around:
- source identity mismatch
- wrong Matrix MAC
- signature verification failure
- artifact SHA/size mismatch
- updater health failure
- missing rollback artifact
- unexpected router/network change requirement

A stop condition should produce one targeted diagnostic, not a new broad investigation.

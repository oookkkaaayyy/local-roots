## Current migration pointer — 2026-10-04 PM2
Read `work/cart2/25_LENGTH_LIMIT_MIGRATION_HANDOFF_20261004_PM2.md` and Drive handoff `1hsrKsToWY-xMtAh8wnW2aMW_EqqKiuMQpqpU_mecuG0` FIRST. Packet20 clean-room run 37234856834 succeeded; artifact is validated and preserved in Drive release capsules. The immediate gate is updater high-water + exact Release07 rollback verification, not another build or source archaeology.

# HBNF Cart 2.0 — Next Codex Handoff

STATUS: CURRENT SOURCE-CONNECTED HANDOFF POINTER — 2026-10-04.

Do not use the older PR #46/release04 audit sequence or the superseded Packet20 plan as the next execution path.

## Current state
- lifecycle: DIAGNOSTIC_ACTIVE
- release07 role: DIAGNOSTIC_BASE / PERFORMANCE_REJECTED
- foundation: FOUNDATION_UNQUALIFIED — PERFORMANCE_OPEN
- Packet20: zero valid live kernel samples
- Cloud run 1 (37229698261) exposed missing WLED base dependency closure; run 2 (37230743394) verified that repair and exposed missing ANIMartRIX dependency; run 3 (37231477686) verified both dependency repairs and exposed the real source/API mismatch: Packet20 expects four historical `animation_clock_*` ANIMartRIX members that do not exist in upstream WLED-pinned Animartrix. No fourth run is authorized.
- Packet20 support tooling: byte-identical pure host tests PASS; live validation still pending
- exact Packet20 renderer-safe source: SHA-256 `529e1bf718c3770b7d4ba6408178e9d3e7a4ed1d223b9bbf9071b68e75eed74b`
- exact source/build/workflow inputs are durable in GitHub + Drive
- local PlatformIO/LDF recovery path: CLOSED
- Phase 2 firmware-dependent implementation: NOT AUTHORIZED
- source-independent planning/acceptance refinement: permitted

## Required read-first
1. root `AGENTS.md`
2. `config/HBNF_CONTROL_MODEL.json`
3. `config/HBNF_CONTROL_STATE.json`
4. `work/cart2/PACKET20_BACKEND_READINESS_20261004.md`
5. Drive `AKS — HBNF CART 2.0 — CURRENT FILE AUTHORITY` — ID `1GwvPv_nihqoIj83WsO6VcvyujRkt8HnnULvLv717OHc`
6. Drive `AKS — ARTIFACT & SOURCE REGISTRY — CURRENT` — ID `18VsUYIYr62fYVaEqynM1kbMmfQpei-3H3rBgrw8S96k`
7. `work/cart2/21_CLASS_LEVEL_PERFORMANCE_FIX_EXECUTION_TEMPLATE.md`
8. `work/cart2/22_FOUNDATION_QUALIFICATION_EXECUTION_TEMPLATE.md`
9. `tools/hbnf_packet20_http_adapter.py`
10. `config/HBNF_PACKET20_LIVE_SWEEP_ADAPTER_20261004.json`
11. `scripts/hbnf_packet20_build_validate.py`
12. `evidence/hbnf-phase2-migration-20261003/packet20-support-tooling-host-test-receipt-20261004.json`

`work/cart2/20_FOUNDATION_PERFORMANCE_SWEEP_EXECUTION.md` is retained as historical planning only and is explicitly SUPERSEDED.

## Exact next gate
GitHub Actions is available and the authorized cloud-build attempts have completed. Do not spend another run discovering source lineage.

Run 3 reached the first genuine source/API mismatch:
- Packet20 source expects `animation_clock_ms_`, `animation_clock_speed_`, `animation_clock_last_ms_`, and `animation_clock_started_`;
- exact WLED 16.0.1 upstream Animartrix commit `81eb09b91c8c9c8c01f8ea442787f8127d56c72f` contains none of them and computes oscillator runtime from absolute `millis()`;
- Delta Inbox row 1014 proves a 2026-09-30 accepted continuity repair replaced that jump-prone behavior with a continuous integrated/slew-limited animation clock;
- the preserved local source patch is named at `/Users/andrew/Documents/Codex/2026-09-29/files-pasted-by-the-user-hbnf-2/outputs/hbnf-visual-audio-repair/source.patch`.

Required next work is bounded provenance recovery of that exact Sep-30 clock modification. Do not remove the clock fields, invent a new clock, or silently fall back to stock upstream timing. Do not trigger a fourth GitHub Actions run without explicit user approval after the exact source-backed correction is staged.

Run-3 receipt:
`evidence/hbnf-phase2-migration-20261003/packet20-cloud-run3-failure-20261004.json`.

## After successful Packet20 build
1. Verify exact branch/commit/source SHA/WLED base/environment.
2. Verify firmware SHA, size and OTA headroom.
3. Run `scripts/hbnf_packet20_build_validate.py` against the extracted Actions artifact and the actual trigger commit. It must PASS exact source/build provenance, firmware SHA/size/headroom, required files and package/build evidence.
4. Immediately promote the validated build artifact/provenance to Drive folder `20 — RELEASE CAPSULES` and update the artifact registry before the 1-day GitHub artifact expires.
5. Read live updater `/etc/hbnf-updater/release-state` once; derive the legal diagnostic/recovery sequence pair from live high-water. Never guess sequence numbers.
6. Verify exact Release07 recovery artifact before install.
7. Install one diagnostic candidate.
8. Use `tools/hbnf_packet20_http_adapter.py` through `config/HBNF_PACKET20_LIVE_SWEEP_ADAPTER_20261004.json`. One renderer-safe snapshot is the preflight and seeds the entire sweep; Packet20 permits only one saved snapshot per boot.
9. STOP on restart, panic/reset evidence, uptime regression, snapshot failure, identity mismatch, or restore mismatch. No automatic retry.
10. If stable, run exactly one complete 28-kernel Packet20 sweep and require firmware `restoreVerified=true` / exact `packet20Same()` restoration.
11. Rank/group pathological kernels by shared primitive/class and instantiate Packet21.

## Device evidence exclusion
The Matrix was intentionally power-cycled once during backend/cloud-build preparation while no firmware install, Packet20 sweep, snapshot capture, or live telemetry collection was active. Any corresponding uptime reset or normal power-on reset reason is expected and MUST NOT be treated as diagnostic evidence.

## After Packet20
Only if complete 28-kernel evidence exists:
- instantiate Packet21;
- fix measured performance classes/shared primitives, not serial kernels;
- reuse the exact successful Packet20 cloud-build provenance;
- build/package one corrected forward candidate;
- do not install without required live authorization.

After corrected candidate install + basic health, instantiate Packet22.

Only an exact artifact passing Packet22 becomes:
**PHASE 2 FOUNDATION — QUALIFIED.**

No prose handoff, successful build, successful OTA, or newest branch HEAD may bypass the lifecycle model.

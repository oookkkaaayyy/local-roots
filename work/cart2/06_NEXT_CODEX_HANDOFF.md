# HBNF Cart 2.0 — Next Codex Handoff

STATUS: CURRENT SOURCE-CONNECTED HANDOFF POINTER — 2026-10-04.

Do not use the older PR #46/release04 audit sequence or the superseded Packet20 plan as the next execution path.

## Current state
- lifecycle: DIAGNOSTIC_ACTIVE
- release07 role: DIAGNOSTIC_BASE / PERFORMANCE_REJECTED
- foundation: FOUNDATION_UNQUALIFIED — PERFORMANCE_OPEN
- Packet20: zero valid live kernel samples
- First cloud compile run 37229698261 failed on missing WLED base dependency closure; corrected run 37230743394 proved that repair worked but then exposed a second undeclared dependency, ANIMartRIX.h. Exact no-run fix is staged at temp commit 19f72a9339d0ed8501337c6141513bdf11dd84cc. No third run is authorized.
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
GitHub Actions was intentionally shut down repository-wide on 2026-09-29 because usage was near the included limit. This is the known explanation for the current absence of GitHub Actions runs.

Do NOT:
- debug Packet20 YAML/auth as the primary blocker;
- rewrite the trigger path;
- reopen local PlatformIO;
- ask for a human-vs-connector trigger experiment;
- trigger unrelated workflows;
- create a second Packet20 build attempt.

The user has explicitly authorized exactly one bounded Packet20 cloud build:
- one job;
- one compile;
- 20-minute timeout;
- no matrix/retry;
- no second run without explicit approval.

Repository Actions must first be re-enabled/available. Current GitHub UI path:
**Repository → Settings → Actions → General → Actions permissions.**

Actions is available. Run 37229698261 exposed missing WLED ESP32 dependencies; corrected run 37230743394 proved that repair and then exposed missing ANIMartRIX.h. The exact WLED-pinned Animartrix dependency is staged at temp-branch commit 19f72a9339d0ed8501337c6141513bdf11dd84cc. Do not trigger a third run without explicit user approval. The trigger file currently has blob SHA `a1ff66bf1d5054a7a874cb7b4146a9674ab20fa2`; update that exact file rather than creating a parallel trigger path. The prior event started zero runner work, so the next event is the first actual authorized build execution, not an authorized retry.

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

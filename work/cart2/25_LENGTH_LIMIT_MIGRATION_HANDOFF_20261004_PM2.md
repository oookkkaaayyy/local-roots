# HBNF Cart 2.0 — Length-Limit Migration Handoff — 2026-10-04 PM2

## Purpose
This is the authoritative successor handoff after the prior coordinator hit the ChatGPT length limit and a later message-delivery timeout. Read this FIRST. Do not ask the user to recap. Then read the Drive handoff/current authorities listed below.

## Current state — materially advanced
Lifecycle remains `DIAGNOSTIC_ACTIVE`.
Foundation remains `FOUNDATION_UNQUALIFIED — PERFORMANCE_OPEN`.
Packet20 still has **zero valid live kernel samples**.

However, the clean-room firmware build blocker is now CLOSED:

- GitHub Actions run **37234856834**: **SUCCESS**
- trigger commit: `7928a256f31ce46775717731cf1338944a2b5709`
- pre-trigger workflow head: `d04771b63ed2c7a704b17a268203e973c9176d68`
- exact workflow Git blob: `7998c2e112db57ac0febc67f20c0cbd14893303d`
- exact Packet20 source SHA-256: `529e1bf718c3770b7d4ba6408178e9d3e7a4ed1d223b9bbf9071b68e75eed74b`
- WLED base: `29b389df1c1aaec6ff53aea742d17063b985906c`
- PlatformIO: `6.1.18`
- Python: `3.12.14`
- Node: `20.20.2`
- target env: `hbnf_matrix_wled16_packet20_diag`

Successful firmware:
- SHA-256: `40b68f0c09573540b57ed517d262a0f41d3739c42139a3d96f9bf659567cf317`
- firmware.bin bytes: `1,462,240`
- OTA slot bytes: `1,572,864`
- headroom: `110,624`
- build log linked flash: `1,455,557 / 1,572,864`
- RAM: `102,888 / 327,680`
- PlatformIO compile result: `SUCCESS`, 148.05 s

## Durable successful artifact
GitHub artifact:
- ID: `11314674860`
- name: `HBNF-Packet20-Safe-Point-37234856834`
- zip size: `16,516,420` bytes
- zip SHA-256: `dca762bce1d934a04c18b9cc6e0b0f9880d0a4779f3945c7943ca6b84c8ef8ed`
- GitHub retention only through 2026-10-05T21:18:59Z

It has already been promoted to Drive folder `20 — RELEASE CAPSULES`:
- Drive file ID: `1VhqoXzlNwBzHCPVrqLDQG1T7Z0Cp9yVF`
- filename: `HBNF-Packet20-Safe-Point-37234856834.zip`
- parent folder: `17B-XkjyK92FS7dT8TWDRqcTxozZRjTFV`

Run5 success evidence:
`evidence/hbnf-phase2-migration-20261003/packet20-cloud-run5-success-20261004.json`

## Artifact validation already performed
The exact run5 artifact was downloaded and extracted in an isolated assistant container. Validation passed for:
- firmware SHA vs provenance;
- firmware size/headroom;
- Packet20 source SHA;
- exact source.patch identity;
- exact Animartrix upstream commit;
- pristine upstream `ANIMartRIX.h` Git blob;
- exact vendor clock patch SHA;
- patched-header SHA;
- all four `animation_clock_*` members;
- non-const oscillator method signatures;
- exact WLED ESP32 dependency closure;
- exact WLED-pinned Animartrix dependency;
- deterministic generated-UI generator/input/output hashes;
- generated-output hashes cross-recorded in `source-input-sha256.txt`;
- build log success.

Exact generated UI output hashes and generator hashes are preserved in the run5 artifact and success receipt.

Staging validator has also been hardened to fail closed on vendor patch evidence and deterministic WLED generated-UI hashes. Do not claim a new host-test receipt for the final validator edit unless one is explicitly added.

## Why Runs 1–4 failed
These were not four independent firmware defects. They were one incomplete clean-room build closure revealed in layers.

### Run 1 — 37229698261
Failed: `AsyncTCP.h` missing.
Fix: restore exact WLED ESP32 dependency closure.

### Run 2 — 37230743394
Failed: `ANIMartRIX.h` missing.
Fix: declare exact WLED 16.0.1 Animartrix pin:
`81eb09b91c8c9c8c01f8ea442787f8127d56c72f`.

### Run 3 — 37231477686
Failed: historical `animation_clock_*` members absent from pristine upstream Animartrix.
User supplied exact historical `source.patch`, which proved the installed lineage patched the third-party Animartrix clock.

Raw exact source.patch:
- Drive: `1uzBe-bVdQhmw2KaOO6eSQfGIelDXNda5`
- size: 17,244 bytes
- SHA-256: `aca7b2fa6fe45ce992e162d91447351487e854279de373e691cf02615c149b04`

Do **not** apply that old full patch wholesale to Release07.

Only newly required vendor hunk:
- Drive: `184_dgUkzJ1raV2K0qC9YdcuP1JOzSeoQ`
- SHA-256: `f38d260d0f1f50644f24166fa92377d48ac0ffbe292b57f8ec5db39579af10c4`
- GitHub: `.hbnf-packet20-cloud/source/animartrix-clock.patch`
- pristine upstream Animartrix commit: `81eb09b91c8c9c8c01f8ea442787f8127d56c72f`
- pristine header Git blob: `db640748175cfdd70dc103fc23c830e646fa5ab6`
- patched header SHA-256 in run5: `bd9d146e2ce5fde991a895ccc2ad2773df1cc77cb815381679c17c6425d7bbe8`

### Run 4 — 37234233203
Compiled through Packet20 + patched Animartrix, then failed at `wled_server.cpp`:
`html_ui.h: No such file or directory`.

Full default-script/generated-input audit proved HBNF override omitted exactly one WLED default build script: `pre:pio-scripts/build_ui.py`.
Fix: pin Python/Node, run deterministic WLED UI generation before PlatformIO, require all 10 outputs, and record hashes.

Run4 failure artifact is durable:
- Drive `1oglzQ_nVT37W2lCTgxb6UleTuOHO1pNx`
- receipt: `evidence/hbnf-phase2-migration-20261003/packet20-cloud-run4-failure-20261004.json`

### Run 5 — 37234856834
Clean-room build SUCCESS.
This closes the build-closure archaeology.

Solved-problems ledger now marks:
- `HBNF-SOLVED-015` generated WLED UI closure;
- `HBNF-SOLVED-016` patched third-party dependency closure.

## Challenger / process correction
Read:
`work/cart2/PACKET20_CHALLENGER_REVIEW_20261004.md`

Permanent correction:
1. Never use paid cloud compile attempts as iterative source archaeology.
2. Reconcile source + dependencies + vendor patches + generated inputs before spending.
3. Freeze exact identities and fail closed pre-compile.
4. After a clean build succeeds, stop build archaeology and move forward.
5. If a later build exposes another missing build input, do a full closure audit before any later run.
6. Never reopen the user's local PlatformIO/LDF repair path.
7. Never wholesale-apply the old source.patch over current Release07.

## Current authoritative sources
Drive:
- Master Router: `1CvCKk04BDMUEbxtqatUP_bU7KbFYYJo1Hu32bh_zgzM`
- Cart2 CURRENT FILE AUTHORITY: `1GwvPv_nihqoIj83WsO6VcvyujRkt8HnnULvLv717OHc`
- Artifact Registry: `18VsUYIYr62fYVaEqynM1kbMmfQpei-3H3rBgrw8S96k`
- Release Engineering: `1bw_VUNt2mEZ4JdKuRsQq7ZS1Bc4KeC8kMVABVK2OdgE`
- prior PM handoff: `1XmyqVCwQIcaEmfdbx4ZaF6S-BuoVfUVgBGpWA2UShfU`
- project folder: `1E5u4gEUVi0cwTEZP8j0vqUF78tWrU-Pc`
- 10 SOURCE & BUILD INPUTS: `1a7m8ck0EA4c4K5CDh6uPRAvf0FTOw8lg`
- 20 RELEASE CAPSULES: `17B-XkjyK92FS7dT8TWDRqcTxozZRjTFV`
- 30 DIAGNOSTICS & EVIDENCE: `1UPugI0cXnKlPU4jyMURj5f4IuKiNILa_`

GitHub:
- repo: `oookkkaaayyy/local-roots`
- staging: `hbnf-cart2-ready-to-implement-staging-20261001`
- clean-build temp branch: `hbnf-packet20-safe-point-cloud-20261004`

## Device / updater
- Matrix: `192.168.77.10`, MAC `70:4b:ca:5b:34:5c`
- AUX: `192.168.77.11`, MAC `8c:94:df:55:c3:4c`
- Opal: `192.168.77.1`
- Matrix owner + AUX DDP follower
- updater: `1.2.4-1`
- updater IPK SHA: `8cd8ded020bf192b323c9a6f8664c34e1f2ddcd760d974d8d152e13b9403bc20`
- release-state high-water authority: `/etc/hbnf-updater/release-state`
- production OTA public-key DER fingerprint: `fa6a5f782607ef2ac3123ac9f7912f4cb2e7d5d0a23f6ef5112510075097f41d`

IMPORTANT DEVICE NOTE:
The Matrix was intentionally power-cycled once during backend/cloud preparation while no Packet20 install/sweep/snapshot/live telemetry was active. Corresponding uptime/reset evidence is expected and MUST NOT be investigated.

## Installed Release07
- release ID: `hbnf-matrix-coordinated-v1-20261002-07`
- installed BIN SHA-256: `8e8db17786b178fc8fcd2cdf8a21512681ec7158941ee49ea255509970b1bcab`
- install/device health: PASS
- performance: REJECTED
- ~11.53 FPS / 85.3 ms whole frame
- Parametric_Water kernel2 ~68.9 ms
- earlier RGB_Blobs5 kernel3 ~59.955 ms
- prior accepted comparison ~35 FPS / 28.6 ms

The exact Release07 rollback BIN is historically reported preserved, but its durable Drive ID/path is still not registered. Existing signed recovery seq14 targets Release06 and is NOT acceptable as the pre-diagnostic Release07 rollback.

Do not perform firmware mutation until an exact Release07 rollback artifact with SHA `8e8db177...` is independently verified and registered.

## Immediate next technical gate
The build is no longer the blocker.

Before any live mutation:
1. read live Opal `/etc/hbnf-updater/release-state` exactly once; do not infer sequence from old history;
2. locate/verify/register the exact Release07 rollback BIN SHA `8e8db177...`;
3. derive the legal diagnostic + exact Release07 recovery sequence pair;
4. sign/publish both;
5. verify public manifests/signatures/artifact hashes before install.

If the user is not on HBNF-Cart / cannot reach Opal, do all remaining backend artifact/recovery discovery first. Ask for a user action only when the exact live high-water is the only remaining blocker.

## Packet20 live execution contract
After release/updater preflight:
1. install exactly one diagnostic candidate;
2. run exactly one renderer-safe snapshot preflight;
3. STOP on restart, panic/reset evidence, uptime regression, snapshot failure, identity mismatch, or restore mismatch;
4. if stable, run all 28 retained kernels exactly once;
5. require runtime kernel identity every selection;
6. preserve timing/heap/RSSI/AUX projection telemetry;
7. exact restore;
8. require firmware `restoreVerified=true` / exact `packet20Same()`;
9. rank/group pathological kernels by shared primitive/class;
10. instantiate Packet21 only from the COMPLETE 28-kernel report.

Packet20 host tooling already staged:
- `tools/hbnf_packet20_http_adapter.py`
- `config/HBNF_PACKET20_LIVE_SWEEP_ADAPTER_20261004.json`
- `scripts/hbnf_live_kernel_sweep.py`
- `scripts/hbnf_kernel_sweep_report.py`
- `scripts/hbnf_packet20_build_validate.py`

## Cost / GitHub Actions
User's latest instruction:
- up to **$5 total external cost** for genuinely necessary continuation work;
- minimize actual spend;
- pause before any single action materially above historical estimates;
- do not use the budget as permission to loop.

Run5 used one hosted Linux job and completed successfully. No additional firmware build is currently justified.

GitHub Actions is still enabled repository-wide because the user re-enabled it for Packet20. This creates potential future incidental CI usage on unrelated pushes/PRs. Do not surprise the user by changing repository settings, but surface this as a cost-control choice when appropriate: either leave enabled for near-term Packet21/22 work, or ask the user to disable it again when the build lane is dormant.

## Hard scope
Do not reopen:
- local PlatformIO/Python/LDF/SCons/cache repair;
- UART/serial;
- LuCI/public-router archaeology unrelated to reading the exact updater high-water;
- AUX physical LEDs for Packet20;
- power/brownout theory absent new evidence;
- old full source.patch application;
- Phase2 firmware-dependent implementation before Foundation qualification.

## User-time rule
The user has spent an excessive amount of active time on this project.
Do not make them a Terminal relay or source archaeologist.
Do backend work autonomously.
When user action is truly required, give:
- exact device/network prerequisite;
- one exact action;
- expected result;
- stop condition.

No walls of text in ordinary status updates.

## Done definition remains unchanged
1. Packet20/21/22 Foundation qualified.
2. Mission Control implemented.
3. Same public PWA works direct/local/offline on cart LAN and remote via cloud relay.
4. differentiated CHILL/GROOVE/HEAVY/PSYCHEDELIC/COSMIC/AUTO audio-visual Vibes.
5. Vibe-specific text/moments/typography.
6. PLAY/guest features.
7. updater/recovery/automation reliable.
8. physical Matrix/AUX/iPad/Wi-Fi/power acceptance.
9. final icon/soak/update-recovery/guest-shareability/acceptance corpus.
10. lifecycle ACCEPTED.

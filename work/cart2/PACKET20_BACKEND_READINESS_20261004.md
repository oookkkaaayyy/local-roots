# HBNF Cart 2.0 — Packet20 Backend Readiness — 2026-10-04

STATUS: BLOCKED ON REPOSITORY GITHUB ACTIONS AVAILABILITY. NO HARDWARE ACTION REQUIRED.

## Exact candidate inputs
- Temp build branch: `hbnf-packet20-safe-point-cloud-20261004`
- Packet20 trigger commit that produced no Actions run: `9162b3a102f1c67553914c467e427d6f19daeefa`
- Current temp-branch governance commit: `1696c462363e043ab8f532d186abb6c582829ba8`
- WLED base commit: `29b389df1c1aaec6ff53aea742d17063b985906c`
- Build environment: `hbnf_matrix_wled16_packet20_diag`
- PlatformIO Core: `6.1.18`
- Packet20 source SHA-256: `529e1bf718c3770b7d4ba6408178e9d3e7a4ed1d223b9bbf9071b68e75eed74b`
- Build overlay SHA-256: `1f2d5d020a6dba814fbc3d65ae1daa0c8973872ab7100b858022cd5110ef1970`
- Workflow SHA-256: `42b6e8803f75b71dd56b41e74a9183157ea994cc56afffa6a7c3eb48aa403d7f`
- Recovery target Release07 BIN SHA-256: `8e8db17786b178fc8fcd2cdf8a21512681ec7158941ee49ea255509970b1bcab`

Durable Drive copies already exist in Cart 2.0 folder 10:
- source: Drive `1NpXNY1PxPMlpMYwD9t9vKXYIfzMNpLjr`
- exact build overlay: Drive `1Gc8-fSwRKvIvxafD1NqHrFT-JkdLh0el`
- one-shot workflow: Drive `1HsWWzwWxnahTebfKNrd3GPEd-5CzNdHl`

## Root-cause evidence for missing cloud run
The Packet20 trigger itself is no longer the leading suspect.

1. Commit `9162b3a...` was a real GitHub push. Cloudflare created and completed a check suite for that exact commit.
2. Packet20 branch/path filters match the changed file exactly.
3. The Packet20 workflow file existed on the branch before the trigger commit.
4. Non-default-branch Actions workflows are historically proven in this repository.
5. Current `main` contains `.github/workflows/ci.yml`, configured for every push to `main`.
6. Multiple recent `main` commits on 2026-10-02 through 2026-10-04 have Cloudflare check suites but NO GitHub Actions suite/run.
7. The latest visible repository GitHub Actions runs predate those main pushes.
8. This is NOT a connector-authentication artifact: PR #52 head commit `1b26040a3c19962c0d6ebe26110c2aa8b6f90903` was created by the user's local Mac identity (`Andrew <andrew@Andrews-MacBook-Air.local>`) and opened against `main`; despite `ci.yml` being configured for `pull_request: [main]`, that commit also received only a Cloudflare check suite and no GitHub Actions suite/run.

Conclusion: GitHub Actions execution is presently suppressed/disabled/suspended at repository/account/policy/billing level. Connector-origin suppression is ruled out. The exact administrative reason is not exposed by available read-only connector endpoints and must remain UNKNOWN until account/repository Actions availability is checked.

Do NOT rewrite Packet20 source, workflow, paths filter, build inputs, or use a human-vs-connector trigger experiment to solve this blocker. Do NOT retry local PlatformIO.

## Historical cause recovered — blocker is no longer mysterious
A preserved project handoff from 2026-09-29 explicitly states that **GitHub Actions were shut down repository-wide because usage was near the included limit**, together with the rule **NO GITHUB ACTIONS RUNS OR CHARGES WITHOUT MY EXPLICIT APPROVAL**. This matches the current repository-wide absence of Actions runs exactly.

Therefore:
- do not investigate Packet20 YAML/auth as the primary cause;
- do not run a human-vs-connector trigger experiment;
- the repository-wide shutdown is the known cause unless current GitHub UI reports a separate account-level disabled state;
- the user's current authorization covers exactly the bounded Packet20 one-shot build already specified; it does not authorize retries or unrelated workflows.

Current GitHub documentation says repository Actions are managed at **Repository → Settings → Actions → General → Actions permissions**. When Actions are disabled, no workflows run. If GitHub instead reports Actions disabled for the account itself, changing repository permissions will not restore access and GitHub Support is required.

Current GitHub billing documentation says included Actions minutes reset at the start of each month. The original near-limit shutdown was recorded on 2026-09-29; today's date is 2026-10-04. Current account usage is not exposed by the connected tools, so do not invent the remaining-minute count.

## Smallest gate before a new trigger
Restore repository GitHub Actions only for the already-authorized bounded Packet20 run. The expected user-side location is Repository → Settings → Actions → General → Actions permissions. Once Actions is enabled, create exactly one new trigger event for the existing Packet20 workflow. The connector may create that trigger; a user-authenticated Git push is not required. A failed prior push created zero runner work, so this is not a build retry from a firmware perspective.

## Once the one-shot build starts
Require exactly one job and one PlatformIO compile. On success preserve:
- `firmware.bin`
- `firmware.elf`
- `build.log`
- `source-input-sha256.txt`
- `project-config.json`
- `project-metadata.json`
- `resolved-packages.txt`
- `size-and-headroom.txt`
- `provenance.json`

Before any hardware mutation:
1. Verify artifact commit/branch/source SHA/WLED base/env.
2. Verify firmware SHA and OTA headroom.
3. Promote firmware + provenance to Drive folder 20 and register them.
4. Read live updater `/etc/hbnf-updater/release-state` once. Do not assume historical sequence numbers.
5. Choose the legal next diagnostic/recovery sequence pair from the live high-water and updater policy.
6. Verify exact Release07 recovery artifact before install.

## Packet20 live stop rules
- Install only one diagnostic candidate after release/updater preflight.
- Run one snapshot preflight before the sweep.
- If restart, uptime regression, panic/reset evidence, snapshot failure, identity mismatch, or restore mismatch occurs: STOP. No automatic retry.
- If snapshot survives: run all 28 retained kernels once, verify runtime kernel identity after every selection, collect diagnostic timing, and restore exact pre-sweep state.
- Packet21 starts only from a complete 28-kernel ranked report.
- Packet22 starts only after a corrected class-level candidate has installed and passed basic health.

## Device note
The Matrix was intentionally power-cycled once during backend/cloud-build preparation while no firmware install, Packet20 sweep, snapshot capture, or live telemetry collection was active. Corresponding uptime reset or normal power-on reset reason is expected and MUST NOT be treated as diagnostic evidence.

## Closed paths
Do not reopen:
- local PlatformIO/Python/LDF/SCons troubleshooting;
- UART/serial diagnosis;
- router/LuCI archaeology;
- AUX LED physical work;
- broad source/worktree rediscovery;
- repeated cloud runs.

Read Drive `AKS — HBNF CART 2.0 — CURRENT FILE AUTHORITY` and the artifact registry before any continuation.


## Host-side Packet20 execution adapter — prepared 2026-10-04
Candidate support tooling is now staged so the live sweep does not need to rediscover the firmware control surface after the build.

Files:
- `tools/hbnf_packet20_http_adapter.py`
- `config/HBNF_PACKET20_LIVE_SWEEP_ADAPTER_20261004.json`
- `tests/hbnf_packet20_http_adapter.py`
- `scripts/hbnf_packet20_build_validate.py`
- `tests/hbnf_packet20_build_validate.py`

Key semantics captured:
- retained effect IDs 220..247 map exactly to Packet20 runtime kernel indices 0..27;
- Packet20 commands use the existing WLED JSON-state usermod path, not a guessed private endpoint;
- snapshot capture is queued by the HTTP handler but the large state copy occurs only at the renderer safe point;
- Packet20 supports one volatile saved snapshot per boot;
- after exact restore, firmware's `packet20Same()` result (`restoreVerified=true`) is authoritative;
- the generic sweep runner's post-restore second snapshot call is satisfied by returning the original immutable snapshot receipt only after `restoreVerified=true` and diagnostics have ended, rather than attempting an illegal second firmware snapshot;
- mid-session uptime regression is treated as a reboot, returns raw Packet20 reset-reason evidence, and fails closed with no retry;
- the prior intentional Matrix power cycle happened before this session and is therefore excluded from diagnostic interpretation;
- physical AUX LEDs may remain disconnected for Packet20, but the AUX controller should remain reachable for projection telemetry.

The adapter normalizes current firmware timing into the existing diagnostic telemetry contract and preserves raw reset evidence in JSONL. No hardware command has been executed with this tooling.

The cloud-build validator fails closed on branch/commit/source/WLED base/PlatformIO environment, firmware SHA/size/headroom, required artifact files, source-input hashes, PlatformIO structured metadata, package evidence, and build-log success before any release/publish/install step.

Status: SOURCE-STAGED / NOT LIVE-EXECUTED. Pure non-network tests are authored; do not claim live validation until they are executed in a source-connected runtime.

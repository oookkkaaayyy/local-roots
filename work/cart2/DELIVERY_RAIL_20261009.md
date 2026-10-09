# CART 2.0 — DELIVERY RAIL (OWNER-MANDATED, 2026-10-09)

**Operational authority:** `config/HBNF_CONTROL_MODEL.json > execution_system.delivery_rail` and the existing `config/HBNF_CONTROL_STATE.json`. This document is the procedure, not a new authority layer. **No owner authorization for restart, OTA, diagnostic reentry, router/AUX/cloud mutation, or scope reduction is granted here.** R5 remains installed until separately approved change.

## Root cause and change from the failed approach

The October 6 `HBNF_EXECUTION_BUDGET_POLICY.json` already required 30-minute stall control, at most one materially changed retry, and offline-first work. Yet builds repeatedly stalled in FileProvider/PlatformIO, live test harnesses failed on environment identity, deadline exhaustion, incorrect preflight ordering, histogram quantiles and restore aliases, and one-shot Packet20 sessions were wasted. The deficiency was **lack of an admission check on the actual launch path**. Additional status summaries, duplicated instructions and arbitrary new candidate versions are not remedies.

## Single release train — exit evidence, not activity

| Gate | Mandatory exit evidence | What is NOT sufficient |
|---|---|---|
| 0 — Identity | Newest canonical device receipt, exact installed release/MAC, GitHub state discrepancy resolved, approved scope and R4 rollback inventoried | Old GitHub state reported R4 while later field receipts reported installed R5 |
| 1 — Local build machine | Reusable immutable pinned source+dependencies+toolchain+generated inputs, local readable PlatformIO core including metadata, known-good compiler-entry smoke and captured environment hashes | Different `PLATFORMIO_BUILD_DIR` alone, same hung `appstate.json` read retried, library upgrade |
| 2 — Integrated release candidate | **One** exact built candidate with embedded release ID, firmware SHA, flash/RAM headroom, compiler logs and full source binding | R6 source identity, 2,580,480 bit-exact host tests, or a pre-compilation halt |
| 3 — Full offline release rehearsal | Historical host failures replayed together; deterministic snapshot→observer→kernel sweep→soak fixture→restore and fail-path with no device calls; correct failure persistence, clean environment | Separate unit tests with no end-to-end launch rehearsal |
| 4 — Admission | `python3 scripts/hbnf_control.py check-admission --admission <JSON> --stage OFFLINE_COMPILED` PASS and saved SHA/receipt | Someone saying "ready"; checker doesn't validate a real device itself |
| 5 — Live admission | Fresh exact owner authorization, current receipt/identity and new `--stage LIVE_APPROVED` admission PASS. Live launcher must reject missing/invalid admission BEFORE first network/device action. | Old or consumed authorization, reusing previous R5 restart permission |
| 6 — Measured hardware | Matched tails-OFF kernel 13/9 tests, recorded brightness/presentation, unchanged 28×(5 s settle + 30 s sample), combined-feature tests, contiguous 90-minute soak, exact renderer/AUX health, rollback only within explicit limits | 9 FPS tails-ON R5 observer signal, synthetic soak, unsaturated maxima alone |
| 7 — Field product | Actual iPad/phone control and scoring, AUX/Matrix physical coherence, Vibes/audio nuance, premium Text/Moments, night-vision brightness with existing frosted/tinted cover, recovery. T4/T5 receipts only for proved scope. | A passing firmware soak alone |

**Current gate:** Gate 1. R6 remains a source-only, unqualified optimization; latest receipt says its pinned PlatformIO `appstate.json` read blocked before compilation. R5 installed per field receipt; live authority closed. Resolve the conflicting older repository state by exact receipt readback, not another device mutation.

## Operational controls

1. **Single WIP release:** One integrated candidate under development, one live mutation lane. No R7/R8 proliferation while R6 remains viable. Independent host-only UX/scoring lanes may run in parallel without editing the candidate or touching hardware.
2. **Known-good environment, once:** Stage verified pinned artifacts locally, fully materialized (no Finder/FileProvider lazy fetch), prove readable core metadata and a compiler-entry smoke before candidate build. If the first mechanism stalls beyond the preexisting anti-stall budget, pivot once to another *verified, pin-identical* fully local core. Never `pip -U`, edit dependencies blindly, or retry a hung read indefinitely.
3. **Test the release machine, not just firmware:** Convert each historical host failure into a deterministic replay exercised in the *same entrypoint* used for future releases: wrong inherited R4 ID, premature telemetry preflight, observer deadline/extension, saturated percentile vs isolated overflow, restoreVerified without serialized packet20Same, short/invalid JSON responses, low disk, cleanup/tails disabled, and duplicate sampler. No repeat live diagnostic session to discover a host bug.
4. **Real gate enforcement:** Before any new flash/restart/snapshot transaction, the actual launcher must invoke `check-admission` or equivalent fail-closed check and must have tests proving a missing/false/stale manifest performs **zero hardware/network operations**. The CLI is read-only; it does not confer authorization and does not physically block a rogue direct `curl`.
5. **Preserve approved outcomes:** Rich organic effects, high-quality audio/Vibe distinctions, Text/Moments, appliance-like owner controls, Skins scoring, local-first operation, dark adaptation, and committed future scope. Do not tune down visual quality to pass performance. A new firmware binary needs new runtime qualification; a harness-only change does not invalidate unrelated firmware evidence.
6. **No-go escalation:** If repeated failure class or admission gap is open, stop that release mechanism, preserve evidence, report one precise root cause plus a materially different safe path. Do not ask for another hardware authorization before all offline gates are met.
7. **Reporting:** Four fields only: last gate completed + evidence SHA; current single gate and objective exit; blocker/pivot deadline; exact owner action (usually NONE). Activity, prompts, summaries, extra commits and logs do not count as progress.

## What changes NOW

**Immediate decision: freeze new live attempts and candidate proliferation; complete G1–G4 offline, then evaluate one exact bounded live transaction.** This is a prohibition on *new* unsafe attempts, not an instruction to cancel any healthy ongoing operation. Running physical R5 is untouched.

The control-model checker is an added safeguard, not a substitute for full integration into every live launcher. Until launcher wiring and negative dry-run tests are verified, the release train's admission condition is **NOT SATISFIED**. No AI claim can waive it.

## Primary evidence and maintainer standards

- Existing primary controls: `config/HBNF_CONTROL_MODEL.json`, `config/HBNF_CONTROL_STATE.json`, `config/HBNF_EXECUTION_BUDGET_POLICY.json`, `config/HBNF_SOLVED_PROBLEMS.json`.
- Canonical scope: Google Drive ID `105J0xKbNFD26NOGChN9MssOVjbJ9Q2p6LYhz2Ky7EgM`; newest field receipt: Living Coordinator Notes `1EKOio8T5oSnng07dVTpKRE8Y4qL4SfPeOFpfjSeEhbs`.
- PlatformIO core stores packages and service metadata: https://docs.platformio.org/en/latest/projectconf/sections/platformio/options/directory/core_dir.html
- PlatformIO build dir is separate *object cache*, not core repair: https://docs.platformio.org/en/latest/projectconf/sections/platformio/options/directory/build_dir.html
- Reproducible-build definitions and byte-level comparisons: https://reproducible-builds.org/docs/definition/
- ESP-IDF documentation warns measuring short routines carries observer overhead: https://docs.espressif.com/projects/esp-idf/en/v5.0.3/esp32/api-guides/performance/speed.html

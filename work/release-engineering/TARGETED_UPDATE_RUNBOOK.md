# HBNF Targeted Update Runbook

## Phase -1 — Local materialization and input closure
Before any build:
1. Create an immutable local snapshot from the accepted source commit/tree.
2. Verify every source/build input is fully materialized locally; no FileProvider/iCloud/on-demand placeholder may remain.
3. Materialize/install only the accepted dependency closure into isolated PlatformIO locations.
4. Compare actual LDF/package resolution with the recorded dependency closure.
5. Fail if an unexpected global library, duplicate candidate, moving VCS branch, or undeclared local dependency is selected.
6. Verify the generated-input policy:
   - deterministic outputs regenerate to expected hashes; OR
   - canonical frozen inputs match expected hashes and their generator is disabled/guarded.
7. Verify source snapshot remains unmodified by build staging.

## Build recovery and anti-stall
Before PlatformIO starts, reuse the last successful pinned release capsule. Record the exact command, selected environment, resolved dependency/LDF closure, source hashes, toolchain versions, cache/build-directory state, and expected output paths. Give each phase (materialization, dependency resolution, compile, link/package) a bounded diagnostic budget and record its measurable outputs before the run.

During a long build, track stage/log progress, object count and newest object time, compiler/SCons process CPU and RSS, memory pressure, and free disk. A changing elapsed timer alone is not progress. If 30 minutes pass without a stage change or measurable file/process progress, preserve the complete log and build tree, classify the failure (resource, external termination, dependency scan, compiler, toolchain, or source), and make at most one materially different, evidence-supported recovery. Do not repeat dependency archaeology unless evidence invalidates the previous capsule; do not change LDF mode, package versions, or compiler flags without proving the required closure and release semantics remain intact.

Use the existing 15-minute Live Status heartbeat. Record the start and expected checkpoint before a long blocking build, then update immediately after completion or a material state change. Heartbeats must not interrupt the build.

STOP before PlatformIO if any materialization/input-closure gate fails.

## Phase 0 — Baseline proof
Before coding:
1. Load the current golden release capsule.
2. Verify accepted source commit/tree.
3. Verify toolchain/dependencies against captured environment.
4. Perform a no-op rebuild/equivalence check when feasible.
5. Verify rollback artifact exists and matches its recorded SHA.
6. Consult the solved-problems ledger.

STOP if accepted source/build identity is not proven.

## Phase 1 — Isolated delta
- create clean worktree from accepted baseline;
- implement only approved scope;
- no adjacent re-architecture;
- no unrelated dependency upgrades;
- no silent scope reduction.

## Phase 2 — Non-hardware gates
Run before touching the cart:
- syntax/static checks;
- unit/contract tests;
- replay/simulation;
- controller/iOS compatibility;
- package completeness;
- dependency/provenance capture;
- dependency-closure/LDF match;
- no unexpected global-library resolution;
- generated-input policy/hash verification;
- source-snapshot immutability check;
- flash/RAM/heap/size regression;
- security/origin/auth checks;
- rollback-path verification.

## Phase 3 — Candidate capsule
Produce:
- candidate BIN;
- candidate SHA-256;
- exact source commit;
- build log/report;
- dependency/toolchain capture;
- local-materialization evidence;
- dependency-closure manifest;
- generated-input policy manifest;
- release-status file;
- rollback artifact;
- preflight checklist;
- acceptance checklist.

At this point the coordinator may say "READY FOR PHYSICAL ROLLOUT" only if every non-hardware gate is PASS, including local materialization, dependency closure, generated-input determinism/frozen-input enforcement, clean-room rebuild/equivalence, package completeness, and rollback readiness.

## Phase 4 — Physical preflight
With Opal, Matrix, AUX powered:
- Matrix API/identity;
- AUX/DDP health;
- local controller;
- signed OTA check;
- rollback availability;
- required network/origin path;
- no unexpected live-state mismatch.

If a hard preflight fails, STOP before install.

## Phase 5 — One coherent install
- install one integrated candidate;
- do not power-cycle during active OTA;
- wait for reboot + health result;
- no chain of tiny test flashes unless the defect is genuinely physical-only.

## Phase 6 — Acceptance
Verify:
- Matrix reconnect;
- AUX coherence;
- controller reconnect;
- brightness;
- Motion;
- Audio Response;
- visual/audio scope;
- text/moments;
- games;
- guest/iPad;
- offline behavior;
- update result;
- feature-specific acceptance.

## Phase 7 — Promote
Only after acceptance:
- create a complete new golden release capsule;
- update solved-problems ledger;
- update machine-readable release status;
- preserve rollback;
- update AKS;
- freeze the new accepted baseline.

## Readiness wording
Use only one:
- COMPLETE
- READY FOR PHYSICAL ROLLOUT
- BLOCKED ON: <specific gate>
- SOURCE/BUILD WORK REMAINS: <specific work>

Do not use vague "almost done" language.


## Runtime qualification amendment — mandatory before golden promotion

After install/health and before promotion:
1. Verify the runtime telemetry contract.
2. Run the automated 5-minute performance smoke against the frozen qualified baseline.
3. For a new foundation or final release, run the unattended 90-minute soak.
4. Compare frame-time tails, FPS, heap low-watermark/fragmentation, AUX projection health, restart count, and exact release identity.
5. Fail promotion on unexplained regression.
6. Preserve the generated runtime profile in the candidate/golden capsule.
7. Keep lightweight field telemetry/flight recording active so future regressions have pre-symptom evidence.

Human observation is a final acceptance layer, not the primary defect detector.

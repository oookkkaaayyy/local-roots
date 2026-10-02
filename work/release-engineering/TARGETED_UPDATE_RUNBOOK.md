# HBNF Targeted Update Runbook

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
- release-status file;
- rollback artifact;
- preflight checklist;
- acceptance checklist.

At this point the coordinator may say "READY FOR PHYSICAL ROLLOUT" only if every non-hardware gate is PASS.

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

# NEXT CODEX EXECUTION TEMPLATE — FOUNDATION QUALIFICATION

STATUS: PREPARED / DO NOT RUN UNTIL A CORRECTED FORWARD CANDIDATE HAS BEEN BUILT, INSTALLED, AND BASIC HEALTH HAS PASSED.

## Goal
Decide whether ONE exact corrected firmware artifact can become the immutable Phase 2 foundation.

No feature development. No speculative optimization. Qualification only.

## Required inputs
- exact installed candidate release ID
- exact firmware BIN SHA-256
- exact source identity (Git commit, source-tree SHA-256, or source-archive SHA-256)
- exact build/dependency/generated-input evidence
- exact recovery artifact
- current 28-kernel inventory
- frozen comparison policy derived from known-good/control evidence and candidate measurements

## Required qualification
1. Verify exact installed artifact identity.
2. Verify full foundation telemetry contract, including frame p50/p95/p99/max, free heap, minimum free heap, largest free block, AUX health, RSSI, restarts, kernel/name/variant.
3. Characterize instrumentation observer effect. Expensive diagnostic tracing must not remain in the golden artifact if materially costly.
4. Run the FULL 28-kernel foundation sweep using `--contract foundation --qualify`.
5. Audit shared stages across all kernels.
6. Exercise coordinated features:
   - Motion
   - Audio Response
   - palette/color
   - overlay/text + expiry/current-base restoration
   - saved looks
   - Skins/Glow/live paths
   - scoreboard/ace pot
   - brightness
   - Matrix→AUX DDP
   - local /hbnf
   - hosted/controller interaction
   - connect/disconnect
   - reboot/reconnect
7. Run unattended foundation soak:
   - minimum 90 minutes;
   - state-changing workload, not one static effect;
   - continue to 2–4 hours where practical without user babysitting;
   - track FPS/frame tails, stage timing, heap/fragmentation, AUX rate, RSSI, clients, restarts/errors.
8. Verify clean/local reproducible rebuild or documented artifact-equivalence under the captured environment.
9. Verify updater/recovery/rollback evidence.
10. Generate the exact golden foundation capsule.

## Pass rule
Do not promote on:
- successful build;
- successful OTA;
- basic health;
- one fast kernel;
- average FPS alone;
- subjective “looks smooth.”

Only the exact artifact passing ALL required qualification becomes:
`PHASE 2 FOUNDATION — QUALIFIED`

## Final response
Return ONLY:
1. `FOUNDATION QUALIFICATION: PASS/FAIL`
2. exact release ID / source identity / BIN SHA
3. 28-kernel sweep summary: pass count / fail count / slowest p99
4. soak duration + drift result
5. coordinated-feature regression result
6. reproducibility/capsule result
7. recovery result
8. exact evidence directory
9. `PHASE 2 FOUNDATION — QUALIFIED: YES/NO`
10. if NO: single exact blocker

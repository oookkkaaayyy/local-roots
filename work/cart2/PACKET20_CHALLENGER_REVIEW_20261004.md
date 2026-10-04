# Packet20 Challenger Review — 2026-10-04

## Bottom line

The last three cloud-build failures were not three independent firmware defects. They were a single release-engineering failure mode revealed in layers: **the clean-room build input closure was incomplete**.

The efficient path is therefore no longer “fix the next compiler error and rerun.” It is:

1. reconcile the complete historical build closure;
2. freeze exact source/dependency/patch identities;
3. make the workflow fail closed before compile if closure is wrong;
4. spend on another compile only after that preflight is complete;
5. after a successful build, move immediately into artifact validation → Drive promotion → updater high-water → one diagnostic install → one snapshot preflight → one 28-kernel sweep.

## What the three runs actually proved

### Run 1 — 37229698261
Failure: `AsyncTCP.h` missing.

Meaning: the reconstructed Packet20 env omitted WLED's normal ESP32 dependency closure.

Correction was valid and later verified.

### Run 2 — 37230743394
Failure: `ANIMartRIX.h` missing.

Meaning: Release07 directly subclasses ANIMartRIX, but the clean env did not declare the library. The exact WLED 16.0.1 pin was recovered:
`netmindz/animartrix@81eb09b91c8c9c8c01f8ea442787f8127d56c72f`.

Correction was valid and Run 3 verified the dependency graph contained Animartrix plus the restored WLED closure.

### Run 3 — 37231477686
Failure: four `animation_clock_*` members missing from pristine upstream ANIMartRIX.

Meaning: this was **not another dependency-version problem**. Release07 had historically patched the third-party Animartrix source. That vendor patch had not been captured in the cloud reconstruction.

The user-supplied `source.patch` now proves the exact missing modifications:
- `animation_clock_ms_`
- `animation_clock_speed_`
- `animation_clock_last_ms_`
- `animation_clock_started_`
- non-const `calculate_oscillators(...)`
- non-const `run_default_oscillators()`
- monotonic/slew-limited animation-clock integration

## Reconciliation of the newly supplied source.patch

Exact raw patch:
- Drive ID: `1uzBe-bVdQhmw2KaOO6eSQfGIelDXNda5`
- size: 17,244 bytes
- SHA-256: `aca7b2fa6fe45ce992e162d91447351487e854279de373e691cf02615c149b04`

The full patch is **older than Release07** and must NOT be applied wholesale.

Evidence:
- it sets candidate identity to the older `hbnf-integrated-rc-visual-audio-continuity-2026-09-30`;
- current Packet20 source is `hbnf-matrix-coordinated-v1-20261002-07`;
- the audio-bridge and Vibe16 patch semantics are already present in the current overlay;
- most Foundation-core patch semantics are present, but `audioGainQ8` has a later deliberate linear-control implementation;
- the current usermod contains the relevant patch semantics plus later Release07 performance/diagnostic work.

Therefore only the **vendor Animartrix clock hunk** is newly required by the clean cloud build.

Derived exact vendor patch:
- Drive ID: `184_dgUkzJ1raV2K0qC9YdcuP1JOzSeoQ`
- SHA-256: `f38d260d0f1f50644f24166fa92377d48ac0ffbe292b57f8ec5db39579af10c4`
- GitHub: `.hbnf-packet20-cloud/source/animartrix-clock.patch`
- Git blob: `1f4b1833b23845595b423e2b07cb6caa502abad8`

Pinned pristine upstream authority:
- Animartrix commit: `81eb09b91c8c9c8c01f8ea442787f8127d56c72f`
- pristine `ANIMartRIX.h` Git blob: `db640748175cfdd70dc103fc23c830e646fa5ab6`

## Revised build path

Current Packet20 temp branch workflow now:
1. verifies exact Packet20 source + overlay;
2. restores WLED's ESP32 dependency closure;
3. declares exact WLED-pinned Animartrix;
4. materializes dependencies before compile;
5. requires exactly one `ANIMartRIX.h`;
6. verifies pristine upstream Git blob `db640748...`;
7. verifies exact vendor patch SHA `f38d260d...`;
8. applies only that vendor hunk, fail closed;
9. verifies all four clock members and both non-const oscillator signatures;
10. records pristine + patched header evidence and the patch itself in the build artifact;
11. compiles exactly once.

Current no-run workflow head: `71e49b85de75031edf1081d7a60fd49acff5c3b6`.

No trigger file was touched by these preparation commits.

## Process correction

### What should stop
- using paid/cloud compile attempts to discover build inputs one missing dependency at a time;
- treating a single captured `.cpp` as sufficient source authority;
- assuming an upstream dependency commit captures locally patched dependency bytes;
- reopening local PlatformIO/LDF repair;
- applying the entire old `source.patch` over newer Release07 source.

### What should continue
- exact-content identities;
- one bounded cloud compile when genuinely ready;
- artifact capture even on failure;
- fail-closed preflight;
- immediate Drive/registry promotion of successful artifacts;
- one physical diagnostic install followed by automated evidence collection.

### New escalation rule
If the next cloud compile fails on another missing/undeclared source input, **do not immediately buy another run**. First perform a complete closure audit against the supplied source.patch, overlay, dependency graph, and any generated/vendor inputs. Another compile is justified only after the new mismatch is reconciled offline.

## Cost control

Latest user instruction authorizes up to **$5 total external cost for genuinely necessary work in this chat**, but explicitly requires minimizing spend. Historical Packet20 runs have completed in roughly 1–1.5 minutes, far below the workflow's 20-minute hard cap.

Do not interpret the $5 budget as permission to loop. It removes cost as an artificial blocker; it does not remove the requirement to eliminate avoidable uncertainty before another paid run. Pause before any single action whose cost would be materially above historical estimates.

## After the first successful build

Do not spend time on further source archaeology unless validation fails.

Sequence:
1. validate exact run/commit/source/patch/dependency provenance;
2. verify firmware size/headroom/hash;
3. promote exact build artifact to Drive `20 — RELEASE CAPSULES`;
4. update global artifact registry;
5. read live Opal updater high-water exactly once;
6. derive legal diagnostic + exact Release07 recovery sequence pair;
7. verify recovery artifact before mutation;
8. publish/sign;
9. install one diagnostic candidate;
10. run one snapshot preflight;
11. stop on any panic/restart/identity/snapshot/restore failure;
12. if stable, run the complete 28-kernel Packet20 sweep and exact restore;
13. instantiate Packet21 only from complete measured evidence.

## Current assessment

The project is still `DIAGNOSTIC_ACTIVE` / `FOUNDATION_UNQUALIFIED — PERFORMANCE_OPEN`.

However, the build-path uncertainty is now substantially narrower than before Run 1: the clean dependency closure and the historical vendor patch are explicitly captured and guarded. The next compile is now a genuine validation attempt rather than another blind reconstruction attempt.

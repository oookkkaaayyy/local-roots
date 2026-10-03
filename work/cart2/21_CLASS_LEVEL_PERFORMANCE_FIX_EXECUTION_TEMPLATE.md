# NEXT CODEX EXECUTION TEMPLATE — CLASS-LEVEL PERFORMANCE FIX

STATUS: PREPARED / DO NOT RUN UNTIL THE COMPLETE 28-KERNEL DIAGNOSTIC SWEEP EXISTS.

## Inputs to substitute before running
- SWEEP_REPORT: <ABSOLUTE_PATH_TO_ALL_KERNEL_SWEEP_REPORT.json>
- SOURCE_MANIFEST: <ABSOLUTE_PATH_TO_SOURCE_TREE_MANIFEST.json>
- SWEEP_EVIDENCE_DIR: <ABSOLUTE_PATH>
- RELEASE07_SOURCE_ROOT: <ABSOLUTE_PATH>
- FAILURE_CLUSTERS: derive from SWEEP_REPORT; do not invent here.

## Goal
Produce the smallest forward firmware correction that fixes the measured PERFORMANCE CLASSES from the complete 28-kernel sweep while preserving all coordinated-release functionality and visual semantics as closely as technically possible.

This is NOT a one-kernel-at-a-time task.

## Hard rules
- Read root AGENTS.md and run `python3 scripts/hbnf_control.py status`.
- Work from the exact content-addressed release07 source/build base proven by SOURCE_MANIFEST.
- Reuse PlatformIO Core 6.1.17 / Python 3.11.16 / env hbnf_matrix_wled16_max and the recovered working toolchain path.
- No PlatformIO upgrade/reinstall unless the recovered environment is actually unusable and the exact reason is documented.
- No rollback-as-fix.
- No disabling/removing committed features, kernels, audio response, Motion, palette/color, overlays/text, event paths, saved looks, DDP, /hbnf, hosted controls, OTA, or recovery behavior.
- Do not optimize a stage just because it is nonzero. Optimize only measured failing paths/classes.
- Do not deploy/flash/install until candidate source/build/nonhardware evidence is complete.
- Do not create another governance/release framework.

## A. Classify failures before editing
From SWEEP_REPORT:
1. list all failing/pathological kernels;
2. map each to the expensive source primitive(s)/algorithm(s);
3. group kernels sharing the same primitive or cost pattern;
4. separate kernel-local cost from truly shared/common-path cost;
5. identify the minimum set of code changes covering the maximum failing set.

Create one machine-readable PLAN.json with:
- failure clusters;
- source files/functions;
- measured evidence;
- proposed optimization;
- expected semantic impact;
- affected kernels;
- unaffected kernels;
- rollback scope.

If the same primitive explains several slow kernels, fix the primitive once.

## B. Preserve rendering semantics
For each optimization:
- preserve 32×16 output resolution;
- preserve animation timing/phase semantics unless the measured defect is specifically timing-related;
- preserve audio-domain behavior;
- preserve palette semantics;
- preserve fallback behavior for unsupported/non-32×16 geometries unless source evidence requires a safe equivalent;
- explicitly document any approximation/interpolation and why perceptual behavior remains acceptable.

Do not trade obvious visual quality for FPS without explicit user approval.

## C. Build a host/source regression where possible
Before firmware build, add the cheapest deterministic regression that catches the expensive class without hardware:
- call-count / sample-count assertion;
- bounded benchmark;
- source invariant;
- deterministic frame comparison/tolerance;
- or equivalent.

Avoid brittle tests that merely assert implementation text.

## D. Build one corrected candidate
Use the recovered exact environment.
Capture:
- source-tree SHA-256;
- build environment;
- dependency/generated-input identity;
- build command/log;
- output BIN SHA-256;
- exact delta from release07;
- nonhardware tests.

Do not publish/install yet if any required source/build evidence is incomplete.

## E. Candidate diagnostic replay BEFORE publication
Where a host/replay path can reproduce the measured expensive primitive, compare release07 behavior to the candidate before hardware publication.

If the candidate does not materially address every measured failure cluster, STOP before publication and return the exact uncovered cluster.

## F. Package as ONE forward candidate
Only after A-E pass:
- use the existing immutable signed release/updater path;
- preserve release07 as historical diagnostic base and existing recovery safety;
- produce exact update/recovery identity;
- run signed-release preflight.

Do NOT install automatically unless the task receives explicit live-install authorization.

## Final response
Return ONLY:
1. `CLASS-LEVEL FIX: PASS/FAIL`
2. failure clusters addressed / not addressed
3. files/functions changed
4. candidate release ID + source identity + BIN SHA
5. nonhardware regression result
6. build/package/preflight result
7. exact evidence paths
8. `READY FOR ONE CONTROLLED INSTALL: YES/NO`
9. if NO: single exact blocker

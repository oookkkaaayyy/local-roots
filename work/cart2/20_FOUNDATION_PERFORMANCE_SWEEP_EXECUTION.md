# NEXT CODEX EXECUTION — FOUNDATION PERFORMANCE SWEEP / SOURCE IDENTITY

Use this only after the FPS-repair closeout has been ingested. It is the next bounded source-connected task.

## Goal
Move the current release07 state from human-discovered kernel failures to one complete machine-generated 28-kernel diagnostic ranking, while also closing source identity enough to support the next forward fix.

Do NOT start Phase 2 feature implementation.
Do NOT flash/install/deploy new firmware during this task.
Do NOT change router/network configuration.
Do NOT invent another framework or lifecycle layer.

## Start
1. Read root `AGENTS.md`.
2. Run:
   `python3 scripts/hbnf_control.py status`
3. Read:
   - `evidence/hbnf-phase2-migration-20261003/HBNF_PHASE2_MIGRATION_INPUT.json`
   - `config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json`
   - `work/release-engineering/RUNTIME_SENTINEL_AND_FOUNDATION_QUALIFICATION.md`
4. Verify current installed Matrix is still release07 before any visual-state mutation.

## A. Close source identity without depending on the broken Files-On-Demand git metadata
Use the successful local build workspace:
`/Users/andrew/Library/Caches/HBNF-Matrix-Build/post-adapter-20261002-ditto`

Read the final local repair evidence:
- `/Users/andrew/Documents/Codex/2026-10-01/continue-pr-46-in-oookkkaaayyy/local/work/local-roots-pr46/work/release-engineering/HBNF_FPS_REPAIR_FINAL_POSTMORTEM_20261003.md`
- `/Users/andrew/Documents/Codex/2026-10-01/continue-pr-46-in-oookkkaaayyy/local/work/local-roots-pr46/evidence/hbnf-fps-repair-final-20261003/HBNF_FPS_REPAIR_CLOSEOUT.json`
- `/Users/andrew/Documents/Codex/2026-10-01/continue-pr-46-in-oookkkaaayyy/local/work/local-roots-pr46/work/HBNF_RELEASE07_POSTINSTALL_AKS_WRITEBACK_PENDING_20261003.md`

Do not block on the cloud-backed worktree's `.git/commondir`.

Run the content-addressed source identity tool against the exact source root that actually produced release07:
`python3 scripts/hbnf_source_tree_identity.py <EXACT_RELEASE07_SOURCE_ROOT> --output <EVIDENCE_DIR>/SOURCE_TREE_MANIFEST.json --label release07`

Then prove linkage between:
- exact release07 source tree;
- build workspace/output;
- BIN SHA `8e8db17786b178fc8fcd2cdf8a21512681ec7158941ee49ea255509970b1bcab`.

Best case: recover a valid Git commit.
If Git provenance is genuinely unavailable, a verified source-tree SHA-256 or source-archive SHA-256 is acceptable under the control model, provided the exact source + build environment/instructions can reproduce or equivalently prove the artifact.

Do NOT label GitHub branch HEAD `0c01d0c7...` as the artifact source merely because it is branch HEAD.

## B. Discover the EXISTING release07 diagnostic/control endpoints
From the final repair files and exact release07 source, identify:
- how the diagnostic JSON is read;
- how active kernel ID/name/variant are reported;
- the safe existing control path for selecting a retained kernel;
- how to snapshot and restore the current visual state exactly.

Do not guess.
Do not use direct WLED mutation merely because the public JSON API supports it if the HBNF control architecture uses a different owner.

Create ONE small local adapter implementing the argv contract in:
`config/HBNF_LIVE_SWEEP_ADAPTER_TEMPLATE.json`

The adapter must:
- pin `expected_release_id` to `hbnf-matrix-coordinated-v1-20261002-07`;
- snapshot current state to JSON;
- select exactly one requested effect ID;
- emit one CANONICAL diagnostic telemetry JSON object;
- restore exact pre-sweep state.

The runner performs a read-only canonical telemetry preflight before the first select command and must abort before visual mutation if release identity is not exactly release07 or required diagnostic fields are absent.

No firmware edits are needed merely to expose p95/p99 if release07 does not already have them.

## C. Validate tooling before touching live visual state
Run:
- `python3 tests/hbnf_control.py`
- `python3 tests/hbnf_guarded_run.py`
- `python3 scripts/hbnf_architecture_fitness.py`
- `python3 tests/hbnf_runtime_qualify_static.py`
- `python3 tests/hbnf_kernel_sweep_report.py`
- `python3 tests/hbnf_live_kernel_sweep.py`
- `python3 tests/hbnf_source_tree_identity.py`

Then:
`python3 scripts/hbnf_live_kernel_sweep.py --adapter <ADAPTER_JSON> --contract diagnostic --outdir <SWEEP_DIR> --dry-run`

If any test/dry-run fails, fix the tool/adapter only. Do not mutate the cart.

## D. Run ONE bounded 28-kernel diagnostic sweep
Only after current release07 identity, snapshot/restore, exact kernel mapping and dry-run pass.

Run:
`python3 scripts/hbnf_live_kernel_sweep.py --adapter <ADAPTER_JSON> --contract diagnostic --outdir <SWEEP_DIR>`

Requirements:
- exactly all 28 retained kernels, IDs 220–247;
- verify runtime kernel ID + name after every selection;
- ~5 s settle + ~30 s sample per kernel unless the actual telemetry cadence requires a justified adjustment;
- collect current available average whole-frame/kernel/stage timing plus FPS, heap, RSSI, AUX and restart state;
- ALWAYS restore exact pre-sweep visual state, including on failure;
- after restore, re-snapshot and require exact equality with the pre-sweep visual snapshot;
- preserve `PRE_SWEEP_STATE.json`, `POST_RESTORE_STATE.json`, and `RESTORE_RECEIPT.json`;
- abort on release identity change, kernel mismatch, restart, uptime regression, adapter failure, restore-command failure, or post-restore snapshot mismatch.

This is a diagnostic ranking pass, NOT foundation qualification.
Do not fail merely because release07 lacks p95/p99 metrics.

## E. Produce one ranked diagnosis
Use the generated report to identify:
1. every pathological/borderline kernel;
2. whether failures cluster by shared procedural primitive/family;
3. shared-stage costs across all 28;
4. whether kernel work, not palette/network/AUX, remains the dominant class;
5. the smallest number of class-level forward fixes that can address the failing set.

Do NOT begin those fixes in this task.

## Final response
Return ONLY:

1. `SOURCE IDENTITY: PASS/FAIL` + exact identity type/value.
2. `28-KERNEL SWEEP: PASS/FAIL` + coverage count.
3. Top 10 slowest kernels: name | FPS | frame avg | kernel avg.
4. Shared-stage summary.
5. Kernel failure clusters / likely shared primitives.
6. Exact evidence directory and report paths.
7. Exact pre-sweep state restoration result.
8. `READY FOR CLASS-LEVEL PERFORMANCE FIX: YES/NO`
9. If NO: single exact blocker.

Do not start the next fix automatically.

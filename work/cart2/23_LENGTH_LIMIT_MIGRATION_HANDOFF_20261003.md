# HBNF CART 2.0 — LENGTH-LIMIT MIGRATION HANDOFF — 2026-10-03

**STATUS:** This is the authoritative migration snapshot for the ChatGPT coordinator chat that hit the site length limit on 2026-10-03.

**Old chat may be retired after this file and its Drive mirror are confirmed.**

## 0. Read-first order for the successor coordinator

1. This file.
2. `config/HBNF_CONTROL_MODEL.json`
3. `config/HBNF_CONTROL_STATE.json`
4. `evidence/hbnf-phase2-migration-20261003/HBNF_PHASE2_MIGRATION_INPUT.json`
5. `evidence/hbnf-phase2-migration-20261003/T1_DIAGNOSTIC_CLOSE_PREFLIGHT.json`
6. `work/cart2/20_FOUNDATION_PERFORMANCE_SWEEP_EXECUTION.md`
7. `work/cart2/21_CLASS_LEVEL_PERFORMANCE_FIX_EXECUTION_TEMPLATE.md`
8. `work/cart2/22_FOUNDATION_QUALIFICATION_EXECUTION_TEMPLATE.md`
9. AKS Master Router: Drive ID `1CvCKk04BDMUEbxtqatUP_bU7KbFYYJo1Hu32bh_zgzM`
10. Cart 2.0 canonical: Drive ID `105J0xKbNFD26NOGChN9MssOVjbJ9Q2p6LYhz2Ky7EgM`
11. Release-engineering canonical: Drive ID `1bw_VUNt2mEZ4JdKuRsQq7ZS1Bc4KeC8kMVABVK2OdgE`
12. AKS Delta Inbox spreadsheet `1tJIcKRfWFdHVYVo4G6mgySB46p6xwsseGON3JdnEnzY`, sheet `Delta Inbox`, especially rows 1186, 1191 and the migration checkpoint appended by this coordinator.

## 1. Current physical/live state

Current installed Matrix firmware:
- Release: `hbnf-matrix-coordinated-v1-20261002-07`
- BIN SHA-256: `8e8db17786b178fc8fcd2cdf8a21512681ec7158941ee49ea255509970b1bcab`
- Update sequence: 13
- Recovery sequence: 14
- Recovery target: release 06
- Install/device health: PASS
- Runtime performance acceptance: FAIL
- Foundation state: **FOUNDATION_UNQUALIFIED — PERFORMANCE_OPEN**
- Exact artifact source commit: **UNVERIFIED**
- Current power-on/off state at migration instant: UNVERIFIED; do not infer.

Live device identities:
- Opal: `192.168.77.1`
- Matrix: `192.168.77.10`, MAC `70:4b:ca:5b:34:5c`
- AUX: `192.168.77.11`, MAC `8c:94:df:55:c3:4c`
- Updater: 1.2.4-1
- Updater IPK SHA-256: `8cd8ded020bf192b323c9a6f8664c34e1f2ddcd760d974d8d152e13b9403bc20`
- Production OTA public-key DER fingerprint: `fa6a5f782607ef2ac3123ac9f7912f4cb2e7d5d0a23f6ef5112510075097f41d`
- HBNF-Cart SSID cold-start/intermittent appearance issue: **OPEN SEPARATE LOOP**; never proven causal to FPS and must not be conflated with renderer performance.

No router/network settings were changed in the FPS-repair cycle or by this coordinator migration.

## 2. Release 05 → 06 → 07 exact performance chronology

### Release 05
- `hbnf-matrix-coordinated-v1-20261002-05`
- BIN SHA-256: `cc06c3b4df7bd1ebf696773650b710adb068de56940832cec1a0f2d33c8d4f60`
- update seq 9 / recovery seq 10
- Targeted improvement: avoid copying full inactive `OverlayState` under render spinlock.
- OTA succeeded.
- Immediate field performance: Matrix ~6 FPS, AUX ~7 FPS.
- ~99 KB free heap, RSSI around -28 dBm, ws=0, DDP live, `/hbnf` 200.
- PERFORMANCE REJECTED.
- Important conclusion: severe slowdown existed essentially from cold boot; do not restart a one-hour memory-decay theory as primary cause.

### Release 06
- `hbnf-matrix-coordinated-v1-20261002-06`
- update seq 11 / recovery seq 12
- exact BIN SHA not preserved in coordinator text; package/publication records contain it.
- Diagnostic/instrumented forward build only; never a production/golden foundation.
- 60-second sample: ~11.1 FPS, ~91.305 ms average frame.
- Active runtime kernel index 3 = `RGB_Blobs5`.
- `RGB_Blobs5` average kernel cost ~59.955 ms/frame.
- Original 32x16 path performed 1,536 expensive `render_value()` / procedural-noise evaluations per frame.
- Release06 established a real kernel-local hotspot.
- Earlier sample also had significant palette/color cost, but that did NOT survive as a universal hypothesis after release07.
- Recovered environment build used PlatformIO Core 6.1.17 / Python 3.11.16 / env `hbnf_matrix_wled16_max`; verified incremental recovery build completed in 9.735s and exactly matched the already-signed artifact.

### Release 07
- `hbnf-matrix-coordinated-v1-20261002-07`
- BIN SHA-256 `8e8db17786b178fc8fcd2cdf8a21512681ec7158941ee49ea255509970b1bcab`
- update seq 13 / recovery seq 14
- Optimized ONLY the 32x16 `RGB_Blobs5` path using coarse-grid sampling/interpolation while retaining all 512 output pixels and fallback behavior for other geometries.
- Installed successfully; Matrix/AUX reachable; DDP live; `/hbnf` 200.
- 60-second acceptance sample:
  - FPS: ~11.53
  - frame avg: ~85.3 ms
  - active kernel index 2 = `Parametric_Water`
  - kernel avg: ~68.9 ms (~81% of frame)
  - audio/modulation: ~6.7 ms
  - palette/color: ~0.47 ms
  - overlay: ~0.04 ms
  - companion DDP: ~4.8 ms
  - unaccounted: ~3.0 ms
  - free heap: ~98.7 KB
  - RSSI: ~-44.8 dBm
- Release07 therefore does **not** resolve the system-level low-FPS defect.
- The release07 sample does **not** prove the RGB_Blobs5 optimization itself failed, because acceptance ran Parametric_Water instead. It proves at least one additional retained kernel is pathological.
- Latest evidence does **not** support palette/color as the universal dominant bottleneck; release07 measured only ~0.47 ms palette/color while kernel work dominated.
- Prior good comparison remains about 35 FPS / 28.6 ms per frame on the earlier accepted Integrated RC/V1.1 lineage.

## 3. User actions already completed; do not repeat as rediscovery

- User already installed release05, release06, and release07 through existing Opal OTA.
- No USB/serial flash was used.
- User already ran the release06 install from Mac Terminal while connected to HBNF-Cart; result was `state=complete`, `one-upload-confirmed`, correct Matrix/AUX identities, DDP live, `/hbnf` 200.
- Release06 postinstall data included Matrix uptime 22s, `companion_render_count=254`, Matrix heap 99,192, AUX heap 105,412.
- Do **not** reinstall releases05/06/07 merely to prove history.
- Rollback remains emergency recovery only; user explicitly rejected rollback-as-forward-solution.

## 4. Critical preserved instructions / non-negotiables

- Continue forward from coordinated releases; no rollback-as-fix.
- Preserve all coordinated-release functionality; no feature-disabling rescue mode.
- Measure before patching; no more speculative hot-path changes.
- Do not reopen cloud/backend/router diagnosis unless telemetry directly implicates it.
- Install/HTTP/device health is not performance acceptance and not physical feature acceptance.
- Do not resume broad source archaeology when runtime measurement can identify the bottleneck.
- Any performance correction must preserve Motion, Audio Response, palettes/colors, overlays/text, event paths, saved looks, Matrix→AUX DDP, local `/hbnf`, hosted-control integration, OTA and recovery.
- Do not silently reduce Cart2 scope or quality to make timing easier.
- No Phase2 firmware-dependent feature stacking on an unqualified foundation.
- User does not want to be the manual diagnostic relay; prefer one bounded automated pass.
- Do not create another governance/release framework; use the existing control model and receipts.

## 5. Exact local Mac/build evidence paths

Repo/PR:
- GitHub: `oookkkaaayyy/local-roots`
- PR #46
- Repair branch: `hbnf-coordinated-release-20261001`
- Repair branch GitHub HEAD observed by successor coordinator: `0c01d0c7f065264e2b9fd8127f1c48cc96a73b56`
- IMPORTANT: that branch HEAD is **not** automatically the release07 artifact source identity.

Local:
- Main repair worktree:
  `/Users/andrew/Documents/Codex/2026-10-01/continue-pr-46-in-oookkkaaayyy-local/work/local-roots-pr46`
- Successful firmware workspace:
  `/Users/andrew/Library/Caches/HBNF-Matrix-Build/post-adapter-20261002-ditto`
- Recovered PlatformIO executable:
  `/Users/andrew/Library/Caches/HBNF-Matrix-Flow/9.17.26_3/venv/bin/platformio`
- PlatformIO Core 6.1.17
- Python 3.11.16
- env `hbnf_matrix_wled16_max`
- default `~/.platformio/penv` entrypoints were absent; do not reinstall/upgrade simply because of that.

Release evidence:
- Release05 checkpoint:
  `.../work/artifacts/hbnf-coordinated-release-20261001/OTA_PREP_RELEASE05/PERFORMANCE_FAILURE_CHECKPOINT.md`
- Release06 package:
  `.../work/artifacts/hbnf-coordinated-release-20261001/OTA_PREP_RELEASE06_INSTRUMENTED_READY/`
  including `PLATFORMIO_ENV_RECOVERY.md`, `PUBLICATION_RECEIPT.md`, `INSTALL_COMMAND.txt`
- Release07 package:
  `.../work/artifacts/hbnf-coordinated-release-20261001/OTA_PREP_RELEASE07_RGB_BLOBS5_PERF_FIX`
- Release07 continuity fallback:
  `.../work/HBNF_RELEASE07_POSTINSTALL_AKS_WRITEBACK_PENDING_20261003.md`
  The filename is stale: AKS Delta Inbox row 1191 was later successfully written.
- Final FPS-repair postmortem:
  `.../work/release-engineering/HBNF_FPS_REPAIR_FINAL_POSTMORTEM_20261003.md`
- Machine-readable closeout:
  `.../evidence/hbnf-fps-repair-final-20261003/HBNF_FPS_REPAIR_CLOSEOUT.json`

## 6. Final Codex closeout that triggered migration

Codex final repair status: **FIX_CANDIDATE**, not solved.
- release07 installed and basic health passed
- performance acceptance failed
- renderer bottleneck remains
- remaining foundation risks: all 28 kernels, common-path cost, frame-time tails, instrumentation overhead, soak/heap fragmentation, coordinated-feature performance
- READY FOR PHASE 2 FOUNDATION QUALIFICATION: NO
- local Git worktree metadata `commondir` timed out, so source commit remained unverified and no closeout commit was created

## 7. AKS / Drive write state

Previously:
- Release07 build/publication checkpoint existed in Delta Inbox row 1186.
- Codex's attempt to write postinstall evidence got Sheets HTTP 404 and canonical doc HTTP 403, so it created the local fallback.
- The old coordinator later successfully wrote/re-read release07 postinstall performance in Delta Inbox row 1191.

During this migration coordinator:
- AKS Master Router was updated with final release07/sole-coordinator migration state.
- Release-engineering canonical was updated with final repair closeout and current performance interpretation.
- Cart2 canonical was updated with sole-coordinator migration/foundation status.
- A new PENDING Delta Inbox migration checkpoint was appended describing release07 status and the new durable Phase2 staging evidence.
- A new dedicated Drive handoff document is created alongside this file and linked from AKS.

## 8. Phase2 staging branch current state

Staging branch:
`hbnf-cart2-ready-to-implement-staging-20261001`

Branch HEAD at length-limit backup:
`1d4a0adffa5f1becf73e52dda11274ff7e77c36b`

This branch is planning/qualification tooling only:
- no firmware installation
- no live cart mutation
- no router mutation
- no merge into production
- no Phase2 feature implementation authorization

Current control state:
- lifecycle: `DIAGNOSTIC_ACTIVE`
- release07 role: `DIAGNOSTIC_BASE__PERFORMANCE_REJECTED`
- foundation: `FOUNDATION_UNQUALIFIED_PERFORMANCE_OPEN`

Important control-model correction completed:
- release07 is NOT treated as the future T1 corrected fix candidate.
- observer-effect acceptance was removed from duplicated T1 diagnostic close and remains a T2 foundation-qualification concern.
- receipt source identity may now be a Git commit OR a deterministic content-addressed source-tree/source-archive SHA-256, so broken cloud-backed Git metadata cannot permanently block provenance if exact source/build linkage is proven.

## 9. Durable files added/changed in this migration coordinator

The branch is 42 commits ahead of the prior release07 evidence checkpoint `58efe5af...`.
The final branch state includes:

### Migration evidence
- `evidence/hbnf-phase2-migration-20261003/HBNF_PHASE2_MIGRATION_INPUT.json`
- `evidence/hbnf-phase2-migration-20261003/HBNF_PHASE2_MIGRATION_INPUT.md`
- `evidence/hbnf-phase2-migration-20261003/T1_DIAGNOSTIC_CLOSE_PREFLIGHT.json`

### All-28-kernel inventory
- `config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json`
- retained effect IDs 220–247, presets 61–88
- ordered names:
  0 Complex_Kaleido_3
  1 Big_Caleido
  2 Parametric_Water
  3 RGB_Blobs5
  4 Polar_Waves
  5 Zoom2
  6 Complex_Kaleido_4
  7 Complex_Kaleido_6
  8 Water
  9 RGB_Blobs4
  10 Complex_Kaleido_5
  11 Spiralus2
  12 Hot_Blob
  13 Caleido3
  14 Waves
  15 Chasing_Spirals
  16 Rotating_Blob
  17 Center_Field
  18 Distance_Experiment
  19 Lava1
  20 Caleido2
  21 Yves
  22 Scaledemo1
  23 Zoom
  24 Complex_Kaleido
  25 RGB_Blobs3
  26 SM5
  27 Module_Experiment10
- runtime mapping must still be verified against release07 before mutation; current evidence confirms index2 Parametric_Water and index3 RGB_Blobs5.

### Runtime qualification split
- `config/HBNF_RUNTIME_TELEMETRY_CONTRACT.json`
- `scripts/hbnf_runtime_qualify.py`
- `scripts/hbnf_kernel_sweep_report.py`
- tests updated accordingly

Two explicit contracts now exist:
1. `diagnostic`: current release07 can be swept/ranked using its already-available average timing metrics. This must NOT require a new firmware solely to obtain p95/p99.
2. `foundation`: the corrected candidate must expose full tails/resource/stage metrics and may be baseline-qualified.

Diagnostic sweep cannot claim foundation qualification.

Foundation telemetry now requires:
- frame p50/p95/p99/max
- kernel/name/variant identity
- free/minimum-free/largest-block heap
- AUX health/age/render FPS
- RSSI/restart/client state
- kernel/palette/audio/scheduler/overlay/AUX-send/unaccounted average + p95 stage timing

### Live bounded sweep runner
- `scripts/hbnf_live_kernel_sweep.py`
- `config/HBNF_LIVE_SWEEP_ADAPTER_TEMPLATE.json`
- `tests/hbnf_live_kernel_sweep.py`

Behavior:
- runner itself knows nothing about cart mutation API
- source-connected adapter supplies argv-only snapshot/select/telemetry/restore commands
- validates adapter before mutation
- snapshots exact visual state once
- verifies selected runtime kernel ID/name before each sample
- collects all 28
- always attempts restore in `finally`
- aborts on mismatch/release change/adapter failure
- creates one JSONL/profile per kernel and one aggregate ranked report
- default contract is diagnostic
- no `shell=True`
- no guessed direct WLED mutation endpoint
- no auto-fix

Latest branch-head commit `1d4a0ad...` fixed the runner so the diagnostic sweep requires average metrics only; full tail/stage requirements remain foundation-only.

### Content-addressed source identity
- `scripts/hbnf_source_tree_identity.py`
- `tests/hbnf_source_tree_identity.py`

Purpose:
- close release07 provenance even if Files-On-Demand `.git/commondir` remains broken
- deterministic manifest includes source files, symlinks, file modes and build-input binaries
- excludes VCS metadata and actual generated build/cache state such as `.git`, `.pio`, node_modules, caches, pyc/pyo
- generic build/dist directories are NOT blindly excluded because they may contain real generated/frozen build inputs
- content identity changes on source or relevant mode/input changes

### Lifecycle/source identity
- `config/HBNF_CONTROL_MODEL.json`
- `config/HBNF_CONTROL_STATE.json`
- `scripts/hbnf_control.py`
- `tests/hbnf_control.py`

Accepted exact source-identity types:
- `git_commit`
- `source_tree_sha256`
- `source_archive_sha256`

### Persistent agent/CI coverage
- `AGENTS.md`
- `.github/workflows/hbnf-coordinated-release-ci.yml`
now include live-sweep/source-identity tests in the release-engineering checks.

### Prepared execution packets
- `work/cart2/20_FOUNDATION_PERFORMANCE_SWEEP_EXECUTION.md`
  One-shot next source-connected task: content-address exact release07 source; discover the existing diagnostic/control endpoints from source; create the tiny adapter; dry-run; perform exactly one bounded 28-kernel diagnostic sweep; rank/group failures; restore exact pre-sweep state; do NOT fix yet.
- `work/cart2/21_CLASS_LEVEL_PERFORMANCE_FIX_EXECUTION_TEMPLATE.md`
  Prepared but DO NOT RUN until complete sweep exists. It requires class/shared-primitive fixes rather than serial kernel whack-a-mole.
- `work/cart2/22_FOUNDATION_QUALIFICATION_EXECUTION_TEMPLATE.md`
  Prepared but DO NOT RUN until a corrected forward candidate has been built/installed/health-passed. It defines all-28 full-tail qualification, observer-effect check, coordinated feature regressions, 90min+ state-changing soak, reproducibility, recovery and golden capsule.

## 10. Current exact blockers

Before a corrected candidate can exist:
1. content-address the exact release07 source/build base and prove linkage to BIN SHA `8e8db177...`;
2. discover the exact existing release07 diagnostic endpoint and safe kernel-selection/snapshot/restore path from source/runtime;
3. run complete 28-kernel diagnostic sweep;
4. group pathological kernels by shared primitive/class;
5. implement the smallest class-level forward correction;
6. build and identify one corrected candidate;
7. pass its nonhardware tests.

Then, before it can become Phase2 foundation:
8. full foundation telemetry/tails;
9. observer-effect characterization;
10. full 28-kernel foundation qualification;
11. coordinated-feature regression;
12. soak/resource/fragmentation qualification;
13. reproducible build/equivalence;
14. recovery/rollback proof;
15. golden capsule.

Cart2 firmware-dependent implementation remains blocked until foundation qualification.
Source-independent Cart2 planning/refinement may continue safely.

## 11. Best next execution

Do **not** start another broad troubleshooting chat.

Use `work/cart2/20_FOUNDATION_PERFORMANCE_SWEEP_EXECUTION.md` as the exact next Codex task in a source-connected Mac/Codex environment.

Desired output:
- exact release07 content source identity
- exact adapter/control/diagnostic path
- complete 28/28 ranked diagnostic report
- shared-stage summary
- failure clusters/shared primitives
- exact restoration result
- READY FOR CLASS-LEVEL PERFORMANCE FIX: YES/NO

That task deliberately stops before editing firmware.

After it returns:
- ingest evidence here/AKS;
- if complete, instantiate `21_CLASS_LEVEL_PERFORMANCE_FIX_EXECUTION_TEMPLATE.md`;
- only after one corrected candidate exists and is installed/health-passed, run `22_FOUNDATION_QUALIFICATION_EXECUTION_TEMPLATE.md`;
- only a fully qualified exact artifact becomes the Phase2 firmware foundation.

## 12. Cart 2.0 product scope continuity

Do not lose existing candidate product work while firmware foundation is repaired.

Canonical Cart2 scope remains in Drive ID `105J0xKbNFD26NOGChN9MssOVjbJ9Q2p6LYhz2Ky7EgM`.

Key product principles:
- Build infrastructure once; thereafter add experiences.
- Primary creative priority: compelling nuanced audio-reactive visuals without monopolizing engineering bandwidth.
- Candidate Vibes (NOT scope-locked): CHILL, GROOVE, HEAVY, PSYCHEDELIC, COSMIC, AUTO; unlabeled clips must be perceptually distinct by motion/composition/audio grammar, not palette alone.
- Text must be a premium Vibe-aware compositor layer, not generic marquee; glyph geometry stable while reading; phrase paging preferred; scroll fallback only when needed.
- Digital arcade candidates (NOT locked): Maze Chase, Snake, Pong, Breakout, Falling Blocks, Space Defense, Crossing.
- IRL rule: cart must materially improve interaction without tedious scoring/input. Strongest candidates: Shuffle Call, Pressure Clock, Sequence Run; Rapid Fire remains challenger only. Reject generic scorekeeping/make-miss logging/trick-shot fluff.
- One iPad-first Mission Control; guest QR/local join; plain-language Vibe cards; limited guest permissions; no admin/network/firmware permissions.
- Local-first/offline reliability; bounded reconnect/self-heal; OTA/recovery; no-login/pairing behavior preserved.
- No committed scope may be silently removed/reduced/deferred after lock.
- Exact Vibe/game counts remain candidates until explicit user approval after feasibility/capacity audits.

## 13. What this coordinator did NOT do

- no live Matrix firmware flash/install
- no Opal/router/network mutation
- no Phase2 feature implementation
- no production merge
- no claim release07 is accepted/golden
- no claim source commit has been recovered
- no claim all 28 kernels have been swept
- no claim foundation telemetry/soak has passed
- no claim SSID issue is solved

## 14. Successor coordinator instruction

Continue from the first genuinely unfinished step above.
Do not ask the user to reconstruct this history.
Do not repeat already-completed installs/diagnostics.
Use AKS/GitHub/local evidence to resolve details.
Prefer bounded autonomous work and return only when user input is actually needed or a meaningful gate has completed.

**CURRENT FOUNDATION STATE: FOUNDATION_UNQUALIFIED — PERFORMANCE_OPEN**
**CURRENT NEXT TASK: CONTENT-ADDRESS RELEASE07 + ONE BOUNDED 28-KERNEL DIAGNOSTIC SWEEP**

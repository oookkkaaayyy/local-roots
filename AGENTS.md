
Apply the global Codex `AGENTS.md` for task budgeting, source identity, independent recovery checkpoints, and general execution. This file adds only HBNF/Cart-specific requirements. Treat these instructions as behavioral guidance: rely on a mechanical gate only after verifying that it is active on the current surface, covers the specific action, and blocks safely when dependencies fail.

## Current work and authority

This repository supports HBNF scoring and Cart 2.0. Current outcomes and acceptance criteria are tracked in [scoring issue #115](https://github.com/oookkkaaayyy/local-roots/issues/115) and [Cart issue #116](https://github.com/oookkkaaayyy/local-roots/issues/116); check their current state instead of treating this file as a live status report. For history-dependent work, follow the AKS Master Router and current HBNF/Cart file authority. Use the existing issue as the single task contract.

For HBNF lifecycle state, the operational authority is `config/HBNF_CONTROL_MODEL.json`, `config/HBNF_CONTROL_STATE.json`, and `scripts/hbnf_control.py`. Inspect it with `python3 scripts/hbnf_control.py status`. Do not infer lifecycle state from prose, successful tests, builds, installs, postmortems, or older records. Change the lifecycle model only when the task explicitly concerns it; obey its complexity limits, applicability classes, and required evidence. T4 work also requires the manifest path in that model. Do not add free-floating governance rules; put lifecycle constraints in the model and task acceptance evidence in the controlling issue.

Preserve the original Oct. 20 scoring evidence and tag finalization. Never recreate scores, re-finalize tags, or alter production scoring data without explicit owner approval. Do not add UV, games, or unrelated features before the reliability outcomes in #115 and #116 are accepted. Do not confuse repository source with the currently installed device version.

## One compact task contract

Before implementation, confirm in the existing issue or work record: user-visible outcome; exact source/ref and installed identity for device work; observable acceptance evidence and how to obtain it; recovery path; scope/non-goals. Confirm that the recovery destination is available and that authorization covers the complete checkpoint payload—including the source tree, any existing dirty changes, and the files planned for editing—before the first edit. Reuse this same contract for workers and review. If a required source, access path, verification path, or checkpoint authorization is missing, do read-only work that closes a named prerequisite, then stop at the specific blocker. Do not create extra prompts, plans, trackers, capsules, or handoffs unless required below.

## Match process to operation risk

For read-only investigation and source-only changes, inspect only relevant files, make one bounded change, and run focused checks tied to acceptance. UI changes must be rendered at the target viewport; local rendering proves layout only.

For substantial HBNF release engineering, firmware promotion, Cart integration, deployment, diagnostics, or acceptance, use the established `platform/workflows/` path. Run `python3 scripts/platform.py doctor` once; it also reports control status, so do not repeat that check without a state change. For worker/live/mutating steps, create one capsule with `python3 scripts/platform.py capsule ...`, validate it with `python3 scripts/platform.py check-capsule ...`, and compile a worker directive with `python3 scripts/platform.py directive ...` when a worker is used. Bind it to exact source, inputs, hashes, checks, expected outputs, recovery, and stop conditions. Do not repeat completed preflight or rediscover unchanged dependencies without new evidence.

Before any live mutation, prove the exact consumer path, current deployed/device identity, preview or rehearsal, user-visible verification, and rollback to the exact prior state. No live or production mutation unless the control model permits it and the owner explicitly authorizes that operation. Owner approval is also required for architecture, security, infrastructure, or purchasing decisions. Paid builds and GitHub Actions require explicit approval for each bounded run; do not use them for diagnosis, and do not retry without new evidence. A diagnostic install is prohibited unless the exact updater/publication path and tested rollback are proven.

For PlatformIO builds, use the last successful pinned release capsule and record command, environment, dependency closure, source identity, and cache state. Set a measurable stop point; after 30 minutes without progress evidence, stop and diagnose before changing build mechanisms.

After two consecutive host/process/tooling blockers without new product evidence, stop and simplify the lane before trying another mechanism. Never retry the same failing mechanism without evidence that changes why it should succeed. Do not use paid/quota-limited runs for diagnosis or give unsupported ETAs.

## Control-change verification

When changing HBNF control or release logic, create the required applicability record and validate it with `python3 scripts/hbnf_control.py check-change --change <record-or-manifest.json>`. Run the established focused control suite:

```text
python3 tests/hbnf_control.py
python3 tests/hbnf_guarded_run.py
python3 scripts/hbnf_architecture_fitness.py
python3 tests/hbnf_runtime_qualify_static.py
python3 tests/hbnf_kernel_sweep_report.py
python3 tests/hbnf_source_tree_identity.py
python3 tests/hbnf_live_kernel_sweep.py
python3 tests/hbnf_packet20_http_adapter.py
python3 tests/hbnf_packet20_build_validate.py
```

`tests/hbnf_live_kernel_sweep.py` exercises mocked/dry-run adapters; it is not authorization to run the live `scripts/hbnf_live_kernel_sweep.py` runner, which requires the live-task capsule and explicit owner authorization. Preserve the lifecycle model's applicability classes and complexity limits; T4 progression also requires its validated governance manifest.

## Acceptance, coordination, and continuity

Track each requested outcome separately as PASS, FAIL, NOT CHECKED, or BLOCKED. Tests, local renders, hashes, and device acknowledgements prove only their specific claims. Cart release requires every B0–B5 and UI criterion in #116, including physical iPad Safari, integration, field checks, and owner acceptance. Never call a candidate installed or accepted without direct evidence.

Keep one accountable coordinator. Use an existing worker only for a bounded independent task; do not fan out or make the owner a courier. Request owner action only at a real access, physical-validation, or authorization boundary, with one consolidated request, exact expected evidence, and a stop condition. Communicate at meaningful milestones or changed blockers; do not send routine heartbeat updates or poll unchanged state.

For a durable decision, result, or material failure, append one nonduplicate PENDING Delta Inbox row and follow AKS reconciliation; do not rewrite canonical AKS sources during ordinary work. Store canonical source in GitHub, durable binaries/recovery evidence in Drive, and current pointers/metadata in AKS. Before a later phase depends on a new artifact: validate it, hash it, register and promote it, then verify readback. Update the artifact registry when a durable artifact becomes current or is superseded, not for transient outputs. Keep the current candidate, exact recovery companion, and last accepted baseline; do not leave decisive evidence local-only. Protect credentials and private user data.

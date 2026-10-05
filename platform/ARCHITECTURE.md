# Local Roots / HBNF Internal Developer Platform — MVP

## Why this exists

The repository accumulated enough workflows, release artifacts, handoffs, device procedures, and external systems that workers began spending more time reconstructing context than producing outcomes. This platform layer is the corrective abstraction.

It is intentionally a **minimum viable platform**, not a new bureaucracy.

## Design principles

This implementation borrows proven ideas from DORA/platform engineering, Google SRE, Backstage, Temporal, Bazel/hermetic build practice, SLSA, OpenGitOps, and OpenTelemetry.

We are adopting the principles, not deploying heavyweight infrastructure where the scale does not justify it.

## Operating model

### One catalog

`platform/catalog.json` is the machine-readable inventory of systems, owners, dependencies, repo authorities, external authorities, and supported golden paths.

Workers should not infer topology from directory names or old handoffs.

### Golden paths

`platform/workflows/*.json` defines the paved roads for recurring work:

- `software-change`
- `artifact-release`
- `live-device-diagnostic`

A golden path declares ordered stages, retry semantics, timeout budgets, recovery behavior, and terminal outputs.

### One command surface

`scripts/platform.py` is the front door:

    python3 scripts/platform.py doctor
    python3 scripts/platform.py capsule --system hbnf-cart --workflow live-device-diagnostic --out /path/to/CAPSULE.json
    python3 scripts/platform.py check-capsule --capsule /path/to/CAPSULE.json
    python3 scripts/platform.py event ...
    python3 scripts/platform.py metrics --runs-dir /path/to/runs

Workers should not manually assemble an execution environment when the platform can prove it first.

### Self-validating execution capsules

A capsule binds one run to exact system/workflow identity, repo/source identity, hashes of required repo inputs, external authority pointers, retry/cost/user-interaction policy, ordered stages, rollback/recovery contract, expected terminal outputs, and unique run/trace IDs.

If the capsule does not validate, fix it **before** live or paid mutation.

### Structured run evidence

Run events are JSONL and share run/trace IDs. Terminal summaries should measure outcome, lead time, retries, tooling/process blockers, user actions, and decisive evidence produced.

Large evidence remains in Drive or another durable evidence store; run metadata points to it rather than duplicating payloads.

### Provenance before deployment

Any immutable artifact that may be deployed must have an artifact SHA-256, source identity, build/workflow identity, durable artifact pointer, and exact recovery companion when applicable.

A successful compile without provenance is not deployment-ready.

### Circuit breakers against wheel-spinning

Platform policy requires:

- no same-mechanism retry without new evidence;
- no inherited authorization for paid/quota-limited retries;
- no remote build as source archaeology;
- no repeated verification of a closed prerequisite unless state changed;
- after two consecutive tooling/process blockers with no new product evidence, simplify the workflow before another mechanism;
- never use the user as a command/output relay.

## Storage and retrieval

| Layer | Role |
| --- | --- |
| GitHub | canonical source, scripts, configs, golden paths, small provenance |
| Google Drive | durable binaries, recovery artifacts, decisive/large evidence |
| AKS / registries | searchable routing, current-state pointers, identities, supersession/acceptance metadata |
| local workspace | ephemeral execution only |

Retrieval is **index-first, not index-only**. If the catalog/registry cannot resolve genuinely needed historical evidence, workers should broaden the search deliberately. The failure mode to eliminate is repeated unindexed archaeology.

## What this replaces

This platform does not delete domain documentation or historical evidence. It replaces the need for workers to treat every handoff, postmortem, README, local folder, and old config as a peer operational authority.

Operational decisions should come from:

1. the catalog;
2. the relevant system control/state file;
3. the selected golden path/capsule;
4. direct evidence.

Historical docs remain searchable evidence.

## Migration approach

Do not perform a big-bang cleanup while Packet20 is active.

1. Run the platform in parallel on the isolated rebuild branch.
2. Use `doctor` to expose authority/tooling contradictions.
3. Convert the next completed HBNF run into the first terminal run summary.
4. After the active diagnostic closes, archive/remove root-level historical build directories only after unique provenance is registered.
5. Merge the platform layer into the accepted baseline when its first real workflow has completed successfully.
6. Expand golden paths only when repeated work demonstrates the need.

The success criterion is not “more governance.” It is **less time from request to verified outcome, fewer retries, fewer user interventions, and less rediscovery**.

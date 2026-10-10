# Platform

This directory is the machine-readable execution platform for Local Roots / HBNF.

## Mandatory front door

For substantial implementation, build, deployment, diagnostic, recovery, or acceptance work:

1. `python3 scripts/platform.py doctor`
2. Select the system + golden path from `catalog.json` and `workflows/`.
3. Create the execution capsule:
   `python3 scripts/platform.py capsule --system <system> --workflow <workflow> --out <CAPSULE.json>`
4. Validate it:
   `python3 scripts/platform.py check-capsule --capsule <CAPSULE.json>`
5. Close the mandatory prelive stages and record evidence in a proof based on `templates/PRELIVE_PROOF.template.json`.
6. Fail closed unless:
   `python3 scripts/platform.py prelive-check --capsule <CAPSULE.json> --proof <PRELIVE_PROOF.json>`
   returns PASS.
7. Generate the worker directive rather than improvising it:
   `python3 scripts/platform.py directive --capsule <CAPSULE.json> --out <WORKER_DIRECTIVE.txt>`

For HBNF live mutation, `scripts/hbnf_guarded_run.py` requires the current `LIVE_APPROVED` release admission, validated capsule, and prelive proof before launching the child command.

## Non-negotiable rule

Deterministic uncertainty belongs before live execution. A live/paid step may discover only genuinely irreducible runtime or physical behavior.

If live work exposes an unproven dependency, credential, URL/role contract, timeout, publication mechanism, recovery path, or rollback dependency, that is a process defect: stop, fix it offline, add regression coverage, and rerun the complete transaction rehearsal before resuming.

Provider-specific paved roads live under `providers/`; for HBNF Cloudflare Workers publication/recovery, read `providers/cloudflare-workers.json`.

See `ARCHITECTURE.md` for design rationale.

EXECUTE THIS CAPSULE. DO NOT IMPROVISE THE WORKFLOW.
Run ID: phase2-r3-night-qualification-20261008
Trace ID: 0f59f167f6ce4bfbac1ea6a760e3ce65
System: hbnf-cart
Workflow: phase2-live-qualification
Repository identity: {"branch": "hbnf-cart2-phase2-integration-20261006", "dirty": false, "type": "git_commit", "value": "6012e4b9904588ce8ab59d50ce135a8031753d20"}

MANDATORY OPERATING RULES:
- Validate the capsule before any mutating or paid step.
- Close every deterministic prerequisite offline before mutation.
- Do not discover build, publication, consumer-contract, timeout, credential, or rollback prerequisites during live execution.
- Live execution may discover only irreducible runtime/physical behavior.
- Do not substitute helpers, configs, artifacts, branches, URLs, or recovery targets.
- Do not retry the same mechanism without new evidence.
- If a required recovery path has not already been proven end-to-end, STOP BEFORE MUTATION.
- Do not use the user as a command/output relay.
- Return only terminal product evidence or one irreducible blocker.

ORDERED STAGES:
- package-doctor: preflight / retry=idempotent
- contract-closure: preflight / retry=idempotent
- recovery-proof: preflight / retry=idempotent
- transaction-rehearsal: verification / retry=idempotent
- capture-current-state: preflight / retry=idempotent
- read-only-preflight: preflight / retry=idempotent
- candidate-install: live / retry=never
- runtime-smoke-and-physical-sync: verification / retry=idempotent
- all-kernel-sweep-and-soak: live / retry=explicit_only
- owner-acceptance: verification / retry=idempotent
- record: evidence / retry=idempotent

TERMINAL RECOVERY:
If the exact candidate is unqualified or runtime safety/required AUX behavior fails, preserve the failure evidence, install only the exact R4 recovery within the authorized limit, verify exact R4 identity and health, then continue offline work; never stop solely because a soak failed.

EXPECTED TERMINAL OUTPUTS:
- R3 runtime qualification or exact failure classification
- exact Matrix release identity
- R4 recovery evidence if used
- AUX physical synchronization/recovery evidence
- soak audit
- T4/T5 lifecycle state
- durable evidence pointers

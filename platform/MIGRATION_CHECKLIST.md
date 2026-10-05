# Platform migration checklist

The platform branch is intentionally isolated while Packet20 is active.

## Before merge

- platform static tests pass;
- platform doctor runs in the real checkout;
- current HBNF tool/state identity mismatch is either fixed or intentionally represented by an exact current adapter contract;
- one real task completes using a generated capsule;
- one RUN_SUMMARY.json is produced;
- one PROMOTION_MANIFEST.json is completed and read-back verified.

## After first successful real run

- merge the platform layer to the accepted baseline;
- make platform doctor the default worker entry point;
- stop creating new process/handoff documents when run state + summary can represent the information;
- keep historical docs searchable but demote them from operational authority.

## Cleanup after Packet20 closes

- classify every HBNF GitHub Actions workflow: current / manual recovery / archive-delete;
- classify every root HBNF build/package directory: active / unique provenance / reproducible obsolete;
- register unique provenance, then remove obsolete active-root clutter;
- compact current Drive authority documents so chronology moves to immutable evidence rather than current-state prose;
- keep AKS as cross-project discovery/routing and append-only history, not a second execution engine.

## Escalation criteria for heavier platform tooling

Do not deploy Backstage, Temporal, Bazel, an OpenTelemetry backend, or a dedicated artifact registry service merely because experts use them.

Adopt a heavier tool only when measured runs show a repeated limitation that the current MVP cannot solve cleanly, such as:

- enough systems that JSON catalog navigation becomes painful;
- enough concurrent/long-running workflows that local durable state is insufficient;
- enough build variants that home-grown hermetic validation stops scaling;
- enough telemetry volume that JSONL correlation is no longer usable.

The platform is a product. Its job is to remove cognitive load and time, not accumulate features.

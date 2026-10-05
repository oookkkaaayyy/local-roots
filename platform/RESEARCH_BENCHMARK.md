# Research benchmark

This rebuild is based on established software/platform engineering practice rather than ad hoc HBNF process invention.

## DORA / Google Cloud platform engineering

Adopted:
- small batches and fast feedback;
- minimum viable platform rather than big-bang tooling;
- golden paths that make the safe path the easy path;
- value-stream visibility and task-success metrics;
- measure delivery speed and instability/toil.

Sources:
- https://dora.dev/capabilities/working-in-small-batches/
- https://dora.dev/capabilities/platform-engineering/
- https://dora.dev/capabilities/work-visibility-in-value-stream/
- https://dora.dev/guides/dora-metrics/
- https://cloud.google.com/solutions/platform-engineering

## Google SRE

Adopted:
- reduce repetitive operational toil with automation;
- significant failures produce system fixes, not human compensating procedures;
- postmortem/action items have verifiable end states;
- repeating incidents indicate systemic design problems.

Sources:
- https://sre.google/resources/book-update/eliminating-toil/
- https://sre.google/workbook/postmortem-culture/
- https://sre.google/resources/practices-and-processes/incident-management-guide/

## Backstage

Adopted:
- centralized machine-readable software catalog;
- standard templates/golden paths;
- docs/config live with code;
- ownership, dependencies, runtime resources, and tooling are discoverable from one entry point.

Not adopted:
- a full Backstage deployment. At this scale, JSON plus one CLI provides the useful abstraction without the operating cost.

Sources:
- https://backstage.io/docs/overview/what-is-backstage/
- https://backstage.io/docs/features/software-catalog/
- https://backstage.io/docs/features/software-templates/

## Temporal / durable execution

Adopted:
- explicit workflow stages and durable run IDs;
- distinguish read-only/idempotent retry from mutation retry;
- nested timeout budgets are declared rather than accidental;
- long/multi-step work preserves intermediate state;
- mutations have recovery semantics.

Not adopted:
- a Temporal service. The current workload volume does not justify it.

Sources:
- https://docs.temporal.io/temporal
- https://docs.temporal.io/tasks
- https://docs.temporal.io/nexus/standalone-activity

## Bazel / hermeticity

Adopted:
- declared inputs only;
- hidden machine/cache/FileProvider state is a defect;
- builds/runs should be reproducible from explicit inputs;
- disposable execution areas must not silently change path/input semantics.

Not adopted:
- converting the whole repo to Bazel.

Sources:
- https://bazel.build/basics/hermeticity
- https://bazel.build/reference/glossary

## SLSA

Adopted:
- artifact digest;
- source identity;
- build/workflow identity;
- provenance binding an artifact to how it was produced.

Source:
- https://slsa.dev/spec/v1.2/provenance

## OpenGitOps

Adopted:
- desired/control state is declarative;
- state/workflow definitions are versioned and auditable;
- workers reconcile actual execution against declared state instead of inferring state from prose.

Not adopted:
- continuous automatic reconciliation of physical devices where bounded explicit mutation is safer.

Source:
- https://opengitops.dev/

## OpenTelemetry

Adopted:
- unique run/trace IDs;
- structured events;
- correlation across stages/logs/evidence.

Not adopted:
- a collector/backend until event volume warrants it.

Sources:
- https://opentelemetry.io/docs/
- https://opentelemetry.io/docs/specs/otel/logs/
- https://opentelemetry.io/docs/concepts/context-propagation/

## Result

The platform is intentionally small:

1. one software catalog;
2. three initial golden paths;
3. one CLI;
4. self-validating execution capsules;
5. structured run events/metrics;
6. existing GitHub/Drive/AKS stores used by role;
7. domain-specific state machines retained only where they add real safety.

The platform should grow only when repeated work demonstrates a missing reusable capability.

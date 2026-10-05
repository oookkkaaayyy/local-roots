# Current-system audit and migration priorities

## Executive finding

The current backend is not failing because it lacks enough safeguards. It is failing because safeguards, history, tools, artifacts, and execution state are spread across too many peer surfaces.

The most important correction is **convergence**:

- one catalog;
- one selected golden path per task;
- one execution capsule per run;
- one domain control state where necessary;
- one terminal summary;
- durable evidence indexed once.

## P0 — fix before another HBNF diagnostic attempt

### Live-tool identity mismatch

Current HBNF control state says seq19 is installed while the repository's named 20261004 Packet20 adapter still declares Release07 as its expected release identity.

The new platform doctor treats this as an error, not something a worker may silently work around.

### Timeout ownership

Packet20 exposed an outer-process timeout smaller than the possible sum of sequential HTTP call timeouts.

Golden paths now declare nested timeout budgets and validation rejects an outer timeout below the declared worst-case inner budget plus margin.

### Source/artifact provenance must be bound before live reuse

A live artifact must bind artifact SHA-256, source identity, and build/workflow identity. If that binding is uncertain, the artifact can be recovered away from but must not become the basis for another diagnostic mutation.

## P1 — remove latent workflow risk after the active lane closes

### Root directory entropy

The HBNF staging root contains numerous historical build/package directories, including multiple .hbnf-build-* trees and multiple product/package variants.

These are useful historical inputs but poor active navigation. After Packet20 closes:

1. identify unique provenance that is not already registered;
2. preserve/register it;
3. move historical source packages out of the active root or delete reproducible duplicates;
4. keep only active source components visible at the root.

### Handoff/process-document accumulation

work/cart2 contains more than 30 planning/status/handoff/spec files, including multiple length-limit handoffs and Packet20 readiness/review documents.

These remain evidence, but future workers should not read them all. The catalog/control state/capsule becomes the operational entry point; historical docs become searchable evidence.

### Legacy Actions workflow surface

The HBNF branch still contains many branch-specific automatic push workflows for old branches. They are not triggered by the current staging/platform branches, but they are latent quota/cost risk if those historical branches are touched.

After the active HBNF lane closes, classify each workflow as:

- current golden path;
- manual recovery;
- archive/delete.

Do not retain automatic triggers merely because they once existed.

### Unprotected main/staging branches

GitHub currently reports main and HBNF staging as unprotected. Repository rulesets are unavailable on the current private-repository plan via the API.

Until stronger protection is available, the platform compensates with:

- isolated work branches;
- capsule/doctor checks before mutation;
- explicit merge discipline;
- no automatic paid Actions trigger.

This is weaker than protected required checks and should be revisited if repository plan/cost changes.

## P2 — improve retrieval and observability

### Catalog-first retrieval

AKS/Drive/GitHub remain useful stores, but workers should resolve topology and authority from the catalog first, then use the registry/pointers to retrieve exact material.

### Structured run history

Every substantial run should emit:

- run_id;
- trace_id;
- stage events;
- terminal outcome;
- lead time;
- retries;
- tooling blockers;
- user actions;
- evidence pointers.

This makes repeated failure patterns visible instead of relying on chat memory.

### Automatic promotion checklist

Terminal run summaries should produce a promotion manifest listing which outputs must move to:

- GitHub;
- Drive;
- AKS/registry.

A worker should not finish with decisive evidence local-only.

## Current vs target value stream

### Current

request → reconstruct context → search authorities → locate local files → validate/build → discover hidden dependency/path issue → write handoff → repeat → live attempt → new tooling issue → reconcile again

### Target

request → platform doctor → choose golden path → build/validate capsule → execute bounded run → verify/recover → promote evidence → terminal summary

The target removes repeated context assembly from the critical path.

## Success metrics

Track per run:

- request-to-terminal-result lead time;
- process time vs waiting/research time;
- retries;
- tooling/process blockers;
- user actions;
- paid/quota-limited runs;
- percentage of runs that finish from the first valid capsule;
- percentage of decisive artifacts already retrievable from indexed authority.

The platform is successful only if these improve.

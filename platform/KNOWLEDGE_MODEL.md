# Knowledge / authority model

## Problem

The current knowledge system mixes three different jobs:

1. append-only history/evidence;
2. current operational state;
3. discovery/routing.

That causes current-state documents to grow indefinitely and forces workers to read historical narrative in order to answer a present-tense question.

Current scale already makes the issue visible:

- Master Router: roughly 18k characters / 94 paragraphs;
- HBNF current file authority: roughly 27k characters / 137 paragraphs;
- Delta Inbox: more than 1,300 rows.

The historical information is valuable. The mistake is making it part of the critical path for every execution.

## Target model

Use a deliberately small variation on event-log + materialized-view architecture without deploying a full event-sourcing/CQRS stack.

### Append-only evidence layer

Keep:

- Delta Inbox;
- immutable build/run receipts;
- postmortems;
- historical accepted/rejected artifacts.

Do not rewrite history to make it look cleaner.

### Materialized current-state layer

Each active system gets one compact current-state object designed for fast reads.

Examples:

- HBNF: existing `config/HBNF_CONTROL_STATE.json`;
- web/data systems: a small `CURRENT_STATE.json` only if they need cross-task operational state.

A current-state object should contain only:

- current lifecycle/status;
- exact active source/artifact identity;
- current blocker/next transition;
- active runtime/deployment identity;
- pointers to decisive evidence.

It should not contain chronology.

### Catalog / query layer

`platform/catalog.json` is the first-stop query surface:

- what systems exist;
- what owns them;
- dependencies;
- where current state lives;
- where durable evidence lives;
- which golden paths apply.

AKS remains the human-searchable cross-project index, but it should route to current state rather than restate that state in long prose.

## Update flow

A meaningful change should follow:

1. execute one golden path;
2. emit one terminal run summary;
3. append one immutable evidence/delta record;
4. update the compact current-state view;
5. update catalog/registry pointers only when identities/locations changed.

This preserves history while keeping current reads cheap.

## Retrieval flow

1. catalog;
2. current-state object;
3. artifact/source registry;
4. direct evidence;
5. historical search only when unresolved.

Historical retrieval is explicitly allowed. It simply stops being the default.

## Why not full CQRS/event sourcing

A full event-sourcing/CQRS implementation would add more operational complexity than this project needs. The useful principle is separation of concerns:

- writes/history remain append-only and auditable;
- current-state reads come from compact materialized views;
- routing comes from the catalog.

That gets the benefit without another platform to operate.

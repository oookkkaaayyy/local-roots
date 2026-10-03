# HBNF Control Plane — One Model, Not a Stack of Rules

STATUS: IMPLEMENTED IN STAGING / NOT YET INGESTED BY ACTIVE FPS CODEX.

## Why this exists
The prior governance approach accumulated:
- AKS prose;
- READ FIRST documents;
- gate JSON;
- postmortem action lists;
- runbooks;
- solved-problem entries;
- acceptance matrices.

Most are useful evidence, but allowing each to independently influence an agent creates implicit rule interaction and document-precedence complexity.

That is now prohibited.

## Operational authority
Only these three artifacts decide promotion state:

1. `config/HBNF_CONTROL_MODEL.json`
   - finite states;
   - explicit forward transitions;
   - evidence required for each transition;
   - small set of invariants.

2. `config/HBNF_CONTROL_STATE.json`
   - one current lifecycle state;
   - evidence booleans;
   - evidence references;
   - explicit user approvals.

3. `scripts/hbnf_control.py`
   - validates the model/state;
   - reports exactly one next transition;
   - reports exact blockers;
   - refuses unknown evidence;
   - refuses implicit human approval;
   - refuses skipping lifecycle states.

Everything else is:
- implementation;
- evidence;
- historical record;
- domain contract;
- generated output.

It does NOT become another independent decision layer.

## Future-agent startup
A future chat/Codex task handling release/Cart 2.0 state must begin with:

```
python3 scripts/hbnf_control.py status
```

The agent must not infer a more advanced state from prose, recency, optimism, a successful compile, or a successful install.

If a new requirement changes promotion logic:
- do not append another free-floating rule;
- challenger-review whether it is:
  1. implementation detail;
  2. evidence for an existing transition;
  3. a genuinely new lifecycle transition/invariant.
- only category 3 changes the control model.

## Current lifecycle
Current staged state:
`DIAGNOSTIC_ACTIVE`

The active FPS task may supply evidence for the next transition, but it cannot directly declare the firmware the Phase 2 foundation.

## Design constraints
- No generic rules engine.
- No chaining.
- No hidden priority/order.
- No natural-language conflict resolution.
- No duplicated current-state files.
- No manual "all green" judgment.
- No human-approval inference.
- Unknowns fail closed.

## What remains
After the active FPS task returns:
1. import evidence through the control CLI;
2. run control-plane tests;
3. advance only when the exact transition requirements are satisfied;
4. bind runtime qualification outputs to evidence references;
5. only `FOUNDATION_QUALIFIED` may authorize Phase 2 integration.

This is the replacement for accumulating additional operational rules.

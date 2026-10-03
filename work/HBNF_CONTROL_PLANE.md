# HBNF Control Plane V2 — Linear Receipts, No Rule Graph

STATUS: IMPLEMENTED IN STAGING / ACTIVE FPS TASK UNTOUCHED.

## Design correction
V1 still exposed too many independent evidence booleans. Although explicit, that could grow into a lateral/vertical dependency graph.

V2 removes that graph.

Operational flow is now strictly linear:
DIAGNOSTIC_ACTIVE
-> FIX_CANDIDATE
-> FOUNDATION_QUALIFIED
-> PHASE2_INTEGRATING
-> RELEASE_CANDIDATE
-> ACCEPTED

Each transition consumes exactly ONE self-contained stage receipt.

## Receipt rule
A receipt contains:
- exact transition/type;
- exact subject identity (release/source/artifact);
- only the direct checks owned by that stage;
- hashes of direct measurement/test artifacts;
- explicit user approval only when the transition requires it.

A receipt may NOT cite or depend on:
- another receipt;
- the control model/state;
- READ FIRST docs;
- postmortems;
- runbooks;
- AKS prose.

Those materials can inform implementation, but they are not runtime dependencies of the decision path.

## Why this matters
The coordinator never traverses a graph of rules.

For the current state it asks one question:
"What is the next transition, and does its one receipt validate?"

No recursion.
No lateral rule references.
No vertical rule inheritance.
No natural-language precedence.
No hidden chaining.

## Change discipline
New information is classified before changing the model:
1. implementation detail -> code/task only;
2. direct evidence for an existing stage -> stage verifier/receipt only;
3. truly new lifecycle boundary -> deliberate model revision.

Default is NOT to change the lifecycle model.

## Complexity budget
- 6 lifecycle states.
- 5 forward transitions.
- exactly 1 outgoing transition per nonterminal state.
- exactly 1 receipt per transition.
- no branching.
- no cycles.
- no nested receipts.

If a future design violates those limits, stop and redesign rather than extending the graph.

## Next source-connected action
When the active FPS Codex finishes:
1. create the T1 diagnostic-close receipt from its direct timing/root-cause/fix/test outputs;
2. validate it;
3. advance to FIX_CANDIDATE only if it passes;
4. build the T2 foundation-qualification receipt from automated runtime/build/physical evidence;
5. only then can the state become FOUNDATION_QUALIFIED.

Future agents begin with:
python3 scripts/hbnf_control.py status

# HBNF / Cart Upgrades — Repository Agent Instructions

For any task touching HBNF release engineering, firmware promotion, Cart 2.0 integration, deployment, or acceptance:

1. Run:
   `python3 scripts/hbnf_control.py status`

2. Treat only these files as operational lifecycle authority:
   - `config/HBNF_CONTROL_MODEL.json`
   - `config/HBNF_CONTROL_STATE.json`
   - `scripts/hbnf_control.py`

3. Do not infer lifecycle state from prose, recency, successful compilation, successful installation, postmortems, READ FIRST docs, AKS, or legacy gate JSON.

4. Do not add free-floating governance rules. New information must be classified as:
   - implementation detail;
   - direct evidence for the current stage receipt; or
   - a deliberate lifecycle-model revision.

5. Preserve the V2 complexity budget:
   - 6 states maximum;
   - 5 forward transitions maximum;
   - exactly one outgoing transition per nonterminal state;
   - one self-contained receipt per transition;
   - no branching, cycles, nested receipts, or receipt-to-receipt references.

6. Before finalizing any repository change that touches HBNF control/release logic, run:
   - `python3 tests/hbnf_control.py`
   - `python3 tests/hbnf_guarded_run.py`
   - `python3 scripts/hbnf_architecture_fitness.py`
   - `python3 tests/hbnf_runtime_qualify_static.py`
   - `python3 tests/hbnf_kernel_sweep_report.py`

7. Do not perform live mutation unless the control plane and the task's explicit user authorization both permit it.

These instructions exist to prevent governance drift across Codex tasks and chats.

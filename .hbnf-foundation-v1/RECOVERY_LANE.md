# Foundation V1 recovery lane

Branch: `hbnf-foundation-recovery-parallel-20260927`

This branch exists only to preserve and harden the recovered Foundation V1 work while the original context-rich chat retries independently.

Rules:
- no production mutation;
- no changes to `hbnf-foundation-rebuild-v1-20260927`;
- no Matrix/AUX OTA;
- no live backend/controller mutation;
- every candidate change must be CI-tested here before later reconciliation;
- promotion requires explicit comparison against the retry branch and physical acceptance.

# HBNF Release Engineering — READ FIRST

Canonical AKS authority:
- CANONICAL — HBNF RELEASE ENGINEERING & NO-REDISCOVERY PROTOCOL — 2026-10-02
- Drive ID: 1bw_VUNt2mEZ4JdKuRsQq7ZS1Bc4KeC8kMVABVK2OdgE
- Canonical Registry: AKS-REC-000119

This directory is planning/tooling only. It must not interrupt or mutate the currently running PR #46/Codex task.

## Required operating rule
Every future HBNF update must begin from a **golden release capsule** and **solved-problems ledger** rather than reconstructing accepted source/build state from old chats.

Do not claim "quick rollout", "nothing more to do", or "ready to install" unless the release status proves:
- accepted source lineage;
- captured/pinned build environment;
- candidate build/test success;
- package completeness;
- rollback readiness;
- only physical acceptance remains.

## Current state
The first complete capsule cannot be finalized until the active source-reconciliation/rebuild task establishes the accepted V1.1 source/build lineage.

Known accepted artifact identity:
- release: hbnf-matrix-v1-1-current-20260930
- firmware SHA-256: 0aeb668e58cad3bae5b636fdc79573a263c3d0e911903ed48af0bbc2e5681f61
- rollback SHA-256: 32802f354cf2edcc1636698e5f15b6bc61311b0bffc7ecf72960221f3478fb55
- WLED: 16.0.1
- Matrix: 192.168.77.10 / 70:4b:ca:5b:34:5c
- AUX: 192.168.77.11 / 8c:94:df:55:c3:4c
- Opal: 192.168.77.1

Unknown source/build fields must remain explicitly UNKNOWN/PENDING rather than guessed.

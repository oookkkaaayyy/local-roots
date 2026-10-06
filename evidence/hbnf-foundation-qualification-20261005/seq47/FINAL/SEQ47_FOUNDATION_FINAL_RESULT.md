# Seq47 Foundation result — 2026-10-06

**Outcome:** Foundation did not qualify. Exact Release07 recovery passed.

- Candidate `hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1`, SHA-256 `338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c`.
- Soak: 5439.949s; 1089 samples; 900 state changes across 28 kernels; maximum gap 8.368s; zero restart.
- Renderer restore: `restoreVerified=true`, `packet20Same=true`, source-bound, snapshot 1/2829015731.
- Frozen-policy results: FPS median 28/28 PASS; frame p95 28/28 PASS; frame p99 28/28 PASS. Minimum free heap failed 28/28 (observed minimum 40,240 bytes); largest free block failed 10/28; AUX staleness failed on kernel 23 (2.564103% vs 1% limit). Single-sample frame maxima remained diagnostic only.
- Seq48 recovery: PASS; `hbnf-matrix-coordinated-v1-20261002-07`; SHA-256 `8e8db17786b178fc8fcd2cdf8a21512681ec7158941ee49ea255509970b1bcab`; Matrix-origin AUX DDP live.
- Foundation remains unqualified. Live mutation must be closed.

The JSON companion binds the raw soak, state-change, frozen-policy, restore, and recovery evidence by SHA-256.

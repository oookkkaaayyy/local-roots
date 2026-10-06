# 2026-10-06 Foundation field rescue result

Status: **INCOMPLETE; exact Release07 restored and verified. Foundation remains unqualified.**

## Offline comparability correction

- Preserved the original seq47 frozen `FOUNDATION_SOAK_AUDIT.json` byte-for-byte (SHA-256 `c9849ed0459e34e423d91b6d9c266ea639b5cc716c805e25fe51c8b21e391224`).
- Derived per-kernel settled current-free-heap, largest-block, and AUX comparators from the hash-matched seq39 raw profiles using the frozen 5-second settle rule. Boot-lifetime `esp_get_minimum_free_heap_size()` remains diagnostic only.
- Replayed the exact 5,439.949-second seq47 JSONL without changing numeric ratios. Replay is INCOMPLETE only because kernel 5 has one and kernel 27 has zero settled resource/AUX samples; no settled resource/AUX failures were found.
- Regression tests cover isolated max excursions, sustained p99 and catastrophic streak failures, restart, heap/fragmentation, AUX, identity, continuity, baseline derivation, and replay.

## Bounded seq49 / seq50 transaction

- Seq49 installed the unchanged candidate `hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1` (SHA-256 `338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c`, 1,489,008 bytes) once. Runtime identity and fresh diagnostic session were verified.
- The targeted resource/AUX collector produced four kernel profiles, then stopped when its AUX `/json/state` HTTP GET timed out with the configured 4-second per-request timeout. No resource/AUX threshold violation was measured. The sweep runner's one renderer restore passed and persisted post-restore state before comparing; `restoreVerified=true` and `packet20Same=true`.
- Under the preauthorized failure path, seq50 restored exact Release07 `hbnf-matrix-coordinated-v1-20261002-07`; Opal verified the uploaded binary hash and size, and post-install Matrix identity plus AUX DDP source were captured. SHA-256 `8e8db17786b178fc8fcd2cdf8a21512681ec7158941ee49ea255509970b1bcab`, 1,458,624 bytes.
- Live mutation is closed. No firmware build, GitHub Actions, repeat soak, or owner-device smoke was performed. Owner-device Home Screen/control smoke remains unverified because targeted qualification did not complete.

## Decisive evidence

- `seq49-offline-reconciliation/SEQ49_OFFLINE_RECONCILIATION.json`
- `seq49-offline-reconciliation/SEQ47_COMPARABILITY_REPLAY.json`
- `seq49/live/SEQ49_INSTALL_RECEIPT.json`
- `seq49/live/SEQ49_SWEEP_STDOUT.txt`, `seq49/live/targeted-resource-sweep/SWEEP_ABORT.json`
- `seq49/live/targeted-resource-sweep/RESTORE_RECEIPT.json`
- `seq49/live/SEQ50_RECOVERY_RESULT.json`
- Original seq47 audit and raw JSONL remain preserved under `seq47/live/retry-20261006T2027Z/`.

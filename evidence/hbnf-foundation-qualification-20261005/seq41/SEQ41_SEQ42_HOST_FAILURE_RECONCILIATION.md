# Seq41 / seq42 reconciliation — 2026-10-06

Seq41 installed the exact Foundation-metrics candidate once (BIN SHA `338afdf5…f3d8c`). It completed the tails-off window and sacrificial warm-up, then produced 48 preserved soak samples before the host sampler observed a 24.114-second gap against its 15-second limit. The retained samples show no restart and no observed >=1000 ms frame; this does not qualify a 90-minute soak.

The restore command was accepted and the firmware reported `restoreVerified=true` for snapshot 1 / hash 3256860723. The host marked restore unverified because the firmware JSON does not serialize `packet20Same`. The exact candidate source proves `restoreVerified` is assigned directly from `packet20Same(saved, verify)`. The host false negative then caused the automated path to consume seq42, although the failure was host-side. The offline host gate is now corrected and source-bound; tests cover the missing wire field and reject mismatched candidate/source/snapshot evidence.

Seq42's Release07 input was SHA/size verified on Opal. Its SSH OTA response file is empty, so no HTTP receipt was captured. A subsequent read-only Matrix `/hbnf/build.json` reports exact Release07 identity; the Matrix uptime reset and AUX reports native DDP live from the Matrix. The binary itself cannot be read back from the device, so evidence distinguishes verified recovery input + runtime identity from a direct installed-byte hash readback.

Foundation remains unqualified. No seq41/42 retry or new sequence is authorized by this checkpoint. Live mutation is closed. The device is on Release07 by runtime identity, AUX DDP is live, and overnight work continues offline.

Detailed machine-readable index: `SEQ41_SEQ42_HOST_FAILURE_RECONCILIATION.json` (SHA-256 `eead0d7c483ab90ce8cc49b52edb2443b929d95fef0be8893b30e82187444f0f`).

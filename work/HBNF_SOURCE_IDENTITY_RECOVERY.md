# HBNF Accepted V1.1 Source Identity Recovery

Purpose: recover exact build/source provenance once the Mac/local build workspace is available, without asking the user to reconstruct prior work manually.

## Known accepted artifact lineage
- Installed candidate SHA-256: 0aeb668e58cad3bae5b636fdc79573a263c3d0e911903ed48af0bbc2e5681f61
- Build base/accepted rollback SHA-256: 32802f354cf2edcc1636698e5f15b6bc61311b0bffc7ecf72960221f3478fb55
- Output directory: outputs/HBNF_AUDIO_EXPRESSION_V1_1/
- Candidate BIN: outputs/HBNF_AUDIO_EXPRESSION_V1_1/HBNF_AUDIO_EXPRESSION_V1_1_candidate.bin
- Report: outputs/HBNF_AUDIO_EXPRESSION_V1_1/REPORT.md
- Hash manifest: outputs/HBNF_AUDIO_EXPRESSION_V1_1/SHA256SUMS

## What is still missing
The retained project records do not identify a Git repository branch/commit for the exact 0aeb... build. Do not invent one and do not assume PR #46's current base is the exact firmware source.

## Recovery procedure when local workspace is available
1. Read REPORT.md and SHA256SUMS first.
2. Inventory the V1.1 output directory and immediate build/source siblings without modifying anything.
3. Identify the exact source tree/build script/PlatformIO environment that produced the candidate.
4. Record Git remote/branch/commit only if that source tree is actually Git-backed.
5. Rebuild in isolation with no flash.
6. Compare rebuilt artifact identity/embedded HBNF marker against the accepted V1.1 lineage.
7. If deterministic binary equality is not expected, document why and compare the exact source/config/user-module deltas against the accepted build report.
8. Only after reconciliation, flip:
   - acceptedLiveSourceIdentityReconciled
   - liveLocalDashboardSourceReconciled
   as supported by evidence.

No firmware publication/install may use a guessed source lineage.

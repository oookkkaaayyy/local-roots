# HBNF Accepted V1.1 Source Identity Recovery

Purpose: recover exact build/source provenance once the Mac/local build workspace is available, without asking the user to reconstruct prior work manually.

## Known accepted artifact lineage
- Installed candidate SHA-256: 0aeb668e58cad3bae5b636fdc79573a263c3d0e911903ed48af0bbc2e5681f61
- Exact V1.1 output root: /Users/andrew/Documents/Codex/2026-09-30/files-pasted-by-the-user-hbnf/outputs/HBNF_AUDIO_EXPRESSION_V1_1
- Exact V1.1 BIN: /Users/andrew/Documents/Codex/2026-09-30/files-pasted-by-the-user-hbnf/outputs/HBNF_AUDIO_EXPRESSION_V1_1/HBNF_AUDIO_EXPRESSION_V1_1_candidate.bin
- V1 predecessor report: /Users/andrew/Documents/Codex/2026-09-30/files-pasted-by-the-user-hbnf/outputs/HBNF_AUDIO_EXPRESSION_V1/REPORT.md
- V1 predecessor source patch: /Users/andrew/Documents/Codex/2026-09-30/files-pasted-by-the-user-hbnf/outputs/HBNF_AUDIO_EXPRESSION_V1/source.patch
- Accepted rollback BIN: /Users/andrew/Documents/Codex/2026-09-30/this-is-the-highest-priority-next/outputs/HBNF_IPAD_MINI_INTEGRATION/HBNF_iPad_Mini2_iOS12_Candidate.bin
- Accepted rollback SHA-256: 32802f354cf2edcc1636698e5f15b6bc61311b0bffc7ecf72960221f3478fb55
- Rollback source tree: /Users/andrew/Documents/Codex/2026-09-30/this-is-the-highest-priority-next/work/hbnf-visual-audio-repair/integration-copy
- HBNF usermod source: .../integration-copy/usermods/hbnf_foundation_v1
- Local UI header in that source: hbnf_local_ui.h
- PlatformIO environment: hbnf_matrix_wled16_max
- Foundation base SHA-256 recorded for that lineage: 3a9d02aa6bf7529a589d150834d4b9b916bef6bdc1634b13b4202eee5576dedb
- Build base/accepted rollback SHA-256: 32802f354cf2edcc1636698e5f15b6bc61311b0bffc7ecf72960221f3478fb55
- Output directory: outputs/HBNF_AUDIO_EXPRESSION_V1_1/
- Candidate BIN: outputs/HBNF_AUDIO_EXPRESSION_V1_1/HBNF_AUDIO_EXPRESSION_V1_1_candidate.bin
- Report: outputs/HBNF_AUDIO_EXPRESSION_V1_1/REPORT.md
- Hash manifest: outputs/HBNF_AUDIO_EXPRESSION_V1_1/SHA256SUMS

## What is still missing
The retained project records do not identify a Git repository branch/commit for the exact 0aeb... build. Do not invent one and do not assume PR #46's current base is the exact firmware source.

## Recovery procedure when local workspace is available
1. From this repository, run the read-only collector first:
   `python3 tools/hbnf-source-identity-preflight.py`
   It searches only bounded likely user-workspace roots, verifies the accepted candidate SHA, extracts REPORT.md clues, and reports nearby Git/PlatformIO source candidates without modifying anything.
2. Read REPORT.md and SHA256SUMS first.
3. Inventory the V1.1 output directory and immediate build/source siblings without modifying anything.
4. Identify the exact source tree/build script/PlatformIO environment that produced the candidate.
5. Record Git remote/branch/commit only if that source tree is actually Git-backed.
6. Rebuild in isolation with no flash.
7. Compare rebuilt artifact identity/embedded HBNF marker against the accepted V1.1 lineage.
8. If deterministic binary equality is not expected, document why and compare the exact source/config/user-module deltas against the accepted build report.
9. Only after reconciliation, flip:
   - acceptedLiveSourceIdentityReconciled
   - liveLocalDashboardSourceReconciled
   as supported by evidence.

No firmware publication/install may use a guessed source lineage.

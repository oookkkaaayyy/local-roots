# Real AudioReactive v2 Trace — Phase 2 Candidate Replay

- Captured passively from the qualified Matrix, WLED AudioReactive UDP Sound Sync v2 multicast `239.0.0.1:11988`; no setting was changed and no PCM was recorded.
- Matrix read-only identity: `192.168.77.10`, MAC `70:4b:ca:5b:34:5c`, WLED `16.0.1`; candidate `hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1`, firmware SHA `338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c`.
- Read-only AudioReactive configuration: enabled, digital mic type 5, sync mode 1 (send), UDP port 11988. Sanitized record is `source_readonly_state.json`.
- Raw trace SHA-256: `712dd275bd260ebec2c60c17ed9413bf8d6cd0c58b2121c913916b0944f7e951`; 3,852 packets over 120.013 s; every accepted packet came from Matrix IP.
- Replay emits all 13 candidate AudioFeatures per sample and computes all five manual Vibe responses from the same sample. Minimum pairwise mean response distance is 0.1265; candidate acceptance threshold is 0.10.
- Bass ablation most affects structure/depth; mid ablation most affects symmetry/flow; high ablation most affects detail. High transient reached 1.0, high-detail 0.650, but only 159 samples had any energy in bins 11–15 and no active sample was high-band dominant. Mid-band was dominant in 26 active samples; bass was dominant in 847. The raw capture is unlabelled ambient microphone data, so it does not prove controlled bass-heavy, mid-forward, and high-detail music coverage.
- AUTO replay stayed on one Vibe for at least 45 s before each of its two switches (CHILL → GROOVE at 48.37 s; GROOVE → HEAVY at 94.43 s), consistent with the candidate 45 s dwell; the selector also applies the 0.12 score margin.
- Desktop replay median/p95 cost is reported in `replay_report.json` only as host cost. It cannot establish ESP32 runtime cost against the Foundation frame budget. That stays a live design-review measurement.
- Since the host renderer cannot faithfully model final FastLED/Matrix scene behavior, no Vibe screenshots are presented as representative; subjective acceptance is deferred to the first integrated Matrix design-review candidate.

## Files

- `real_audio_capture.jsonl` — raw UDP feature packets and source identity metadata.
- `derived_features_vibes.jsonl` — 13 AudioFeatures, five manual Vibe responses, and AUTO choice per sample.
- `replay_report.json` — distribution, pairwise distances, band-axis influence, AUTO transitions, and host timing.

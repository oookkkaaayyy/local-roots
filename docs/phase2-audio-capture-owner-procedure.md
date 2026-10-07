# Phase 2 labeled audio capture (owner action)

This is a passive, offline-evidence capture against the already running Foundation firmware. It writes WLED AudioReactive UDP Sound Sync v2 feature packets only; it does not record PCM/audio, contact WLED configuration endpoints, or change firmware. Keep the existing source and network routing unchanged. Do not run this against an unverified device identity.

The baseline identity embedded in each trace is:

- Matrix IP: `192.168.77.10`
- Matrix MAC: `70:4b:ca:5b:34:5c`
- Release: `hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1`
- Firmware SHA-256: `338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c`

## Exact procedure

From the repository root, run one command at a time. During each 30-second window, route/play representative source material for the named category through the existing audio input path. Do not change WLED settings between captures. Use a new capture date directory if the listed date has passed.

```sh
python3 tools/hbnf_audio_udp_v2_capture.py --out evidence/hbnf-phase2-audioreactive-20261007/BASS_HEAVY.jsonl --seconds 30 --matrix-ip 192.168.77.10 --matrix-mac 70:4b:ca:5b:34:5c --release-id hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1 --firmware-sha256 338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c --label BASS_HEAVY
python3 tools/hbnf_audio_udp_v2_capture.py --out evidence/hbnf-phase2-audioreactive-20261007/MID_RHYTHMIC.jsonl --seconds 30 --matrix-ip 192.168.77.10 --matrix-mac 70:4b:ca:5b:34:5c --release-id hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1 --firmware-sha256 338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c --label MID_RHYTHMIC
python3 tools/hbnf_audio_udp_v2_capture.py --out evidence/hbnf-phase2-audioreactive-20261007/HIGH_DETAIL_TRANSIENT.jsonl --seconds 30 --matrix-ip 192.168.77.10 --matrix-mac 70:4b:ca:5b:34:5c --release-id hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1 --firmware-sha256 338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c --label HIGH_DETAIL_TRANSIENT
python3 tools/hbnf_audio_udp_v2_capture.py --out evidence/hbnf-phase2-audioreactive-20261007/QUIET_LOW_ACTIVITY.jsonl --seconds 30 --matrix-ip 192.168.77.10 --matrix-mac 70:4b:ca:5b:34:5c --release-id hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1 --firmware-sha256 338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c --label QUIET_LOW_ACTIVITY
```

Each command returns `PASS` and a positive packet count if valid packets arrived from the expected source. `NO_PACKETS` means retain the trace for diagnosis and repeat only after checking that the existing source produces Sound Sync v2 multicast on the current interface. The capture tool rejects other source IPs and malformed/version-mismatched packets.

After capture, keep the four traces local until they have been reviewed. Run the existing trace-replay analysis against each trace before incorporating it into a decision; category labels remain evidence labels and do not by themselves freeze audio thresholds or mappings. No owner visual choice is needed for this capture.

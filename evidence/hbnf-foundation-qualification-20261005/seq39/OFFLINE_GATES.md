# Seq39 Tail-Range Offline Gate

Status: PASS, offline gates complete; no device mutation has occurred.

- Exact firmware telemetry delta: `HBNF_TAIL_BIN_US` 100 → 250 microseconds. Histogram remains 512 bins; fixed memory and exact-max tracking are unchanged. Renderer, scheduler, audio, AUX, and production behavior are unchanged. The source assertion proves the candidate differs from the pinned seq37 Foundation source only in telemetry identity metadata, comment, and that constant.
- Exact candidate: `hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1`, SHA-256 `338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c`, 1,489,008 bytes. OTA slot 1,572,864 bytes; headroom 83,856 bytes (5.331%).
- Exact Release07 recovery companion SHA-256 `8e8db17786b178fc8fcd2cdf8a21512681ec7158941ee49ea255509970b1bcab`, 1,458,624 bytes.
- Local clean-room build used the existing pinned WLED 16.0.1/FastLED 3.10.4 closure. GitHub Actions was not used.
- Adapter, saturation persistence, source-diff, seq37/seq39 host-failure policy, offline threshold/recovery/evidence tooling, soak audit, syntax, transaction dry-run, platform doctor, and control status checks passed.
- This is a new artifact/instrumentation identity; the live transaction will measure observer effect exactly once on seq39. No other inherited R4/Packet20/golden/observer work is reopened.
- Durable package: [Drive ZIP](https://drive.google.com/file/d/1E0te1eJH6TCAmLHVQct5huZAToLI1fwq/view?usp=drivesdk).

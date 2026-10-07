# P2_VIBE_AUDIO offline checkpoint — 2026-10-06

## Boundary preserved
- Foundation seq43 soak was treated as a hard no-touch boundary.
- No Matrix/AUX/Opal request, OTA, reboot, state write, firmware build, hosted deploy, or live control-state mutation was performed by this lane.
- Work is isolated on `hbnf-cart2-p2-vibe-audio-20261006`.

## Authority read before work
- `config/HBNF_CONTROL_MODEL.json` blob: `9d97636f9e527a25f4e5ccd016c2ae99bf911cf1`
- `config/HBNF_CONTROL_STATE.json` blob: `cf77a324f4d1707ea0e0a060b5248a38a4de3392`
- Current seq43 candidate SHA-256: `338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c`
- Current same-morning Drive source map: `HBNF_OVERNIGHT_OFFLINE_FIELD_READINESS_20261006.md`, Drive ID `1kTb3o_qPvHTVh4hQReC-ga6kcI50VxSD`.

## Source conclusion
The qualified-candidate lineage already exposes the inputs and most derived signals needed for the proposed shared AudioFeatures layer:
- WLED AudioReactive existing 16-bin FFT, smoothed volume, and sample peak;
- current `Vibe16` low/mid/high grouping;
- current `AudioExpression` low/mid/high energy, transient, and slow-energy derivation;
- current `AudioFrame` pulses/bodies/energy fields;
- current source-coupled `AnimartrixAudioBridge`.

Therefore the Phase 2 production path should adapt the existing chain. It should **not** create a second FFT or a parallel realtime audio engine. Owner Motion remains authoritative.

## Offline deliverables
- `config/HBNF_P2_VIBE_AUDIO_CANDIDATE_V1.json`
  - all 13 candidate AudioFeatures semantics;
  - explicit mapping to existing source signals;
  - CHILL/GROOVE/HEAVY/PSYCHEDELIC/COSMIC candidate response grammars;
  - AUTO characteristic scoring with 45 s minimum dwell + hysteresis;
  - explicit NOT_FROZEN markers for numeric formulas/bin mapping/time constants/performance budget.
- `tools/hbnf_vibe_audio_replay.py`
  - host-only candidate semantic extractor;
  - Vibe consequence-vector replay;
  - AUTO selector; no network or hardware I/O.
- `tests/hbnf_vibe_audio_replay.py`
  - bounded feature/range checks;
  - silence/no-fake-activity;
  - low/high transient separation;
  - sustained-bass pressure vs transient decay;
  - loud-input anti-saturation;
  - pairwise manual-Vibe differentiation on palette-neutral response axes;
  - intent-specific Heavy/Groove/Cosmic/Psychedelic checks;
  - AUTO anti-churn;
  - complete source-adapter coverage and explicit no-second-FFT guard.

## Host result
Command:
`python3 -m py_compile tools/hbnf_vibe_audio_replay.py tests/hbnf_vibe_audio_replay.py && python3 tests/hbnf_vibe_audio_replay.py`

Result:
`PASS hbnf_vibe_audio_replay: 13 AudioFeatures semantics, six synthetic traces, pairwise Vibe differentiation, AUTO hysteresis`

Observed minimum pairwise response distances, acceptance floor 0.10:
- isolated kick: 0.1278 (CHILL/COSMIC)
- sustained bass: 0.1415 (CHILL/COSMIC)
- mid swell: 0.1310 (GROOVE/HEAVY)
- high transient burst: 0.1136 (GROOVE/HEAVY)
- steady broadband: 0.1324 (GROOVE/HEAVY)

Additional checks:
- isolated kick low transient peak: 1.0
- high-frequency burst high transient peak: 1.0
- sustained-bass final low pressure: 0.6661
- steady broadband features >0.95: 1

These are host/synthetic design checks, not physical aesthetic acceptance and not a frozen DSP formula.

## Exact dependency / stop point
Production Vibe/audio integration is intentionally blocked on:
1. completion of T2 Foundation qualification for the current seq43 lineage;
2. `P2_INTERFACE_FREEZE` for AudioFeatures and VibeSelection (this lane may not change shared interfaces);
3. preservation/replay of a qualified-source audio-observable trace so formulas/time constants can be judged against real input rather than synthetic-only traces;
4. the qualified Foundation frame/runtime budget, so any adapter cost can be checked before realtime integration.

Until those dependencies close, firmware/realtime mapping changes would either violate the current lane contract or contaminate Foundation qualification.

## Resume action
After the dependencies above close: replay the preserved real trace through this candidate, remove materially redundant features, freeze formulas/ranges/time constants, bind the five manual Vibes + AUTO to actual donor/render dimensions, run the acceptance corpus, then integrate once into the qualified source tree.

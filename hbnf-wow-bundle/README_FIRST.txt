HBNF MATRIX — WOW MAX V2 BUNDLE

Release: hbnf-wow-r3-max-2026-09-21-v2
Status: FINAL CANDIDATE — NOT FIELD-INSTALLED YET

Purpose: one bundled upgrade after R2 is frozen as the known-good rollback.

WOW MAX uses the existing WLED AudioReactive 16-bin FFT/microphone pipeline only. It does not add a second FFT or a second audio capture path. The local HBNF music engine derives bass, mid, treble, transient, pulse, energy, build, impact, and drop features from that existing stream.

The Course candidate contains 28 ANIMartRIX scenes (presets 61–88) under playlist 60:
- uniform 18-second holds
- 1.2-second transitions
- brightness 8 default
- durable AudioReactive inputLevel=255
- durable HBNFFlow disabled
- six music-response profiles: bass, mid, balanced, treble, full, impact
- six render styles: clean, punch, ring, spark, chroma, hybrid
- per-scene render amount
- semantic pixel-event animations: ACE, CTP, NICE SHOT, NICE PUTT, SKINS, GLOW

MoonModules-derived changes included only when bounded and source-audited:
- no-serpentine ANIMartRIX mapping option
- dimension-change reinitialization
- optional gamma post-processing hook
The documented unsafe long-runtime fmod approximation was explicitly NOT included.

Verified build gates:
- exact WLED 16.0.1 base commit 29b389df1c1aaec6ff53aea742d17063b985906c
- target ESP32 compile PASS
- OTA slot/headroom PASS
- second clean build byte-identical PASS
- host profile/render tests PASS
- six-hour deterministic music/render soak PASS
- package preflight/mock-installer/UI tests PASS
- ZIP integrity + Drive re-fetch SHA verification PASS

Production compatibility already staged:
- hbnf-matrix-control v132
- hbnf-cinematic-dispatcher v27
- hbnf-watch-control v7
- hbnf-watch-score v7
These remain backward-compatible with the current R2 controller state. False WOW adoption is refused until the device is actually running the verified WOW scene state.

Final package:
- Drive ID: 1TgXwOVb2jCId7mUxspaJYkL95Wm_FYq_
- File: HBNF_WOW_MAX_BUNDLE_2026-09-21.zip
- ZIP SHA256: 6143f52150346c8f98a52ec94dc2b5f4471c4669fecbd2ee9e0eaf2c84d2ecc0
- Size: 2,053,610 bytes

DO NOT INSTALL the older R3 v1 package (Drive ID 1LeFSGbiJPGiBUtiTlQQTGqQvU_EeDZZy).

Remaining physical acceptance gates only:
1. Run INSTALL_WOW_MAX.command once with explicit visible-reboot warning.
2. Perform one true >=5-second cold power cycle.
3. Complete one consolidated music/visual/event/overlay/network review.

R2 remains the exact rollback until all three gates pass.

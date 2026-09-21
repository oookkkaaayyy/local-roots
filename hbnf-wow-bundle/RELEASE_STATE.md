# HBNF Matrix WOW MAX V2 — final candidate checkpoint

Release: hbnf-wow-r3-max-2026-09-21-v2
Field status: NOT INSTALLED — current Matrix remains under R2 ownership.

## Firmware
- WLED base: 16.0.1 / 29b389df1c1aaec6ff53aea742d17063b985906c
- WOW MAX firmware SHA256: bbc9b3b15a024d291d355cc4c3d70c153821f3874884d0946a1b7687150a248a
- Firmware bytes: 1,356,704
- OTA headroom: 216,160 bytes
- Target compile: PASS
- Second clean compile byte-identical: PASS
- Six-hour deterministic 1,080,000-frame soak: PASS
- Existing AudioReactive FFT only; no second FFT/audio pipeline

## Visual/music engine
- 28 ANIMartRIX scenes, presets 61–88, playlist60
- 18 s holds / 1.2 s transitions / brightness8
- Profiles: bass, mid, balanced, treble, full, impact
- Derived features: band pulses, transient, energy, build, impact, drop
- Styles: clean, punch, ring, spark, chroma, hybrid
- Durable inputLevel255 + HBNFFlow disabled in every scene
- Safe MoonModules-derived mapping/dimension/gamma improvements included
- Unsafe documented fmod approximation excluded

## Semantic overlays
Pixel-event animations:
- ACE
- CTP
- NICE SHOT
- NICE PUTT
- SKINS
- GLOW

Automatic cinematic dispatcher routes ACE/compound-ACE and skin-win events to semantic pixel animations on R2/WOW revisions while retaining safe text handling for other event classes.

## Production compatibility
- hbnf-matrix-control v132
  SHA256 82193fbc8751dfaf8463b4008b4804eb1f759aacb1220e474b71cdd5be5b41d1
- hbnf-cinematic-dispatcher v27
  SHA256 98e73db93b4afab6d63aa917c3fd3a7c0e4ff4b30bdb2e4abb55d250003021dc
- hbnf-watch-control v8
  SHA256 777c43561d433c5c345ff3666b645c37df363e40ac61f8b96cad056e34232fb4
- hbnf-watch-score v8
- hbnf-matrix-ui v9 · hbnf-fallback-wow-max-v2 · SHA256 8076a0efd18792d444bd26fa1b555f846c1d83175403000fb0be3a24e5aa063c\n- Phone/PWA candidate marker: hbnf-build-9.21.26-wow-max-v2
- Phone/PWA regression: 29/29 PASS
- Six semantic event selftest: PASS\n- Watch control/score read-only self-tests: PASS\n- Adaptive fallback console GET/marker smoke test: PASS
- False WOW adoption on current R2: correctly REFUSED

## Final atomic package
- Drive ID: 1TgXwOVb2jCId7mUxspaJYkL95Wm_FYq_
- File: HBNF_WOW_MAX_BUNDLE_2026-09-21_FINAL.zip
- SHA256: 3ac3a63d627205e7f21443fa2456c8183e50ec9b76847ccaf4c697a5d4cfc2b4
- Size: 2,088,177 bytes
- Drive re-fetch hash: VERIFIED
- ZIP integrity: PASS

Superseded package:
- Older R3 v1 Drive ID 1LeFSGbiJPGiBUtiTlQQTGqQvU_EeDZZy
- MUST NOT be installed.

## Transaction safety
- Full package SHA256SUMS is verified before any controller mutation.
- Rollback pointer is written before any controller mutation.
- Pre-flash staging failure restores exact pre-install presets + prior boot defaults without flashing.
- Post-flash validation/adoption failure automatically restores exact pre-install presets/boot defaults and reflashes exact proven R2 when the controller remains reachable.
- Automatic R2 recovery path unit test: PASS

## Rollback
- Exact proven R2 firmware SHA256:
  e81adb8523cf3a875d3ce05962d538b7c6cf3f178bfeaf42833678b9c4cd5d10
- Installer creates exact pre-install filesystem/config/state backup.
- ROLLBACK_TO_R2.command restores pre-install presets plus exact R2 firmware and R2 backend adoption.

## Remaining unavoidable gates
1. One bundled install/OTA reboot.
2. One true >=5-second cold boot.
3. One consolidated visual/music/event/overlay/network review.

Until those pass, WOW MAX is a final candidate, not an accepted production release.

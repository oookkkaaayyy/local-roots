HBNF MATRIX — WOW R3 BUNDLE

Purpose: one bundled upgrade after R2 is frozen as the known-good rollback.

R3 adds a reusable 3-band music-response engine on top of the existing WLED AudioReactive FFT: bass-, mid-, treble-, full-spectrum-, and impact/build-oriented timewarp profiles. It does not add a second FFT or microphone pipeline.

The candidate library contains 28 ANIMartRIX looks at uniform 18-second holds. Each scene carries durable AudioReactive inputLevel=255 and HBNFFlow disabled. The WLED intensity field is intentionally used as an R3 audio-profile selector because the ANIMartRIX wrapper does not otherwise consume intensity.

Release goals:
- one firmware upgrade, not repeated firmware surgery per effect
- one scene manifest controlling effect/profile/speed/duration
- atomic backup/preflight/install/verify path
- preserve preset55 and every unrelated preset
- brightness 8 course default
- R2 remains the rollback
- later scene additions should be manifest/pack updates unless a new engine capability is actually needed

Do not promote to production until target compile, OTA-size/reproducibility gates, backend compatibility, package hashes, one true cold boot, and one consolidated visual/music review pass.

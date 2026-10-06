# Overnight offline field-readiness checkpoint — 2026-10-06

## Live Foundation transaction

Seq41 installed the exact Foundation-metrics candidate once. The tails-off setup and sacrificial warm-up completed. Forty-eight soak samples were preserved before the host sampler recorded a 24.114-second gap (limit 15 seconds), so no 90-minute soak pass exists. Preserved samples show zero restarts and no >=1000 ms frame. The raw firmware restore report has `restoreVerified=true`, snapshot ID 1/hash 3256860723. The endpoint omits the `packet20Same` alias; exact source sets `restoreVerified` to `packet20Same(packet20Saved, packet20Verify)`. The host's absent-field check was a false negative and caused seq42 to run despite a host-only gap. The source-bound host correction and regression test are now in the working tree; there is no new live authorization.

Seq42's exact Release07 artifact bytes (SHA `8e8db17786b178fc8fcd2cdf8a21512681ec7158941ee49ea255509970b1bcab`, 1,458,624 bytes) were verified at Opal before the single local OTA. Its HTTP response file is empty. A subsequent read-only GET from Opal reports exact Release07 runtime identity, a reset uptime, and AUX native WLED DDP live from Matrix. This proves runtime identity, not a direct on-device BIN readback. Current Matrix runtime identity: `hbnf-matrix-coordinated-v1-20261002-07`. Live mutation is closed; seq41/42 are consumed. Foundation remains unqualified.

Detailed evidence: `seq41/SEQ41_SEQ42_HOST_FAILURE_RECONCILIATION.md`, machine record `seq41/SEQ41_SEQ42_HOST_FAILURE_RECONCILIATION.json`, current read-only device capture `seq41/SEQ41_SEQ42_POST_RECOVERY_READONLY.json`.

## Tomorrow Skins owner path — staged, not deployed

The permanent owner scoring UI reads and updates the existing `league_state.state_json.skins.weeks[date]` cards. Front 9 is holes 1–9; back 9 is holes 10–18. Writes use updated-at compare-and-swap and per-hole expected-winner checks. A network-uncertain write is never blindly replayed: a confirmed write is reflected immediately then reread, while an ambiguous request tells the owner to refresh before retrying. The test covers stale concurrent edits, locks, winner validation, hole boundaries, and confirmed/uncertain network outcomes.

PWA packaging now includes the score module and all app icons referenced by HTML/manifest; manifest scope is limited to `/hbnf-cart.html`, cache-bust versions are present, and no service worker was introduced. A new local package-closure test confirms every referenced asset exists and all package paths include the score module/icons. The V7.3 controller is prepared offline; no hosted deploy occurred because Phase 2 is not authorized.

## Offline Vibe/text source map

The exact seq39 build overlay archive SHA-256 is `7beac2c97a38257da08d1128f4a01fb39c5f90ec0811b5da6cb5bdf9310192ce`. Its AudioReactive path uses the WLED usermod data at `u_data[2]` (16 FFT bytes), `u_data[0]` (smoothed volume), and `u_data[3]` (sample peak). `Vibe16` groups bins 0–3, 4–10, and 11–15; `AudioExpression` consumes the computed `VibeMetrics` and derives low/mid/high energy, transient, and slow-energy values without a second FFT. The central Foundation frame path passes those existing values to `AnimartrixAudioBridge.beginFrameFromAudio`. The shared AudioFeatures contract remains a candidate pending qualified-source replay; current app/backend labels `mellow/moderate/energetic/peak` do not yet implement the approved product set CHILL/GROOVE/HEAVY/PSYCHEDELIC/COSMIC/AUTO. No Vibe/audio implementation was frozen.

The current Foundation source contains a 3x5 glyph table. Command text/score overlays clear the 32x16 frame before drawing; that does not meet the Vibe-aware contract requiring the base Vibe to continue underneath. Existing historical WBF-font evidence is not present in this exact overlay closure. Reuse must be established after the Foundation source is qualified; no new font or firmware work was started.

## Locked low-brightness decision

**DEFER_FOR_STABILITY.** Current Matrix brightness is a literal linear 0–255 pixel scale and the owner slider sends the same value. A nonlinear owner mapping could be localized to the controller and unit-tested without changing firmware timing, but it changes real output/current and needs actual low-light readability/maximum-output confirmation. Foundation is still unqualified, the seq41/42 pair is consumed, and no field-live mutation is authorized. Preserve the currently stable physical/cart state for Skins; reconsider a staged mapping only after a safe post-Foundation physical check can be authorized.

## Exact source identities

- Foundation usermod: `31126d341bf0a3e54a33d87de0856c5f68e79f20dd05653ae1d5df3270a9bc9d` (`firmware/packet20/seq39-tail250/usermod_hbnf_foundation_v1.cpp`).
- Owner Skins scoring backend: `3babd73fcc09bd50dcb98332191280a7709d1734233fde8bbecdf0bc2855850a`.
- Owner Skins client: `0874b20d6e5a27e28cf99f47ce2c28c7948cb18ad9b411e3d0ee186a99349a3a`.
- Owner HTML: `6012f6a763e08157a2401a51581f2772808d492d38b9ae5425257dcf933e3cd6`.
- Owner PWA manifest: `f8040db1b96ffdd2aa716eb0ea48e3ee24f3d9e7badc736050e8f2e307a6444c`.
- Overlay headers: `{"hbnf_animartrix_audio_bridge.h": "8748231ccf7733bd34c16dc0417933a46d3a5bdccfc47c2bd54ce2e3fa104535", "hbnf_audio_expression.h": "f4825884dd53cba9bca698bd8b9b7d9d13a81e7ce381957d23790f13073dc4c3", "hbnf_coordinated_contract.h": "22d17d917db8d74ba141fbc1825fe1a637e7f3396208b5cf0c706f4c6c7ecbaa", "hbnf_foundation_core.h": "9f4a63546bc42cef6ce71edfc6bb055fca40f1b28b8e7595fd09b6da9b5acf5c", "hbnf_local_ui.h": "f83b4664efcac701ad50e9dfb69059903a97ce62c51603f79d1fa688734cbbc0", "hbnf_vibe16.h": "f076acf0e5710bf5a9acffe63b31a95f2252230b5470bd362301caa73a743b0a"}`.

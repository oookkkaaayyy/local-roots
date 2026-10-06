# HBNF Cart 2.0 — T3 / Phase 2 Fast-Path Packet — 2026-10-06

STATUS: **PREPARED / NOT APPROVED / NO T3 AUTHORITY / NO LIVE MUTATION**

Purpose: preassemble the exact post-Foundation T3 decision so a clean T2 PASS can move directly into Phase 2 without reopening product archaeology or re-running the four offline lanes.

This packet does **not** advance lifecycle, freeze interfaces, authorize deployment, or replace HBNF_CONTROL_MODEL.json / HBNF_CONTROL_STATE.json.

## 1. Inputs already prepared

### Mission Control / Skins scoring
- Branch: `hbnf-cart2-p2-mission-control-scoring-20261006-r2`
- Implementation: `eb2bb8f17b9dfce621e6aaeed4c7036acb541013`
- Handoff head: `e402caae482a33f1a5552858b9942468e20f80b6`
- Receipt: `evidence/hbnf-phase2-mission-control-scoring-20261006/OFFLINE_SCORING_LANE_RECEIPT.json`
- State: offline implementation complete; integration gated.

### Owner PWA / control reliability
- Source: `f7a9870e2a42b0fe005da0cb6c3849cce3fea9a9`
- Receipt: `evidence/hbnf-phase2-pwa-reliability-20261006/OWNER_PWA_V7_3_PWA_R1_OFFLINE_CHECKPOINT.json`
- Package: `HBNF_CART_UI_V7_3_SKINS_OWNER_PWA_R1_20261006.zip`
- SHA-256: `21cfee1b08ce122e86c703ff2060c3cdb3bcab2f544249822cc44dd2ef868d94`
- Drive: `1MvBkyIqJJa-9uC0n73NXEozn28frLm47`
- State: offline implementation complete; deployment/device smoke gated.

### Vibe / audio
- Branch/head: `hbnf-cart2-p2-vibe-audio-20261006 @ f0ae01712bfeb2f2afb5cb1dda1cf12a638abcf6`
- Receipt: `evidence/hbnf-phase2-vibe-audio-20261006/OFFLINE_PREP_RECEIPT.json`
- State: offline prep complete; production mapping waits on qualified-source replay/runtime budget.

### Premium text / moments
- Branch/head: `hbnf-p2-text-moments-offline-20261006 @ 2bbe7ca5c244986c57d4d6f054ebcdfe6337b362`
- Receipt: `evidence/hbnf-phase2-text-moments-20261006/OFFLINE_COMPLETION_RECEIPT.json`
- State: offline prep complete; renderer integration waits on interface freeze / qualified source.

## 2. Recommended T3 scope lock

### COMMIT
- Owner Mission Control + authoritative Skins scoring/control.
- Owner PWA/control reliability.
- Vibe/audio core.
- Premium **owner** text/moments.
- Matrix/AUX core runtime/recovery.
- Low-brightness fidelity/granularity requirement already locked in Cart 2.0 scope.

### COMMIT — manual Vibes
- CHILL
- GROOVE
- HEAVY
- PSYCHEDELIC
- COSMIC

### CONDITIONAL COMMIT
- AUTO Vibe: include only if qualified-source replay confirms stable hysteresis/non-flapping behavior and acceptable runtime cost.

### PRESERVE BUT DEFER FROM CORE ACCEPTANCE
- AUX UV expansion.
- Arcade.
- IRL games.
- Guest platform.
- Guest-entered short text/moments.
- Physical gamepad support.

These items remain Cart 2.0 expansion scope and are not silently deleted.

## 3. Recommended interface freeze

### Scoring / control boundary
Reuse the existing authoritative structure:
- `league_state.state_json.skins.weeks[date]`
- F9 Singles = holes 1–9.
- B9 Doubles = holes 10–18.
- tiebreaker = `winners.tb`.
- ace state = section `aceWinner` + canonical ace-pot readback.
- mutations require paired-owner authorization, expected-value / `updated_at` CAS protection, and authoritative reread after save.

No second scoring system.

### Owner control transport
Freeze the **semantic control contract**, not a transport-specific UI implementation:
- one desired/confirmed state model;
- local cart-LAN direct path when reachable;
- authenticated remote relay when off-LAN/remote;
- fail closed if neither path is available;
- app shell may cache, but mutation/API/device authority never comes from stale cache.

The exact local relay binding remains an implementation task against the qualified Foundation.

### AudioFeatures
Freeze these 13 semantic names/meanings:
- `energy_short`, `energy_medium`, `energy_slow`
- `low_pressure`, `low_transient`
- `mid_body`, `mid_change`
- `high_detail`, `high_transient`
- `spectral_brightness`, `spectral_change`
- `activity`, `silence_confidence`

Direction:
- reuse existing WLED AudioReactive → Vibe16 → AudioExpression → AudioFrame lineage;
- no second FFT by default;
- freeze numeric formulas/smoothing/thresholds only after qualified-source real-audio replay and runtime-cost acceptance.

### VibeSelection
Values:
- CHILL
- GROOVE
- HEAVY
- PSYCHEDELIC
- COSMIC
- AUTO

Rules:
- manual owner selection overrides AUTO;
- AUTO is local-only and hysteretic;
- Motion remains owner-authoritative;
- no genre-recognition claim.

### VisualMoment
Freeze the shared semantic shape:
- `type`
- `primary_text`
- `secondary_text`
- `value`
- `duration`
- `urgency`
- `allow_audio_accent`
- `return_behavior`

Presentation contract:
- stable glyph geometry during readable hold;
- Vibe-aware entry/hold/exit;
- phrase paging before scrolling;
- marquee only as last resort;
- exact return-to-base-state where required.

### HealthState
Minimum owner-facing semantics:
- Matrix: OK / DEGRADED / OFFLINE.
- AUX: OK / DEGRADED / OFFLINE.
- Cart LAN: OK / DEGRADED.
- Internet: OPTIONAL / AVAILABLE / UNAVAILABLE.
- release identity.
- restart/reconnect warning.
- safe actionable recovery hint.

Health remains human-readable; raw diagnostics stay out of normal LIVE use.

## 4. Lane plan immediately after T3

1. Create one integration branch from the **then-current authoritative head**.
2. Integrate PWA reliability first.
3. Apply the isolated six-file scoring diff onto that head; preserve all newer PWA changes.
4. Run host/package closure before deployment.
5. Replay qualified-source real audio through the 13-feature adapter; then freeze numeric Vibe/audio tuning if runtime/differentiation evidence passes.
6. Recover/bind the qualified-source WBF/font primitive and integrate the Text/Moment framebuffer compositor; verify runtime/current cost.
7. Implement brightness-quality correction only as a bounded output/perceptual mapping unless evidence requires broader invalidation.
8. Build **one integrated Phase 2 candidate**, avoiding unnecessary serial live flashes.
9. Run intended-owner iPad/iPhone Home Screen scoring/control smoke, Matrix/AUX coherence, Vibe/audio physical acceptance, text readability/aesthetic acceptance, and recovery checks.
10. Advance to RELEASE_CANDIDATE only after committed core features and integration smokes pass.

## 5. Core acceptance lock

### Hard owner go/no-go
- Authoritative Skins scoring works end-to-end on the intended owner device.
- Owner can reliably control Matrix/AUX/system with confirmed state and **no Mac/Terminal** during normal round use.

### PWA
- Home Screen launch/relaunch survives lock/wake and temporary network loss without blank screen.
- Pairing persistence works as designed.
- Stale cache never supplies control/API authority.
- Reconnect/resync resolves to understandable confirmed state.

### Vibe/audio
- Five manual Vibes remain materially distinct beyond palette alone.
- Bass/mid/high influence meaningfully different artistic dimensions.
- Motion remains authoritative.
- Qualified-source real-audio replay and adapter cost fit the qualified Foundation budget.

### Text/moments
- Short text readable at actual cart viewing distance.
- Glyph geometry stable during readable hold.
- Underlying Vibe remains coherent/reactive.
- Phrase paging before marquee.
- Human aesthetic acceptance is mandatory.

### Brightness
- Low-night brightness preserves materially the same scene structure/pixel participation aside from unavoidable quantization.
- Low-end control is meaningfully more granular.
- True maximum remains reachable.
- No material runtime/AUX/control regression.

### Global non-regression
Preserve:
- Matrix/AUX coherence;
- boot/reconnect behavior;
- OTA/recovery behavior;
- iPad compatibility;
- no new realtime cloud dependency;
- no material frame-pacing/control-latency regression;
- no unexplained heap/flash regression.

## 6. The post-T2 human approval turn

When T2 Foundation is objectively PASS, the user should need only one short approval decision:

> Approve the prepared T3 core scope/interface/acceptance packet: five manual Vibes committed; AUTO conditional on qualified replay; owner text/moments committed; Guest/Arcade/IRL/UV/gamepad expansion deferred but preserved; owner control uses the local-first desired/confirmed semantic contract with remote relay fallback; proceed into PHASE2_INTEGRATING.

If T2 evidence invalidates any premise above, do **not** ask for blanket approval; surface only the changed premise and evidence.

## 7. Current gate

T3 cannot execute until:
1. T2 Foundation is objectively qualified.
2. The packet is reconciled against the exact then-current authoritative head.
3. Required human approval is given.
4. A `phase2_scope_lock` receipt records all four T3 checks PASS.

Until then this document is preparation only.

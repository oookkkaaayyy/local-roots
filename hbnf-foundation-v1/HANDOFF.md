# HBNF Foundation Rebuild V1 — Durable Handoff

Status: design/research branch only. Production must remain untouched until acceptance gates pass.

## Why this exists

The current cart is functional enough as a rollback state but is NOT an accepted long-term foundation. The user explicitly rejected it as muddy, laggy, weakly causal, and increasingly guess-and-hope across the whole stack: audio response, Matrix rendering, AUX synchronization, controls, brightness/power semantics, state confirmation, and cloud latency.

Do not continue the old patch-on-patch approach. Rebuild the foundation in isolation.

## Current production rollback state

Hardware:
- Matrix: 32x16, 512 LEDs, ESP32/WLED.
- AUX underglow: SP803E ESP32, 22 logical groups around cart.
- Physical AUX geometry: 5 / 6 / 5 / 6 groups.
- AUX current ceiling: 1210 mA.
- AUX color order: BRG.
- Home-LAN addresses used during commissioning: Matrix 192.168.68.82, AUX 192.168.68.77.

Installed firmware:
- Matrix witness: registry28-tempo-lock-v9-network-no-starve
- AUX witness: registry28-tempo-lock-1d-v6-network-no-starve
- Matrix firmware SHA-256: 5b42b1b7e2a5b08860becd0fe0563bb312731a854fcabbb55102f0aa3f930ed6
- AUX firmware SHA-256: 152a795c6dcc5ea396687aee29d15a3e569dd15becfa6537b347e51a09e54e95

Latest backend:
- hbnf-cart-control v16
- hbnf-cart-reconcile v10
- hbnf-aux-adapter v8
- hbnf-matrix-adapter-v4 v6
- V7.2 Course Safe static controller
- Main controller: https://hbnightflyers.com/hbnf-cart.html

The installed no-starve pair passed sustained local frame-advance verification, but physical acceptance was NOT granted. Matrix/AUX color/rhythm correlation remained only passable, audio response felt less crisp, and controls did not feel authoritative.

## Clean rebuild branch

Repository: oookkkaaayyy/local-roots
Production/integration branch: hbnf-prephase2-final-integration-20260927
Rebuild branch: hbnf-foundation-rebuild-v1-20260927
Branch creation base: b76903cf63be497e9ef855c641a12916eff7149f

Full external handoff backup:
Google Drive file ID: 1fCRWpJD4gvchgCr_jY2hEosmsTBNXW4D
Title: HBNF_FOUNDATION_REBUILD_HANDOFF_20260927.md

## Root problems in the current architecture

1. Too many translation layers between user intent and LEDs.
2. Custom adaptive DSP is layered on top of WLED AudioReactive and can make the same musical event behave differently depending on prior audio context.
3. The novelty engine randomizes too many dimensions simultaneously, weakening stable scene identity.
4. Custom HBNP transport/discovery duplicated native WLED networking and accumulated failure modes.
5. AUX owns too much logic while also acting as follower.
6. Supabase/MQTT is too close to the physical control loop.
7. Sampling/averaging a completed 32x16 Matrix image into 22 AUX pixels is inherently lossy and perceptually weak.

## Evidence-based architecture decisions

### Native WLED DDP for Matrix to AUX

WLED implements BusNetwork and TYPE_NET_DDP_RGB as a first-class DDP RGB network bus. Network buses participate in normal WLED pixel start/length semantics and use WLED realtimeBroadcast() for DDP output.

Primary source files:
- https://github.com/wled/WLED/blob/main/wled00/bus_manager.cpp
- https://github.com/wled/WLED/blob/main/wled00/bus_manager.h
- https://github.com/wled/WLED/blob/main/wled00/udp.cpp

Decision:
- Remove custom HBNP transport/discovery from V1.
- Matrix owns a WLED-native 22-pixel DDP output targeted to AUX.
- Use unicast on the dedicated cart LAN.
- Give AUX a stable address via DHCP reservation/static LAN identity.

### Wi-Fi power saving off

Espressif documents that modem sleep adds packet latency and WIFI_PS_NONE minimizes realtime receive delay.

Source:
- https://docs.espressif.com/projects/esp-idf/en/release-v5.1/esp32/api-guides/wifi.html

Decision:
- Wi-Fi sleep OFF on Matrix and AUX.
- Cart LAN is authoritative for realtime traffic.
- Hotspot/internet is optional uplink only.

### One audio engine: WLED AudioReactive on Matrix

WLED AudioReactive already provides I2S capture, 512-sample FFT, 16 GEQ channels, noise gating/squelch, gain, optional AGC, peak detection, and processed/smoothed frequency values.

Sources:
- https://github.com/wled/WLED/blob/main/usermods/audioreactive/audio_reactive.cpp
- https://github.com/wled/WLED-Docs/blob/main/docs/advanced/audio-reactive.md

Decision:
- Matrix is the only microphone/FFT/audio-analysis node.
- AUX has no HBNF audio interpretation while linked.
- Consume WLED processed 16-channel signal directly.
- Do not layer the old slowly adapting long-term novelty normalizer/shared-budget DSP on top.
- Initial commissioning should use documented squelch/gain procedure with AGC OFF for deterministic response.

### One canonical state drives both fixtures

Matrix computes one canonical AudioFrame and one canonical VisualState per render frame.
- 32x16 Matrix renderer consumes that state.
- Dedicated 22-pixel Companion renderer consumes the same state.
- Companion is rendered for the physical 5/6/5/6 topology.
- Companion is NOT sampled or averaged from the finished Matrix framebuffer.
- DDP sends the exact companion pixels to AUX.

### Local-first controller

Long-term physical path:
phone/browser -> cart LAN -> Matrix directly

Cloud path:
local Matrix state -> asynchronous Supabase persistence/status

Supabase must not sit in the live control loop. Hotspot/cloud loss must not affect local scene, audio, brightness, or motion controls.

### Minimal AUX linked mode

AUX normal linked role:
- DDP receive
- physical LED output
- minimal management/recovery

Remove/disable normal linked ownership of:
- HBNF audio
- HBNF generator
- custom HBNP
- HBNF MQTT live control
- unnecessary notifier/audio-sync interfaces

## Canonical control contract

Controls must be direct, monotonic, and measurable:
- Matrix brightness 0..100 -> Matrix output scale 0..1
- AUX brightness 0..100 -> Companion output scale 0..1
- Motion 0..100 -> one explicit animation time-scale mapping
- Audio response 0..100 -> one explicit modulation-depth mapping
- Variation 0..100 -> one explicit evolution interval/range
- Scene selects a curated renderer family/config and does NOT silently remap other controls
- Advanced mic controls map to WLED-native gain/squelch/AGC only

Remove hidden vibe categories, responseBoost indirection, multiple speed-bias translations, and device-specific reinterpretation.

## Audio contract

Use WLED processed fftResult[16].

Initial fixed band groups:
- Low: 0..3
- Mid: 4..10
- High: 11..15

Requirements:
- Same AudioFrame + same state => deterministic render.
- Raising Audio Response cannot reduce modulation for the same AudioFrame.
- Raising Motion cannot reduce phase velocity for the same state.
- Brightness 0 produces exact black before transport.
- Matrix and Companion use the same frame sequence/timebase.
- Any extra attack/release envelope must use explicit fixed constants and host tests.

## Visual contract

Novelty is subordinate to coherence.
- Curate fewer strong renderer families.
- Give each named scene a stable visual language.
- Vary one or two dimensions at a time.
- Keep palette, phase, direction and musical accents coherent across Matrix and Companion.
- Anti-repeat must not destroy scene identity.

Do not optimize for thousands of unique signatures if the result feels random or generic.

## Acceptance gates before any production flash

1. Host tests prove all control mappings monotonic and bounded.
2. Synthetic/recorded AudioFrame tests prove low/mid/high are distinct and deterministic.
3. Same canonical state deterministically produces Matrix and Companion frames.
4. Companion is directly rendered, never sampled from completed Matrix pixels.
5. WLED-native DDP is used; no custom pixel transport remains in V1.
6. Wi-Fi sleep disabled on Matrix and AUX.
7. AUX linked mode owns no HBNF audio/generator state.
8. Local controls work with internet/Supabase unavailable.
9. 10-minute soak: no stalled frames, state drift, or brightness/off disagreement.
10. Only then build a guarded installer with the current V9/V6 production pair embedded as rollback.

## Not completed yet

At the time of this handoff:
- No V1 clean-core implementation exists yet.
- No DDP bus config has been committed yet.
- No local Matrix controller endpoint/UI exists yet.
- No deterministic replacement audio renderer exists yet.
- No dedicated Companion renderer exists yet.
- No V1 host test suite exists yet.
- No V1 firmware has been built or flashed.
- Production has not been migrated.

## Exact next steps

1. Finish source-level feasibility audit for WLED DDP bus + existing Matrix/AUX hardware.
2. Define smallest C++ ControlState, AudioFrame and VisualState.
3. Implement direct monotonic control mappings + host tests.
4. Implement WLED AudioReactive adapter with no second long-term normalizer.
5. Implement dedicated 22-pixel Companion renderer from same VisualState.
6. Configure Companion output through WLED-native DDP unicast.
7. Reduce AUX linked mode to DDP receiver/output.
8. Add local Matrix controller routes/UI; Supabase becomes asynchronous.
9. Add deterministic tests and 10-minute soak simulation.
10. Build guarded migration package with current production firmware as rollback.
11. Perform staged physical acceptance.
12. Do NOT begin router/games/UV Phase 2 until foundation is explicitly accepted.

Priority: crisp causality, low latency, stable sync, strong musical response, and a coherent impressive visual system.


## Critical development-operations constraints

GitHub Actions usage is near the included monthly limit. The user received an alert at approximately 1,802 / 2,000 included Actions minutes with reset on 2026-10-01 and explicitly requires that NO additional GitHub Actions charges ever occur without prior explicit approval.

Development policy:
- Use local/host tests during iteration.
- Do not trigger Actions for each small commit.
- Batch changes.
- Run cloud Actions only for a deliberately selected release/hardware artifact or when a required check cannot reasonably be reproduced locally.
- Avoid workflow-failure notification spam.
- Do not change billing/spending settings on the user's behalf.

Power-scope constraint:
- Do not introduce new batteries/master-power hardware during this foundation rebuild. A future single physical master-switch architecture remains desired but is intentionally deferred until the lighting/software foundation is stable.

# HBNF Coordinated Firmware Contract — 2026-10-01

This is the exact firmware-side contract for the next Matrix candidate. It must be implemented on the accepted Audio V1.1 source lineage; do not rebuild the visual/audio engine.

## Preserve unchanged
- WLED 16.0.1 base.
- 32×16 Matrix = 512 LEDs.
- Companion/AUX logical segment = LEDs 512–533 inclusive, segment id 1, fx 142.
- Matrix remains the visual/audio master.
- AUX remains the Matrix-owned DDP follower.
- Existing accepted continuous slew-limited animation clock.
- Audio never resets oscillator phase/time.
- Existing source-coupled AudioReactive input; no second FFT.
- Existing Motion and Audio Response semantics.
- Existing 28 curated ANIMartRIX effects / show behavior.
- Existing independent Matrix/AUX brightness semantics.
- Existing no-login local /hbnf behavior.

## Existing HBNF JSON contract
The Foundation adapter already sends:
```json
{
  "HBNF": {
    "scene": "course-flow|field-mix|hbnf-signature|quiet-cosmos",
    "motion": 0,
    "audioResponse": 0,
    "matrixBrightness": 0,
    "auxBrightness": 0
  }
}
```

The coordinated candidate adds two backward-compatible optional fields only:
```json
{
  "HBNF": {
    "palette": {},
    "overlay": {}
  }
}
```

Unknown/missing new fields must leave accepted V1.1 behavior unchanged.

## Canonical palette
Adapter-normalized palette forms:

WLED palette:
```json
{"mode":"wled","index":0}
```
- index is 0–255.
- Change color source only.
- Do not change animation effect, phase, speed, audio mapping, Motion, Audio Response, Matrix brightness, or AUX brightness.
- Apply the same visual color direction to Matrix and AUX.

Solid color:
```json
{"mode":"solid","rgb":[255,255,255]}
```
- RGB channels are 0–255.
- Use this as the base color source for both Matrix and AUX while preserving the current animation/timing/audio structure.

Legacy compatibility:
```json
{"mode":"legacy","id":"hbnf-balanced|copper|ocean"}
```
- Do not invent a new visual mapping.
- Preserve current accepted color behavior until the user selects a new canonical palette/solid color.

## Canonical overlay
No overlay:
```json
"overlay": null
```

Manual text:
```json
{
  "id":"unique-command-id",
  "kind":"text",
  "ttlMs":8000,
  "text":"MESSAGE",
  "color":"#FFFFFF"
}
```

Scoreboard:
```json
{
  "id":"unique-command-id",
  "kind":"scoreboard",
  "ttlMs":22000,
  "label":"F9|B9|GLOW|SCORES",
  "entries":["PLAYER -2","PLAYER E"]
}
```

Overlay rules:
1. A new overlay id starts the overlay timer.
2. Re-receiving the SAME overlay id must not restart the timer.
3. ttlMs is bounded by the adapter to 250–30000 ms.
4. Overlay is Matrix-only and visually exclusive over an opaque black Matrix background.
5. AUX continues the CURRENT base visual/color/brightness while the Matrix overlay is active.
6. The base Matrix animation clock continues underneath; do not reset phase/time.
7. Any canonical base-state update received during an overlay updates the hidden/current base state immediately.
8. At expiry, return to the CURRENT base state, never a pre-overlay snapshot.
9. `on:false` clears any overlay immediately.
10. A replacement overlay id preempts the prior overlay cleanly.
11. Invalid overlay data fails closed to normal base rendering; it must not crash/reboot the device.

## Local UI contract
The firmware-hosted /hbnf must include:
- current accepted core controls
- show selection
- palette + solid color
- named saved looks
- Motion
- Audio Response
- manual text
- Skins/Glow live status
- scoreboard
- ace pot
- signed OTA status/check/install handoff/result
- rollout preflight

The browser must not POST base-state mutations directly to /json/state. Base visual mutations go through canonical hbnf-cart-control.

## Build identity endpoint
Add a read-only local endpoint:
`/hbnf/build.json`

Minimum response:
```json
{
  "schema":"hbnf-build-v1",
  "candidate":"<candidate-id>",
  "basedOnReleaseId":"hbnf-matrix-v1-1-current-20260930",
  "basedOnFirmwareSha256":"0aeb668e58cad3bae5b636fdc79573a263c3d0e911903ed48af0bbc2e5681f61",
  "wled":"16.0.1",
  "features":["canonical-palette-v1","canonical-overlay-v1","coordinated-ui-v1"]
}
```

The candidate/release pipeline may inject an additional immutable build id. The endpoint is read-only and must not expose secrets.

## Acceptance invariants
- No new animation discontinuity.
- No second FFT/audio-analysis pipeline.
- No global-tempo change from cough/clap/transient.
- Matrix/AUX brightness remain independently persistent.
- Palette/color never overwrite brightness.
- Overlay never overwrites canonical base state.
- Overlay expiry restores current state.
- OFF remains immediate and persistent.
- DDP follower remains synchronized.
- Existing Audio V1.1 visual quality must not regress.

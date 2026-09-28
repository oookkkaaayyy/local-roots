# HBNF Foundation V1

## Goal

Replace the accumulated cart-control stack with a smaller system that is deterministic, locally responsive, testable and physically coherent.

## Live path

Phone / iPad
  -> local router
  -> Matrix ESP32 WebSocket
  -> canonical control state
  -> WLED AudioReactive input
  -> canonical frame state
  -> Matrix renderer
  -> AUX companion renderer
  -> LED buses

No Supabase, MQTT, cross-controller reconciliation or network pixel projection exists in the primary live path.

## Cloud path

Matrix ESP32 / local controller
  -> asynchronous state snapshot
  -> Supabase

Cloud failure must not alter active rendering or control.

## Canonical frame

A frame contains:
- scene id
- monotonic frame number
- monotonic phase
- palette id/colors
- direct AudioReactive bands
- direct peak/volume signal
- exact user control values

Both Matrix and AUX render from this same object.

## Rendering rule

The AUX output is a companion composition, not a sampled/downscaled Matrix image.

Reason:
sampling/averaging a dense 32x16 render destroys transients and can produce a color that is mathematically present but perceptually unrelated.

Instead:
- Matrix and AUX use the same palette
- same phase
- same audio bands
- same structural event clock
- AUX uses a geometry-specific 22-pixel composition built for the cart perimeter

## Failure behavior

- If audio is unavailable: renderer continues visually, audio modulation = 0.
- If cloud is unavailable: no change.
- If local controller UI disconnects: current state continues.
- No legacy renderer fallback.
- No second independent AUX generator.
- No stale network frame replay.

## Production migration

Production remains on the current rollback-safe build until Foundation V1 passes:
1. host tests
2. WLED build tests
3. bench test
4. side-by-side physical comparison
5. explicit user acceptance

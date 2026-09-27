# HBNF Visual Lab

Standalone staging UI for the Phase 2 cart visual-control redesign.

## Current behavior

- No network calls.
- No production commands.
- Runs against an in-browser mock renderer.
- Demonstrates semantic controls, Matrix/AUX previews, audio telemetry, and requested-vs-confirmed state.

## Why standalone

The active renderer/scene branch is still changing. Keeping this UI isolated lets the operator experience and state contract stabilize without touching firmware, Matrix/AUX adapters, or the active scene overhaul.

## Integration point

After the final renderer commit is accepted, replace the mock adapter in `app.js` with a thin adapter that:

1. reads canonical cart status,
2. reads renderer telemetry / preview samples,
3. sends supported semantic commands through the paired canonical controller,
4. waits for Matrix and AUX confirmation,
5. updates confirmed state independently for each device.

Do not wire unsupported fields by pretending existing WLED parameters are equivalent.

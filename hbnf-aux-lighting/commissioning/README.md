# HBNF Aux Commissioning — guarded underglow-first path

This directory commissions the Rogue Iron cart SP803E safely from stock WLED through the proven HBNF AUX firmware and the real 12V WS2811 underglow.

## Current hardware truth

- SP803E: ESP32, 5–24V controller.
- Underglow: 12V WS2811, DATA on GPIO16.
- Installed UV: **5V USB**, not 12V.
- Therefore the SP803E's 12V VCC/PWM outputs are **not** used for the UV strip in the current commissioning plan.
- GPIO25/26/27 remain unused until a separate 5V switching interface is verified.

## Preferred entry point

Double-click `COMMISSION_HBNF_AUX.command`.

The launcher:
1. verifies the frozen package and target identity;
2. talks to local WLED devices without system/environment HTTP proxies;
3. backs up AUX before mutation;
4. installs the exact firmware using valid multipart OTA framing;
5. allows AUX-only firmware/hardware phases even when Matrix is offline;
6. calibrates the real WS2811 color order at low current;
7. applies a one-bus GPIO16 underglow plan with rollback and fail-dark boot;
8. requires Matrix only for Matrix→AUX visual/audio sync;
9. records underglow physical acceptance separately from the still-pending UV architecture.

## Proven firmware

- Release: `hbnf-wow-aux-r3-2026-09-22-v1`
- Engine/witness: `aux-r3-wow-1d` / `registry28-fixed-1d-v1`
- Projection: `fold2-1d-v1`
- Effects: fixed IDs 220–247
- Firmware SHA-256: `2a70872fd2373a8ecdcd98c8c73c2e8d871dc902c92599f85081895fe98f744e`
- Firmware bytes: 1,342,288

## Safety boundary

The software never treats the 5V UV strip as a 12V PWM load. Full AUX/Supabase acceptance remains closed until an electrically verified 5V UV switching design is installed and its physical tests pass.

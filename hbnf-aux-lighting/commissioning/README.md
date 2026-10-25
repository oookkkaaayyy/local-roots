# HBNF Aux Commissioning — guarded underglow-first path

This directory commissions the Rogue Iron cart SP803E safely from stock WLED through the proven HBNF AUX firmware and the real 12V WS2811 underglow.

## Current hardware truth

- SP803E: ESP32, 5–24V controller.
- Underglow: 12V WS2811, DATA on GPIO16.
- Owner's 2026-10-25 hardware report identifies both current UV loads as iNextStation 5V USB-A strips: RIM/Main about 6–6.6 ft and SHORT about 12–13 in (a shortened strip). They remain standalone on power banks and are not connected to the SP803E or the off-Cart switching module. Voltage/model are owner-reported; current draw and channel mapping are unmeasured.
- Do not infer that the SP803E PWM outputs are a safe driver for either UV load. Verify each load's actual rating and switching path, including boot/restart OFF behavior, before use.
- GPIO25/26/27 remain unused until the exact channel mapping and electrical path are verified.

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

- Release: `hbnf-wow-aux-r3-2026-10-25-uv-follow-v1`
- Engine/witness: `aux-r3-wow-1d` / `registry28-tempo-lock-1d-v7-network-no-starve-uv-follow`
- Projection: `fold2-1d-v1`
- Effects: fixed IDs 220–247
- Firmware SHA-256: `2a70872fd2373a8ecdcd98c8c73c2e8d871dc902c92599f85081895fe98f744e`
- Firmware bytes: 1,342,288

## Safety boundary

UV readiness remains closed until each load's voltage/current, switching path, channel mapping, protection, and physical OFF behavior are verified. It also requires the existing UV-specific Main, Short, full-load, thermal, and mixed-load commissioning checks; passing only the underglow setup no longer opens UV control. Both reported 5V strip ratings are recorded in source, but supply/current limits and the proposed external-5V/shared-ground PWM-return topology are unverified. The SP803E manual documents direct wiring with the strip positive on VCC and says input voltage should match the strip. It does not establish whether the exact board's PWM FETs can safely sink an externally powered 5V strip while the controller runs at 12V. No public board schematic/topology confirmation was found; compatibility remains UNKNOWN. Keep the proposed path disconnected until the exact return/common-ground behavior, current ratings, backfeed behavior, and power budget are verified.

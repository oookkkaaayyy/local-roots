# HBNF Aux Commissioning — guarded underglow-first path

This directory commissions the Rogue Iron cart SP803E safely from stock WLED through the proven HBNF AUX firmware and the real 12V WS2811 underglow.

## Current hardware truth

- SP803E: ESP32, 5–24V controller.
- Underglow: 12V WS2811, DATA on GPIO16.
- Owner's 2026-10-25 hardware report identifies both current UV loads as iNextStation 5V USB-A strips: RIM/Main about 6–6.6 ft and SHORT about 12–13 in (a shortened strip). They remain standalone on power banks and are not connected to the SP803E or the off-Cart switching module. Voltage/model are owner-reported; current draw and channel mapping are unmeasured.
- Do not infer that the SP803E PWM outputs are a safe driver for either UV load. Verify each load's actual rating and switching path, including boot/restart OFF behavior, before use.
- GPIO25/26/27 remain unused until the exact channel mapping and electrical path are verified.

## Owner PWA baseline (separate from AUX firmware)

The latest direct Opal readback recorded for this work is Owner PWA **v1.0.13**, with all 17 served assets matching its saved manifest (GitHub #116 comment 6394889462). The pasted SSH transcript showing v1.0.12 is an older snapshot and is superseded; v1.0.12 is retained as the rollback package, not the current installed version. This PR changes AUX firmware/source and did not change the Owner PWA. Recheck the PWA version only after a later PWA installation or a newer direct runtime readback.

## Preferred entry point

Double-click `COMMISSION_HBNF_AUX.command`.

The launcher:
1. verifies the frozen package and target identity;
2. talks to local WLED devices without system/environment HTTP proxies;
3. saves a WLED configuration/state/preset snapshot before any permitted change (this is not a firmware image or rollback);
4. refuses firmware OTA while the source-bound release admission is REVIEW ONLY;
5. allows AUX-only hardware phases when Matrix is offline; firmware OTA requires a separately admitted exact rollback;
6. calibrates the real WS2811 color order at low current;
7. applies a one-bus GPIO16 underglow plan with rollback and fail-dark boot;
8. requires Matrix only for Matrix→AUX visual/audio sync;
9. records underglow physical acceptance separately from the still-pending UV architecture.

## Proven firmware

- Release: `hbnf-wow-aux-r3-2026-10-25-uv-follow-v1`
- Engine/witness: `aux-r3-wow-1d` / `registry28-tempo-lock-1d-v7-network-no-starve-uv-follow`
- Projection: `fold2-1d-v1`
- Effects: fixed IDs 220–247
- Firmware SHA-256: `178c070defcd080ce2acd3ef83acb9a8b31d2aebd4fa1ec1ad37fafd44191d0d`
- Firmware bytes: 1,348,784

The current package disposition is **REVIEW ONLY** because the exact installed firmware rollback is missing. `RELEASE_ADMISSION.json` binds the disposition to the build's exact source commit and firmware hash. The ordinary WLED HTTP backup contains settings and presets, not the firmware image.

## Safety boundary

UV readiness remains closed until each load's voltage/current, switching path, channel mapping, protection, and physical OFF behavior are verified. It also requires the existing UV-specific Main, Short, full-load, thermal, and mixed-load commissioning checks; passing only the underglow setup no longer opens UV control. Both reported 5V strip ratings are recorded in source, but their currents and supply limits remain unmeasured. The SP803E manual documents direct wiring with the strip positive on VCC and says input voltage should match the strip. It does not establish whether the exact board's PWM FETs can safely sink an externally powered 5V strip while the controller runs at 12V. No public board schematic/topology confirmation was found; compatibility remains UNKNOWN. Amazon's current listing for proposed buck ASIN B0F1F71F2B identifies the 5V/5A (25W) option; the 10A option has a different ASIN, and the installed unit's continuous rating is not independently confirmed. Keep the proposed path disconnected until the exact return/common-ground behavior, ratings, backfeed behavior, and power budget are verified.

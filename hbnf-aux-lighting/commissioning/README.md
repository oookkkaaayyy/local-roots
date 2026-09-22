# HBNF Aux Commissioning — turnkey guarded path

This directory is the final guarded commissioning path for the Rogue Iron cart SP803E underglow + UV node after physical wiring exists.

## Preferred entry point

Double-click `COMMISSION_HBNF_AUX.command`.

The launcher invokes `commission_guard.py`, which is read-only until exact controller identities are proven and the user explicitly types `YES` for a mutation phase. It is designed to be rerun after interruption: current device state plus `HBNF_AUX_ACCEPTANCE_EVIDENCE.json` determine the first unfinished stage.

### It now handles

1. frozen-package verification;
2. Matrix/AUX discovery from exact runtime identity using the Mac's actual interface subnet rather than a fixed /24 assumption;
3. fresh Matrix/AUX backups;
4. exact AUX OTA with Matrix-target refusal, ESP32 gate, 4 MB flash gate, exact firmware hash/size gate and reboot verification;
5. actual WS2811 logical-group count input;
6. low-current RGB calibration that derives the strip's physical color order instead of asking the user to know it;
7. hardware/bus/segment/current application with post-write verification and rollback;
8. Matrix SEND → AUX RECEIVE local visual/audio sync with post-write verification and rollback;
9. resumable physical acceptance for wiring, power, sync, UV main, UV short, full UV, mixed load and thermal behavior;
10. AUX MQTT configuration matched to the current Matrix broker for unified cloud controls;
11. course/hotspot Wi-Fi profile preparation without logging the password;
12. true cold-boot and actual hotspot acceptance when the user is ready;
13. final read-only release-doctor/PWA/Watch/cart verification once physical gates are imported.

The script intentionally **does not write Supabase physical-acceptance flags itself**. When all real physical checks pass it produces one evidence file for ChatGPT to review/import into the guarded database state. After that, rerunning the same launcher performs final cloud verification without repeating passed tests.

## Frozen architecture

- Matrix R3 remains the sole visual/audio master.
- Matrix release: `hbnf-wow-r3-max-2026-09-21-v3`.
- AUX release: `hbnf-wow-aux-r3-2026-09-22-v1`.
- AUX engine/witness: `aux-r3-wow-1d` / `registry28-fixed-1d-v1`.
- Projection: `fold2-1d-v1`.
- Fixed effects: 220–247, identical scene-name map to Matrix.
- Visual sync: WLED UDP group 1.
- Audio sync: Matrix SEND → AUX RECEIVE, port 11988.
- AUX receive brightness = off; underglow brightness remains independent.
- AUX receive segment options/bounds = off.
- WS2811 underglow: GPIO16, Segment 0, selected.
- UV main: GPIO25, Segment 1, unselected.
- UV short: GPIO26, Segment 2, unselected.
- GPIO27 remains spare.
- GPIO36 remains local mic fallback only.
- Initial addressable underglow limiter: <=900 mA.
- WLED addressable current estimation does not replace the separate UV/mixed-load physical test.

## Proven firmware

- firmware SHA-256: `2a70872fd2373a8ecdcd98c8c73c2e8d871dc902c92599f85081895fe98f744e`
- bytes: 1,342,288
- OTA slot: 1,572,864
- headroom: 230,576
- 28-effect fold2 audit: PASS
- clean rebuild byte-identical: PASS
- OTA slot gate: PASS

The firmware bytes are intentionally unchanged by commissioning-tool hardening.

## Delivery safety

The build creates a nested `HBNF_SP803E_AUX_R3_COMMISSIONING.zip` with the Mac launcher stored as Unix mode `0755`, avoiding GitHub Actions' normal loss of executable permissions.

`COMMISSION_HBNF_AUX.command` also avoids `set -e` so an expected guarded stop can still print the report path and next action.

## Field/network behavior

Local Matrix→AUX visual/audio sync does not depend on MQTT. Unified PWA/Watch/cloud controls do require the AUX MQTT path, so the guarded acceptance runner matches AUX to the Matrix broker after local electrical/visual acceptance.

The present Matrix transport remains `broker.emqx.io`. That preserves current functionality and minimizes change during this hardware rollout, but release-doctor deliberately continues to expose it as a public-broker hardening risk. A future authenticated broker migration should move Matrix + AUX together rather than changing only one node during commissioning.

## Manual fallback tools

The following remain packaged for audit/recovery, but the normal workflow should not require manually chaining them:

- `commission_operator.py` — read-only package/controller discovery and backup.
- `generate_aux_hardware_plan.py` — review-only WLED 16.0.1 hardware plan.
- `local_commission.py` — exact-identity guarded local sync helper.
- `CODEX_RUNBOOK.md` — technical fallback/recovery detail.

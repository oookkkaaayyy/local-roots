# HBNF SP803E AUX R3 — current commissioning runbook

## Non-negotiable hardware facts

- Underglow is 12V WS2811 and uses SP803E DATA / GPIO16.
- Owner reports the removable UV module is assembled off-Cart using the existing 5V converter, fused shared positive feed, and separate RIM/Cart GPIO25 and SHORT/Bar GPIO26 returns. The module remains disconnected and unpowered. The physical integration review is accepted; do not repeat design/assembly review.
- The owner confirms AUX V7 is current, with no later install. Exact rollback bytes are retained as `HBNF_SP803E_AUX_V7_ROLLBACK.bin` and `AUX_V7_RECOVERY_MANIFEST.json`; SHA-256 `c44298bb4b80a0e3d36d094f8270a1959708997571784803592e257ecdef054a`.
- Keep UV outputs disabled until the combined field acceptance records loaded voltage/current, thermal behavior, PWM response, channel mapping, combined load, physical OFF behavior, and matching device readback.
- Matrix firmware must not be reflashed during AUX commissioning.
- An AUX OTA HTTP response plus runtime identity is not release success. The installer reports `PENDING_COMPLETE_DURABLE_RECEIPT` until the complete source-bound receipt and exact rollback evidence have been durably retained, retrieved, and validated.
- Re-read AUX identity immediately before any future installation and require the retained V7 bytes as exact rollback. Keep UV disabled until the combined field acceptance and durable install receipt pass.

## Current commissioning order

1. Positively identify AUX by runtime identity/MAC and create a fresh backup.
2. Install/verify the exact HBNF AUX firmware. Matrix presence is not required.
3. Connect only the underglow for the physical calibration stage.
4. Determine actual logical group count and observed RGB order at low current; never guess color order.
5. Apply the single-bus GPIO16 underglow plan, <=900 mA commissioning limit, fail-dark boot.
6. Only then locate the exact Matrix and configure Matrix SEND → AUX RECEIVE:
   - WLED UDP group 1
   - Matrix AudioReactive SEND / AUX RECEIVE on UDP 11988
   - AUX receives color/effect/palette but not brightness or segment bounds/options.
7. Run underglow visual/audio and thermal acceptance.
8. Keep full AUX database gates closed until each UV channel's matching supply/switch path and physical behavior have been verified and accepted.

## Recovery rules

- Never pipe `yes` or any unbounded auto-answer stream into the launcher.
- Inspect current device state before replaying any write.
- A successful exact firmware identity means do not reflash.
- Local WLED HTTP must bypass environment/system proxies.
- If OTA fails, preserve the backup and diagnose the transport/target before retrying.

## UV boundary

The SP803E manual says controller input voltage must match the LED strip voltage and depicts direct PWM strips with positive connected to VCC. It does not show the proposed 12V controller plus separate 5V load supply with shared-ground PWM returns. That difference alone does not prove incompatibility; the exact board FET drain/source/common-ground and backfeed behavior remains unverified because no public schematic was found. A voltage match alone would also not establish safe current, thermal, boot/restart, channel mapping, or optical behavior. Keep outputs off until the exact path is confirmed safe and qualified.

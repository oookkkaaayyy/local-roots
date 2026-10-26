# HBNF SP803E AUX R3 — current commissioning runbook

## Non-negotiable hardware facts

- Underglow is 12V WS2811 and uses SP803E DATA / GPIO16.
- Owner reports both current UV loads are iNextStation 5V USB-A strips (RIM/Main 6–6.6 ft; SHORT 12–13 in). This supersedes older 12V YGS-Tech notes for the current build. Both remain standalone on power banks; current draw and channel mapping are unmeasured.
- Do not assume the SP803E 12V PWM/VCC path is safe from voltage match alone. Verify each load, driver, supply, fuse, wiring, and fail-dark behavior first.
- Do not configure GPIO25/26/27 as UV outputs until per-channel load and output mapping and ratings are verified.
- Matrix firmware must not be reflashed during AUX commissioning.
- An AUX OTA HTTP response plus runtime identity is not release success. The installer reports `PENDING_COMPLETE_DURABLE_RECEIPT` until the complete source-bound receipt and exact rollback evidence have been durably retained, retrieved, and validated.
- Exact installed V6 rollback is recovered from Actions run `36354143870`, source `b76903cf63be497e9ef855c641a12916eff7149f`; firmware SHA-256 `152a795c6dcc5ea396687aee29d15a3e569dd15becfa6537b347e51a09e54e95`. Its embedded firmware and original ZIP were hash-checked. A 2026-10-25 read-only AUX query also matched the V6 release/build witness. Recheck identity immediately before any future installation; keep UV compile-gated off and do not energize until electrical and physical acceptance pass.

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

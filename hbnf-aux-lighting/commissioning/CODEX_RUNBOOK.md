# HBNF SP803E AUX R3 — current commissioning runbook

## Non-negotiable hardware facts

- Underglow is 12V WS2811 and uses SP803E DATA / GPIO16.
- The installed UV strip is 5V USB.
- Do not connect the 5V UV strip to the SP803E's 12V VCC output.
- Do not configure GPIO25/26/27 as UV outputs until a separate verified 5V switching interface exists.
- Matrix firmware must not be reflashed during AUX commissioning.

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
8. Keep full AUX database gates closed until a separate 5V UV switching architecture has been installed and physically accepted.

## Recovery rules

- Never pipe `yes` or any unbounded auto-answer stream into the launcher.
- Inspect current device state before replaying any write.
- A successful exact firmware identity means do not reflash.
- Local WLED HTTP must bypass environment/system proxies.
- If OTA fails, preserve the backup and diagnose the transport/target before retrying.

## UV boundary

Manufacturer guidance for SP803E direct PWM loads requires the controller supply voltage to match the LED load voltage. The cart presently runs the SP803E/underglow from 12V, while the actual UV strip is 5V USB. Treat direct SP803E PWM control of that UV strip as unsupported in the current wiring. A separate 5V switching solution is required before UV control can be commissioned.

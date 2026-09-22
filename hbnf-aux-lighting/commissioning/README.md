# HBNF Aux Commissioning — software side ready

This directory is the guarded final commissioning path for the SP803E underglow/UV controller after physical wiring exists.

## Frozen architecture

- Matrix R3 is the sole **visual and audio master**.
- Aux custom R3 firmware release: `hbnf-wow-aux-r3-2026-09-22-v1`.
- Aux renderer uses the same fixed effect IDs 220–247 as Matrix R3. It renders on a two-row virtual safety canvas and folds that output onto the 1D strip (`fold2-1d-v1`), avoiding ANIMartRIX height=1 divide-by-zero paths.
- Visual synchronization: WLED UDP Sync group 1; effect/speed/intensity/palette/colors/timebase follow Matrix, while underglow brightness remains independently capped for the cart power budget.
- Music synchronization: AudioReactive UDP Sound Sync, Matrix SEND → Aux RECEIVE, port 11988.
- Addressable 12V WS2811 underglow: GPIO16, Segment 0, selected.
- UV main: GPIO25, Segment 1, unselected.
- UV short: GPIO26, Segment 2, unselected.
- GPIO36 remains an analog-mic fallback only; normal commissioning uses Matrix audio sync.
- Initial underglow current limiter: <=900 mA.
- Receive segment options/bounds stay disabled so Matrix 32×16 geometry cannot overwrite aux/UV segmentation.
- Base aux and mixed-load operation remain database-gated until physical acceptance.
- Unified cart scenes also require exact live aux runtime telemetry before they can energize.

## Proven firmware artifact

Current verified fold2 firmware content:

- firmware SHA-256: `2a70872fd2373a8ecdcd98c8c73c2e8d871dc902c92599f85081895fe98f744e`
- size: 1,342,288 bytes
- OTA slot: 1,572,864 bytes
- headroom: 230,576 bytes
- 28-effect fold2 dimension audit: PASS
- clean rebuild byte-identical: PASS
- OTA slot gate: PASS

The final package records its own GitHub run ID and source commit in `FINAL_METRICS.txt`.

## local_commission.py

Default behavior is **read-only**. It discovers/inspects WLED nodes and verifies exact Matrix/Aux runtime identity.

The only mutation flag is `--prepare-sync`. It is guarded by exact Matrix R3 and exact Aux custom-R3 identity checks, then configures only synchronization plumbing and selected-segment state. It does not guess or change LED bus lengths, physical GPIO output definitions, current limits, Wi-Fi credentials, firmware, or presets.

Physical bus lengths/output wiring must be inspected on the real SP803E before that separate hardware-configuration step is accepted.

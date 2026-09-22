# HBNF Aux Commissioning — software side ready

This directory is the guarded final commissioning path for the SP803E underglow/UV controller after physical wiring exists.

## Fast entry point

Use `COMMISSION_HBNF_AUX.command` on the Mac first. It is intentionally **read-only**: it verifies the frozen package, discovers WLED nodes, identifies an unambiguous aux candidate when possible, takes a timestamped backup to the Desktop, and writes `HBNF_AUX_PREFLIGHT_LATEST.json`. It will not flash firmware, change Matrix settings, change LED buses, or open the database gate.

`commission_operator.py` is the underlying read-only operator. `generate_aux_hardware_plan.py` is also non-mutating: once the real installed logical pixel count and real strip color order are known, it generates the exact WLED 16.0.1 bus/segment JSON for review (GPIO16 underglow, GPIO25/26 UV, <=900 mA initial addressable limit) without applying it. The older `local_commission.py` remains the separately guarded low-level helper; its only mutation mode is `--prepare-sync`, and it refuses unless exact Matrix R3 + Aux R3 identities are already proven.

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

## Physical boundary

The software package deliberately does **not** guess the final WS2811 logical pixel count or color order. Those depend on the actual installed/cut strip and must be established from the real hardware before output-bus configuration is accepted. WLED firmware OTA and `/json/cfg` are supported mechanisms, but physical output configuration remains a later guarded step rather than an unattended action.

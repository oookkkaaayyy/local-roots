# HBNF Aux Commissioning — prepared software side

This directory is for the final SP803E/underglow/UV commissioning pass after the physical wiring exists.

## Frozen architecture

- Matrix R3 is the sole visual master.
- Aux SP803E/WLED receives WLED UDP Sync group 1.
- Addressable 12V WS2811 underglow: GPIO16, Segment 0, selected.
- UV main: GPIO25, Segment 1, unselected.
- UV short: GPIO26, Segment 2, unselected.
- Analog mic: GPIO36.
- Initial addressable underglow limiter: <=900 mA.
- Receive segment options and receive segment bounds stay disabled so Matrix geometry cannot overwrite UV isolation.
- Base aux control and mixed-load control remain database-gated until physical acceptance.

## local_commission.py

Safe default is read-only. It can discover another WLED device on the Matrix /24 LAN, inspect both nodes, and prove the Matrix is still the exact R3 fixed-ID release.

The only mutation flag is `--apply-runtime-sync`. It changes runtime WLED UDP sync flags and selected-segment state only. It intentionally does **not** change bus/GPIO definitions, current limits, Wi-Fi, firmware, or presets.

Codex should use this after the SP803E is physically wired and powered. Hardware-output configuration remains a deliberate, inspected step because strip length/output configuration cannot be safely guessed before the real node is available.

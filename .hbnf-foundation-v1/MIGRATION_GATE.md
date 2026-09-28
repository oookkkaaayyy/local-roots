# HBNF Foundation V1 — migration gate

This branch is intentionally **not install-ready**. It is a safe parallel continuation while the context-rich retry chat runs.

## What is already valid

- One ESP32 / one WLED instance is the target live renderer.
- Matrix and AUX consume one canonical frame and one WLED AudioReactive source.
- WLED supports multiple ESP32 outputs and runtime-configurable LED type, pin, length and color order.
- WLED segments provide independent brightness per segment.
- The current Foundation build compiles against exact WLED 16.0.1 and the proven ESP32 4 MB / dual-OTA environment.

## Physical topology gate

Two viable topologies remain. **Do not choose by software convenience alone.**

### A — one data chain

Matrix controller DATA -> Matrix 512 pixels -> AUX 22 logical WS2811 pixels.

Required before use:
- verify the installed Matrix exposes a clean final DOUT;
- connect AUX DIN to that DOUT without stressing the removable Matrix carrier;
- Matrix and AUX may keep their own 5 V / 12 V power branches, but the data source and both LED power systems must share the required signal ground;
- configure total address space 534;
- configure Matrix as 0..511 and AUX as 512..533;
- preserve the AUX BRG ordering with WLED color-order override if the shared bus default differs.

Benefit: least active hardware and no inter-controller sync.

Risk: mixed-voltage physical wiring and one-chain serviceability must be proven on the actual cart.

### B — two data outputs from one ESP32

One ESP32 drives Matrix and AUX on separate GPIO outputs.

Required before use:
- controller must expose a second suitable output with proper level shifting;
- both buses remain on the same WLED instance/canonical frame;
- retain current separate 5 V Matrix and 12 V AUX power branches;
- configure WLED output 1 = 512 Matrix pixels and output 2 = 22 AUX logical pixels.

Benefit: electrical/service isolation while retaining one rendering brain.

Risk: current GL-MC-001WL hardware may not expose a suitable second output; replacing the controller is a hardware change.

## What must happen before any flash

1. Run the read-only `foundation_preflight.py` while both current controllers are powered.
2. Capture current Matrix/AUX `/json/info`, `/json/state`, and `/json/cfg`.
3. Select topology A or B from actual connector/controller evidence.
4. Build the exact WLED bus + 2D/1D segment configuration.
5. Prepare exact rollback firmware/config backups.
6. Only then create a guarded installer.
7. Physical acceptance remains mandatory; a green CI build is not acceptance.

## Explicit status language

Allowed:
- source-built
- CI-passing
- candidate
- ready for bench test (only after topology/config package exists)

Not allowed before physical proof:
- done
- installed
- production-ready
- accepted

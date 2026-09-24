# HBNF Game Integration Decision

## Preferred reliability architecture: isolated game bridge

Use a separate inexpensive ESP32-family board as the **game/controller bridge**.

- Stadia controllers pair to the bridge through Bluepad32.
- Snake/Pong/etc. run locally on the bridge.
- The bridge sends the 32x16 RGB framebuffer to the existing Matrix WLED controller over DDP realtime UDP.
- The existing Matrix firmware remains unchanged.
- WLED already implements realtime input and automatically exits realtime mode after its timeout, returning control to the existing effect engine.
- HBNF can later add a semantic GAME MODE button without embedding game code into the production Matrix firmware.

### Why this is the default

It isolates the highest-risk dependency (Bluetooth/BTstack) from the proven R2 WLED image. If the game bridge crashes, fails to pair, or is unplugged, the Matrix remains a normal HBNF Matrix.

It also lets essentially all development happen before the real Matrix is involved.

## Alternative: same-ESP32 WLED usermod

Technically feasible, but not the first choice for this project. Bluepad32 is proven on ESP32 and Stadia BLE is supported, but integrating its Bluetooth stack into the exact custom WLED build increases firmware/toolchain/memory/coexistence risk. That path should only be reconsidered if the bridge architecture fails the final network test or the user rejects one extra tiny board.

## Final physical gates that cannot be simulated away

1. Stadia pairing/reconnect on the selected bridge hardware.
2. Bridge -> Matrix local-network reachability in both home Wi-Fi and HBNFHotspot field topology.
3. DDP visual latency/packet loss at the intended frame rate.
4. Exact 32x16 physical orientation.
5. Exit/resume behavior with the real active HBNF playlist.

No firmware flash is required for those gates.

# HBNF Matrix Games Lab

**Status: isolated development only. Nothing in this directory is deployed to the Matrix.**

This branch starts from the trusted R2 Course lineage and exists to make the game subsystem boring before any firmware mutation.

## Proven feasibility

- Bluepad32 explicitly supports Bluetooth-converted Google Stadia controllers over BLE.
- A public ESP32 + WS2812 matrix project uses a Bluetooth Stadia controller for Snake, Tetris, Breakout, Pong, Space Invaders, Flappy Bird, Simon Says, Frogger, Game of Life and River Raid.
- That project documented Wi-Fi/Bluetooth contention during active Bluetooth discovery. HBNF therefore treats discovery as a controlled state, not a continuously-running background activity.

## Architecture boundary

The game code is split into three layers:

1. **Pure game core** (this directory)
   - fixed 32x16 framebuffer
   - generic PadState input
   - no WLED includes
   - no Bluetooth includes
   - no Wi-Fi/MQTT
   - deterministic host tests and fuzzing

2. **Controller adapter** (next gate)
   - Bluepad32
   - two allowlisted Stadia controllers
   - stable player assignment
   - discovery only when explicitly pairing/reconnecting
   - no game logic

3. **WLED usermod adapter** (final offline integration gate)
   - enters/exits game mode
   - snapshots prior HBNF state
   - suppresses playlist/text/score overlays while playing
   - renders game framebuffer locally
   - bypasses Flow interpolation between gameplay frames
   - restores the exact prior HBNF show on exit
   - never flashes automatically

## User experience target

Normal HBNF show -> GAMES -> local menu -> play -> hold START+SELECT 0.8s -> exact prior HBNF show.

Controller loss pauses gameplay; it must not strand the Matrix in a stale game state.

## Current games

- Snake
- 2-player Pong

The engine is deliberately small first. Additional games are added only after the controller/WLED integration contract passes; the architecture does not need to change.

## Pre-hardware gates

A candidate is not eligible for the physical Matrix until all pass:

- warnings-as-errors host compile
- AddressSanitizer + UndefinedBehaviorSanitizer
- deterministic replay checksum
- >=250k manager fuzz updates
- framebuffer out-of-bounds rejection count remains zero
- controller-disconnect / reconnect state tests
- two-controller player assignment tests
- Wi-Fi/BLE discovery arbitration tests
- exact WLED 16.0.1 target compile
- OTA-slot headroom gate
- current R2 config/presets remain byte-preserved in the installer fixture
- no deploy/OTA action in CI
- rollback binary and pre-install backups prepared before any later physical test

## Non-claim

Host tests can remove most software defects, but cannot prove RF coexistence, physical controller reconnection, or exact GL-MC-001WL runtime behavior. Those are intentionally reserved for one final controlled hardware acceptance session.

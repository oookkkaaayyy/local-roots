# HBNF controller transport contract

Exact hardware: two Google Stadia controllers + original ESP32-WROOM-32 class game bridge.

Stadia wireless is BLE only if the controller was converted to Google's Bluetooth firmware. Bluepad32's documented Stadia pairing method is `Y + Stadia`.

## Validation
1. Do not infer Bluetooth mode from LED color.
2. Post-release, enable pairing only while no game frames are streaming.
3. Hold `Y + Stadia`; require Bluepad32 Stadia identity plus live button events.
4. Repeat for controller 2.
5. Save/allowlist their Bluetooth addresses for stable P1/P2 assignment.
6. Disable discovery during gameplay; re-enable only for explicit reconnect.
7. Controller loss pauses immediately; >2.2 s loss terminates the realtime lease.

## Mapping
D-pad -> direction; A -> choose/action; B -> back; misc START/SELECT -> start/select.
START+SELECT 0.8 s exits the current game to menu; 2.0 s from menu ends the game session.

## Hard fallback
Google's Bluetooth conversion window ended 2024-12-31. If a unit was never converted, do not pretend the ESP32-WROOM programming USB port is a USB host. Keep that controller unavailable for this wireless bridge and leave the normal cart untouched.

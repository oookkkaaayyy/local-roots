# HBNF Game Bridge — ELEGOO ESP32-WROOM-32 USB-C

Target: generic **ESP32 Dev Board** using the Bluepad32 Arduino ESP32 package pinned to 4.1.0.

## Safety boundary
- local only: Wi-Fi -> Matrix direct IP `192.168.8.20`
- output: DDP UDP/4048 RGB frames only
- no Supabase/API writes
- no Matrix/AUX preset, brightness or power writes
- no AUX control
- Matrix identity must report 512 LEDs before a session can start
- Matrix OFF / brightness 0 stops the lease
- stale Matrix state or P1 loss stops the lease
- stopping the bridge stops DDP; it does not restore a saved snapshot

## Wi-Fi secret handling
No password is compiled into firmware. On first boot the bridge reports `HBNF_WIFI=NEEDS_PROVISIONING`. Provision by USB serial at 115200:
- `WIFI_SSID HBNF-Cart`
- `WIFI_PASS <password>`
- `WIFI_CONNECT`
- `STATUS`

The password is stored only in ESP32 NVS and is never echoed.

## Controller behavior
First two accepted gamepads become persistent P1/P2 by Bluetooth MAC. Pair Stadia with **Y + Stadia**. During an active game session new Bluetooth discovery is disabled; already-paired controllers remain eligible to reconnect.

## Controls
- idle: hold START+SELECT 0.8 s -> start game session/menu
- menu: D-pad up/down; A selects game
- in game: START+SELECT 0.8 s -> back to menu
- menu while session active: START+SELECT 2.0 s -> end session

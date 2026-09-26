# HBNF local game controllers

This optional layer does not replace the verified canonical cart controller or dedicated Stadia gamepads.

## Network boundary
- Bridge STA: `HBNF-Cart` -> Matrix `192.168.8.20`
- Bridge SoftAP: `HBNF-Play` -> controller clients at `192.168.4.1`
- No NAT/routing is enabled between HBNF-Play and HBNF-Cart.
- Guest clients receive only the bridge-hosted game controller page.
- Guests cannot issue cart lighting, AUX, UV, router or Supabase commands.

## Priority
1. Stadia/Bluepad32 physical controller
2. owner web controller on HBNF-Cart
3. guest web controller on HBNF-Play

A physical controller connecting to a claimed slot immediately preempts the web controller.

## Guest safety
Guest play defaults CLOSED after boot/session exit. A host browser connected through HBNF-Cart must open guest play. Guest messages have START/SELECT bits stripped server-side, so a guest cannot start/end the game session or acquire cart authority.

## Touch quality gate
The browser controller benchmarks WebSocket round-trip latency locally and shows p50/p95. Intended acceptance: p50 <= 50 ms and p95 <= 80 ms. If the device/network misses this consistently, use the dedicated controller instead.

The page is deliberately ES5-style, animation-free and touch-event based for old iOS/Safari devices such as iPad mini 2.

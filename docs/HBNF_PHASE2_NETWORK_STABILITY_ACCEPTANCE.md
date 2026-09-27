# HBNF Phase 2 network stability acceptance

Status: isolated staging only. This document does not change production, Matrix/AUX Wi-Fi, or the active V7.x rollout.

## Intended topology

### Router present
- Opal SSID: `HBNF-Cart`
- Opal LAN: `192.168.8.1/24`
- Matrix: `192.168.8.20`
- AUX: `192.168.8.21`
- GameBridge: `192.168.8.30`
- mounted iPad mini: DHCP client on `HBNF-Cart`
- Opal upstream: optional home Wi-Fi or iPhone hotspot/repeater
- Local Matrix/AUX/GameBridge traffic must continue if upstream internet disappears.

### Router absent
- Preserve current hotspot Wi-Fi profile on Matrix/AUX.
- Mounted iPad mini may join the existing hotspot directly.
- GameBridge must retain a fallback hotspot profile before Phase 2 is accepted.
- The cart must not require Opal presence to boot into a usable lighting state.

## Selection policy

Do not clone the same SSID across Opal and hotspot. Use distinct SSIDs and explicit preference:
1. prefer `HBNF-Cart` when available;
2. otherwise fall back to the preserved current hotspot profile;
3. never delete the current hotspot profile during migration.

Because Wi-Fi reassociation is not instantaneous, "router removed while actively running" may create a brief reconnect interval. Acceptance requires clean automatic recovery, not a false promise of zero milliseconds.

## Mounted iPad mini role

The mounted iPad is a client/control surface, not infrastructure.
- Preferred normal network: `HBNF-Cart`.
- When Opal is present, the iPad stays on `HBNF-Cart`; Opal supplies optional upstream internet.
- When Opal is absent, the iPad may auto-join the existing iPhone hotspot.
- No lighting or game runtime may depend on the iPad being awake, unlocked, connected, or the controller page being open.
- The control page must be compatible with iPad mini 2 / iOS 12-era Safari.
- Normal control must use the current zero-pair guest-safe control contract, not legacy Supabase Auth login.

## Pre-live acceptance gates

### A. Router-only
- 10 consecutive Opal cold boots.
- `HBNF-Cart` returns each time.
- DHCP stays `192.168.8.100-199`.
- Admin remains `192.168.8.1`.
- AP/client isolation remains off.
- No spontaneous reboot during a 30-minute powered soak.

### B. Router present / upstream absent
- Matrix + AUX + GameBridge local traffic continues for 15 minutes with Opal WAN/repeater deliberately disconnected.
- Lighting control from mounted iPad remains usable for local-capable functions.
- Games remain smooth because gameplay is local.

### C. Router absent fallback
- Cold boot with Opal physically unpowered.
- Matrix and AUX automatically recover onto the existing hotspot without manual credential entry.
- Mounted iPad can join hotspot and control lights.
- Repeat 5 cold boots.

### D. Transition
- Start with Opal present and cart stable.
- Remove Opal power.
- Measure time to fallback and verify recovery without rebooting Matrix/AUX if supported by firmware.
- Re-power Opal and verify devices return to preferred `HBNF-Cart` without split-network state.
- Repeat 3 cycles.

### E. Games
- Physical Stadia controller input -> GameBridge -> Matrix DDP only.
- Sustain ~30 FPS for 10 minutes with no visible multi-frame hitch.
- Internet/upstream loss must not affect game timing.
- Matrix safety polling is prohibited from the 30 FPS render/input critical path.
- Phone/iPad touchscreen controller is secondary; physical controllers have priority.

### F. Split-brain guard
Never accept a state where Matrix is on Opal and AUX is on hotspot, or vice versa, while follower/frame-lock traffic requires local peer reachability. Commissioning must detect and reject split-network state.

## Live criterion

Phase 2 is not live merely because each component works once. Live requires A+B+C+D+E+F to pass and one final full cart cold boot with no manual network intervention.

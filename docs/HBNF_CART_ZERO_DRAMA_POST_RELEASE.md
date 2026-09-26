# HBNF Cart post-release zero-drama operator card

This applies only after the current canonical Matrix+AUX release is physically accepted.

## 0. Attach staging safely
Run `scripts/hbnf-cart-postrelease-overlay.sh <EXACT_ACCEPTED_RELEASE_SHA>`.
It creates a new branch/worktree from the accepted release, checks for path collisions, cherry-picks only staging commits, and runs host QA. It never writes the accepted release branch.

## 1. Opal setup
Before changing settings, create an Opal configuration backup in LuCI: **SYSTEM → Advanced Settings → Go To LuCI → System → Backup / Flash Firmware → Generate archive**.

Then configure:
- main 2.4 GHz SSID `HBNF-Cart`
- WPA2-PSK/AES; password set only on the router, never in Git/AKS
- LAN `192.168.8.1/24`
- DHCP `.100-.199`
- AP isolation OFF
- guest network not used

Do not make internet upstream a dependency. Local Matrix/AUX/game control must pass with the Opal disconnected from the internet.

## 2. Move Matrix/AUX without deleting rollback
Add `HBNF-Cart` to Matrix and AUX while preserving their current Wi-Fi profiles. Let both join by DHCP first. In Opal **NETWORK → LAN → Address Reservation**, learn the real client MACs and reserve:
- Matrix -> `192.168.8.20`
- AUX -> `192.168.8.21`

Reconnect both clients so reservations take effect. Never identify AUX solely by IP: AUX must match MAC `8c94df55c34c` and must not report 512 LEDs.

Run:
`python3 scripts/hbnf-cart-device-preflight.py`

PASS requires Matrix=512 LEDs and AUX=known SP803E MAC + 22 logical LEDs. The script performs GET requests only and writes a local evidence bundle.

## 3. Cold-boot gate
Power in this order: Opal, then Matrix/AUX. Confirm the same reserved IPs on two consecutive cold boots. Only after this passes should optional iPhone upstream be added.

For internet, USB tethering is the lowest-disruption path. Repeater/WISP to `HBNFHotspot` is allowed, but loss/reconnect of upstream must not affect the local acceptance criteria.

## 4. Controllers/game gate
Validate Stadia controllers individually with `Y + Stadia` and Bluepad32 identity/button events. If either controller was never converted to Stadia Bluetooth firmware, stop the game-controller workstream only; normal cart operation remains accepted.

No game DDP frames are permitted until controller identity, direct Matrix IP reachability and canonical OFF watchdog tests pass.

## 5. UV gate
UV remains electrically separate until all checks pass. Obtain the accepted AUX `cfg.json` backup and run:
`python3 scripts/hbnf-cart-uv-pin-plan.py <cfg.json>`

This only proposes a free GPIO among 25/26/27 and never changes WLED. Then physically verify relay polarity/default-OFF and combined 5V UV current before wiring the load. Never connect a 5V UV strip to 12V VCC.

## 6. Final acceptance
Required before calling the rollout complete:
1. local LAN works with no internet
2. Matrix `.20` and AUX `.21` survive two cold boots
3. canonical normal show + Matrix/AUX sync works
4. game lease exits to CURRENT canonical state, not a stale snapshot
5. canonical OFF immediately kills game visual lease
6. UV defaults OFF and global OFF dominates UV
7. powering off the game bridge cannot break normal cart operation
8. rollback to preserved pre-Opal networking still works

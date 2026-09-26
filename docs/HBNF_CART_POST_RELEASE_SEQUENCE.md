# HBNF cart — one post-release sequence

Prerequisite: main Matrix+AUX canonical-cart release physically accepted.

## A. Configure router
Configure Opal: HBNF-Cart, WPA2/AES, 192.168.8.1/24, DHCP .100-.199, isolation OFF. Add HBNFHotspot only as optional upstream.

## B. Validate networking
Add HBNF-Cart to Matrix/AUX without deleting existing profiles. Learn MACs; reserve Matrix .20 and AUX .21. Cold boot twice. Verify direct-IP normal cart behavior. Confirm rollback by powering Opal off and reconnecting through preserved HBNFHotspot.

## C. Validate controllers
Pair controller 1 then 2 with Y+Stadia. Require Bluepad32 identification + live controls. Allowlist both and power-cycle them once. If BLE validation fails, stop only the game-controller workstream.

## D. Install game adapter
Reserve bridge .30. Flash only the bridge ESP32. Verify safety monitor with DDP disabled. Run Snake then Pong. Change canonical brightness during play. Issue canonical OFF: DDP must stop and Matrix stay dark. Turn ON, run again, exit: CURRENT canonical state must resume. Power-cycle bridge: normal cart must remain unaffected.

## E. Integrate UV only if hardware gate passes
With UV load unpowered, verify SP803E spare output/polarity and relay behavior. Confirm combined UV current fits the separate 5V bank/output. Switch +5V only, never 12V. Relay defaults OFF and canonical OFF forces relay OFF. If any uncertainty remains, leave UV separate.

## F. Cart-wide acceptance
Cold boot Opal -> Matrix/AUX -> bridge. Test local LAN without hotspot, then with upstream hotspot. Run normal music show+AUX, game->exit->current show, global OFF in normal and game modes, and individual power cycles. No component may strand the cart in game/UV state.

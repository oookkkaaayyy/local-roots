#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

STAMP="$(date +%Y%m%d-%H%M%S)"
EVIDENCE="${HOME}/Desktop/HBNF_POST_RELEASE_${STAMP}"
mkdir -p "$EVIDENCE"
exec > >(tee -a "$EVIDENCE/SESSION.log") 2>&1

die(){ echo "STOP: $*" >&2; echo "EVIDENCE=$EVIDENCE"; exit 2; }
gate(){
  local prompt="$1"
  echo
  echo "=== $prompt ==="
  read -r -p "Type GO to continue, or anything else to stop safely: " ans
  [[ "$ans" == "GO" ]] || die "operator stopped at: $prompt"
}

echo "HBNF CART — ONE-PASS FINISH"
echo "Evidence folder: $EVIDENCE"
echo "Run this only AFTER the current canonical Matrix+AUX update has been physically accepted."
echo "Accepted canonical release base: 8962d34d908e2bbd6971575f0174ff203e797a27"
echo "This process adds the iPad controller route, configures the dedicated cart LAN, flashes only the game-bridge ESP32, and performs acceptance."
echo "It does not modify production Supabase and does not flash Matrix or AUX."
echo
read -r -p "Type ACCEPTED to confirm the current Matrix+AUX release is physically accepted: " ACCEPTED
[[ "$ACCEPTED" == "ACCEPTED" ]] || die "current canonical release not confirmed accepted"

[[ "$(uname -s)" == "Darwin" ]] || die "this operator kit is staged for the HBNF Mac (macOS)"
command -v python3 >/dev/null || die "python3 not found"

echo
echo "PHASE 0 — iPAD CONTROLLER DEPLOY + AUTOMATIC NETWORK STATE"
[[ -x web/DEPLOY_HBNF_IPAD_UI.command ]] || chmod +x web/DEPLOY_HBNF_IPAD_UI.command
bash web/DEPLOY_HBNF_IPAD_UI.command | tee "$EVIDENCE/IPAD_WEB_DEPLOY.log"
grep -q 'HBNF_IPAD_CONTROLLER_DEPLOY=PASS' "$EVIDENCE/IPAD_WEB_DEPLOY.log" || die "iPad controller web deployment did not report PASS"
python3 scripts/hbnf-cart-network-state.py | tee "$EVIDENCE/NETWORK_STATE_INITIAL.json" || true
echo "iPad controller live: https://hbnightflyers.com/hbnf-cart-ipad.html"
[[ -f config/hbnf-cart-router-manifest.json ]] || die "router manifest missing"
python3 -m json.tool config/hbnf-cart-router-manifest.json > "$EVIDENCE/ROUTER_MANIFEST.json"

echo
echo "PHASE A — ROUTER"
echo "Configure GL.iNet Opal:"
echo "  SSID: HBNF-Cart"
echo "  2.4 GHz, WPA2-PSK/AES"
echo "  LAN: 192.168.8.1/24"
echo "  DHCP: 192.168.8.100-199"
echo "  Client/AP isolation: OFF"
echo "  Do NOT delete existing Matrix/AUX Wi-Fi profiles."
echo "  Internet upstream is optional."
open "http://192.168.8.1" >/dev/null 2>&1 || true
gate "Router configured and HBNF-Cart is visible"

echo
echo "PHASE B0 — PRESERVE OLD NETWORK + ADD HBNF-Cart AS SECOND WLED PROFILE"
python3 scripts/hbnf-cart-network-state.py | tee "$EVIDENCE/NETWORK_STATE_PRE_MIGRATION.json" || true
INITIAL_STATE="$(python3 - "$EVIDENCE/NETWORK_STATE_PRE_MIGRATION.json" <<'PY'
import json,sys
try: print(json.load(open(sys.argv[1])).get("state","UNKNOWN"))
except Exception: print("UNKNOWN")
PY
)"
if [[ "$INITIAL_STATE" == "LEGACY_READY" ]]; then
  read -r MATRIX_OLD AUX_OLD < <(python3 - "$EVIDENCE/NETWORK_STATE_PRE_MIGRATION.json" <<'PY'
import json,sys
p=json.load(open(sys.argv[1]))
d={x["role"]:x["ip"] for x in p["devices"]}
print(d["matrix"],d["aux"])
PY
)
  python3 scripts/hbnf-cart-device-preflight.py --matrix-ip "$MATRIX_OLD" --aux-ip "$AUX_OLD" --out-dir "$EVIDENCE/LEGACY_DEVICE_SNAPSHOT"
  echo "Opening Matrix and AUX WLED Wi-Fi settings on the CURRENT network."
  open "http://$MATRIX_OLD/settings/wifi" || true
  open "http://$AUX_OLD/settings/wifi" || true
  echo "On EACH page:"
  echo "  1. Click + to add another Wi-Fi network."
  echo "  2. Add SSID HBNF-Cart and the Opal Wi-Fi password."
  echo "  3. Keep the existing network entry. Do NOT delete it."
  echo "  4. Save/apply."
  gate "HBNF-Cart was added as a SECOND Wi-Fi profile on BOTH Matrix and AUX"
  echo "Now connect this Mac to HBNF-Cart, then power-cycle Matrix and AUX."
  echo "If either device fails to move, reconnect the Mac to the old HBNFHotspot; its profile was preserved."
  gate "Mac is on HBNF-Cart and Matrix/AUX have been power-cycled"
elif [[ "$INITIAL_STATE" == "TARGET_READY" ]]; then
  echo "Matrix and AUX are already on HBNF-Cart; profile migration is already complete."
else
  echo "Automatic state was $INITIAL_STATE."
  echo "No network setting will be changed until both devices are uniquely identifiable."
  die "network migration precondition is not clean; inspect $EVIDENCE/NETWORK_STATE_PRE_MIGRATION.json"
fi

echo
echo "PHASE B1 — DISCOVER TARGET-LAN DEVICE IDENTITIES"
python3 scripts/hbnf-cart-lan-discover.py --subnet 192.168.8.0/24 | tee "$EVIDENCE/LAN_DISCOVERY.json"
python3 - "$EVIDENCE/LAN_DISCOVERY.json" <<'PY'
import json,sys
p=json.load(open(sys.argv[1]))
if not p.get("ok"): raise SystemExit("discovery did not uniquely identify Matrix and AUX")
print("Reserve in Opal:")
print("  Matrix:",p["matrix"]["mac"],"-> 192.168.8.20")
print("  AUX:   ",p["aux"]["mac"],"-> 192.168.8.21")
PY
gate "Opal DHCP reservations entered for Matrix .20 and AUX .21, then Matrix/AUX reconnected"

echo
echo "PHASE B2 — DIRECT-IP VALIDATION"
python3 scripts/hbnf-cart-device-preflight.py --matrix-ip 192.168.8.20 --aux-ip 192.168.8.21 --out-dir "$EVIDENCE/DEVICE_PREFLIGHT"
echo "DIRECT_IP_PREFLIGHT=PASS"

echo
echo "PHASE B3 — COLD-BOOT CHECK"
echo "Power-cycle Opal first, then Matrix/AUX. Wait for HBNF-Cart to return."
gate "Cold boot completed"
python3 scripts/hbnf-cart-device-preflight.py --matrix-ip 192.168.8.20 --aux-ip 192.168.8.21 --out-dir "$EVIDENCE/COLD_BOOT_PREFLIGHT"
echo "COLD_BOOT_PREFLIGHT=PASS"

echo
echo "PHASE C/D — CONTROLLERS + GAME BRIDGE"
echo "Connect ONLY the ELEGOO ESP32-WROOM-32 game bridge by USB-C."
echo "The verified bridge firmware is bundled inside this same one-pass package."
echo "Its FLASH_HBNF_GAME_BRIDGE.command will:"
echo "  - verify hashes"
echo "  - refuse ambiguous USB serial targets"
echo "  - flash ONLY the bridge ESP32"
echo "  - ask once for HBNF-Cart password"
echo "  - create isolated HBNF-Play guest Wi-Fi + QR files"
echo "  - optionally pair P1/P2 using Y + Stadia"
echo "If Stadia pairing is unavailable, the rollout continues; touchscreen controls remain available for testing."
BRIDGE_INSTALLER="$ROOT/game-bridge/FLASH_HBNF_GAME_BRIDGE.command"
if [[ -f "$BRIDGE_INSTALLER" ]]; then
  gate "ELEGOO game-bridge ESP32 is connected by USB-C"
  chmod +x "$BRIDGE_INSTALLER"
  bash "$BRIDGE_INSTALLER"
else
  die "bundled game-bridge installer missing"
fi

echo "Verifying deterministic game-bridge address 192.168.8.30..."
for n in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS --max-time 2 http://192.168.8.30/ | grep -q 'HBNF PLAY'; then BRIDGE_OK=1; break; fi
  sleep 1
done
[[ "${BRIDGE_OK:-0}" == "1" ]] || die "game bridge did not answer at 192.168.8.30"
echo "GAME_BRIDGE_IP=192.168.8.30 PASS"
echo "Guest QR files are in: $HOME/Desktop/HBNF_PLAY_QR"

echo
echo "PHASE D1 — iPHONE + iPAD CANONICAL CONTROL ACCEPTANCE"
echo "On iPad mini 2 open: https://hbnightflyers.com/hbnf-cart-ipad.html"
echo "If sign-in is needed, request the link there. It intentionally lands on the already-allowed canonical /hbnf-cart.html route."
echo "After canonical sign-in succeeds, return to /hbnf-cart-ipad.html; it imports the same local session."
echo "Then:"
echo "  1. Change Matrix brightness on iPad."
echo "  2. Use NEXT on iPhone."
echo "  3. Refresh/observe both and verify the resulting canonical state is correct."
echo "  4. Verify OFF from either device turns the cart off."
gate "iPhone and iPad both controlled the same canonical cart correctly"

echo
echo "PHASE D2 — GAME SAFETY ACCEPTANCE"
echo "1. Start game session."
echo "2. Confirm Snake responds to the active P1 input."
echo "3. Confirm Pong responds to both active player slots (Stadia and/or web controllers)."
echo "4. During game, use canonical cart UI to change Matrix brightness."
echo "5. Issue canonical OFF. Game visuals must stop and Matrix must stay dark."
echo "6. Turn canonical ON, start a game, exit from menu. CURRENT canonical show must resume."
gate "All six game safety checks passed"

echo
echo "PHASE D3 — TOUCHSCREEN GAME QUALITY"
echo "On the iPad game page, claim P1 and run the built-in latency sample."
echo "Acceptance target: median <= 50 ms AND p95 <= 80 ms, with no obvious missed/repeated touches during 2-3 minutes of Snake."
echo "Optionally scan the generated HBNF-Play Wi-Fi QR with another phone and repeat as guest P2."
echo
read -r -p "If touchscreen play genuinely feels good and meets the target, type TOUCH. Otherwise type STADIA: " TOUCH_MODE
case "$TOUCH_MODE" in
  TOUCH) TOUCH_RESULT="ACCEPTED" ;;
  STADIA) TOUCH_RESULT="NOT_ACCEPTED_STADIA_PRIMARY" ;;
  *) die "enter TOUCH or STADIA" ;;
esac
echo "TOUCHSCREEN_GAME=$TOUCH_RESULT"

echo
echo "PHASE E — UV REVIEW ONLY"
echo "No UV wiring is changed automatically."
echo "Capture current AUX cfg.json before selecting a spare pin."
echo "Run: python3 scripts/hbnf-cart-uv-pin-plan.py <AUX_CFG_JSON>"
echo "Only continue UV if relay, pin/polarity, 5V-bank current, and default-OFF behavior are physically verified."
echo "UV may remain separate without blocking router/controllers/games."

echo
echo "PHASE F — FINAL CART ACCEPTANCE"
echo "Test local HBNF-Cart LAN with iPhone hotspot OFF, then optional internet upstream ON."
echo "Verify normal Matrix+AUX music/show sync, controller reconnect, game exit, and canonical global OFF."
gate "Final cart-wide acceptance passed"

cat > "$EVIDENCE/RESULT.txt" <<EOF
HBNF_POST_RELEASE_SETUP=PASS
ROUTER=PASS
MATRIX_AUX_LAN=PASS
COLD_BOOT=PASS
GAME_BRIDGE=PASS
GAME_SAFETY=PASS
IPAD_CANONICAL_CONTROL=PASS
TOUCHSCREEN_GAME=$TOUCH_RESULT
UV=SEPARATE_OR_MANUALLY_ACCEPTED
FINAL_CART=PASS
EOF
cat "$EVIDENCE/RESULT.txt"
echo "EVIDENCE=$EVIDENCE"

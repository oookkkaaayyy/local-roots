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

echo "HBNF POST-RELEASE CART SETUP"
echo "Evidence folder: $EVIDENCE"
echo "This tool does not modify production Supabase and does not flash Matrix or AUX."

command -v python3 >/dev/null || die "python3 not found"
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
echo "PHASE B1 — DISCOVER CURRENT DEVICE IDENTITIES"
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
echo "Use the CI-produced HBNF-GAME-BRIDGE-ESP32-WROOM32 artifact."
echo "Its FLASH_HBNF_GAME_BRIDGE.command will:"
echo "  - verify hashes"
echo "  - refuse ambiguous USB serial targets"
echo "  - flash ONLY the bridge ESP32"
echo "  - ask once for HBNF-Cart password"
echo "  - pair P1/P2 using Y + Stadia"
echo "If either controller cannot pair, stop game setup; normal cart remains unaffected."
gate "Game-bridge artifact is downloaded/unzipped and bridge ESP32 is connected"
echo "NEXT_ACTION=double-click FLASH_HBNF_GAME_BRIDGE.command in the artifact folder"
echo "After it reports HBNF_GAME_BRIDGE_INSTALL=PASS, return here."
gate "HBNF_GAME_BRIDGE_INSTALL=PASS was shown"

echo
echo "PHASE D2 — GAME SAFETY ACCEPTANCE"
echo "1. Start game session."
echo "2. Confirm Snake responds."
echo "3. Confirm Pong responds to both controllers."
echo "4. During game, use canonical cart UI to change Matrix brightness."
echo "5. Issue canonical OFF. Game visuals must stop and Matrix must stay dark."
echo "6. Turn canonical ON, start a game, exit from menu. CURRENT canonical show must resume."
gate "All six game safety checks passed"

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
UV=SEPARATE_OR_MANUALLY_ACCEPTED
FINAL_CART=PASS
EOF
cat "$EVIDENCE/RESULT.txt"
echo "EVIDENCE=$EVIDENCE"

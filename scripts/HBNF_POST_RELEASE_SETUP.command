#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
STAMP="$(date +%Y%m%d-%H%M%S)"
EVIDENCE="${HOME}/Desktop/HBNF_PHASE2_${STAMP}"
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

echo "HBNF CART — PHASE 2"
echo "Evidence folder: $EVIDENCE"
echo "Phase 2 never repairs or replaces Phase 1."
echo "It does not deploy/mutate Supabase production and does not flash Matrix or AUX."
echo

[[ "$(uname -s)" == "Darwin" ]] || die "Phase 2 operator is staged for macOS"
command -v python3 >/dev/null || die "python3 not found"
[[ -f config/PHASE1_FINAL_HANDOFF.json ]] || die "Phase 1 final handoff manifest missing"

python3 scripts/hbnf-phase2-handoff-guard.py config/PHASE1_FINAL_HANDOFF.json | tee "$EVIDENCE/PHASE1_HANDOFF.txt"
grep -q 'HBNF_PHASE2_HANDOFF=PASS' "$EVIDENCE/PHASE1_HANDOFF.txt" || die "Phase 1 handoff is not finalized"
PHASE1_PHONE_URL="$(python3 - <<'PY'
import json
p=json.load(open("config/PHASE1_FINAL_HANDOFF.json"))
print(p["phone_controller"]["production_url"])
PY
)"
IPAD_COMPATIBLE="$(python3 - <<'PY'
import json
p=json.load(open("config/PHASE1_FINAL_HANDOFF.json"))
print("true" if p["phone_controller"]["ipad_compatible"] else "false")
PY
)"
echo "PHASE1_PHONE_URL=$PHASE1_PHONE_URL"
echo "IPAD_COMPATIBLE=$IPAD_COMPATIBLE"

echo
echo "PHASE A — DEDICATED CART LAN"
python3 scripts/hbnf-cart-network-state.py | tee "$EVIDENCE/NETWORK_STATE_INITIAL.json" || true
[[ -f config/hbnf-cart-router-manifest.json ]] || die "router manifest missing"
python3 -m json.tool config/hbnf-cart-router-manifest.json > "$EVIDENCE/ROUTER_MANIFEST.json"
echo "Configure GL.iNet Opal:"
echo "  SSID: HBNF-Cart"
echo "  2.4 GHz, WPA2-PSK/AES"
echo "  LAN: 192.168.8.1/24"
echo "  DHCP: 192.168.8.100-199"
echo "  Client/AP isolation: OFF"
echo "  Internet upstream: optional"
echo "  Do NOT delete existing Matrix/AUX Wi-Fi profiles."
open "http://192.168.8.1" >/dev/null 2>&1 || true
gate "Opal is configured and HBNF-Cart is visible"

echo
echo "PHASE B — ROLLBACK-SAFE MATRIX/AUX LAN MIGRATION"
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
  open "http://$MATRIX_OLD/settings/wifi" || true
  open "http://$AUX_OLD/settings/wifi" || true
  echo "On EACH WLED page add HBNF-Cart as a SECOND Wi-Fi profile."
  echo "Keep the existing profile. Save/apply both."
  echo "Then connect the Mac to HBNF-Cart and power-cycle Matrix+AUX."
  gate "HBNF-Cart is a second profile on both devices; Mac is on HBNF-Cart; Matrix+AUX were power-cycled"
elif [[ "$INITIAL_STATE" == "TARGET_READY" ]]; then
  echo "Matrix+AUX are already on HBNF-Cart."
else
  die "network state is $INITIAL_STATE; Phase 2 will not guess"
fi

python3 scripts/hbnf-cart-lan-discover.py --subnet 192.168.8.0/24 | tee "$EVIDENCE/LAN_DISCOVERY.json"
python3 - "$EVIDENCE/LAN_DISCOVERY.json" <<'PY'
import json,sys
p=json.load(open(sys.argv[1]))
if not p.get("ok"): raise SystemExit("discovery failed")
print("Reserve in Opal:")
print("  Matrix:",p["matrix"]["mac"],"-> 192.168.8.20")
print("  AUX:   ",p["aux"]["mac"],"-> 192.168.8.21")
PY
gate "Opal reservations are entered for Matrix .20 and AUX .21; both reconnected"

python3 scripts/hbnf-cart-device-preflight.py --matrix-ip 192.168.8.20 --aux-ip 192.168.8.21 --out-dir "$EVIDENCE/DEVICE_PREFLIGHT"
echo "DIRECT_IP_PREFLIGHT=PASS"
echo "Cold boot: Opal first, then Matrix+AUX."
gate "Cold boot completed"
python3 scripts/hbnf-cart-device-preflight.py --matrix-ip 192.168.8.20 --aux-ip 192.168.8.21 --out-dir "$EVIDENCE/COLD_BOOT_PREFLIGHT"
echo "COLD_BOOT_PREFLIGHT=PASS"

echo
echo "PHASE C — GAME BRIDGE + CONTROLLERS"
BRIDGE_INSTALLER="$ROOT/game-bridge/FLASH_HBNF_GAME_BRIDGE.command"
[[ -f "$BRIDGE_INSTALLER" ]] || die "bundled game-bridge installer missing"
echo "Connect ONLY the ELEGOO ESP32-WROOM-32 game bridge by USB-C."
echo "This flashes only the game bridge, not Matrix/AUX."
echo "It creates isolated HBNF-Play guest Wi-Fi + QR files."
echo "Stadia pairing is optional; web/touch controls remain testable if unavailable."
gate "ELEGOO game bridge is connected by USB-C"
chmod +x "$BRIDGE_INSTALLER"
bash "$BRIDGE_INSTALLER"

echo "Verifying game bridge at 192.168.8.30..."
for n in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS --max-time 2 http://192.168.8.30/ | grep -q 'HBNF PLAY'; then BRIDGE_OK=1; break; fi
  sleep 1
done
[[ "${BRIDGE_OK:-0}" == "1" ]] || die "game bridge did not answer at 192.168.8.30"
echo "GAME_BRIDGE=PASS"
echo "Guest QR files: $HOME/Desktop/HBNF_PLAY_QR"

echo
echo "PHASE D — INTEGRATED ACCEPTANCE"
echo "Primary cart control remains the finalized Phase 1 controller:"
echo "  $PHASE1_PHONE_URL"
if [[ "$IPAD_COMPATIBLE" == "true" ]]; then
  echo "Phase 1 declared the final controller iPad-mini compatible."
  echo "Pair/open the SAME controller system on the iPad; do not deploy a second cart-control backend."
else
  echo "Phase 1 did not approve the final controller for iPad mini 2."
  echo "Use the iPad only as a local game controller in this Phase 2 run."
fi
echo
echo "Run once:"
echo "  1. Verify Phase 1 iPhone cart control still works after LAN migration."
echo "  2. Start Snake; verify active P1 control."
echo "  3. Start Pong; verify both active player slots."
echo "  4. During a game, change canonical Matrix brightness."
echo "  5. Issue canonical OFF; game visuals must stop immediately and remain dark."
echo "  6. ON -> start game -> exit; CURRENT canonical show must resume."
echo "  7. Test iPad touchscreen game latency/feel for 2-3 minutes."
echo "     Target: median <=50 ms, p95 <=80 ms, no obvious missed/repeated touches."
echo "  8. Optionally scan HBNF-Play QR on another phone and verify guest P2."
echo "  9. Turn upstream/hotspot internet OFF; local HBNF-Cart game/LAN behavior must continue."
echo " 10. Restore optional upstream; verify normal Matrix+AUX sync."
echo
read -r -p "Touchscreen gaming genuinely passed? Type TOUCH; otherwise type STADIA: " TOUCH_MODE
case "$TOUCH_MODE" in
  TOUCH) TOUCH_RESULT="ACCEPTED" ;;
  STADIA) TOUCH_RESULT="NOT_ACCEPTED_STADIA_PRIMARY" ;;
  *) die "enter TOUCH or STADIA" ;;
esac
gate "All Phase 2 integrated acceptance checks above passed"

echo
echo "PHASE E — UV REVIEW ONLY"
echo "Phase 2 does not energize UV automatically."
echo "Use the captured AUX cfg with: python3 scripts/hbnf-cart-uv-pin-plan.py <AUX_CFG_JSON>"
echo "Proceed only after relay pin/polarity, separate 5V-bank current, and fail-dark behavior are physically verified."
echo "UV may remain separate without blocking Phase 2 acceptance."

cat > "$EVIDENCE/RESULT.txt" <<EOF
HBNF_PHASE2=PASS
PHASE1_HANDOFF=PASS
DEDICATED_LAN=PASS
MATRIX_AUX_MIGRATION=PASS
COLD_BOOT=PASS
GAME_BRIDGE=PASS
GAME_SAFETY=PASS
TOUCHSCREEN_GAME=$TOUCH_RESULT
UV=SEPARATE_OR_MANUALLY_ACCEPTED
EOF
cat "$EVIDENCE/RESULT.txt"
echo "EVIDENCE=$EVIDENCE"

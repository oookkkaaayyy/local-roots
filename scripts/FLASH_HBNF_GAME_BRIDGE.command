#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
FACTORY="HBNF_GAME_BRIDGE_FACTORY.bin"
[[ -f "$FACTORY" ]] || { echo "ERROR: $FACTORY missing"; exit 2; }
[[ -f "SHA256SUMS.txt" ]] || { echo "ERROR: SHA256SUMS.txt missing"; exit 3; }
shasum -a 256 -c SHA256SUMS.txt >/dev/null || { echo "ERROR: artifact hash verification failed"; exit 4; }

PORTS=()
for p in /dev/cu.usbserial* /dev/cu.SLAB_USBtoUART* /dev/cu.wchusbserial* /dev/cu.usbmodem*; do
  [[ -e "$p" ]] && PORTS+=("$p")
done
if [[ ${#PORTS[@]} -ne 1 ]]; then
  echo "ERROR: connect exactly ONE ESP32 USB board and no other USB-serial device."
  printf 'Detected: %s\n' "${PORTS[*]:-(none)}"
  exit 5
fi
PORT="${PORTS[0]}"
echo "Target serial port: $PORT"
echo "This installer does not touch Matrix, AUX, Supabase, or the router."

VENV="${TMPDIR:-/tmp}/hbnf-game-bridge-venv"
python3 -m venv "$VENV"
"$VENV/bin/python" -m pip -q install --upgrade pip
"$VENV/bin/python" -m pip -q install "esptool==4.5.1" "pyserial==3.5"
"$VENV/bin/python" -m esptool --chip esp32 --port "$PORT" --baud 460800 write_flash 0x0 "$FACTORY"
echo "FLASH=PASS"
sleep 2
"$VENV/bin/python" provision_hbnf_game_bridge.py "$PORT"
echo
echo "HBNF_GAME_BRIDGE_INSTALL=PASS"

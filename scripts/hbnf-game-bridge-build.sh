#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
URLS="https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json,https://raw.githubusercontent.com/ricardoquesada/esp32-arduino-lib-builder/master/bluepad32_files/package_esp32_bluepad32_index.json"
CORE="esp32-bluepad32:esp32@4.1.0"
FQBN="esp32-bluepad32:esp32:esp32"
OUT="${1:-$ROOT/build/hbnf-game-bridge}"
command -v arduino-cli >/dev/null || { echo "ERROR: arduino-cli not found" >&2; exit 2; }
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
SK="$TMP/HBNF_GameBridge"
mkdir -p "$SK" "$OUT"
cp "$ROOT/hbnf-game-adapter/bridge/HBNF_GameBridge/HBNF_GameBridge.ino" "$SK/HBNF_GameBridge.ino"
for h in game_core.h ddp_frame.h game_lease_guard.h session_lifecycle.h; do
  cp "$ROOT/hbnf-game-adapter/$h" "$SK/$h"
done
arduino-cli core update-index --additional-urls "$URLS" >/dev/null
if ! arduino-cli core list | awk '{print $1"@"$2}' | grep -qx "$CORE"; then
  arduino-cli core install "$CORE" --additional-urls "$URLS"
fi
arduino-cli board listall | grep -F "ESP32 Dev Board" >/dev/null
rm -rf "$OUT"/*
arduino-cli compile --warnings all --fqbn "$FQBN" --output-dir "$OUT" "$SK"
(
  cd "$OUT"
  sha256sum *.bin 2>/dev/null || true
) > "$OUT/SHA256SUMS.txt"
printf 'HBNF_GAME_BRIDGE_BUILD=PASS\nFQBN=%s\nCORE=%s\nOUT=%s\n' "$FQBN" "$CORE" "$OUT"

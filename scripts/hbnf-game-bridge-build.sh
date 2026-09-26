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
arduino-cli board details --fqbn "$FQBN" >/dev/null
rm -rf "$OUT"/*
arduino-cli compile --warnings all --fqbn "$FQBN" --output-dir "$OUT" "$SK"

PLATFORM="$HOME/.arduino15/packages/esp32-bluepad32/hardware/esp32/4.1.0"
BOOT_APP0="$(find "$PLATFORM/tools/partitions" -maxdepth 1 -name 'boot_app0.bin' -print -quit)"
ESPTOOL="$(find "$HOME/.arduino15/packages/esp32/tools/esptool_py" -name esptool.py -print | LC_ALL=C sort | tail -1)"
[[ -f "$BOOT_APP0" ]] || { echo "ERROR: boot_app0.bin not found" >&2; exit 3; }
[[ -f "$ESPTOOL" ]] || { echo "ERROR: esptool.py not found" >&2; exit 4; }
cp "$BOOT_APP0" "$OUT/boot_app0.bin"
python3 "$ESPTOOL" --chip esp32 merge_bin -o "$OUT/HBNF_GAME_BRIDGE_FACTORY.bin" \
  0x1000 "$OUT/HBNF_GameBridge.ino.bootloader.bin" \
  0x8000 "$OUT/HBNF_GameBridge.ino.partitions.bin" \
  0xe000 "$OUT/boot_app0.bin" \
  0x10000 "$OUT/HBNF_GameBridge.ino.bin"
python3 "$ESPTOOL" --chip esp32 image_info "$OUT/HBNF_GameBridge.ino.bootloader.bin" > "$OUT/BOOTLOADER_IMAGE_INFO.txt"
cp "$ROOT/scripts/FLASH_HBNF_GAME_BRIDGE.command" "$OUT/FLASH_HBNF_GAME_BRIDGE.command"
cp "$ROOT/scripts/provision_hbnf_game_bridge.py" "$OUT/provision_hbnf_game_bridge.py"
chmod +x "$OUT/FLASH_HBNF_GAME_BRIDGE.command"
(
  cd "$OUT"
  sha256sum *.bin 2>/dev/null | LC_ALL=C sort
) > "$OUT/SHA256SUMS.txt"
printf 'HBNF_GAME_BRIDGE_BUILD=PASS\nFQBN=%s\nCORE=%s\nOUT=%s\n' "$FQBN" "$CORE" "$OUT"

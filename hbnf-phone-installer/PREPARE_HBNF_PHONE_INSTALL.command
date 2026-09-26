#!/bin/bash
set -euo pipefail

# Usage:
#   PREPARE_HBNF_PHONE_INSTALL.command /path/to/HBNF_WLED16_MAX_WOWMAX_V3.bin /path/to/HBNF_SP803E_AUX_R3.bin
#
# Produces a signed Apple Shortcut + firmware folder in iCloud Drive > Shortcuts.
# It does not flash devices or mutate production.

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 MATRIX_BIN AUX_BIN"
  exit 2
fi

MATRIX_BIN="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
AUX_BIN="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
[[ -s "$MATRIX_BIN" ]] || { echo "BLOCKER: Matrix firmware missing"; exit 1; }
[[ -s "$AUX_BIN" ]] || { echo "BLOCKER: AUX firmware missing"; exit 1; }

HERE="$(cd "$(dirname "$0")" && pwd)"
ICLOUD_SHORTCUTS="$HOME/Library/Mobile Documents/iCloud~is~workflow~my~workflows/Documents"
FIELD_DIR="$ICLOUD_SHORTCUTS/HBNF_FIELD_DEPLOY"
mkdir -p "$FIELD_DIR"

cp "$MATRIX_BIN" "$FIELD_DIR/HBNF_MATRIX.bin"
cp "$AUX_BIN" "$FIELD_DIR/HBNF_AUX.bin"

MATRIX_SHA="$(shasum -a 256 "$FIELD_DIR/HBNF_MATRIX.bin" | awk '{print $1}')"
AUX_SHA="$(shasum -a 256 "$FIELD_DIR/HBNF_AUX.bin" | awk '{print $1}')"
cat > "$FIELD_DIR/SHA256SUMS.txt" <<EOF
$MATRIX_SHA  HBNF_MATRIX.bin
$AUX_SHA  HBNF_AUX.bin
EOF

python3 "$HERE/make_phone_shortcut.py" "$FIELD_DIR/HBNF_Field_Install.unsigned.shortcut"

command -v shortcuts >/dev/null || {
  echo "BLOCKER: macOS shortcuts CLI is unavailable"
  exit 1
}

shortcuts sign --mode anyone   --input "$FIELD_DIR/HBNF_Field_Install.unsigned.shortcut"   --output "$FIELD_DIR/HBNF_Field_Install.shortcut"

[[ -s "$FIELD_DIR/HBNF_Field_Install.shortcut" ]] || {
  echo "BLOCKER: shortcut signing did not create output"
  exit 1
}

cat > "$FIELD_DIR/MORNING.txt" <<'EOF'
HBNF PHONE FIELD INSTALL

Before leaving:
- Do not need the Mac.
- Firmware + signed Shortcut are in iCloud Drive > Shortcuts > HBNF_FIELD_DEPLOY.

At the course:
1. Turn Personal Hotspot OFF, then ON.
2. With other hotspot clients disconnected, power the cart and wait for Matrix + AUX to join.
3. In Files > iCloud Drive > Shortcuts > HBNF_FIELD_DEPLOY, tap HBNF_Field_Install.shortcut and Add Shortcut (first use only).
4. Run “HBNF Field Install”.
5. If iOS asks for Local Network access, tap Allow.
6. When it says Firmware installed, open ChatGPT/Codex and send:
   HBNF PHONE OTA COMPLETE — resume approved production cutover.

Safety:
- The Shortcut verifies 512 LEDs = Matrix and 22 LEDs = AUX before either firmware upload.
- If identity is not exact, it stops without flashing.
- UV is untouched.
EOF

echo
echo "HBNF_PHONE_FIELD_KIT=PASS"
echo "FOLDER: $FIELD_DIR"
echo "MATRIX_SHA256=$MATRIX_SHA"
echo "AUX_SHA256=$AUX_SHA"
echo "SIGNED_SHORTCUT=$FIELD_DIR/HBNF_Field_Install.shortcut"
echo
echo "No production mutation performed."

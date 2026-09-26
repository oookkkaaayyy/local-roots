#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/build/hbnf-postrelease-kit}"
rm -rf "$OUT"
mkdir -p "$OUT/scripts" "$OUT/config" "$OUT/docs" "$OUT/game-bridge"

bash "$ROOT/scripts/hbnf-game-bridge-build.sh" "$OUT/game-bridge"

for f in   HBNF_POST_RELEASE_SETUP.command   hbnf-cart-network-state.py   hbnf-cart-lan-discover.py   hbnf-cart-device-preflight.py   hbnf-cart-uv-pin-plan.py
do cp "$ROOT/scripts/$f" "$OUT/scripts/$f"; done
cp "$ROOT/config/hbnf-cart-router-manifest.json" "$OUT/config/"
cp "$ROOT/docs/HBNF_CART_POST_RELEASE_OPERATOR.md" "$OUT/docs/"
cp "$ROOT/docs/HBNF_CART_ROUTER_STAGING.md" "$OUT/docs/"
cp "$ROOT/docs/HBNF_CART_CONTROLLER_STAGING.md" "$OUT/docs/"

cat > "$OUT/START_HBNF_POST_RELEASE.command" <<'EOF'
#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
chmod +x scripts/HBNF_POST_RELEASE_SETUP.command game-bridge/FLASH_HBNF_GAME_BRIDGE.command
exec bash scripts/HBNF_POST_RELEASE_SETUP.command
EOF
chmod +x "$OUT/START_HBNF_POST_RELEASE.command" "$OUT/scripts/HBNF_POST_RELEASE_SETUP.command" "$OUT/game-bridge/FLASH_HBNF_GAME_BRIDGE.command"

(
  cd "$OUT"
  find . -type f ! -name SHA256SUMS.txt -print0 | LC_ALL=C sort -z | xargs -0 shasum -a 256
) > "$OUT/SHA256SUMS.txt"

PARENT="$(dirname "$OUT")"
NAME="$(basename "$OUT")"
tar -C "$PARENT" -czf "$PARENT/HBNF_CART_POST_RELEASE_KIT.tar.gz" "$NAME"
(cd "$PARENT" && shasum -a 256 "HBNF_CART_POST_RELEASE_KIT.tar.gz" > "HBNF_CART_POST_RELEASE_KIT.tar.gz.sha256")
echo "HBNF_POST_RELEASE_KIT_BUILD=PASS"
echo "ARCHIVE=$PARENT/HBNF_CART_POST_RELEASE_KIT.tar.gz"

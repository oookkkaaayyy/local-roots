#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/build/hbnf-cart-one-pass}"
rm -rf "$OUT"
mkdir -p "$OUT/scripts" "$OUT/config" "$OUT/docs" "$OUT/game-bridge" "$OUT/web"

bash "$ROOT/scripts/hbnf-game-bridge-build.sh" "$OUT/game-bridge"

for f in   HBNF_POST_RELEASE_SETUP.command   hbnf-cart-network-state.py   hbnf-cart-lan-discover.py   hbnf-cart-device-preflight.py   hbnf-cart-uv-pin-plan.py
do cp "$ROOT/scripts/$f" "$OUT/scripts/$f"; done

for f in hbnf-cart-ipad.html hbnf-cart-ipad.js HBNF_CART_IPAD_TEST.cjs; do
  cp "$ROOT/hbnf-wow-bundle/web/$f" "$OUT/web/$f"
done
cp "$ROOT/scripts/DEPLOY_HBNF_IPAD_UI.command" "$OUT/web/DEPLOY_HBNF_IPAD_UI.command"

cp "$ROOT/config/hbnf-cart-router-manifest.json" "$OUT/config/"
cp "$ROOT/docs/HBNF_CART_POST_RELEASE_OPERATOR.md" "$OUT/docs/"
cp "$ROOT/docs/HBNF_CART_ROUTER_STAGING.md" "$OUT/docs/"
cp "$ROOT/docs/HBNF_CART_CONTROLLER_STAGING.md" "$OUT/docs/"
cp "$ROOT/docs/HBNF_CART_IPAD_CONTROLLER_STAGING.md" "$OUT/docs/"
cp "$ROOT/hbnf-game-adapter/WEB_CONTROLLERS.md" "$OUT/docs/"

cat > "$OUT/START_HBNF_CART_FINISH.command" <<'EOF'
#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
echo "Verifying HBNF one-pass package..."
shasum -a 256 -c SHA256SUMS.txt >/dev/null || { echo "ERROR: package verification failed"; exit 2; }
chmod +x scripts/HBNF_POST_RELEASE_SETUP.command game-bridge/FLASH_HBNF_GAME_BRIDGE.command web/DEPLOY_HBNF_IPAD_UI.command
exec bash scripts/HBNF_POST_RELEASE_SETUP.command
EOF
chmod +x "$OUT/START_HBNF_CART_FINISH.command" "$OUT/scripts/HBNF_POST_RELEASE_SETUP.command" "$OUT/game-bridge/FLASH_HBNF_GAME_BRIDGE.command" "$OUT/web/DEPLOY_HBNF_IPAD_UI.command"

cat > "$OUT/READ_ME_FIRST.txt" <<'EOF'
HBNF CART — ONE PASS AFTER CURRENT RELEASE ACCEPTANCE

Do not run this while the current Matrix+AUX release is still in progress.
After that release is physically accepted, double-click ONLY:
  START_HBNF_CART_FINISH.command

This one package contains the entire staged follow-on rollout:
Opal/HBNF-Cart LAN, rollback-safe Matrix/AUX Wi-Fi migration, device validation,
iPad mini full cart controller deployment, ESP32 game bridge, optional Stadia pairing,
isolated HBNF-Play guest phone controllers + QR setup, touchscreen quality gate,
UV review, and final cart acceptance.
EOF

(
  cd "$OUT"
  find . -type f ! -name SHA256SUMS.txt -print0 | LC_ALL=C sort -z | xargs -0 shasum -a 256
) > "$OUT/SHA256SUMS.txt"

PARENT="$(dirname "$OUT")"
NAME="$(basename "$OUT")"
tar -C "$PARENT" -czf "$PARENT/HBNF_CART_ONE_PASS_AFTER_ACCEPTANCE.tar.gz" "$NAME"
(cd "$PARENT" && shasum -a 256 "HBNF_CART_ONE_PASS_AFTER_ACCEPTANCE.tar.gz" > "HBNF_CART_ONE_PASS_AFTER_ACCEPTANCE.tar.gz.sha256")
echo "HBNF_CART_ONE_PASS_BUILD=PASS"
echo "ARCHIVE=$PARENT/HBNF_CART_ONE_PASS_AFTER_ACCEPTANCE.tar.gz"

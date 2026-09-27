#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/build/hbnf-cart-phase2}"
rm -rf "$OUT"
mkdir -p "$OUT/scripts" "$OUT/config" "$OUT/docs" "$OUT/game-bridge"

bash "$ROOT/scripts/hbnf-game-bridge-build.sh" "$OUT/game-bridge"

for f in   HBNF_POST_RELEASE_SETUP.command   hbnf-phase2-handoff-guard.py   hbnf-cart-network-state.py   hbnf-cart-lan-discover.py   hbnf-cart-device-preflight.py   hbnf-cart-uv-pin-plan.py
do cp "$ROOT/scripts/$f" "$OUT/scripts/$f"; done

cp "$ROOT/config/PHASE1_FINAL_HANDOFF.json" "$OUT/config/"
cp "$ROOT/config/hbnf-cart-router-manifest.json" "$OUT/config/"
cp "$ROOT/docs/HBNF_CART_PHASE2_TRANSITION.md" "$OUT/docs/"
cp "$ROOT/docs/HBNF_CART_ROUTER_STAGING.md" "$OUT/docs/"
cp "$ROOT/docs/HBNF_CART_CONTROLLER_STAGING.md" "$OUT/docs/"
cp "$ROOT/hbnf-game-adapter/WEB_CONTROLLERS.md" "$OUT/docs/"

cat > "$OUT/START_HBNF_PHASE2.command" <<'EOF'
#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
echo "Verifying HBNF Phase 2 package..."
shasum -a 256 -c SHA256SUMS.txt >/dev/null || { echo "ERROR: package verification failed"; exit 2; }
python3 scripts/hbnf-phase2-handoff-guard.py config/PHASE1_FINAL_HANDOFF.json
chmod +x scripts/HBNF_POST_RELEASE_SETUP.command game-bridge/FLASH_HBNF_GAME_BRIDGE.command
exec bash scripts/HBNF_POST_RELEASE_SETUP.command
EOF
chmod +x "$OUT/START_HBNF_PHASE2.command" "$OUT/scripts/HBNF_POST_RELEASE_SETUP.command" "$OUT/game-bridge/FLASH_HBNF_GAME_BRIDGE.command"

cat > "$OUT/READ_ME_FIRST.txt" <<'EOF'
HBNF CART — PHASE 2

Do not run until PHASE1_FINAL_HANDOFF.json says Phase 1 is finalized.
The launcher enforces that boundary automatically.

Phase 2 does NOT redeploy or repair the canonical cart/phone controller.
It adds the dedicated Opal LAN, rollback-safe WLED network migration,
ESP32 game bridge, Stadia/touch games, isolated HBNF-Play guest controllers,
iPad role, UV review, and integrated acceptance.

Run exactly one launcher:
  START_HBNF_PHASE2.command
EOF

(
  cd "$OUT"
  find . -type f ! -name SHA256SUMS.txt -print0 | LC_ALL=C sort -z | xargs -0 shasum -a 256
) > "$OUT/SHA256SUMS.txt"

PARENT="$(dirname "$OUT")"
NAME="$(basename "$OUT")"
tar -C "$PARENT" -czf "$PARENT/HBNF_CART_PHASE2.tar.gz" "$NAME"
(cd "$PARENT" && shasum -a 256 "HBNF_CART_PHASE2.tar.gz" > "HBNF_CART_PHASE2.tar.gz.sha256")
echo "HBNF_CART_PHASE2_BUILD=PASS"
echo "ARCHIVE=$PARENT/HBNF_CART_PHASE2.tar.gz"

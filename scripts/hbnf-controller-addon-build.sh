#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/build/hbnf-controller-addon}"
rm -rf "$OUT"
mkdir -p "$OUT/game-bridge" "$OUT/ipad" "$OUT/docs"
bash "$ROOT/scripts/hbnf-game-bridge-build.sh" "$OUT/game-bridge"
cp "$ROOT/hbnf-wow-bundle/web/hbnf-cart-ipad.html" "$OUT/ipad/"
cp "$ROOT/hbnf-wow-bundle/web/hbnf-cart-ipad.js" "$OUT/ipad/"
cp "$ROOT/hbnf-game-adapter/WEB_CONTROLLERS.md" "$OUT/docs/"
cat > "$OUT/README.txt" <<'EOF'
HBNF OPTIONAL WEB CONTROLLER ADD-ON
This artifact is staging-only. Do not deploy/flash until the accepted canonical cart release is preserved.
The iPad page talks only to canonical hbnf-cart-control.
The bridge creates isolated HBNF-Play for guest game input and never routes guests to HBNF-Cart.
EOF
(
 cd "$OUT"
 find . -type f ! -name SHA256SUMS.txt -print0 | LC_ALL=C sort -z | xargs -0 shasum -a 256
) > "$OUT/SHA256SUMS.txt"
echo HBNF_CONTROLLER_ADDON_BUILD=PASS

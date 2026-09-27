#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/build/hbnf-cart-phase2}"
HANDOFF_SRC="${PHASE1_HANDOFF_FILE:-$ROOT/config/PHASE1_FINAL_HANDOFF.json}"
TOKEN_SRC="${BRIDGE_CART_TOKEN_FILE:-}"
REQUIRE_FINAL="${HBNF_PHASE2_REQUIRE_FINAL:-0}"

rm -rf "$OUT"
mkdir -p "$OUT/scripts" "$OUT/config" "$OUT/docs" "$OUT/game-bridge"
[[ -s "$HANDOFF_SRC" ]] || { echo "ERROR: Phase 1 handoff missing"; exit 2; }
cp "$HANDOFF_SRC" "$OUT/config/PHASE1_FINAL_HANDOFF.json"

FINALIZED=0
if python3 "$ROOT/scripts/hbnf-phase2-handoff-guard.py" "$HANDOFF_SRC" >/tmp/hbnf-phase2-handoff-check.txt 2>&1; then
  FINALIZED=1
  cat /tmp/hbnf-phase2-handoff-check.txt
else
  if [[ "$REQUIRE_FINAL" == "1" ]]; then
    cat /tmp/hbnf-phase2-handoff-check.txt >&2
    echo "ERROR: final Phase 2 build requires finalized Phase 1." >&2
    exit 3
  fi
  echo "STAGING_ONLY: Phase 1 handoff is intentionally not finalized."
fi

bash "$ROOT/scripts/hbnf-game-bridge-build.sh" "$OUT/game-bridge"

for f in HBNF_POST_RELEASE_SETUP.command hbnf-phase2-handoff-guard.py hbnf-phase2-token-guard.py hbnf-cart-network-state.py hbnf-cart-lan-discover.py hbnf-cart-device-preflight.py hbnf-cart-uv-pin-plan.py
do cp "$ROOT/scripts/$f" "$OUT/scripts/$f"; done

if [[ "$FINALIZED" == "1" ]]; then
  [[ -n "$TOKEN_SRC" && -s "$TOKEN_SRC" ]] || { echo "ERROR: finalized build requires BRIDGE_CART_TOKEN_FILE"; exit 4; }
  python3 "$ROOT/scripts/hbnf-phase2-token-guard.py" "$HANDOFF_SRC" "$TOKEN_SRC"
  cp "$TOKEN_SRC" "$OUT/game-bridge/BRIDGE_CART_TOKEN.txt"
  chmod 600 "$OUT/game-bridge/BRIDGE_CART_TOKEN.txt"
fi

cp "$ROOT/config/hbnf-cart-router-manifest.json" "$OUT/config/"
cp "$ROOT/docs/HBNF_CART_PHASE2_TRANSITION.md" "$OUT/docs/"
cp "$ROOT/docs/HBNF_CART_ROUTER_STAGING.md" "$OUT/docs/"
cp "$ROOT/docs/HBNF_CART_CONTROLLER_STAGING.md" "$OUT/docs/"
cp "$ROOT/docs/HBNF_PHASE2_FINALIZATION_RUNBOOK.md" "$OUT/docs/"
cp "$ROOT/hbnf-game-adapter/WEB_CONTROLLERS.md" "$OUT/docs/"

cat > "$OUT/START_HBNF_PHASE2.command" <<'EOF'
#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
echo "Verifying HBNF Phase 2 package..."
shasum -a 256 -c SHA256SUMS.txt >/dev/null || { echo "ERROR: package verification failed"; exit 2; }
python3 scripts/hbnf-phase2-handoff-guard.py config/PHASE1_FINAL_HANDOFF.json
[[ -s game-bridge/BRIDGE_CART_TOKEN.txt ]] || { echo "ERROR: finalized bridge token missing"; exit 3; }
python3 scripts/hbnf-phase2-token-guard.py config/PHASE1_FINAL_HANDOFF.json game-bridge/BRIDGE_CART_TOKEN.txt
chmod 600 game-bridge/BRIDGE_CART_TOKEN.txt
chmod +x scripts/HBNF_POST_RELEASE_SETUP.command game-bridge/FLASH_HBNF_GAME_BRIDGE.command
exec bash scripts/HBNF_POST_RELEASE_SETUP.command
EOF
chmod +x "$OUT/START_HBNF_PHASE2.command" "$OUT/scripts/HBNF_POST_RELEASE_SETUP.command" "$OUT/game-bridge/FLASH_HBNF_GAME_BRIDGE.command"

cat > "$OUT/READ_ME_FIRST.txt" <<EOF
HBNF CART — PHASE 2
PACKAGE_STATE=$([[ "$FINALIZED" == "1" ]] && echo FINALIZED || echo STAGING_BLOCKED)

When finalized, run exactly:
  START_HBNF_PHASE2.command
EOF

(
  cd "$OUT"
  find . -type f ! -name SHA256SUMS.txt -print0 | LC_ALL=C sort -z | xargs -0 shasum -a 256
) > "$OUT/SHA256SUMS.txt"

PARENT="$(dirname "$OUT")"; NAME="$(basename "$OUT")"
tar -C "$PARENT" -czf "$PARENT/HBNF_CART_PHASE2.tar.gz" "$NAME"
(cd "$PARENT" && shasum -a 256 HBNF_CART_PHASE2.tar.gz > HBNF_CART_PHASE2.tar.gz.sha256)
echo "HBNF_CART_PHASE2_BUILD=PASS"
echo "FINALIZED=$FINALIZED"
echo "ARCHIVE=$PARENT/HBNF_CART_PHASE2.tar.gz"

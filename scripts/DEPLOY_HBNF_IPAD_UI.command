#!/bin/bash
set -euo pipefail
VERSION="9.26.26_CART_IPAD_LEGACY_V1"
MARKER="hbnf-cart-ipad-legacy-v1"
HERE="$(cd "$(dirname "$0")" && pwd)"
TMPBASE="${TMPDIR:-/tmp}"; TMPBASE="${TMPBASE%/}"
CANDIDATES=("$HOME/Desktop/01 ACTIVE PROJECTS/HBNF-Website-Deploy/hbnf-static-worker" "$HOME/Desktop/HBNF-Website-Deploy/hbnf-static-worker")
ROOT=""
for x in "${CANDIDATES[@]}"; do [[ -d "$x/public" ]] && ROOT="$x" && break; done
[[ -n "$ROOT" ]] || { echo "ERROR: HBNF deployment root not found."; exit 1; }
PUBLIC="$ROOT/public"
BACKUP="$(mktemp -d "$TMPBASE/hbnf-ipad-web-backup.XXXXXX")"
DEPLOYED=0
FILES=(hbnf-cart-ipad.html hbnf-cart-ipad.js)
backup_file(){ local n="$1"; if [[ -f "$PUBLIC/$n" ]]; then cp "$PUBLIC/$n" "$BACKUP/$n"; printf 1 > "$BACKUP/$n.existed"; else printf 0 > "$BACKUP/$n.existed"; fi; }
restore_file(){ local n="$1"; if [[ "$(cat "$BACKUP/$n.existed")" == "1" ]]; then cp "$BACKUP/$n" "$PUBLIC/$n"; else rm -f "$PUBLIC/$n"; fi; }
restore_local(){ for f in "${FILES[@]}"; do restore_file "$f"; done; }
rollback(){ echo "Rolling back iPad controller route only..."; restore_local; (cd "$ROOT" && npx wrangler deploy) || true; }
fail(){ code=$?; echo; echo "ERROR: iPad controller deployment failed."; if [[ "$DEPLOYED" == "1" ]]; then rollback; else restore_local || true; fi; rm -rf "$BACKUP"; exit "$code"; }
trap fail ERR INT TERM
for f in "${FILES[@]}" HBNF_CART_IPAD_TEST.cjs; do [[ -s "$HERE/$f" ]] || { echo "ERROR: missing $f"; exit 1; }; done
echo "Verifying accepted canonical cart UI is already live..."
CANONICAL="$(curl -fsSL --max-time 20 "https://hbnightflyers.com/hbnf-cart.html?v=$(date +%s)")"
printf '%s' "$CANONICAL" | grep -Fq 'hbnf-cart-canonical-v1'
for f in "${FILES[@]}"; do backup_file "$f"; cp "$HERE/$f" "$PUBLIC/$f"; done
node "$HERE/HBNF_CART_IPAD_TEST.cjs"
grep -Fq "$MARKER" "$PUBLIC/hbnf-cart-ipad.html"
grep -Fq 'hbnf-cart-control' "$PUBLIC/hbnf-cart-ipad.js"
! grep -Fq '192.168.8.20' "$PUBLIC/hbnf-cart-ipad.js"
! grep -Fq '192.168.8.21' "$PUBLIC/hbnf-cart-ipad.js"
echo "Running Wrangler dry run..."
(cd "$ROOT" && npx wrangler deploy --dry-run)
echo "Deploying ONLY the iPad controller route/assets..."
(cd "$ROOT" && npx wrangler deploy)
DEPLOYED=1
CACHE="$(date +%s)"
LIVE_HTML="$(curl -fsSL --max-time 20 "https://hbnightflyers.com/hbnf-cart-ipad.html?v=$CACHE")"
printf '%s' "$LIVE_HTML" | grep -Fq "$MARKER"
TMP="$(mktemp "$TMPBASE/hbnf-ipad-js.XXXXXX")"
curl -fsSL --max-time 20 "https://hbnightflyers.com/hbnf-cart-ipad.js?v=$CACHE" -o "$TMP"
LOCAL_SHA="$(shasum -a 256 "$HERE/hbnf-cart-ipad.js" | awk '{print $1}')"
LIVE_SHA="$(shasum -a 256 "$TMP" | awk '{print $1}')"
rm -f "$TMP"
[[ "$LOCAL_SHA" == "$LIVE_SHA" ]] || { echo "ERROR: production parity failed for hbnf-cart-ipad.js"; exit 1; }
trap - ERR INT TERM
rm -rf "$BACKUP"
echo "HBNF_IPAD_CONTROLLER_DEPLOY=PASS"
echo "LIVE=https://hbnightflyers.com/hbnf-cart-ipad.html"

#!/bin/bash
set -euo pipefail

VERSION="9.26.26_CART_CANONICAL_V1"
MARKER="hbnf-cart-canonical-v1"
HERE="$(cd "$(dirname "$0")" && pwd)"
TMPBASE="${TMPDIR:-/tmp}"; TMPBASE="${TMPBASE%/}"
CANDIDATES=("$HOME/Desktop/01 ACTIVE PROJECTS/HBNF-Website-Deploy/hbnf-static-worker" "$HOME/Desktop/HBNF-Website-Deploy/hbnf-static-worker")
ROOT=""
for x in "${CANDIDATES[@]}"; do [[ -d "$x/public" ]] && ROOT="$x" && break; done
[[ -n "$ROOT" ]] || { echo "ERROR: HBNF deployment root not found."; exit 1; }

PUBLIC="$ROOT/public"
BACKUP="$(mktemp -d "$TMPBASE/hbnf-cart-web-backup.XXXXXX")"
DEPLOYED=0

FILES=(hbnf-cart.html hbnf-cart.js hbnf-cart-manifest.webmanifest)
ALIASES=(cart.html)

backup_file(){
  local name="$1"
  if [[ -f "$PUBLIC/$name" ]]; then
    cp "$PUBLIC/$name" "$BACKUP/$name"
    printf '1' > "$BACKUP/$name.existed"
  else
    printf '0' > "$BACKUP/$name.existed"
  fi
}

restore_file(){
  local name="$1"
  if [[ "$(cat "$BACKUP/$name.existed")" == "1" ]]; then
    cp "$BACKUP/$name" "$PUBLIC/$name"
  else
    rm -f "$PUBLIC/$name"
  fi
}

for f in "${FILES[@]}" "${ALIASES[@]}"; do backup_file "$f"; done

restore_local(){
  for f in "${FILES[@]}" "${ALIASES[@]}"; do restore_file "$f"; done
}
rollback(){
  echo "Rolling back canonical cart web UI..."
  restore_local
  (cd "$ROOT" && npx wrangler deploy) || true
}
fail(){
  code=$?
  echo
  echo "ERROR: canonical cart web deployment failed."
  if [[ "$DEPLOYED" == "1" ]]; then rollback; else restore_local || true; fi
  rm -rf "$BACKUP"
  exit "$code"
}
trap fail ERR INT TERM

printf '\n== Deploy HBNF Canonical Cart UI %s ==\n' "$VERSION"
for f in "${FILES[@]}"; do [[ -s "$HERE/$f" ]] || { echo "ERROR: missing $f"; exit 1; }; done

cp "$HERE/hbnf-cart.html" "$PUBLIC/hbnf-cart.html"
cp "$HERE/hbnf-cart.html" "$PUBLIC/cart.html"
cp "$HERE/hbnf-cart.js" "$PUBLIC/hbnf-cart.js"
cp "$HERE/hbnf-cart-manifest.webmanifest" "$PUBLIC/hbnf-cart-manifest.webmanifest"

node --check "$PUBLIC/hbnf-cart.js"
node "$HERE/HBNF_CART_UI_TEST.js"
grep -Fq "$MARKER" "$PUBLIC/hbnf-cart.html"
grep -Fq 'hbnf-cart-control' "$PUBLIC/hbnf-cart.js"
! grep -Fq 'hbnf-cart-orchestrator' "$PUBLIC/hbnf-cart.js"

echo "Running Wrangler dry run..."
(cd "$ROOT" && npx wrangler deploy --dry-run)

echo "Deploying canonical cart UI to Cloudflare..."
(cd "$ROOT" && npx wrangler deploy)
DEPLOYED=1

echo "Verifying live canonical UI..."
CACHE="$(date +%s)"
LIVE_HTML="$(curl -fsSL --max-time 20 "https://hbnightflyers.com/hbnf-cart.html?v=$CACHE")"
printf '%s' "$LIVE_HTML" | grep -Fq "$MARKER"
LIVE_ALIAS="$(curl -fsSL --max-time 20 "https://hbnightflyers.com/cart.html?v=$CACHE")"
printf '%s' "$LIVE_ALIAS" | grep -Fq "$MARKER"

for asset in hbnf-cart.js hbnf-cart-manifest.webmanifest; do
  TMP="$(mktemp "$TMPBASE/hbnf-cart-asset.XXXXXX")"
  curl -fsSL --max-time 20 "https://hbnightflyers.com/$asset?v=$CACHE" -o "$TMP"
  LOCAL_SHA="$(shasum -a 256 "$HERE/$asset" | awk '{print $1}')"
  LIVE_SHA="$(shasum -a 256 "$TMP" | awk '{print $1}')"
  rm -f "$TMP"
  [[ "$LOCAL_SHA" == "$LIVE_SHA" ]] || { echo "ERROR: production parity failed for $asset"; exit 1; }
done

trap - ERR INT TERM
rm -rf "$BACKUP"
echo "PASS canonical HBNF cart UI is live at /hbnf-cart.html and /cart.html."
echo "CANONICAL_CART_UI_DEPLOY=PASS"

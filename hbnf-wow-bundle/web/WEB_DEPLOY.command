#!/bin/bash
set -euo pipefail
VERSION="9.21.26_WOW_MAX_V3_FULL"
MARKER="hbnf-build-9.21.26-wow-max-v3-full"
HERE="$(cd "$(dirname "$0")" && pwd)"
TMPBASE="${TMPDIR:-/tmp}"; TMPBASE="${TMPBASE%/}"
CANDIDATES=("$HOME/Desktop/01 ACTIVE PROJECTS/HBNF-Website-Deploy/hbnf-static-worker" "$HOME/Desktop/HBNF-Website-Deploy/hbnf-static-worker")
ROOT=""
for x in "${CANDIDATES[@]}"; do [[ -d "$x/public" ]] && ROOT="$x" && break; done
[[ -n "$ROOT" ]] || { echo "ERROR: HBNF deployment root not found."; exit 1; }
PUBLIC="$ROOT/public"
BACKUP="$(mktemp -d "$TMPBASE/hbnf-matrix-flow-web-backup.XXXXXX")"
DEPLOYED=0
MANIFEST_EXISTED=0
restore_local(){
  cp "$BACKUP/matrix.html" "$PUBLIC/matrix.html"
  cp "$BACKUP/matrix-control.js" "$PUBLIC/matrix-control.js"
  if [[ "$MANIFEST_EXISTED" == "1" ]]; then cp "$BACKUP/matrix-manifest.webmanifest" "$PUBLIC/matrix-manifest.webmanifest"; else rm -f "$PUBLIC/matrix-manifest.webmanifest"; fi
}
rollback(){ echo "Rolling back previous Matrix web console..."; restore_local; (cd "$ROOT" && npx wrangler deploy) || true; }
fail(){ code=$?; echo; echo "ERROR: Matrix web deployment failed."; [[ "$DEPLOYED" == "1" ]] && rollback || restore_local || true; rm -rf "$BACKUP"; exit "$code"; }
trap fail ERR INT TERM

printf '\n== Deploy Matrix WOW MAX Console %s ==\n' "$VERSION"
[[ -f "$PUBLIC/matrix.html" && -f "$PUBLIC/matrix-control.js" ]] || { echo "ERROR: current Matrix files missing."; exit 1; }
cp "$PUBLIC/matrix.html" "$BACKUP/matrix.html"
cp "$PUBLIC/matrix-control.js" "$BACKUP/matrix-control.js"
if [[ -f "$PUBLIC/matrix-manifest.webmanifest" ]]; then MANIFEST_EXISTED=1; cp "$PUBLIC/matrix-manifest.webmanifest" "$BACKUP/matrix-manifest.webmanifest"; fi
cp "$HERE/matrix.html" "$PUBLIC/matrix.html"
cp "$HERE/matrix-control.js" "$PUBLIC/matrix-control.js"
cp "$HERE/matrix-manifest.webmanifest" "$PUBLIC/matrix-manifest.webmanifest"
node --check "$PUBLIC/matrix-control.js"
node "$HERE/MATRIX_UI_TEST.js" "$PUBLIC/matrix.html" "$PUBLIC/matrix-control.js" "$PUBLIC/matrix-manifest.webmanifest"

echo "Running Wrangler dry run..."
(cd "$ROOT" && npx wrangler deploy --dry-run)
echo "Deploying to Cloudflare..."
(cd "$ROOT" && npx wrangler deploy)
DEPLOYED=1

echo "Verifying production parity..."
CACHE="$(date +%s)"
LIVE_HTML="$(curl -fsSL --max-time 20 "https://hbnightflyers.com/matrix.html?v=$CACHE")"
printf '%s' "$LIVE_HTML" | grep -Fq "$MARKER"
for asset in matrix-control.js matrix-manifest.webmanifest; do
  TMP="$(mktemp "$TMPBASE/hbnf-flow-asset.XXXXXX")"
  curl -fsSL --max-time 20 "https://hbnightflyers.com/$asset?v=$CACHE" -o "$TMP"
  LOCAL_SHA="$(shasum -a 256 "$HERE/$asset" | awk '{print $1}')"
  LIVE_SHA="$(shasum -a 256 "$TMP" | awk '{print $1}')"
  rm -f "$TMP"
  [[ "$LOCAL_SHA" == "$LIVE_SHA" ]] || { echo "ERROR: production parity failed for $asset"; exit 1; }
done
trap - ERR INT TERM
rm -rf "$BACKUP"
echo "PASS Matrix WOW MAX full Course Console is live."

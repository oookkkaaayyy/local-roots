#!/bin/bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PARTDIR="$HERE/source-bundle"
EXPECTED="90b29bc0c6a51515c552431c580b6753c0811b2503387b86faedeb18d513c017"
TMPBASE="${TMPDIR:-/tmp}"; TMPBASE="${TMPBASE%/}"
WORK="$(mktemp -d "$TMPBASE/hbnf-wow-full-pwa.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

ZIP="$WORK/HBNF_MATRIX_WOW_FULL_PWA_V3_SOURCE.zip"
cat "$PARTDIR"/HBNF_MATRIX_WOW_FULL_PWA_V3_SOURCE.b64.part* | tr -d '\n' | base64 --decode > "$ZIP"
ACTUAL="$(shasum -a 256 "$ZIP" | awk '{print $1}')"
[[ "$ACTUAL" == "$EXPECTED" ]] || { echo "ERROR: source bundle SHA mismatch."; exit 1; }

mkdir "$WORK/unpacked"
unzip -q "$ZIP" -d "$WORK/unpacked"
SRC="$WORK/unpacked/HBNF_MATRIX_WOW_FULL_PWA_V3"
[[ -d "$SRC" ]] || { echo "ERROR: expected source folder missing."; exit 1; }

node --check "$SRC/matrix-control.js"
node "$SRC/MATRIX_UI_TEST.js" "$SRC/matrix.html" "$SRC/matrix-control.js" "$SRC/matrix-manifest.webmanifest"
chmod +x "$SRC/WEB_DEPLOY.command"

echo
echo "HBNF full-PWA source verified. Starting guarded Cloudflare static-site deployment."
echo "This updates web assets only; it does not flash or command the physical Matrix."
exec "$SRC/WEB_DEPLOY.command"

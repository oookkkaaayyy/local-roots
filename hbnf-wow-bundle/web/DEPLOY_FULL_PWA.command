#!/bin/bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PARTDIR="$HERE/source-bundle"
EXPECTED_B64="2399ce9c06377c10afdabe256365fe6ebc7013a2519ea565fe7af61b2586bd70"
EXPECTED_ZIP="ad32a0e6e24c130c9b4ed831b2b4d1af9c009472fcdf57e74f8ff884eaf9bdcc"
TMPBASE="${TMPDIR:-/tmp}"; TMPBASE="${TMPBASE%/}"
WORK="$(mktemp -d "$TMPBASE/hbnf-wow-full-pwa.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

B64="$WORK/HBNF_MATRIX_WOW_FULL_PWA_V3_SOURCE.b64"
ZIP="$WORK/HBNF_MATRIX_WOW_FULL_PWA_V3_SOURCE.zip"
cat "$PARTDIR"/HBNF_MATRIX_WOW_FULL_PWA_V3_SOURCE.b64.part* > "$B64"
ACTUAL_B64="$(shasum -a 256 "$B64" | awk '{print $1}')"
[[ "$ACTUAL_B64" == "$EXPECTED_B64" ]] || { echo "ERROR: source bundle stream SHA mismatch."; exit 1; }
tr -d '\n' < "$B64" | base64 --decode > "$ZIP"
ACTUAL_ZIP="$(shasum -a 256 "$ZIP" | awk '{print $1}')"
[[ "$ACTUAL_ZIP" == "$EXPECTED_ZIP" ]] || { echo "ERROR: source ZIP SHA mismatch."; exit 1; }

mkdir "$WORK/unpacked"
unzip -q "$ZIP" -d "$WORK/unpacked"
SRC="$WORK/unpacked/HBNF_MATRIX_WOW_FULL_PWA_V3"
[[ -d "$SRC" ]] || { echo "ERROR: expected source folder missing."; exit 1; }

node --check "$SRC/matrix-control.js"
node "$SRC/MATRIX_UI_TEST.js" "$SRC/matrix.html" "$SRC/matrix-control.js" "$SRC/matrix-manifest.webmanifest"
bash -n "$SRC/WEB_DEPLOY.command"
chmod +x "$SRC/WEB_DEPLOY.command"

echo
echo "HBNF full-PWA mobile-first source verified. Starting guarded Cloudflare static-site deployment."
echo "WEB ONLY: this does not flash, reboot, or command the physical Matrix."
exec "$SRC/WEB_DEPLOY.command"

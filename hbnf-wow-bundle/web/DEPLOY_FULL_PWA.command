#!/bin/bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PARTDIR="$HERE/source-bundle"
EXPECTED_B64="6b4054fa08642c926bef4bec986235cd26b6f3af2bf5e3608fdede1cbf4e86b3"
EXPECTED_ZIP="0dc5163592d6a5a6dfa2ad883e46da399e1a267067d449a60e4085cea8f5b91d"
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

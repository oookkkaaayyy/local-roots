#!/bin/sh
set -eu
PKG_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT=${HBNF_WWW_ROOT:-/www}
BASE="$ROOT/mission-control-local"
TARGET="$BASE/owner-pwa"
STAGE="$BASE/.owner-pwa.stage-v1.0.0"

[ "$(id -u)" = 0 ] || { echo "Run as root on the Opal." >&2; exit 77; }
[ -d "$BASE" ] && [ -w "$BASE" ] || { echo "Existing Mission Control root is unavailable." >&2; exit 78; }
[ -f "$BASE/.hbnf-package-marker" ] && [ "$(cat "$BASE/.hbnf-package-marker")" = "hbnf-owner-mission-control-local-v1" ] || { echo "Existing Mission Control identity is unexpected." >&2; exit 79; }
[ -f "$BASE/.hbnf-package-version" ] && [ "$(cat "$BASE/.hbnf-package-version")" = "1.0.2" ] || { echo "Expected accepted Mission Control v1.0.2 is not installed." >&2; exit 80; }
[ ! -e "$TARGET" ] && [ ! -e "$STAGE" ] || { echo "Owner PWA destination or staging path already exists; refusing to overwrite." >&2; exit 81; }
command -v sha256sum >/dev/null 2>&1 || { echo "sha256sum is required." >&2; exit 82; }
cleanup() { rc=$?; [ ! -e "$STAGE" ] || rm -rf "$STAGE"; exit "$rc"; }
trap cleanup EXIT HUP INT TERM
verify_base_file() {
  file=$1 expected=$2
  [ -f "$file" ] || return 1
  actual=$(sha256sum "$file" | awk '{print $1}')
  [ "$actual" = "$expected" ]
}
verify_base_file "$BASE/index.html" 0424ab290ab1d80dbbd1bff31e068009e3000cae22ec2792b92e4eef7bdcbcaf &&
verify_base_file "$BASE/styles.css" e2aceeabac8fa7e85fca1e638f50da6182d4e5b79fd5004a7a3c071915cc3522 &&
verify_base_file "$BASE/app.js" d44691025b16d95fb1a210a56d901c3ee6cdd74bf932a59f7ffe08679184df2b &&
verify_base_file "$BASE/local-transport.js" 51e4f03ff1ffc9d8cece0a3e6f14fefac77e642fe1a4eced95ca749d777f676a || { echo "Installed Mission Control base differs from the accepted v1.0.2 rollback target." >&2; exit 83; }
(cd "$PKG_DIR" && sha256sum -c PAYLOAD.SHA256SUMS >/dev/null) || { echo "Owner PWA payload integrity check failed." >&2; exit 84; }

mkdir -m 0755 "$STAGE"
cp -pR "$PKG_DIR/owner-pwa/." "$STAGE/"
sed 's#owner-pwa/##' "$PKG_DIR/PAYLOAD.SHA256SUMS" > "$STAGE/.hbnf-payload.sha256"
cp -p "$PKG_DIR/rollback.sh" "$STAGE/.hbnf-rollback.sh"
printf '%s\n' 'hbnf-owner-pwa-local-v1' > "$STAGE/.hbnf-package-marker"
printf '%s\n' '1.0.0' > "$STAGE/.hbnf-package-version"
chmod 0644 "$STAGE"/* "$STAGE"/.[!.]*
chmod 0755 "$STAGE/.hbnf-rollback.sh"
(cd "$STAGE" && sha256sum -c .hbnf-payload.sha256 >/dev/null) || { rm -rf "$STAGE"; echo "Staged payload verification failed." >&2; exit 85; }
set -- $(find "$STAGE" -type f | wc -l | tr -d ' ')
[ "$1" = 17 ] || { rm -rf "$STAGE"; echo "Unexpected staged file set." >&2; exit 86; }
mv "$STAGE" "$TARGET"
echo "Installed existing Owner PWA at $TARGET. Existing Mission Control v1.0.2 and Skins relay were not replaced."
echo "Open http://192.168.77.1/mission-control-local/owner-pwa/hbnf-cart.html"

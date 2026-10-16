#!/bin/sh
set -eu
PKG_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT=${HBNF_WWW_ROOT:-/www}
BACKUP_ROOT=${HBNF_BACKUP_ROOT:-/root}
BASE="$ROOT/mission-control-local"
TARGET="$BASE/owner-pwa"
BACKUP="$BACKUP_ROOT/hbnf-owner-pwa-local.rollback-v1.0.0"
STAGE="$BASE/.owner-pwa.stage-v1.0.1"
PREVIOUS="$BASE/.owner-pwa.previous-v1.0.1"
FAILED="$BASE/.owner-pwa.failed-v1.0.1"
BASELINE="$PKG_DIR/BASELINE.SHA256SUMS"
BASELINE_HASH=d98f53e17f4104568214db3a2b7d1af150f1647097dbd63506df1d497b490499

[ "$(id -u)" = 0 ] || { echo "Run as root on the Opal." >&2; exit 77; }
[ -d "$BASE" ] && [ -w "$BASE" ] || { echo "Existing Mission Control root is unavailable." >&2; exit 78; }
[ -d "$BACKUP_ROOT" ] && [ -w "$BACKUP_ROOT" ] || { echo "Rollback location is unavailable or not writable." >&2; exit 79; }
[ -d "$TARGET" ] || { echo "Installed Owner PWA v1.0.0 is missing." >&2; exit 80; }
[ ! -e "$BACKUP" ] && [ ! -e "$STAGE" ] && [ ! -e "$PREVIOUS" ] && [ ! -e "$FAILED" ] || { echo "An update or recovery path already exists; inspect before proceeding." >&2; exit 81; }
[ -f "$BASE/.hbnf-package-marker" ] && [ "$(cat "$BASE/.hbnf-package-marker")" = "hbnf-owner-mission-control-local-v1" ] || { echo "Mission Control identity is unexpected." >&2; exit 82; }
[ -f "$BASE/.hbnf-package-version" ] && [ "$(cat "$BASE/.hbnf-package-version")" = "1.0.2" ] || { echo "Expected accepted Mission Control v1.0.2 is not installed." >&2; exit 83; }
[ -f "$TARGET/.hbnf-package-marker" ] && [ "$(cat "$TARGET/.hbnf-package-marker")" = "hbnf-owner-pwa-local-v1" ] || { echo "Owner PWA identity is unexpected." >&2; exit 84; }
[ -f "$TARGET/.hbnf-package-version" ] && [ "$(cat "$TARGET/.hbnf-package-version")" = "1.0.0" ] || { echo "Expected installed Owner PWA v1.0.0 is not present." >&2; exit 85; }
command -v sha256sum >/dev/null 2>&1 || { echo "sha256sum is required." >&2; exit 86; }
verify_file() {
  file=$1 expected=$2
  [ -f "$file" ] || return 1
  actual=$(sha256sum "$file" | awk '{print $1}')
  [ "$actual" = "$expected" ]
}
verify_file "$BASE/index.html" 0424ab290ab1d80dbbd1bff31e068009e3000cae22ec2792b92e4eef7bdcbcaf &&
verify_file "$BASE/styles.css" e2aceeabac8fa7e85fca1e638f50da6182d4e5b79fd5004a7a3c071915cc3522 &&
verify_file "$BASE/app.js" d44691025b16d95fb1a210a56d901c3ee6cdd74bf932a59f7ffe08679184df2b &&
verify_file "$BASE/local-transport.js" 51e4f03ff1ffc9d8cece0a3e6f14fefac77e642fe1a4eced95ca749d777f676a || { echo "Accepted Mission Control v1.0.2 differs from its recorded identity." >&2; exit 87; }
verify_file "$BASELINE" "$BASELINE_HASH" || { echo "Pinned v1.0.0 recovery manifest is invalid." >&2; exit 88; }
[ -f "$TARGET/.hbnf-payload.sha256" ] && cmp -s "$TARGET/.hbnf-payload.sha256" "$BASELINE" || { echo "Installed Owner PWA is not the exact recorded v1.0.0 baseline." >&2; exit 89; }
(cd "$TARGET" && sha256sum -c "$BASELINE" >/dev/null) || { echo "Installed v1.0.0 payload verification failed." >&2; exit 90; }
set -- $(find "$TARGET" -type f | wc -l | tr -d ' ')
[ "$1" = 17 ] || { echo "Unexpected installed Owner PWA file set." >&2; exit 91; }
(cd "$PKG_DIR" && sha256sum -c PAYLOAD.SHA256SUMS >/dev/null) || { echo "Candidate payload integrity check failed." >&2; exit 92; }

mkdir -m 0755 "$STAGE"
cp -pR "$PKG_DIR/owner-pwa/." "$STAGE/"
sed 's#owner-pwa/##' "$PKG_DIR/PAYLOAD.SHA256SUMS" > "$STAGE/.hbnf-payload.sha256"
cp -p "$PKG_DIR/rollback.sh" "$STAGE/.hbnf-rollback.sh"
printf '%s\n' 'hbnf-owner-pwa-local-v1' > "$STAGE/.hbnf-package-marker"
printf '%s\n' '1.0.1' > "$STAGE/.hbnf-package-version"
chmod 0644 "$STAGE"/* "$STAGE"/.[!.]*
chmod 0755 "$STAGE/.hbnf-rollback.sh"
(cd "$STAGE" && sha256sum -c .hbnf-payload.sha256 >/dev/null) || { rm -rf "$STAGE"; echo "Staged payload verification failed." >&2; exit 93; }
set -- $(find "$STAGE" -type f | wc -l | tr -d ' ')
[ "$1" = 17 ] || { rm -rf "$STAGE"; echo "Unexpected staged file set." >&2; exit 94; }
cp -a "$TARGET" "$BACKUP"
if ! (cd "$BACKUP" && cmp -s .hbnf-payload.sha256 "$BASELINE" && sha256sum -c .hbnf-payload.sha256 >/dev/null); then
  rm -rf "$BACKUP"
  echo "Exact rollback copy did not verify." >&2
  exit 95
fi
cp -p "$BASELINE" "$BACKUP_ROOT/hbnf-owner-pwa-v1.0.0.BASELINE.SHA256SUMS"
verify_file "$BACKUP_ROOT/hbnf-owner-pwa-v1.0.0.BASELINE.SHA256SUMS" "$BASELINE_HASH" || { echo "Rollback manifest preservation failed; baseline remains at $BACKUP." >&2; exit 96; }

restore_on_error() {
  rc=$?
  if [ "$rc" -ne 0 ] && [ -e "$PREVIOUS" ]; then
    [ ! -e "$TARGET" ] || mv "$TARGET" "$FAILED" || { echo "Failed candidate preserved; exact v1.0.0 rollback remains at $BACKUP." >&2; exit 97; }
    mv "$PREVIOUS" "$TARGET" || { echo "Automatic restoration failed; exact v1.0.0 rollback remains at $BACKUP." >&2; exit 98; }
    (cd "$TARGET" && cmp -s .hbnf-payload.sha256 "$BASELINE" && sha256sum -c .hbnf-payload.sha256 >/dev/null) || { echo "Restored v1.0.0 verification failed; preserve $BACKUP." >&2; exit 99; }
  fi
  [ ! -e "$STAGE" ] || rm -rf "$STAGE"
  exit "$rc"
}
trap restore_on_error EXIT HUP INT TERM
mv "$TARGET" "$PREVIOUS"
mv "$STAGE" "$TARGET"
(cd "$TARGET" && sha256sum -c .hbnf-payload.sha256 >/dev/null) || { echo "Installed candidate payload verification failed." >&2; exit 100; }
[ "$(cat "$TARGET/.hbnf-package-version")" = "1.0.1" ] || { echo "Installed version readback failed." >&2; exit 101; }
rm -rf "$PREVIOUS"
trap - EXIT HUP INT TERM
echo "Updated Owner PWA to v1.0.1 at $TARGET. Exact v1.0.0 rollback retained at $BACKUP."
echo "Mission Control v1.0.2, Skins relay, firmware, and network settings were not changed."
echo "Open http://192.168.77.1/mission-control-local/owner-pwa/hbnf-cart.html"

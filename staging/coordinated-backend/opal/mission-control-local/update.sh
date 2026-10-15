#!/bin/sh
set -eu
PKG_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT=/www
TARGET="$ROOT/mission-control-local"
BACKUP=/root/hbnf-mission-control-local.rollback-v1.0.0
STAGE="$ROOT/.mission-control-local.stage-v1.0.1"
PREVIOUS="$ROOT/.mission-control-local.previous.$$"
FAILED="$ROOT/.mission-control-local.failed.$$"

[ "$(id -u)" = 0 ] || { echo "Run as root on the Opal." >&2; exit 77; }
[ -d "$ROOT" ] && [ -w "$ROOT" ] || { echo "Opal static root /www is unavailable or not writable." >&2; exit 78; }
[ -d "$TARGET" ] || { echo "Existing Mission Control v1.0.0 is missing; refusing update." >&2; exit 80; }
[ ! -e "$BACKUP" ] || { echo "Rollback snapshot already exists; refusing a second update." >&2; exit 81; }
[ ! -e "$STAGE" ] && [ ! -e "$PREVIOUS" ] && [ ! -e "$FAILED" ] || { echo "A prior update staging path exists; inspect it before proceeding." >&2; exit 82; }
[ -f "$TARGET/.hbnf-package-marker" ] && [ "$(cat "$TARGET/.hbnf-package-marker")" = "hbnf-owner-mission-control-local-v1" ] || { echo "Unexpected target marker; refusing update." >&2; exit 83; }
if [ -f "$TARGET/.hbnf-package-version" ]; then
  [ "$(cat "$TARGET/.hbnf-package-version")" = "1.0.0" ] || { echo "Unexpected installed package version; refusing update." >&2; exit 84; }
fi
command -v sha256sum >/dev/null 2>&1 || { echo "sha256sum is required; refusing update." >&2; exit 85; }
(cd "$PKG_DIR" && sha256sum -c SHA256SUMS >/dev/null) || { echo "Package integrity check failed." >&2; exit 86; }

verify_file(){
  file=$1
  expected=$2
  actual=
  [ -f "$file" ] || { echo "Missing file: $file" >&2; return 1; }
  actual=$(sha256sum "$file" | awk '{print $1}')
  [ "$actual" = "$expected" ] || { echo "Unexpected file identity: $file" >&2; return 1; }
}
verify_v100(){
  dir=$1
  verify_file "$dir/index.html" d4c08cfb6830023f8b02f0dac0a379bae22aba9a47bb9fefa97b43dfc8d3c31d &&
  verify_file "$dir/styles.css" e2aceeabac8fa7e85fca1e638f50da6182d4e5b79fd5004a7a3c071915cc3522 &&
  verify_file "$dir/app.js" 4a6e649c850b86797020f8cbadcf77439640316be9682a370df04ae8fbac7ea1 &&
  verify_file "$dir/local-transport.js" f519f82e14106806f3a2c21bf2f724118260c8ccd5a719cac097f122dc86576a &&
  verify_file "$dir/rollback.sh" e3a8dfdd48bd31d6634f8b0752553a93ae532945c2d89c50c92cbd7a94aa8166
}
set -- $(find "$TARGET" -type d | wc -l)
[ "$1" = "1" ] || { echo "Unexpected nested target directories; refusing replacement." >&2; exit 87; }
set -- $(find "$TARGET" -type f | wc -l)
[ "$1" = "6" ] || { echo "Unexpected target file set; refusing replacement." >&2; exit 88; }
verify_v100 "$TARGET" || { echo "Installed files do not match the exact v1.0.0 rollback baseline." >&2; exit 89; }

cleanup(){
  rc=$?
  if [ "$rc" -ne 0 ]; then
    [ ! -e "$STAGE" ] || rm -rf "$STAGE"
    if [ -e "$PREVIOUS" ]; then
      if [ -e "$TARGET" ]; then mv "$TARGET" "$FAILED" || { echo "Automatic restore could not move the failed candidate; preserve $BACKUP and $PREVIOUS." >&2; exit 90; }; fi
      mv "$PREVIOUS" "$TARGET" || { echo "Automatic restore failed; preserve $BACKUP for manual recovery." >&2; exit 91; }
      [ ! -e "$FAILED" ] || rm -rf "$FAILED"
      verify_v100 "$TARGET" || { echo "Restored target did not match the verified v1.0.0 files; preserve $BACKUP." >&2; exit 92; }
      [ ! -e "$BACKUP" ] || rm -rf "$BACKUP"
    elif [ -e "$BACKUP" ] && verify_v100 "$TARGET" >/dev/null 2>&1; then
      rm -rf "$BACKUP"
    fi
  fi
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

cp -a "$TARGET" "$BACKUP"
verify_v100 "$BACKUP" || { echo "Rollback snapshot verification failed; refusing update." >&2; exit 93; }
mkdir -m 0755 "$STAGE"
cp "$PKG_DIR/index.html" "$PKG_DIR/styles.css" "$PKG_DIR/app.js" "$PKG_DIR/local-transport.js" "$PKG_DIR/rollback.sh" "$PKG_DIR/rollback-update.sh" "$STAGE/"
printf '%s\n' 'hbnf-owner-mission-control-local-v1' > "$STAGE/.hbnf-package-marker"
printf '%s\n' '1.0.1' > "$STAGE/.hbnf-package-version"
chmod 0644 "$STAGE/index.html" "$STAGE/styles.css" "$STAGE/app.js" "$STAGE/local-transport.js" "$STAGE/.hbnf-package-marker" "$STAGE/.hbnf-package-version"
chmod 0755 "$STAGE/rollback.sh" "$STAGE/rollback-update.sh"
mv "$TARGET" "$PREVIOUS"
mv "$STAGE" "$TARGET"
new_app_sha=$(sha256sum "$PKG_DIR/app.js" | awk '{print $1}')
new_transport_sha=$(sha256sum "$PKG_DIR/local-transport.js" | awk '{print $1}')
verify_file "$TARGET/app.js" "$new_app_sha"
verify_file "$TARGET/local-transport.js" "$new_transport_sha"
rm -rf "$PREVIOUS"
trap - EXIT HUP INT TERM
echo "Installed Mission Control v1.0.1 at $TARGET. Exact v1.0.0 rollback snapshot retained at $BACKUP."
echo "No router settings, Nginx configuration, relays, firmware, or device state were changed."

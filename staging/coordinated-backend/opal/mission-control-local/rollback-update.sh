#!/bin/sh
set -eu
ROOT=/www
TARGET="$ROOT/mission-control-local"
BACKUP=/root/hbnf-mission-control-local.rollback-v1.0.0
FAILED="$ROOT/.mission-control-local.failed-rollback.$$"

[ "$(id -u)" = 0 ] || { echo "Run as root on the Opal." >&2; exit 77; }
[ -d "$TARGET" ] && [ -d "$BACKUP" ] || { echo "Candidate or exact rollback snapshot is missing." >&2; exit 80; }
[ -f "$TARGET/.hbnf-package-version" ] && [ "$(cat "$TARGET/.hbnf-package-version")" = "1.0.1" ] || { echo "Installed candidate identity mismatch; refusing rollback." >&2; exit 81; }
[ -f "$BACKUP/.hbnf-package-marker" ] && [ "$(cat "$BACKUP/.hbnf-package-marker")" = "hbnf-owner-mission-control-local-v1" ] || { echo "Rollback snapshot marker mismatch." >&2; exit 82; }
[ ! -e "$FAILED" ] || { echo "Rollback staging path already exists; inspect before proceeding." >&2; exit 83; }
verify_file(){
  file=$1
  expected=$2
  actual=
  [ -f "$file" ] || { echo "Missing rollback file: $file" >&2; return 1; }
  actual=$(sha256sum "$file" | awk '{print $1}')
  [ "$actual" = "$expected" ] || { echo "Rollback file identity mismatch: $file" >&2; return 1; }
}
verify_v100(){
  dir=$1
  verify_file "$dir/index.html" d4c08cfb6830023f8b02f0dac0a379bae22aba9a47bb9fefa97b43dfc8d3c31d &&
  verify_file "$dir/styles.css" e2aceeabac8fa7e85fca1e638f50da6182d4e5b79fd5004a7a3c071915cc3522 &&
  verify_file "$dir/app.js" 4a6e649c850b86797020f8cbadcf77439640316be9682a370df04ae8fbac7ea1 &&
  verify_file "$dir/local-transport.js" f519f82e14106806f3a2c21bf2f724118260c8ccd5a719cac097f122dc86576a &&
  verify_file "$dir/rollback.sh" e3a8dfdd48bd31d6634f8b0752553a93ae532945c2d89c50c92cbd7a94aa8166
}
command -v sha256sum >/dev/null 2>&1 || { echo "sha256sum is required; refusing rollback." >&2; exit 84; }
verify_v100 "$BACKUP" || { echo "Exact v1.0.0 snapshot verification failed; refusing rollback." >&2; exit 85; }
mv "$TARGET" "$FAILED"
if ! mv "$BACKUP" "$TARGET"; then
  mv "$FAILED" "$TARGET"
  echo "Rollback swap failed; v1.0.1 was restored in place." >&2
  exit 86
fi
if ! verify_v100 "$TARGET"; then
  mv "$TARGET" "$BACKUP"
  mv "$FAILED" "$TARGET"
  echo "Rollback readback failed; v1.0.1 was restored in place." >&2
  exit 87
fi
rm -rf "$FAILED"
echo "Restored the exact v1.0.0 static files at $TARGET."
echo "No router settings, Nginx configuration, relays, firmware, or device state were changed."

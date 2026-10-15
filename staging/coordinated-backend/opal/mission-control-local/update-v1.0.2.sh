#!/bin/sh
set -eu
PKG_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT=${HBNF_WWW_ROOT:-/www}
BACKUP_ROOT=${HBNF_BACKUP_ROOT:-/root}
TARGET="$ROOT/mission-control-local"
BACKUP="$BACKUP_ROOT/hbnf-mission-control-local.rollback-v1.0.1"
STAGE="$ROOT/.mission-control-local.stage-v1.0.2"
PREVIOUS="$ROOT/.mission-control-local.previous-v1.0.2"
FAILED="$ROOT/.mission-control-local.failed-v1.0.2"

[ "$(id -u)" = 0 ] || { echo "Run as root on the Opal." >&2; exit 77; }
[ -d "$ROOT" ] && [ -w "$ROOT" ] || { echo "Opal static root is unavailable or not writable." >&2; exit 78; }
[ -d "$BACKUP_ROOT" ] && [ -w "$BACKUP_ROOT" ] || { echo "Rollback location is unavailable or not writable." >&2; exit 79; }
[ -d "$TARGET" ] || { echo "Existing Mission Control directory is missing." >&2; exit 80; }
[ ! -e "$BACKUP" ] && [ ! -e "$STAGE" ] && [ ! -e "$PREVIOUS" ] && [ ! -e "$FAILED" ] || { echo "A v1.0.2 update or rollback path already exists; inspect before proceeding." >&2; exit 81; }
[ -f "$TARGET/.hbnf-package-marker" ] && [ "$(cat "$TARGET/.hbnf-package-marker")" = "hbnf-owner-mission-control-local-v1" ] || { echo "Unexpected Mission Control marker; refusing update." >&2; exit 82; }
[ -f "$TARGET/.hbnf-package-version" ] && [ "$(cat "$TARGET/.hbnf-package-version")" = "1.0.1" ] || { echo "Installed package is not the expected v1.0.1." >&2; exit 83; }
command -v sha256sum >/dev/null 2>&1 || { echo "sha256sum is required." >&2; exit 84; }
(cd "$PKG_DIR" && sha256sum -c SHA256SUMS >/dev/null) || { echo "Candidate package integrity check failed." >&2; exit 85; }

verify_file(){
  file=$1 expected=$2
  [ -f "$file" ] || { echo "Missing file: $file" >&2; return 1; }
  actual=$(sha256sum "$file" | awk '{print $1}')
  [ "$actual" = "$expected" ] || { echo "Unexpected file identity: $file" >&2; return 1; }
}
verify_v101(){
  dir=$1
  verify_file "$dir/index.html" d4c08cfb6830023f8b02f0dac0a379bae22aba9a47bb9fefa97b43dfc8d3c31d &&
  verify_file "$dir/styles.css" e2aceeabac8fa7e85fca1e638f50da6182d4e5b79fd5004a7a3c071915cc3522 &&
  verify_file "$dir/app.js" 20f33bf6cd8ce7526fc240ea66aebd3b49b7a4e95aea2520c566a80e86930d44 &&
  verify_file "$dir/local-transport.js" a91e84c89a481739f9c47c619a1d3c5c35d690869c54159486d528d3863c746e &&
  verify_file "$dir/rollback.sh" e3a8dfdd48bd31d6634f8b0752553a93ae532945c2d89c50c92cbd7a94aa8166 &&
  verify_file "$dir/rollback-update.sh" 68759bf32d762508eb76a48a7693dd0c1bf6a33615370fd2ee504e663218eb6f
}
set -- $(find "$TARGET" -type d | wc -l); [ "$1" = 1 ] || { echo "Unexpected directory tree; refusing update." >&2; exit 86; }
set -- $(find "$TARGET" -type f | wc -l); [ "$1" = 8 ] || { echo "Unexpected installed file set; refusing update." >&2; exit 87; }
verify_v101 "$TARGET" || { echo "Installed v1.0.1 does not match the exact recorded baseline." >&2; exit 88; }

cp -a "$TARGET" "$BACKUP"
verify_v101 "$BACKUP" || { echo "Exact rollback copy verification failed." >&2; exit 89; }
mkdir -m 0755 "$STAGE"
cp "$PKG_DIR/index.html" "$PKG_DIR/styles.css" "$PKG_DIR/app.js" "$PKG_DIR/local-transport.js" "$PKG_DIR/rollback.sh" "$PKG_DIR/rollback-v1.0.2.sh" "$STAGE/"
printf '%s\n' 'hbnf-owner-mission-control-local-v1' > "$STAGE/.hbnf-package-marker"
printf '%s\n' '1.0.2' > "$STAGE/.hbnf-package-version"
chmod 0644 "$STAGE/index.html" "$STAGE/styles.css" "$STAGE/app.js" "$STAGE/local-transport.js" "$STAGE/.hbnf-package-marker" "$STAGE/.hbnf-package-version"
chmod 0755 "$STAGE/rollback.sh" "$STAGE/rollback-v1.0.2.sh"

restore(){
  rc=$?
  if [ "$rc" -ne 0 ] && [ -e "$PREVIOUS" ]; then
    if [ -e "$TARGET" ]; then mv "$TARGET" "$FAILED" || { echo "Could not preserve failed candidate; v1.0.1 snapshot remains at $BACKUP." >&2; exit 90; }; fi
    mv "$PREVIOUS" "$TARGET" || { echo "Automatic restoration failed; v1.0.1 snapshot remains at $BACKUP." >&2; exit 91; }
    verify_v101 "$TARGET" || { echo "Restored v1.0.1 did not verify; preserve $BACKUP." >&2; exit 92; }
    [ ! -e "$FAILED" ] || rm -rf "$FAILED"
  fi
  [ ! -e "$STAGE" ] || rm -rf "$STAGE"
  exit "$rc"
}
trap restore EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
mv "$TARGET" "$PREVIOUS"
mv "$STAGE" "$TARGET"
for f in index.html styles.css app.js local-transport.js rollback.sh rollback-v1.0.2.sh; do
  expected=$(awk -v n="$f" '$2==n{print $1}' "$PKG_DIR/SHA256SUMS")
  verify_file "$TARGET/$f" "$expected"
done
[ "$(cat "$TARGET/.hbnf-package-version")" = "1.0.2" ] || { echo "Candidate version readback failed." >&2; exit 93; }
rm -rf "$PREVIOUS"
trap - EXIT HUP INT TERM
echo "Installed Mission Control v1.0.2 at $TARGET. Exact v1.0.1 rollback retained at $BACKUP."
echo "Only /www/mission-control-local was changed."

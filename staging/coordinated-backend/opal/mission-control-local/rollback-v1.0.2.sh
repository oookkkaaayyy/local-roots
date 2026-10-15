#!/bin/sh
set -eu
ROOT=${HBNF_WWW_ROOT:-/www}
BACKUP_ROOT=${HBNF_BACKUP_ROOT:-/root}
TARGET="$ROOT/mission-control-local"
BACKUP="$BACKUP_ROOT/hbnf-mission-control-local.rollback-v1.0.1"
FAILED="$ROOT/.mission-control-local.failed-rollback-v1.0.2"

[ "$(id -u)" = 0 ] || { echo "Run as root on the Opal." >&2; exit 77; }
[ -d "$TARGET" ] && [ -d "$BACKUP" ] || { echo "Candidate or exact v1.0.1 rollback is missing." >&2; exit 80; }
[ -f "$TARGET/.hbnf-package-version" ] && [ "$(cat "$TARGET/.hbnf-package-version")" = "1.0.2" ] || { echo "Installed candidate is not v1.0.2; refusing rollback." >&2; exit 81; }
[ -f "$BACKUP/.hbnf-package-version" ] && [ "$(cat "$BACKUP/.hbnf-package-version")" = "1.0.1" ] || { echo "Rollback snapshot is not v1.0.1." >&2; exit 82; }
[ ! -e "$FAILED" ] || { echo "Rollback staging path already exists; inspect it first." >&2; exit 83; }
command -v sha256sum >/dev/null 2>&1 || { echo "sha256sum is required." >&2; exit 84; }
verify_file(){ file=$1 expected=$2; [ -f "$file" ] || return 1; actual=$(sha256sum "$file" | awk '{print $1}'); [ "$actual" = "$expected" ] || { echo "Rollback identity mismatch: $file" >&2; return 1; }; }
verify_v101(){
  dir=$1
  verify_file "$dir/index.html" d4c08cfb6830023f8b02f0dac0a379bae22aba9a47bb9fefa97b43dfc8d3c31d &&
  verify_file "$dir/styles.css" e2aceeabac8fa7e85fca1e638f50da6182d4e5b79fd5004a7a3c071915cc3522 &&
  verify_file "$dir/app.js" 20f33bf6cd8ce7526fc240ea66aebd3b49b7a4e95aea2520c566a80e86930d44 &&
  verify_file "$dir/local-transport.js" a91e84c89a481739f9c47c619a1d3c5c35d690869c54159486d528d3863c746e &&
  verify_file "$dir/rollback.sh" e3a8dfdd48bd31d6634f8b0752553a93ae532945c2d89c50c92cbd7a94aa8166 &&
  verify_file "$dir/rollback-update.sh" 68759bf32d762508eb76a48a7693dd0c1bf6a33615370fd2ee504e663218eb6f
}
verify_v101 "$BACKUP" || { echo "Exact v1.0.1 snapshot verification failed; refusing rollback." >&2; exit 85; }
mv "$TARGET" "$FAILED"
if ! mv "$BACKUP" "$TARGET"; then mv "$FAILED" "$TARGET"; echo "Rollback swap failed; v1.0.2 restored." >&2; exit 86; fi
if ! verify_v101 "$TARGET"; then mv "$TARGET" "$BACKUP"; mv "$FAILED" "$TARGET"; echo "Restored state failed verification; v1.0.2 restored." >&2; exit 87; fi
rm -rf "$FAILED"
echo "Restored exact Mission Control v1.0.1 files at $TARGET."

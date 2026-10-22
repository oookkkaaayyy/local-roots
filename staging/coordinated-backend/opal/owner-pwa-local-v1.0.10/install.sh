#!/bin/sh
set -eu

PKG_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
WWW_ROOT=${HBNF_WWW_ROOT:-/www}
BACKUP_ROOT=${HBNF_BACKUP_ROOT:-/root}
BASE="$WWW_ROOT/mission-control-local"
TARGET="$BASE/owner-pwa"
TX="OWNER-PWA-LOCAL-V110-COURSE-STATUS-20261022-01"
BACKUP="$BACKUP_ROOT/hbnf-owner-pwa-local.rollback-$TX"
BASELINE_COPY="$BACKUP_ROOT/hbnf-owner-pwa-$TX.BASELINE.SHA256SUMS"
STAGE="$BASE/.owner-pwa.stage-$TX"
PREVIOUS="$BASE/.owner-pwa.previous-$TX"
FAILED="$BASE/.owner-pwa.failed-$TX"
BASELINE="$PKG_DIR/BASELINE.SHA256SUMS"
BASELINE_SHA256=b8802bc9d956ca9e19c127c0bd362f173b103adc4c5e20808eef426cf0c01fb5
BASE_MARKER_SHA256=fbeeb20927e58ff3bea0d0a66d5e996dbaefcbb72259a80a45ff206585137835
BASE_VERSION_SHA256=9fd28642d3aca191e5c7fc2383cfd6fabb2aac8743f029dabb8989ac584e31bc

[ "$(id -u)" = 0 ] || { echo "Run as root on the Opal." >&2; exit 77; }
[ -d "$BASE" ] && [ -w "$BASE" ] || { echo "Existing Mission Control root is unavailable." >&2; exit 78; }
[ -d "$BACKUP_ROOT" ] && [ -w "$BACKUP_ROOT" ] || { echo "Rollback location is unavailable or not writable." >&2; exit 79; }
[ -d "$TARGET" ] && [ ! -L "$TARGET" ] || { echo "Installed Owner PWA directory is missing or is a symlink." >&2; exit 80; }
[ -f "$BASE/.hbnf-package-marker" ] && [ "$(cat "$BASE/.hbnf-package-marker")" = "hbnf-owner-pwa-empty-runtime-recovery-v2" ] || { echo "Mission Control identity is unexpected." >&2; exit 81; }
[ -f "$BASE/.hbnf-package-version" ] && [ "$(cat "$BASE/.hbnf-package-version")" = "1.0.2" ] || { echo "Accepted Mission Control v1.0.2 is not installed." >&2; exit 82; }
[ -f "$TARGET/.hbnf-package-marker" ] && [ "$(cat "$TARGET/.hbnf-package-marker")" = "hbnf-owner-pwa-local-v1" ] || { echo "Owner PWA identity is unexpected." >&2; exit 83; }
[ -f "$TARGET/.hbnf-package-version" ] && [ "$(cat "$TARGET/.hbnf-package-version")" = "1.0.9" ] || { echo "Expected Owner PWA v1.0.9 is not installed." >&2; exit 84; }
[ ! -e "$BACKUP" ] && [ ! -e "$BASELINE_COPY" ] && [ ! -e "$STAGE" ] && [ ! -e "$PREVIOUS" ] && [ ! -e "$FAILED" ] || { echo "A transaction recovery path already exists; inspect before proceeding." >&2; exit 85; }
command -v sha256sum >/dev/null 2>&1 || { echo "sha256sum is required." >&2; exit 86; }

verify_file() {
  file=$1 expected=$2
  [ -f "$file" ] || return 1
  actual=$(sha256sum "$file" | awk '{print $1}')
  [ "$actual" = "$expected" ]
}

verify_file "$BASE/.hbnf-package-marker" "$BASE_MARKER_SHA256" &&
verify_file "$BASE/.hbnf-package-version" "$BASE_VERSION_SHA256" &&
verify_file "$BASE/index.html" 0424ab290ab1d80dbbd1bff31e068009e3000cae22ec2792b92e4eef7bdcbcaf &&
verify_file "$BASE/styles.css" e2aceeabac8fa7e85fca1e638f50da6182d4e5b79fd5004a7a3c071915cc3522 &&
verify_file "$BASE/app.js" d44691025b16d95fb1a210a56d901c3ee6cdd74bf932a59f7ffe08679184df2b &&
verify_file "$BASE/local-transport.js" 51e4f03ff1ffc9d8cece0a3e6f14fefac77e642fe1a4eced95ca749d777f676a || { echo "Mission Control v1.0.2 or the unchanged local transport differs from its recovery-v2 identity." >&2; exit 87; }
verify_file "$BASELINE" "$BASELINE_SHA256" || { echo "Candidate-bound exact installed-tree manifest is invalid." >&2; exit 88; }

set -- $(find "$TARGET" -maxdepth 1 -type f | wc -l | tr -d ' ')
[ "$1" = 20 ] || { echo "Installed Owner PWA file count differs from the inspected baseline." >&2; exit 89; }
[ -z "$(find "$TARGET" -mindepth 1 -maxdepth 1 ! -type f -print)" ] || { echo "Installed Owner PWA contains a non-file entry; inspect before proceeding." >&2; exit 90; }
(cd "$TARGET" && sha256sum -c "$BASELINE" >/dev/null) || { echo "Installed Owner PWA differs from the exact inspected filesystem baseline." >&2; exit 91; }
(cd "$PKG_DIR" && sha256sum -c PAYLOAD.SHA256SUMS >/dev/null) || { echo "Candidate payload integrity check failed." >&2; exit 92; }

mkdir -m 0755 "$STAGE"
cp -pR "$PKG_DIR/owner-pwa/." "$STAGE/"
sed 's#owner-pwa/##' "$PKG_DIR/PAYLOAD.SHA256SUMS" > "$STAGE/.hbnf-payload.sha256"
cp -p "$PKG_DIR/rollback.sh" "$STAGE/.hbnf-rollback.sh"
printf '%s\n' 'hbnf-owner-pwa-local-v1' > "$STAGE/.hbnf-package-marker"
printf '%s\n' '1.0.10' > "$STAGE/.hbnf-package-version"
chmod 0644 "$STAGE"/* "$STAGE"/.[!.]*
chmod 0755 "$STAGE/.hbnf-rollback.sh"
(cd "$STAGE" && sha256sum -c .hbnf-payload.sha256 >/dev/null) || { echo "Staged candidate payload verification failed." >&2; exit 93; }
set -- $(find "$STAGE" -maxdepth 1 -type f | wc -l | tr -d ' ')
[ "$1" = 20 ] || { echo "Staged Owner PWA file count is unexpected." >&2; exit 94; }
[ -z "$(find "$STAGE" -mindepth 1 -maxdepth 1 ! -type f -print)" ] || { echo "Staged Owner PWA contains a non-file entry." >&2; exit 95; }

cp -a "$TARGET" "$BACKUP"
cp -p "$BASELINE" "$BASELINE_COPY"
verify_file "$BASELINE_COPY" "$BASELINE_SHA256" || { echo "Exact rollback manifest copy failed; original Owner PWA remains in place." >&2; exit 96; }
set -- $(find "$BACKUP" -maxdepth 1 -type f | wc -l | tr -d ' ')
[ "$1" = 20 ] && (cd "$BACKUP" && sha256sum -c "$BASELINE_COPY" >/dev/null) || { echo "Exact rollback copy failed verification; original Owner PWA remains in place." >&2; exit 97; }

restore_on_error() {
  rc=$?
  if [ "$rc" -ne 0 ] && [ -e "$PREVIOUS" ]; then
    if [ -e "$TARGET" ]; then
      [ ! -e "$FAILED" ] || { echo "Candidate and exact rollback copies retained; failure path already exists." >&2; exit 98; }
      mv "$TARGET" "$FAILED" || { echo "Candidate preserved; exact baseline remains at $PREVIOUS and $BACKUP." >&2; exit 99; }
    fi
    mv "$PREVIOUS" "$TARGET" || { echo "Exact baseline remains at $BACKUP; restoration from $PREVIOUS failed." >&2; exit 100; }
    (cd "$TARGET" && sha256sum -c "$BASELINE_COPY" >/dev/null) || { echo "Restored baseline did not verify; exact backup remains at $BACKUP." >&2; exit 101; }
  fi
  [ ! -e "$STAGE" ] || rm -rf "$STAGE"
  exit "$rc"
}
trap restore_on_error EXIT HUP INT TERM
mv "$TARGET" "$PREVIOUS"
mv "$STAGE" "$TARGET"
(cd "$TARGET" && sha256sum -c .hbnf-payload.sha256 >/dev/null) || { echo "Installed candidate payload verification failed." >&2; exit 102; }
[ "$(cat "$TARGET/.hbnf-package-version")" = "1.0.10" ] || { echo "Installed Owner PWA version readback failed." >&2; exit 103; }
rm -rf "$PREVIOUS"
trap - EXIT HUP INT TERM
echo "Updated Owner PWA to v1.0.10 at $TARGET. Exact pre-install v1.0.9 runtime retained at $BACKUP."
echo "Mission Control, local transport, firmware, router/network settings, and scoring data were not changed."

#!/bin/sh
set -eu

PKG_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ADMISSION_FILE=${HBNF_PWA_ADMISSION_FILE:-}
ADMISSION_SHA256=${HBNF_PWA_ADMISSION_SHA256:-}
CANDIDATE_ARCHIVE=${HBNF_PWA_CANDIDATE_ARCHIVE:-}
WWW_ROOT=${HBNF_WWW_ROOT:-/www}
BACKUP_ROOT=${HBNF_BACKUP_ROOT:-/root}
BASE="$WWW_ROOT/mission-control-local"
TARGET="$BASE/owner-pwa"
TX="OWNER-PWA-LOCAL-V119-UV-LOCAL-REQUEST-20261028-01"
BACKUP="$BACKUP_ROOT/hbnf-owner-pwa-local.rollback-$TX"
BASELINE_COPY="$BACKUP_ROOT/hbnf-owner-pwa-$TX.BASELINE.SHA256SUMS"
STAGE="$BASE/.owner-pwa.stage-$TX"
PREVIOUS="$BASE/.owner-pwa.previous-$TX"
FAILED="$BASE/.owner-pwa.failed-$TX"
BASELINE="$PKG_DIR/BASELINE.SHA256SUMS"
BASELINE_SHA256=b0bbb642edf8218b8dab0e5d81f490e61be72f1c1672e42fb934d30d53702c9a
BASELINE_ZIP_SHA256=5c1947aae7b50e49b5e3cf672086c9260dd5f71adae4b49f91a448978255006e
BASE_MARKER_SHA256=fbeeb20927e58ff3bea0d0a66d5e996dbaefcbb72259a80a45ff206585137835
BASE_VERSION_SHA256=9fd28642d3aca191e5c7fc2383cfd6fabb2aac8743f029dabb8989ac584e31bc

[ "$(id -u)" = 0 ] || { echo "Run as root on the Opal." >&2; exit 77; }
[ -d "$BASE" ] && [ -w "$BASE" ] || { echo "Existing Mission Control root is unavailable." >&2; exit 78; }
[ -d "$BACKUP_ROOT" ] && [ -w "$BACKUP_ROOT" ] || { echo "Rollback location is unavailable or not writable." >&2; exit 79; }
[ -d "$TARGET" ] && [ ! -L "$TARGET" ] || { echo "Installed Owner PWA directory is missing or is a symlink." >&2; exit 80; }
[ -f "$BASE/.hbnf-package-marker" ] && [ "$(cat "$BASE/.hbnf-package-marker")" = "hbnf-owner-pwa-empty-runtime-recovery-v2" ] || { echo "Mission Control identity is unexpected." >&2; exit 81; }
[ -f "$BASE/.hbnf-package-version" ] && [ "$(cat "$BASE/.hbnf-package-version")" = "1.0.2" ] || { echo "Mission Control v1.0.2 is not installed." >&2; exit 82; }
[ -f "$TARGET/.hbnf-package-marker" ] && [ "$(cat "$TARGET/.hbnf-package-marker")" = "hbnf-owner-pwa-local-v1" ] || { echo "Owner PWA identity is unexpected." >&2; exit 83; }
[ -f "$TARGET/.hbnf-package-version" ] && [ "$(cat "$TARGET/.hbnf-package-version")" = "1.0.18" ] || { echo "Expected Owner PWA v1.0.18 is not installed." >&2; exit 84; }
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
verify_file "$BASE/local-transport.js" 51e4f03ff1ffc9d8cece0a3e6f14fefac77e642fe1a4eced95ca749d777f676a || { echo "Mission Control or local transport differs from the readback identity." >&2; exit 87; }
verify_file "$BASELINE" "$BASELINE_SHA256" || { echo "Expected v1.0.18 manifest is missing or invalid." >&2; exit 88; }
verify_file "$PKG_DIR/ROLLBACK_BASELINE.zip" "$BASELINE_ZIP_SHA256" || { echo "Exact v1.0.18 recovery companion is missing or invalid." >&2; exit 89; }

set -- $(find "$TARGET" -maxdepth 1 -type f | wc -l | tr -d ' ')
[ "$1" = 21 ] || { echo "Installed Owner PWA file count differs from the exact v1.0.18 package." >&2; exit 90; }
[ -z "$(find "$TARGET" -mindepth 1 -maxdepth 1 ! -type f -print)" ] || { echo "Installed Owner PWA contains a non-file entry." >&2; exit 91; }
(cd "$TARGET" && sha256sum -c "$BASELINE" >/dev/null) || { echo "Installed Owner PWA differs from the exact expected v1.0.18 baseline." >&2; exit 92; }
(cd "$PKG_DIR" && sha256sum -c ROLLBACK_BASELINE.SHA256 >/dev/null && sha256sum -c PAYLOAD.SHA256SUMS >/dev/null) || { echo "Candidate or rollback package checksum failed." >&2; exit 94; }
[ -n "$ADMISSION_FILE" ] && [ -f "$ADMISSION_FILE" ] && [ ! -L "$ADMISSION_FILE" ] || { echo "One-time pre-mutation admission manifest is required." >&2; exit 110; }
[ -n "$ADMISSION_SHA256" ] && [ "$(sha256sum "$ADMISSION_FILE" | awk '{print $1}')" = "$ADMISSION_SHA256" ] || { echo "Admission manifest readback hash differs." >&2; exit 111; }
[ -n "$CANDIDATE_ARCHIVE" ] && [ -f "$CANDIDATE_ARCHIVE" ] && [ ! -L "$CANDIDATE_ARCHIVE" ] || { echo "Exact retained candidate archive is required." >&2; exit 112; }
command -v jsonfilter >/dev/null 2>&1 || { echo "jsonfilter is required for admission validation." >&2; exit 113; }
admission_value(){ jsonfilter -i "$ADMISSION_FILE" -e "$1" 2>/dev/null | sed -n '1p'; }
[ "$(admission_value '@.schema')" = hbnf-opal-uv-update-admission-v1 ] || { echo "Admission schema mismatch." >&2; exit 114; }
[ "$(admission_value '@.transaction_id')" = "$TX" ] || { echo "Admission transaction mismatch." >&2; exit 115; }
[ "$(admission_value '@.outcome')" = PASS ] || { echo "Admission has not passed." >&2; exit 116; }
[ "$(admission_value '@.target.model')" = GL-SFT1200 ] && [ "$(admission_value '@.target.ip')" = 192.168.77.1 ] || { echo "Admission target mismatch." >&2; exit 117; }
source_commit=$(jsonfilter -i "$PKG_DIR/PACKAGE.json" -e '@.sourceCommit' 2>/dev/null | sed -n '1p')
[ -n "$source_commit" ] && [ "$(admission_value '@.candidate.source_commit')" = "$source_commit" ] || { echo "Admission source commit mismatch." >&2; exit 118; }
[ "$(admission_value '@.candidate.package_sha256')" = "$(sha256sum "$CANDIDATE_ARCHIVE" | awk '{print $1}')" ] || { echo "Candidate archive differs from admitted bytes." >&2; exit 119; }
[ "$(admission_value '@.baseline.package_sha256')" = "$BASELINE_ZIP_SHA256" ] || { echo "Admission rollback package differs." >&2; exit 120; }
[ "$(admission_value '@.baseline.installed_files_manifest_sha256')" = "$BASELINE_SHA256" ] || { echo "Admission installed-file baseline differs." >&2; exit 121; }
[ "$(admission_value '@.durable_readback.status')" = PASS ] || { echo "Candidate and rollback lack durable readback." >&2; exit 122; }
[ "$(admission_value '@.acceptance_plan.status')" = DECLARED ] || { echo "Acceptance plan is missing." >&2; exit 123; }

mkdir -m 0755 "$STAGE"
cp -pR "$PKG_DIR/owner-pwa/." "$STAGE/"
sed 's#owner-pwa/##' "$PKG_DIR/PAYLOAD.SHA256SUMS" > "$STAGE/.hbnf-payload.sha256"
cp -p "$PKG_DIR/rollback.sh" "$STAGE/.hbnf-rollback.sh"
printf '%s\n' 'hbnf-owner-pwa-local-v1' > "$STAGE/.hbnf-package-marker"
printf '%s\n' '1.0.19' > "$STAGE/.hbnf-package-version"
chmod 0644 "$STAGE"/* "$STAGE"/.[!.]*
chmod 0755 "$STAGE/.hbnf-rollback.sh"
(cd "$STAGE" && sha256sum -c .hbnf-payload.sha256 >/dev/null) || { echo "Staged candidate payload verification failed." >&2; exit 95; }
set -- $(find "$STAGE" -maxdepth 1 -type f | wc -l | tr -d ' ')
[ "$1" = 21 ] || { echo "Staged Owner PWA file count is unexpected." >&2; exit 96; }
[ -z "$(find "$STAGE" -mindepth 1 -maxdepth 1 ! -type f -print)" ] || { echo "Staged Owner PWA contains a non-file entry." >&2; exit 97; }

cp -a "$TARGET" "$BACKUP"
cp -p "$BASELINE" "$BASELINE_COPY"
verify_file "$BASELINE_COPY" "$BASELINE_SHA256" || { echo "Exact rollback manifest copy failed; original runtime remains in place." >&2; exit 98; }
set -- $(find "$BACKUP" -maxdepth 1 -type f | wc -l | tr -d ' ')
[ "$1" = 21 ] && (cd "$BACKUP" && sha256sum -c "$BASELINE_COPY" >/dev/null) || { echo "Exact v1.0.18 rollback snapshot failed verification; original runtime remains in place." >&2; exit 99; }

restore_on_error() {
  rc=$?
  if [ "$rc" -ne 0 ] && [ -e "$PREVIOUS" ]; then
    if [ -e "$TARGET" ]; then
      [ ! -e "$FAILED" ] || { echo "Candidate, previous tree, and rollback snapshot retained; failure path already exists." >&2; exit 100; }
      mv "$TARGET" "$FAILED" || { echo "Candidate preserved; exact baseline remains at $PREVIOUS and $BACKUP." >&2; exit 101; }
    fi
    mv "$PREVIOUS" "$TARGET" || { echo "Exact baseline remains at $BACKUP; restoration from $PREVIOUS failed." >&2; exit 102; }
    (cd "$TARGET" && sha256sum -c "$BASELINE_COPY" >/dev/null) || { echo "Restored baseline failed verification; exact backup remains at $BACKUP." >&2; exit 103; }
  fi
  [ ! -e "$STAGE" ] || rm -rf "$STAGE"
  exit "$rc"
}
trap restore_on_error EXIT HUP INT TERM
mv "$TARGET" "$PREVIOUS"
mv "$STAGE" "$TARGET"
(cd "$TARGET" && sha256sum -c .hbnf-payload.sha256 >/dev/null) || { echo "Installed candidate payload verification failed." >&2; exit 104; }
[ "$(cat "$TARGET/.hbnf-package-version")" = "1.0.19" ] || { echo "Installed Owner PWA version readback failed." >&2; exit 105; }
candidate_archive_sha=$(sha256sum "$CANDIDATE_ARCHIVE" | awk '{print $1}')
printf '{\n  "schema":"hbnf-owner-pwa-install-readback-v1",\n  "transaction_id":"%s",\n  "admission_manifest_sha256":"%s",\n  "candidate_archive_sha256":"%s",\n  "installed_payload_manifest":"PASS",\n  "version_readback":"PASS",\n  "rollback_copy":"PASS"\n}\n' "$TX" "$ADMISSION_SHA256" "$candidate_archive_sha" > "$BACKUP_ROOT/hbnf-owner-pwa-$TX.POST-INSTALL-READBACK.json"
sync
rm -rf "$PREVIOUS"
trap - EXIT HUP INT TERM
echo "Updated Owner PWA to v1.0.19 at $TARGET. Exact v1.0.18 runtime retained at $BACKUP."
echo "Mission Control, local transport, firmware, router/network settings, and scoring data were not changed."

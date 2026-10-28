#!/bin/sh
set -eu
ADMISSION_FILE=${HBNF_PWA_ADMISSION_FILE:-}
ADMISSION_SHA256=${HBNF_PWA_ADMISSION_SHA256:-}
CANDIDATE_ARCHIVE=${HBNF_PWA_CANDIDATE_ARCHIVE:-}
WWW_ROOT=${HBNF_WWW_ROOT:-/www}
BACKUP_ROOT=${HBNF_BACKUP_ROOT:-/root}
TARGET="$WWW_ROOT/mission-control-local/owner-pwa"
BASE="$WWW_ROOT/mission-control-local"
BACKUP="$BACKUP_ROOT/hbnf-owner-pwa-local.rollback-OWNER-PWA-LOCAL-V116-UV-READINESS-20261027-01"
MANIFEST="$BACKUP_ROOT/hbnf-owner-pwa-OWNER-PWA-LOCAL-V116-UV-READINESS-20261027-01.BASELINE.SHA256SUMS"
FAILED="$BASE/.owner-pwa.failed-OWNER-PWA-LOCAL-V116-UV-READINESS-20261027-01"
MANIFEST_SHA256=13aa68dd70e9a972ed7a1627d6daa9d105a91ad58e03e32bcd851f9d97529006

[ "$(id -u)" = 0 ] || { echo "Run as root on the Opal." >&2; exit 77; }
[ -n "$ADMISSION_FILE" ] && [ -f "$ADMISSION_FILE" ] && [ ! -L "$ADMISSION_FILE" ] || { echo "The original one-time admission manifest is required for rollback." >&2; exit 87; }
[ -n "$ADMISSION_SHA256" ] && [ "$(sha256sum "$ADMISSION_FILE" | awk '{print $1}')" = "$ADMISSION_SHA256" ] || { echo "Admission manifest readback hash differs." >&2; exit 88; }
[ -n "$CANDIDATE_ARCHIVE" ] && [ -f "$CANDIDATE_ARCHIVE" ] && [ ! -L "$CANDIDATE_ARCHIVE" ] || { echo "Exact admitted candidate archive is required for rollback." >&2; exit 89; }
command -v jsonfilter >/dev/null 2>&1 || { echo "jsonfilter is required for admission validation." >&2; exit 90; }
admission_value(){ jsonfilter -i "$ADMISSION_FILE" -e "$1" 2>/dev/null | sed -n '1p'; }
[ "$(admission_value '@.schema')" = hbnf-opal-uv-update-admission-v1 ] || { echo "Admission schema mismatch." >&2; exit 91; }
[ "$(admission_value '@.transaction_id')" = OWNER-PWA-LOCAL-V116-UV-READINESS-20261027-01 ] || { echo "Admission transaction mismatch." >&2; exit 92; }
[ "$(admission_value '@.outcome')" = PASS ] || { echo "Admission has not passed." >&2; exit 93; }
[ "$(admission_value '@.target.model')" = GL-SFT1200 ] && [ "$(admission_value '@.target.ip')" = 192.168.77.1 ] || { echo "Admission target mismatch." >&2; exit 95; }
[ "$(admission_value '@.candidate.package_sha256')" = "$(sha256sum "$CANDIDATE_ARCHIVE" | awk '{print $1}')" ] || { echo "Candidate differs from the admitted package." >&2; exit 94; }
[ "$(admission_value '@.baseline.package_sha256')" = 1c3b54584c813d966f8e8d678810edf6bd0cdd3e8ec000afc08390f51ce2824f ] || { echo "Admission rollback package differs." >&2; exit 96; }
[ "$(admission_value '@.baseline.installed_files_manifest_sha256')" = "$MANIFEST_SHA256" ] || { echo "Admission installed-file baseline differs." >&2; exit 97; }
[ "$(admission_value '@.durable_readback.status')" = PASS ] || { echo "Candidate and rollback lack durable readback." >&2; exit 98; }
[ "$(admission_value '@.acceptance_plan.status')" = DECLARED ] || { echo "Acceptance plan is missing." >&2; exit 99; }
[ -d "$TARGET" ] && [ -d "$BACKUP" ] || { echo "Installed candidate or exact v1.0.15 recovery snapshot is missing." >&2; exit 78; }
[ "$(cat "$TARGET/.hbnf-package-version" 2>/dev/null || true)" = "1.0.16" ] || { echo "Current Owner PWA is not v1.0.16; refusing rollback." >&2; exit 79; }
[ -f "$MANIFEST" ] && [ "$(sha256sum "$MANIFEST" | awk '{print $1}')" = "$MANIFEST_SHA256" ] || { echo "Exact v1.0.15 baseline manifest identity failed." >&2; exit 80; }
[ "$(find "$BACKUP" -maxdepth 1 -type f | wc -l | tr -d ' ')" = 21 ] || { echo "Exact pre-install Owner PWA recovery copy is incomplete." >&2; exit 81; }
(cd "$BACKUP" && sha256sum -c "$MANIFEST" >/dev/null) || { echo "Exact pre-install v1.0.15 recovery copy failed verification." >&2; exit 82; }
(cd "$TARGET" && sha256sum -c .hbnf-payload.sha256 >/dev/null) || { echo "Current v1.0.16 payload changed; preserve it and inspect before rollback." >&2; exit 83; }
[ ! -e "$FAILED" ] || { echo "Failed-candidate preservation path already exists." >&2; exit 84; }

mv "$TARGET" "$FAILED"
if ! mv "$BACKUP" "$TARGET"; then
  mv "$FAILED" "$TARGET" || echo "Restore failed; candidate preserved at $FAILED and exact recovery copy remains at $BACKUP." >&2
  exit 85
fi
(cd "$TARGET" && sha256sum -c "$MANIFEST" >/dev/null) || { echo "Restored exact v1.0.15 runtime did not verify; failed candidate retained at $FAILED." >&2; exit 86; }
echo "Restored the exact pre-install v1.0.15 Owner PWA tree. Candidate preserved at $FAILED."

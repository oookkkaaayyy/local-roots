#!/bin/sh
set -eu
WWW_ROOT=${HBNF_WWW_ROOT:-/www}
BACKUP_ROOT=${HBNF_BACKUP_ROOT:-/root}
TARGET="$WWW_ROOT/mission-control-local/owner-pwa"
BASE="$WWW_ROOT/mission-control-local"
BACKUP="$BACKUP_ROOT/hbnf-owner-pwa-local.rollback-OWNER-PWA-LOCAL-V115-GATEWAY-PORT-20261026-01"
MANIFEST="$BACKUP_ROOT/hbnf-owner-pwa-OWNER-PWA-LOCAL-V115-GATEWAY-PORT-20261026-01.BASELINE.SHA256SUMS"
FAILED="$BASE/.owner-pwa.failed-OWNER-PWA-LOCAL-V115-GATEWAY-PORT-20261026-01"
MANIFEST_SHA256=2c0e7f48983762ddc228b568b159f86c489d9d675d31cc18937c2c2b03e96d27

[ "$(id -u)" = 0 ] || { echo "Run as root on the Opal." >&2; exit 77; }
[ -d "$TARGET" ] && [ -d "$BACKUP" ] || { echo "Installed candidate or exact v1.0.14 recovery snapshot is missing." >&2; exit 78; }
[ "$(cat "$TARGET/.hbnf-package-version" 2>/dev/null || true)" = "1.0.15" ] || { echo "Current Owner PWA is not v1.0.15; refusing rollback." >&2; exit 79; }
[ -f "$MANIFEST" ] && [ "$(sha256sum "$MANIFEST" | awk '{print $1}')" = "$MANIFEST_SHA256" ] || { echo "Exact v1.0.14 baseline manifest identity failed." >&2; exit 80; }
[ "$(find "$BACKUP" -maxdepth 1 -type f | wc -l | tr -d ' ')" = 21 ] || { echo "Exact pre-install Owner PWA recovery copy is incomplete." >&2; exit 81; }
(cd "$BACKUP" && sha256sum -c "$MANIFEST" >/dev/null) || { echo "Exact pre-install v1.0.14 recovery copy failed verification." >&2; exit 82; }
(cd "$TARGET" && sha256sum -c .hbnf-payload.sha256 >/dev/null) || { echo "Current v1.0.14 payload changed; preserve it and inspect before rollback." >&2; exit 83; }
[ ! -e "$FAILED" ] || { echo "Failed-candidate preservation path already exists." >&2; exit 84; }

mv "$TARGET" "$FAILED"
if ! mv "$BACKUP" "$TARGET"; then
  mv "$FAILED" "$TARGET" || echo "Restore failed; candidate preserved at $FAILED and exact recovery copy remains at $BACKUP." >&2
  exit 85
fi
(cd "$TARGET" && sha256sum -c "$MANIFEST" >/dev/null) || { echo "Restored exact v1.0.14 runtime did not verify; failed candidate retained at $FAILED." >&2; exit 86; }
echo "Restored the exact pre-install v1.0.14 Owner PWA tree. Candidate preserved at $FAILED."

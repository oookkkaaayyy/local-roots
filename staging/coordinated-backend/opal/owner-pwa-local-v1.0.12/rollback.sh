#!/bin/sh
set -eu
TARGET=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
BASE=$(dirname "$TARGET")
BACKUP_ROOT=${HBNF_BACKUP_ROOT:-/root}
TX="OWNER-PWA-LOCAL-V112-SHOW-SCORES-SYSTEM-20261022-01"
BACKUP="$BACKUP_ROOT/hbnf-owner-pwa-local.rollback-$TX"
MANIFEST="$BACKUP_ROOT/hbnf-owner-pwa-$TX.BASELINE.SHA256SUMS"
FAILED="$BASE/.owner-pwa.failed-$TX"
MANIFEST_SHA256=7ca405175fa7032d018d3d5f6f6adffc8a5c268d421a661b5be02f425931e348

[ "$(id -u)" = 0 ] || { echo "Run as root on the Opal." >&2; exit 77; }
[ -d "$TARGET" ] && [ -d "$BACKUP" ] || { echo "Installed candidate or exact pre-install rollback copy is missing." >&2; exit 78; }
[ "$(cat "$TARGET/.hbnf-package-version" 2>/dev/null || true)" = "1.0.12" ] || { echo "Current Owner PWA is not v1.0.12; refusing rollback." >&2; exit 79; }
[ -f "$MANIFEST" ] && [ "$(sha256sum "$MANIFEST" | awk '{print $1}')" = "$MANIFEST_SHA256" ] || { echo "Candidate-bound exact baseline manifest identity failed." >&2; exit 80; }
[ "$(find "$BACKUP" -maxdepth 1 -type f | wc -l | tr -d ' ')" = 20 ] || { echo "Exact pre-install Owner PWA file set is incomplete." >&2; exit 81; }
(cd "$BACKUP" && sha256sum -c "$MANIFEST" >/dev/null) || { echo "Exact pre-install Owner PWA recovery copy failed verification." >&2; exit 82; }
(cd "$TARGET" && sha256sum -c .hbnf-payload.sha256 >/dev/null) || { echo "Current v1.0.11 payload changed; preserve it and inspect before rollback." >&2; exit 83; }
[ ! -e "$FAILED" ] || { echo "Failed-candidate preservation path already exists." >&2; exit 84; }

mv "$TARGET" "$FAILED"
if ! mv "$BACKUP" "$TARGET"; then
  mv "$FAILED" "$TARGET" || echo "Restore failed; candidate preserved at $FAILED and exact recovery copy remains at $BACKUP." >&2
  exit 85
fi
(cd "$TARGET" && sha256sum -c "$MANIFEST" >/dev/null) || { echo "Restored exact Owner PWA did not verify; failed candidate retained at $FAILED." >&2; exit 86; }
echo "Restored the exact pre-install Owner PWA tree. Candidate preserved at $FAILED."

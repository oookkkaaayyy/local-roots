#!/bin/sh
set -eu
TARGET=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
BASE=$(dirname "$TARGET")
ROOT=${HBNF_BACKUP_ROOT:-/root}
BACKUP="$ROOT/hbnf-owner-pwa-local.rollback-v1.0.1"
MANIFEST="$ROOT/hbnf-owner-pwa-v1.0.1.BASELINE.SHA256SUMS"
FAILED="$BASE/.owner-pwa.failed-v1.0.2"
MANIFEST_HASH=72e4b51282567fddc8f43d5acef00c8048c4fb920b9b0bee3f33c1c4cdc6d8fc

[ "$(id -u)" = 0 ] || { echo "Run as root on the Opal." >&2; exit 77; }
[ -d "$TARGET" ] && [ -d "$BACKUP" ] || { echo "Installed candidate or exact v1.0.1 recovery copy is missing." >&2; exit 78; }
[ "$(cat "$TARGET/.hbnf-package-version" 2>/dev/null || true)" = "1.0.2" ] || { echo "Current Owner PWA is not v1.0.2; refusing rollback." >&2; exit 79; }
[ "$(cat "$BACKUP/.hbnf-package-version" 2>/dev/null || true)" = "1.0.1" ] || { echo "Recovery copy is not v1.0.1; refusing rollback." >&2; exit 80; }
command -v sha256sum >/dev/null 2>&1 || { echo "sha256sum is required." >&2; exit 81; }
[ -f "$MANIFEST" ] || { echo "Pinned recovery manifest is missing." >&2; exit 82; }
[ "$(sha256sum "$MANIFEST" | awk '{print $1}')" = "$MANIFEST_HASH" ] || { echo "Pinned recovery manifest identity failed." >&2; exit 83; }
(cd "$BACKUP" && cmp -s .hbnf-payload.sha256 "$MANIFEST" && sha256sum -c .hbnf-payload.sha256 >/dev/null) || { echo "Exact v1.0.1 recovery copy failed verification." >&2; exit 84; }
(cd "$TARGET" && sha256sum -c .hbnf-payload.sha256 >/dev/null) || { echo "Current v1.0.2 payload changed; preserve it and inspect before rollback." >&2; exit 85; }
[ ! -e "$FAILED" ] || { echo "Failed-candidate preservation path already exists." >&2; exit 86; }
mv "$TARGET" "$FAILED"
if ! mv "$BACKUP" "$TARGET"; then
  mv "$FAILED" "$TARGET" || echo "Restore failed; candidate preserved at $FAILED and recovery copy remains at $BACKUP." >&2
  exit 87
fi
(cd "$TARGET" && cmp -s .hbnf-payload.sha256 "$MANIFEST" && sha256sum -c .hbnf-payload.sha256 >/dev/null) || { echo "Restored Owner PWA did not verify; failed candidate retained at $FAILED." >&2; exit 88; }
echo "Restored exact Owner PWA v1.0.1 at $TARGET. Superseded v1.0.2 preserved at $FAILED."

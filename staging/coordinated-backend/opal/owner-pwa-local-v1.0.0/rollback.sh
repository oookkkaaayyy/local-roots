#!/bin/sh
set -eu
TARGET=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
BASE=$(dirname "$TARGET")
[ "$(id -u)" = 0 ] || { echo "Run as root on the Opal." >&2; exit 77; }
[ -d "$TARGET" ] && [ -d "$BASE" ] || { echo "Owner PWA candidate is missing." >&2; exit 78; }
[ -f "$TARGET/.hbnf-package-marker" ] && [ "$(cat "$TARGET/.hbnf-package-marker")" = "hbnf-owner-pwa-local-v1" ] || { echo "Owner PWA marker mismatch; refusing removal." >&2; exit 79; }
[ -f "$TARGET/.hbnf-package-version" ] && [ "$(cat "$TARGET/.hbnf-package-version")" = "1.0.0" ] || { echo "Owner PWA version mismatch; refusing removal." >&2; exit 80; }
command -v sha256sum >/dev/null 2>&1 || { echo "sha256sum is required." >&2; exit 81; }
(cd "$TARGET" && sha256sum -c .hbnf-payload.sha256 >/dev/null) || { echo "Owner PWA payload changed; preserve it and do not remove." >&2; exit 82; }
set -- $(find "$TARGET" -type f | wc -l | tr -d ' ')
[ "$1" = 17 ] || { echo "Owner PWA file set changed; preserve it and do not remove." >&2; exit 83; }
set -- $(find "$TARGET" -type d | wc -l | tr -d ' ')
[ "$1" = 1 ] || { echo "Owner PWA directory set changed; preserve it and do not remove." >&2; exit 84; }
rm -rf "$TARGET"
echo "Removed only the verified additive Owner PWA subtree. Existing Mission Control and Skins relay remain untouched."

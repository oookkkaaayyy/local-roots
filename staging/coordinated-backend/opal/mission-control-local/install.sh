#!/bin/sh
set -eu
PKG_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
TARGET=/www/mission-control-local
[ "$(id -u)" = 0 ] || { echo "Run as root on the Opal." >&2; exit 77; }
[ -d /www ] || { echo "Nginx document root /www is missing." >&2; exit 78; }
[ -w /www ] || { echo "Nginx document root /www is not writable." >&2; exit 79; }
[ ! -e "$TARGET" ] || { echo "Target exists; refusing to overwrite: $TARGET" >&2; exit 80; }
for f in index.html styles.css app.mjs local-transport.mjs rollback.sh SHA256SUMS; do [ -f "$PKG_DIR/$f" ] || { echo "Package file missing: $f" >&2; exit 81; }; done
command -v sha256sum >/dev/null 2>&1 || { echo "sha256sum is required; refusing install." >&2; exit 82; }
(cd "$PKG_DIR" && sha256sum -c SHA256SUMS >/dev/null) || { echo "Package integrity check failed." >&2; exit 83; }
mkdir -m 0755 "$TARGET"
trap 'rc=$?; if [ "$rc" -ne 0 ]; then rm -rf "$TARGET"; fi' EXIT
printf '%s\n' 'hbnf-owner-mission-control-local-v1' > "$TARGET/.hbnf-package-marker"
cp "$PKG_DIR/index.html" "$PKG_DIR/styles.css" "$PKG_DIR/app.mjs" "$PKG_DIR/local-transport.mjs" "$PKG_DIR/rollback.sh" "$TARGET/"
chmod 0644 "$TARGET/index.html" "$TARGET/styles.css" "$TARGET/app.mjs" "$TARGET/local-transport.mjs" "$TARGET/.hbnf-package-marker"
chmod 0755 "$TARGET/rollback.sh"
echo "Installed static files at $TARGET"
echo "Open http://192.168.77.1/mission-control-local/"
trap - EXIT
echo "No Nginx, Wi-Fi, relay, firmware, or device settings were changed."

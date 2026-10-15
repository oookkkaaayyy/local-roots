#!/bin/sh
set -eu
TARGET=/www/mission-control-local
[ "$(id -u)" = 0 ] || { echo "Run as root on the Opal." >&2; exit 77; }
[ -f "$TARGET/.hbnf-package-marker" ] || { echo "Package marker absent; refusing removal." >&2; exit 82; }
[ "$(cat "$TARGET/.hbnf-package-marker")" = "hbnf-owner-mission-control-local-v1" ] || { echo "Unexpected package marker; refusing removal." >&2; exit 83; }
rm -rf "$TARGET"
echo "Removed only $TARGET; relay, Nginx configuration, Wi-Fi, firmware, and devices were not changed."

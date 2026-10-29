#!/bin/sh
set -eu
TX=OWNER-LOCAL-CONTROL-CORS-V118-20261028-02
BACKUP=/root/hbnf-owner-local-control-cors.rollback-$TX
TARGET=/etc/hbnf-local-control/nginx-server.conf
NGINX=/usr/sbin/nginx
SERVICE=/etc/init.d/hbnf-owner-local-control
[ "$(id -u)" = 0 ] || { echo "Run as root on the Opal." >&2; exit 77; }
[ -f "$BACKUP/nginx-server.conf" ] && [ -f "$BACKUP/BASELINE_FILES.SHA256SUMS" ] || { echo "Exact gateway rollback is missing." >&2; exit 78; }
expected=$(awk '$2=="etc/hbnf-local-control/nginx-server.conf" {print $1}' "$BACKUP/BASELINE_FILES.SHA256SUMS")
[ -n "$expected" ] && [ "$(sha256sum "$BACKUP/nginx-server.conf" | awk '{print $1}')" = "$expected" ] || { echo "Exact rollback config hash mismatch." >&2; exit 79; }
cp -p "$BACKUP/nginx-server.conf" "$TARGET.rollback"
mv -f "$TARGET.rollback" "$TARGET"
"$NGINX" -t -c /etc/hbnf-local-control/nginx.conf
"$SERVICE" reload
[ "$(sha256sum "$TARGET" | awk '{print $1}')" = "$expected" ] || { echo "Rollback config readback failed." >&2; exit 80; }
echo "Restored exact pre-v1.0.18 gateway config. Previous full 20-file image remains at $BACKUP/ROLLBACK_BASELINE.zip."

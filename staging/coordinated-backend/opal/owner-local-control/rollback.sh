#!/bin/sh
set -eu
BASE=/etc/hbnf-local-control
STATE=/etc/hbnf-local-control-state
CONF=$BASE/nginx.conf
SERVER_CONF=$BASE/nginx-server.conf
SERVICE=/etc/init.d/hbnf-owner-local-control
TARGET=/www/mission-control-local/local-transport.js
BACKUP=/root/hbnf-owner-local-control.rollback-v1.0.3
CANDIDATE_TRANSPORT_SHA=51e4f03ff1ffc9d8cece0a3e6f14fefac77e642fe1a4eced95ca749d777f676a
EXPECTED_ROLLBACK_TRANSPORT_SHA=a91e84c89a481739f9c47c619a1d3c5c35d690869c54159486d528d3863c746e
LOG_DIR=/var/log/hbnf-owner-local-control-nginx
PID_FILE=/var/run/hbnf-owner-local-control-nginx.pid
fail(){ echo "ROLLBACK BLOCKED: $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || fail "run as root"
[ -f "$BACKUP/local-transport.js" ] || fail "exact pre-install transport snapshot missing"
[ -f "$TARGET" ] || fail "installed transport missing"
actual=$(sha256sum "$TARGET" | awk '{print $1}')
[ "$actual" = "$CANDIDATE_TRANSPORT_SHA" ] || fail "installed transport changed after release; preserve files and inspect manually"
[ -x "$SERVICE" ] || fail "dedicated service file is missing; preserve files and inspect manually"
[ -s "$CONF" ] && [ -s "$SERVER_CONF" ] || fail "dedicated config is incomplete; preserve files and inspect manually"

# Stop/disable only the isolated :8443 instance. The GL.iNet Nginx service and
# its global config/listeners are never reloaded or rewritten.
"$SERVICE" stop || fail "could not stop the dedicated service"
"$SERVICE" disable || fail "could not disable the dedicated service"
[ ! -e /etc/rc.d/S85hbnf-owner-local-control ] || fail "dedicated boot symlink remains after disable"
[ ! -s "$PID_FILE" ] || fail "dedicated Nginx PID remains after stop"
cp -p "$BACKUP/local-transport.js" "$TARGET.rollback"
cmp -s "$BACKUP/local-transport.js" "$TARGET.rollback" || fail "rollback copy verification failed"
mv "$TARGET.rollback" "$TARGET"
rm -f "$CONF" "$SERVER_CONF" "$SERVICE" /var/lock/hbnf-owner-local-control-nginx.lock
rm -rf "$BASE/lua" "$STATE" "$LOG_DIR"
actual=$(sha256sum "$TARGET" | awk '{print $1}')
[ "$actual" = "$EXPECTED_ROLLBACK_TRANSPORT_SHA" ] || fail "restored transport hash mismatch"
# Confirm the original router web listeners remain available without touching
# or reloading their Nginx process.
netstat -lnt 2>/dev/null | awk 'NR > 2 && $4 ~ /(:|\])80$/ { http=1 } NR > 2 && $4 ~ /(:|\])443$/ { https=1 } END { exit !(http && https) }' || fail "existing GL.iNet 80/443 listeners are not both present"
echo "ROLLBACK_VERIFIED: dedicated service disabled/stopped, prior Opal transport hash restored, and existing GL.iNet Nginx listeners remain present; Skins relay and Matrix firmware untouched."

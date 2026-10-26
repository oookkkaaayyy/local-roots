#!/bin/sh
# Staged one-shot installer. Run only through exact release authorization.
set -eu
PKG=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
BASE=/etc/hbnf-local-control
STATE=/etc/hbnf-local-control-state
CONF=$BASE/nginx.conf
SERVER_CONF=$BASE/nginx-server.conf
SERVICE=/etc/init.d/hbnf-owner-local-control
TARGET=/www/mission-control-local/local-transport.js
OWNER_HTTP_TARGET=/www/mission-control-local/owner-http-transport.js
BACKUP=/root/hbnf-owner-local-control.rollback-v1.0.12
EXPECTED_OLD_TRANSPORT=51e4f03ff1ffc9d8cece0a3e6f14fefac77e642fe1a4eced95ca749d777f676a
HOST=cart-control.hbnightflyers.com
LOG_DIR=/var/log/hbnf-owner-local-control-nginx
PID_FILE=/var/run/hbnf-owner-local-control-nginx.pid
ROLLING_BACK=0
fail(){ echo "INSTALL BLOCKED: $*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || fail "run as root for the Nginx master and exact file installation"
[ ! -e "$BACKUP" ] || fail "rollback path already exists; do not overwrite it"
[ ! -e "$CONF" ] && [ ! -e "$SERVER_CONF" ] || fail "dedicated Nginx config already exists"
[ ! -e "$SERVICE" ] || fail "dedicated init service already exists"
[ ! -e "$STATE" ] || fail "dedicated session state path already exists; inspect before proceeding"
[ ! -e "$LOG_DIR" ] || fail "dedicated log directory already exists; inspect before proceeding"
[ ! -e "$PID_FILE" ] || fail "dedicated Nginx PID path already exists; inspect before proceeding"
[ ! -e /etc/rc.d/S85hbnf-owner-local-control ] || fail "dedicated boot link already exists"
[ -f "$TARGET" ] || fail "expected existing Mission Control transport is missing"
[ ! -e "$OWNER_HTTP_TARGET" ] || fail "Owner PWA HTTP transport target already exists; inspect before proceeding"
[ -d "$BASE/tls" ] || fail "install the DNS-01 certificate first; do not create or replace it here"
# The owner accepts that unpaired Cart-Wi-Fi clients can call the unauthenticated
# WLED API directly. This exposure is recorded in SOURCE_BASE/PACKAGE-MANIFEST;
# it is not represented as tested or blocked. Gateway authentication still
# applies to requests that use this dedicated service.
[ ! -e "$BASE/lua" ] || fail "Owner Control Lua files already exist; inspect before install"
command -v sha256sum >/dev/null 2>&1 || fail "sha256sum missing"
(cd "$PKG" && sha256sum -c SHA256SUMS >/dev/null) || fail "package hash verification failed"
actual=$(sha256sum "$TARGET" | awk '{print $1}')
[ "$actual" = "$EXPECTED_OLD_TRANSPORT" ] || fail "installed Opal transport differs from the accepted Mission Control v1.0.2 rollback base; do not install over an unverified baseline"
"$PKG/preflight.sh" || fail "read-only preflight failed"

worker_uid=$(id -u nobody 2>/dev/null || true)
worker_gid=$(id -g nobody 2>/dev/null || true)
case "$worker_uid:$worker_gid" in *[!0-9:]*|:*) fail "could not resolve dedicated nobody worker identity" ;; esac
[ "$worker_uid" -ne 0 ] || fail "refusing to run request workers as root"

mkdir -m 0700 "$BACKUP"
cp -p "$TARGET" "$BACKUP/local-transport.js"
cp -p "$PKG/rollback.sh" "$BACKUP/rollback.sh"
chmod 0700 "$BACKUP/rollback.sh"
backup_transport_sha=$(sha256sum "$BACKUP/local-transport.js" | awk '{print $1}')
[ "$backup_transport_sha" = "$EXPECTED_OLD_TRANSPORT" ] || fail "read-back of the exact pre-install transport rollback copy failed"
backup_rollback_sha=$(sha256sum "$BACKUP/rollback.sh" | awk '{print $1}')
package_rollback_sha=$(sha256sum "$PKG/rollback.sh" | awk '{print $1}')
[ "$backup_rollback_sha" = "$package_rollback_sha" ] || fail "read-back of the rollback procedure copy failed"

rollback_now(){
  [ "$ROLLING_BACK" = 0 ] || return 0
  ROLLING_BACK=1
  echo "Install validation failed; stopping only the dedicated service before restoring the exact prior Mission Control transport." >&2
  stop_failed=0
  disable_failed=0
  [ ! -x "$SERVICE" ] || "$SERVICE" stop >/dev/null 2>&1 || stop_failed=1
  [ ! -x "$SERVICE" ] || "$SERVICE" disable >/dev/null 2>&1 || disable_failed=1
  if [ -s "$PID_FILE" ]; then
    rollback_pid=$(cat "$PID_FILE" 2>/dev/null || true)
    case "$rollback_pid" in
      *[!0-9]*|'') stop_failed=1 ;;
      *) kill -0 "$rollback_pid" 2>/dev/null && stop_failed=1 || true ;;
    esac
  fi
  if [ -e /etc/rc.d/S85hbnf-owner-local-control ]; then disable_failed=1; fi
  if [ "$stop_failed" -ne 0 ] || [ "$disable_failed" -ne 0 ]; then
    echo "INSTALL ROLLBACK INCOMPLETE: dedicated service stop/disable could not be verified. Preserving candidate files, state, and rollback backup for safe manual recovery; no active configuration has been deleted." >&2
    return 0
  fi
  echo "Dedicated service is stopped and disabled; restoring the exact prior transport and removing only this release's files." >&2
  [ ! -f "$BACKUP/local-transport.js" ] || cp -p "$BACKUP/local-transport.js" "$TARGET"
  rm -f "$CONF" "$SERVER_CONF" "$SERVICE" "$TARGET.tmp" "$OWNER_HTTP_TARGET" "$OWNER_HTTP_TARGET.tmp" /etc/rc.d/S85hbnf-owner-local-control "$PID_FILE" /var/lock/hbnf-owner-local-control-nginx.lock
  rm -rf "$BASE/lua" "$STATE" "$LOG_DIR"
}
trap 'rollback_now' EXIT HUP INT TERM

mkdir -m 0710 "$STATE"
chown "0:$worker_gid" "$STATE"
mkdir -m 0700 "$STATE/sessions" "$STATE/revoked" "$STATE/tmp" "$STATE/tmp/client_body" "$STATE/tmp/proxy"
chown "$worker_uid:$worker_gid" "$STATE/sessions" "$STATE/revoked" "$STATE/tmp" "$STATE/tmp/client_body" "$STATE/tmp/proxy"
cp "$PKG/uv_hardware_profile.json" "$STATE/uv_hardware_profile.json"
chown "0:$worker_gid" "$STATE/uv_hardware_profile.json"
chmod 0640 "$STATE/uv_hardware_profile.json"
mkdir -m 0700 "$LOG_DIR"
mkdir -m 0755 "$BASE/lua"
cp "$PKG/auth.lua" "$PKG/session.lua" "$PKG/enroll.lua" "$PKG/revalidate.lua" "$PKG/revoke.lua" "$PKG/auth_owner.lua" "$PKG/auth_origin.lua" "$PKG/aux_command_access.lua" "$PKG/uv_policy_access.lua" "$PKG/uv_status_access.lua" "$PKG/uv_runtime.lua" "$PKG/uv_policy_spec.json" "$PKG/matrix_command_access.lua" "$BASE/lua/"
cp "$PKG/dedicated-nginx.conf.example" "$CONF"
cp "$PKG/nginx.conf.example" "$SERVER_CONF"
cp "$PKG/hbnf-owner-local-control.init" "$SERVICE"
cp "$PKG/local-transport.js" "$TARGET.tmp"
cp "$PKG/owner-http-transport.js" "$OWNER_HTTP_TARGET.tmp"
chmod 0644 "$BASE/lua/"*.lua "$BASE/lua/uv_policy_spec.json" "$CONF" "$SERVER_CONF" "$TARGET.tmp" "$OWNER_HTTP_TARGET.tmp"
chmod 0755 "$SERVICE"
chmod 0755 "$BASE/lua"
mv "$TARGET.tmp" "$TARGET"
mv "$OWNER_HTTP_TARGET.tmp" "$OWNER_HTTP_TARGET"

grep -Fxq '    listen 192.168.77.1:8443 ssl;' "$SERVER_CONF" || fail "dedicated listener must bind only to the HBNF-Cart LAN address"
[ "$(grep -Ec '^[[:space:]]*listen[[:space:]]' "$SERVER_CONF" || true)" = "1" ] || fail "dedicated gateway must have exactly one listener, bound only to the HBNF-Cart LAN address"

# Nginx's root master opens the root:root 0600 TLS key then drops its single
# request worker to nobody. It uses a dedicated config, PID, log, temp paths,
# dictionaries and :8443 listener; no global Nginx reload occurs.
/usr/sbin/nginx -t -c "$CONF" || fail "dedicated Nginx config validation failed"
"$SERVICE" enable || fail "could not enable the isolated procd service"
"$SERVICE" start || fail "could not start the isolated procd service"
sleep 2
[ -s "$PID_FILE" ] || fail "dedicated Nginx master did not create its PID file"
master_pid=$(cat "$PID_FILE")
case "$master_pid" in *[!0-9]*|'') fail "dedicated Nginx PID file is invalid" ;; esac
kill -0 "$master_pid" 2>/dev/null || fail "dedicated Nginx master is not running"
worker_count=$(ps w | awk '$2 == "nobody" && $0 ~ /nginx: worker process/ { n++ } END { print n+0 }')
[ "$worker_count" = "1" ] || fail "dedicated Nginx request worker is not exactly one unprivileged nobody process"
code=$(curl -sS --max-time 4 --resolve "$HOST:8443:192.168.77.1" -o /dev/null -w '%{http_code}' -H "Origin: https://hbnightflyers.com" -H "X-HBNF-Device: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" "https://$HOST:8443/api/session") || fail "dedicated TLS/session probe failed"
[ "$code" = "401" ] || fail "expected fail-closed HTTP 401 probe; received ${code:-no status}"
[ -x /etc/init.d/nginx ] || fail "existing GL.iNet Nginx service disappeared"
netstat -lnt 2>/dev/null | awk 'NR > 2 && $4 ~ /(:|\])80$/ { http=1 } NR > 2 && $4 ~ /(:|\])443$/ { https=1 } END { exit !(http && https) }' || fail "existing GL.iNet 80/443 listeners were not preserved"
actual=$(sha256sum "$TARGET" | awk '{print $1}')
expected=$(grep 'local-transport.js$' "$PKG/SHA256SUMS" | awk '{print $1}')
[ "$actual" = "$expected" ] || fail "installed Mission Control transport hash mismatch"
actual=$(sha256sum "$OWNER_HTTP_TARGET" | awk '{print $1}')
expected=$(grep 'owner-http-transport.js$' "$PKG/SHA256SUMS" | awk '{print $1}')
[ "$actual" = "$expected" ] || fail "installed Owner PWA HTTP transport hash mismatch"

trap - EXIT HUP INT TERM
echo "INSTALL_OK: authenticated local Owner Control endpoint installed on isolated Nginx :8443; request worker is nobody. Existing GL.iNet :80/:443 Nginx and Skins relay were not reloaded. Exact rollback: $BACKUP/rollback.sh"
echo "This does not prove iPad trust, physical output, or AUX illumination; those acceptance checks remain required. Unpaired Cart-Wi-Fi clients retain direct unauthenticated WLED API access by owner-accepted design."

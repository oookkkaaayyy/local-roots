#!/bin/sh
# Staged installer. Run only after exact release authorization.
set -eu
PKG=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
BASE=/etc/hbnf-local-control
CONF=/etc/nginx/conf.d/hbnf-owner-local-control.conf
TARGET=/www/mission-control-local/local-transport.js
BACKUP=/root/hbnf-owner-local-control.rollback-20261015
EXPECTED_OLD_TRANSPORT=a91e84c89a481739f9c47c619a1d3c5c35d690869c54159486d528d3863c746e
HOST=cart-control.hbnightflyers.com
ROLLING_BACK=0
fail(){ echo "INSTALL BLOCKED: $*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || fail "run as root"
[ ! -e "$BACKUP" ] || fail "rollback path already exists; do not overwrite it"
[ ! -e "$CONF" ] || fail "Nginx target config already exists"
[ -f "$TARGET" ] || fail "expected existing Mission Control transport is missing"
[ -d "$BASE/tls" ] || fail "install the DNS-01 certificate first; do not create or replace it here"
[ -f "$BASE/owner-network-isolation-verified" ] || fail "guest/unpaired-to-WLED isolation is not verified"
[ ! -e "$BASE/lua" ] && [ ! -e "$BASE/sessions" ] && [ ! -e "$BASE/revoked" ] || fail "Owner Control files already exist; inspect before proceeding"
command -v sha256sum >/dev/null 2>&1 || fail "sha256sum missing"
(cd "$PKG" && sha256sum -c SHA256SUMS >/dev/null) || fail "package hash verification failed"
actual=$(sha256sum "$TARGET" | awk '{print $1}')
[ "$actual" = "$EXPECTED_OLD_TRANSPORT" ] || fail "installed Opal transport differs from verified v1.0.1 rollback base"
"$PKG/preflight.sh" || fail "read-only preflight failed"

mkdir -m 0700 "$BACKUP"
cp -p "$TARGET" "$BACKUP/local-transport.js"
cp -p "$PKG/rollback.sh" "$BACKUP/rollback.sh"
chmod 0700 "$BACKUP/rollback.sh"

rollback_now(){
  [ "$ROLLING_BACK" = 0 ] || return 0
  ROLLING_BACK=1
  echo "Install validation failed; restoring exact previous static module and removing only this release's files." >&2
  [ ! -f "$BACKUP/local-transport.js" ] || cp -p "$BACKUP/local-transport.js" "$TARGET"
  rm -f "$CONF" "$TARGET.tmp"
  rm -rf "$BASE/lua" "$BASE/sessions" "$BASE/revoked"
  nginx -t >/dev/null 2>&1 && nginx -s reload >/dev/null 2>&1 || true
}
trap 'rollback_now' EXIT HUP INT TERM

mkdir -m 0700 "$BASE/sessions" "$BASE/revoked"
mkdir -m 0755 "$BASE/lua"
cp "$PKG/auth.lua" "$PKG/session.lua" "$PKG/enroll.lua" "$PKG/revoke.lua" "$PKG/auth_owner.lua" "$PKG/auth_websocket.lua" "$PKG/auth_origin.lua" "$PKG/aux_command_access.lua" "$BASE/lua/"
cp "$PKG/nginx.conf.example" "$CONF"
cp "$PKG/local-transport.js" "$TARGET.tmp"
chmod 0644 "$BASE/lua/"*.lua "$CONF" "$TARGET.tmp"
chmod 0700 "$BASE/sessions" "$BASE/revoked"
chmod 0755 "$BASE/lua"
mv "$TARGET.tmp" "$TARGET"

nginx -t || fail "nginx -t failed"
nginx -s reload || fail "Nginx reload failed"
code=$(curl -sS --max-time 4 -o /dev/null -w '%{http_code}' -H "Origin: https://hbnightflyers.com" -H "X-HBNF-Device: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" "https://$HOST/api/session") || fail "trusted local TLS probe failed"
[ "$code" = 401 ] || fail "expected fail-closed HTTP 401 probe; received ${code:-no status}"
actual=$(sha256sum "$TARGET" | awk '{print $1}')
expected=$(grep 'local-transport.js$' "$PKG/SHA256SUMS" | awk '{print $1}')
[ "$actual" = "$expected" ] || fail "installed transport hash mismatch"

trap - EXIT HUP INT TERM
echo "INSTALL_OK: authenticated local Owner Control endpoint installed. Exact static rollback: $BACKUP/rollback.sh"
echo "This does not prove iPad trust, physical output, guest isolation, or AUX illumination; those acceptance checks remain required."

#!/bin/sh
set -eu
TX=OWNER-LOCAL-UV-LOCAL-ACCESS-V125-20261028-02
BACKUP=/root/hbnf-owner-local-uv-local-access.rollback-$TX
STATUS=/etc/hbnf-local-control/lua/uv_status_access.lua
POLICY=/etc/hbnf-local-control/lua/uv_policy_access.lua
AUTH=/etc/hbnf-local-control/lua/auth_owner.lua
SERVER=/etc/hbnf-local-control/nginx-server.conf
[ "$(id -u)" = 0 ] || exit 77
for n in uv_status_access.lua uv_policy_access.lua auth_owner.lua nginx-server.conf; do [ -f "$BACKUP/$n" ] || { echo "Exact rollback file missing: $n" >&2; exit 78; }; done
cp -p "$BACKUP/uv_status_access.lua" "$STATUS.restore"; mv -f "$STATUS.restore" "$STATUS"
cp -p "$BACKUP/uv_policy_access.lua" "$POLICY.restore"; mv -f "$POLICY.restore" "$POLICY"
cp -p "$BACKUP/auth_owner.lua" "$AUTH.restore"; mv -f "$AUTH.restore" "$AUTH"
cp -p "$BACKUP/nginx-server.conf" "$SERVER.restore"; mv -f "$SERVER.restore" "$SERVER"
/usr/sbin/nginx -t -c /etc/hbnf-local-control/nginx.conf >/dev/null
pid=$(cat /var/run/hbnf-owner-local-control-nginx.pid); kill -HUP "$pid"
(cd / && sha256sum -c "$BACKUP/BASELINE_FILES.SHA256SUMS" >/dev/null)
echo 'Exact pre-v1.0.25 four-file baseline restored; full 20-file rollback archive remains retained.'

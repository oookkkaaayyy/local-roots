#!/bin/sh
set -eu
TX=OWNER-LOCAL-UV-LOCAL-ACCESS-V121-20261028-01
BACKUP=/root/hbnf-owner-local-uv-local-access.rollback-$TX
STATUS=/etc/hbnf-local-control/lua/uv_status_access.lua
POLICY=/etc/hbnf-local-control/lua/uv_policy_access.lua
AUTH=/etc/hbnf-local-control/lua/auth_owner.lua
[ "$(id -u)" = 0 ] || exit 77
[ -f "$BACKUP/uv_status_access.lua" ] && [ -f "$BACKUP/uv_policy_access.lua" ] && [ -f "$BACKUP/auth_owner.lua" ] || { echo 'Exact UV route rollback missing.' >&2; exit 78; }
cp -p "$BACKUP/uv_status_access.lua" "$STATUS.restore"; mv -f "$STATUS.restore" "$STATUS"
cp -p "$BACKUP/uv_policy_access.lua" "$POLICY.restore"; mv -f "$POLICY.restore" "$POLICY"
cp -p "$BACKUP/auth_owner.lua" "$AUTH.restore"; mv -f "$AUTH.restore" "$AUTH"
echo 'Restored exact pre-v1.0.21 UV/auth handlers; full live rollback remains in the transaction directory.'

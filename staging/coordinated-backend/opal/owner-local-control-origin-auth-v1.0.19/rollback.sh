#!/bin/sh
set -eu
TX=OWNER-LOCAL-CONTROL-LOCAL-AUTH-V119-20261028-01
BACKUP=/root/hbnf-owner-local-control-origin-auth.rollback-$TX
TARGET=/etc/hbnf-local-control/lua/auth.lua
[ "$(id -u)" = 0 ] || exit 77
[ -f "$BACKUP/auth.lua" ] && [ -f "$BACKUP/BASELINE_FILES.SHA256SUMS" ] || { echo 'Exact local-auth rollback missing.' >&2; exit 78; }
expected=$(awk '$2=="etc/hbnf-local-control/lua/auth.lua" {print $1}' "$BACKUP/BASELINE_FILES.SHA256SUMS")
[ -n "$expected" ] && [ "$(sha256sum "$BACKUP/auth.lua" | awk '{print $1}')" = "$expected" ] || { echo 'Exact auth rollback hash mismatch.' >&2; exit 79; }
cp -p "$BACKUP/auth.lua" "$TARGET.rollback"; mv -f "$TARGET.rollback" "$TARGET"
[ "$(sha256sum "$TARGET" | awk '{print $1}')" = "$expected" ] || { echo 'Auth rollback readback failed.' >&2; exit 80; }
echo "Restored exact pre-v1.0.19 auth.lua; full current baseline remains at $BACKUP/ROLLBACK_BASELINE.zip."

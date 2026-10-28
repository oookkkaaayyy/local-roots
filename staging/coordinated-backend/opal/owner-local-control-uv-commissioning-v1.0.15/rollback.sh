#!/bin/sh
set -eu
ROOT=${HBNF_OPAL_ROOT:-/}
TEST_MODE=${HBNF_TEST_MODE:-0}
TX=OWNER-LOCAL-CONTROL-UV-COMMISSIONING-V115-20261027-01
BASE=$(printf '%s/%s\n' "${ROOT%/}" etc/hbnf-local-control)
BACKUP=$(printf '%s/%s\n' "${ROOT%/}" "root/hbnf-owner-local-control-uv-commissioning.rollback-$TX")
SERVICE=$(printf '%s/%s\n' "${ROOT%/}" etc/init.d/hbnf-owner-local-control)
NGINX=$(printf '%s/%s\n' "${ROOT%/}" usr/sbin/nginx)
TARGETS='etc/hbnf-local-control/lua/uv_policy_access.lua etc/hbnf-local-control/lua/uv_runtime.lua etc/hbnf-local-control/lua/uv_status_access.lua'
fail(){ echo "UV ROLLBACK BLOCKED: $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || [ "$TEST_MODE" = 1 ] || fail "run as root on the Opal"
command -v sha256sum >/dev/null 2>&1 || fail "sha256sum unavailable"
[ -d "$BACKUP" ] && [ -f "$BACKUP/BASELINE_FILES.SHA256SUMS" ] && [ -f "$BACKUP/UPDATED_FILES.SHA256SUMS" ] || fail "exact transaction recovery is missing"
(cd "$ROOT" && sha256sum -c "$BACKUP/UPDATED_FILES.SHA256SUMS" >/dev/null) || fail "installed files differ from the admitted candidate"
for rel in $TARGETS; do
  expected=$(awk -v p="$rel" '$2==p {print $1}' "$BACKUP/BASELINE_FILES.SHA256SUMS")
  [ -n "$expected" ] && [ "$(sha256sum "$BACKUP/$rel" | awk '{print $1}')" = "$expected" ] || fail "saved baseline module copy failed: $rel"
done
if [ "$ROOT" != / ] && [ "$TEST_MODE" = 1 ]; then RELOAD=${HBNF_TEST_RELOAD:-}; [ -x "$RELOAD" ] || fail "test reload stub missing"; reload(){ "$RELOAD" reload; }; else reload(){ "$SERVICE" reload; }; fi
for rel in $TARGETS; do
  source="$BACKUP/$rel"; target="$ROOT/$rel"
  [ -f "$source" ] && [ -f "$target" ] || fail "required rollback file missing: $rel"
  cp -p "$source" "$target.restore" && mv -f "$target.restore" "$target"
done
reload || fail "gateway reload failed after restoration"
(cd "$ROOT" && sha256sum -c "$BACKUP/BASELINE_FILES.SHA256SUMS" >/dev/null) || fail "restored baseline did not verify"
echo "UV_ROLLBACK_OK: exact three v1.0.14 UV modules restored; failed candidate remains recoverable in $BACKUP."

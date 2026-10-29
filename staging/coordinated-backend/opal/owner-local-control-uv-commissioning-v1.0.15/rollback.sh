#!/bin/sh
set -eu
PKG=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT=${HBNF_OPAL_ROOT:-/}
TEST_MODE=${HBNF_TEST_MODE:-0}
ADMISSION_FILE=${HBNF_OPAL_ADMISSION_FILE:-}
ADMISSION_SHA256=${HBNF_OPAL_ADMISSION_SHA256:-}
CANDIDATE_ARCHIVE=${HBNF_OPAL_CANDIDATE_ARCHIVE:-}
TX=OWNER-LOCAL-CONTROL-UV-COMMISSIONING-V115-20261027-01
BASE=$(printf '%s/%s\n' "${ROOT%/}" etc/hbnf-local-control)
BACKUP=$(printf '%s/%s\n' "${ROOT%/}" "root/hbnf-owner-local-control-uv-commissioning.rollback-$TX")
SERVICE=$(printf '%s/%s\n' "${ROOT%/}" etc/init.d/hbnf-owner-local-control)
NGINX=$(printf '%s/%s\n' "${ROOT%/}" usr/sbin/nginx)
TARGETS='etc/hbnf-local-control/lua/uv_policy_access.lua etc/hbnf-local-control/lua/uv_runtime.lua etc/hbnf-local-control/lua/uv_status_access.lua'
fail(){ echo "UV ROLLBACK BLOCKED: $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || [ "$TEST_MODE" = 1 ] || fail "run as root on the Opal"
command -v sha256sum >/dev/null 2>&1 || fail "sha256sum unavailable"
if [ "$ROOT" = / ]; then
  [ -n "$ADMISSION_FILE" ] && [ -f "$ADMISSION_FILE" ] && [ ! -L "$ADMISSION_FILE" ] || fail "original admission manifest is required for rollback"
  [ -n "$ADMISSION_SHA256" ] && [ "$(sha256sum "$ADMISSION_FILE" | awk '{print $1}')" = "$ADMISSION_SHA256" ] || fail "admission manifest readback hash differs"
  [ -n "$CANDIDATE_ARCHIVE" ] && [ -f "$CANDIDATE_ARCHIVE" ] && [ ! -L "$CANDIDATE_ARCHIVE" ] || fail "exact admitted candidate archive is required for rollback"
  command -v jsonfilter >/dev/null 2>&1 || fail "jsonfilter required for admission validation"
  av(){ jsonfilter -i "$ADMISSION_FILE" -e "$1" 2>/dev/null | sed -n '1p'; }
  [ "$(av '@.schema')" = hbnf-opal-uv-update-admission-v1 ] || fail "admission schema mismatch"
  [ "$(av '@.transaction_id')" = "$TX" ] || fail "admission transaction mismatch"
  [ "$(av '@.outcome')" = PASS ] || fail "admission has not passed"
  [ "$(av '@.target.model')" = GL-SFT1200 ] && [ "$(av '@.target.ip')" = 192.168.77.1 ] || fail "admission target mismatch"
  [ "$(av '@.candidate.package_sha256')" = "$(sha256sum "$CANDIDATE_ARCHIVE" | awk '{print $1}')" ] || fail "candidate differs from admitted bytes"
  [ "$(av '@.baseline.package_sha256')" = a5a877c3c9089df245c1262341ad3a3926c9fc85ba660d67197f277fad6096fa ] || fail "baseline rollback package mismatch"
  [ "$(av '@.baseline.installed_files_manifest_sha256')" = "$(sha256sum "$BACKUP/BASELINE_FILES.SHA256SUMS" | awk '{print $1}')" ] || fail "baseline installed-file manifest mismatch"
  [ "$(av '@.durable_readback.status')" = PASS ] || fail "candidate or rollback durable readback missing"
  [ "$(av '@.acceptance_plan.status')" = DECLARED ] || fail "acceptance plan missing"
fi
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

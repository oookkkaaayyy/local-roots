#!/bin/sh
set -eu
PKG=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT=${HBNF_OPAL_ROOT:-/}
TEST_MODE=${HBNF_TEST_MODE:-0}
ADMISSION_FILE=${HBNF_OPAL_ADMISSION_FILE:-}
ADMISSION_SHA256=${HBNF_OPAL_ADMISSION_SHA256:-}
CANDIDATE_ARCHIVE=${HBNF_OPAL_CANDIDATE_ARCHIVE:-}
TX=OWNER-LOCAL-CONTROL-UV-COMMISSIONING-V117-20261028-01
BACKUP_REL=root/hbnf-owner-local-control-uv-commissioning.rollback-$TX
TARGETS='etc/hbnf-local-control/lua/uv_policy_access.lua etc/hbnf-local-control/lua/uv_runtime.lua etc/hbnf-local-control/lua/uv_status_access.lua'
fail(){ echo "UV UPDATE BLOCKED: $*" >&2; exit 1; }
at(){ printf '%s/%s\n' "${ROOT%/}" "$1"; }
[ "$ROOT" = / ] || [ "$TEST_MODE" = 1 ] || fail "alternate roots are allowed only for offline rehearsal"
[ "$ROOT" = / ] && [ "$(id -u)" != 0 ] && fail "run as root on the Opal"
command -v sha256sum >/dev/null 2>&1 || fail "sha256sum is required"
(cd "$PKG" && sha256sum -c SHA256SUMS >/dev/null) || fail "package checksum failed"
[ "$ROOT" != / ] || {
  [ -n "$ADMISSION_FILE" ] && [ -f "$ADMISSION_FILE" ] && [ ! -L "$ADMISSION_FILE" ] || fail "one-time admission manifest is required"
  [ -n "$ADMISSION_SHA256" ] && [ "$(sha256sum "$ADMISSION_FILE" | awk '{print $1}')" = "$ADMISSION_SHA256" ] || fail "admission manifest readback hash differs"
  [ -n "$CANDIDATE_ARCHIVE" ] && [ -f "$CANDIDATE_ARCHIVE" ] && [ ! -L "$CANDIDATE_ARCHIVE" ] || fail "exact retained candidate archive is required"
  command -v jsonfilter >/dev/null 2>&1 || fail "jsonfilter is required for admission validation"
  av(){ jsonfilter -i "$ADMISSION_FILE" -e "$1" 2>/dev/null | sed -n '1p'; }
  [ "$(av '@.schema')" = hbnf-opal-uv-update-admission-v1 ] || fail "admission schema mismatch"
  [ "$(av '@.transaction_id')" = "$TX" ] || fail "admission transaction mismatch"
  [ "$(av '@.outcome')" = PASS ] || fail "admission has not passed"
  [ "$(av '@.target.model')" = GL-SFT1200 ] && [ "$(av '@.target.ip')" = 192.168.77.1 ] || fail "admission target mismatch"
  [ "$(av '@.candidate.source_commit')" = "$(jsonfilter -i "$PKG/PACKAGE.json" -e '@.sourceCommit' | sed -n '1p')" ] || fail "source commit mismatch"
  [ "$(av '@.candidate.package_sha256')" = "$(sha256sum "$CANDIDATE_ARCHIVE" | awk '{print $1}')" ] || fail "candidate archive differs from admitted bytes"
  [ "$(av '@.baseline.package_sha256')" = "$(jsonfilter -i "$PKG/PACKAGE.json" -e '@.baseline.packageSha256' | sed -n '1p')" ] || fail "rollback package mismatch"
  [ "$(av '@.baseline.installed_files_manifest_sha256')" = "$(sha256sum "$PKG/BASELINE_FILES.SHA256SUMS" | awk '{print $1}')" ] || fail "admitted installed-file baseline differs"
  [ "$(av '@.durable_readback.status')" = PASS ] || fail "candidate and rollback lack durable readback"
  [ "$(av '@.acceptance_plan.status')" = DECLARED ] || fail "acceptance plan is missing"
}
if [ "$ROOT" = / ]; then
  UBUS=$(command -v ubus) || fail "ubus unavailable"
  BOARD=$("$UBUS" call system board 2>/dev/null) || fail "cannot identify target"
  printf '%s\n' "$BOARD" | grep -Fq '"board_name": "glinet,gl-sft1200"' || fail "target is not GL-SFT1200"
fi
BASE=$(at etc/hbnf-local-control)
SERVICE=$(at etc/init.d/hbnf-owner-local-control)
NGINX=$(at usr/sbin/nginx)
NETSTAT=$(at bin/netstat)
PID_FILE=$(at var/run/hbnf-owner-local-control-nginx.pid)
[ -f "$BASE/nginx-server.conf" ] && [ -x "$SERVICE" ] && [ -f "$PID_FILE" ] || fail "dedicated gateway service is unavailable"
[ -x "$NGINX" ] && [ -x "$NETSTAT" ] || fail "Nginx or netstat unavailable"
pid=$(cat "$PID_FILE"); case "$pid" in *[!0-9]*|'') fail "gateway PID malformed" ;; esac
kill -0 "$pid" 2>/dev/null || fail "dedicated gateway is not running"
"$NGINX" -t -c "$BASE/nginx.conf" >/dev/null || fail "Nginx config check failed"
"$NETSTAT" -lnt 2>/dev/null | awk 'NR > 2 && $4 ~ /(:|\])9443$/ { found=1 } END { exit !found }' || fail "gateway is not listening on TCP 9443"
(cd "$ROOT" && sha256sum -c "$PKG/BASELINE_FILES.SHA256SUMS" >/dev/null) || fail "installed 20-file live baseline differs"
[ "$(wc -l < "$PKG/BASELINE_FILES.SHA256SUMS" | tr -d ' ')" = 20 ] || fail "installed baseline manifest is incomplete"
BACKUP=$(at "$BACKUP_REL")
[ ! -e "$BACKUP" ] || fail "transaction backup already exists; inspect before retry"
if [ "$ROOT" != / ] && [ "$TEST_MODE" = 1 ]; then
  RELOAD=${HBNF_TEST_RELOAD:-}; [ -x "$RELOAD" ] || fail "test reload stub missing"; reload(){ "$RELOAD" reload; }
else
  reload(){ "$SERVICE" reload; }
fi
mkdir -m 0700 "$BACKUP"
for rel in $TARGETS; do
  target=$(at "$rel"); [ -f "$target" ] && [ ! -L "$target" ] || fail "baseline module missing: $rel"
  dest="$BACKUP/$rel"; mkdir -p "$(dirname "$dest")"; cp -p "$target" "$dest"
  expected=$(awk -v p="$rel" '$2==p {print $1}' "$PKG/BASELINE_FILES.SHA256SUMS")
  if [ -z "$expected" ] || [ "$(sha256sum "$dest" | awk '{print $1}')" != "$expected" ]; then
    rm -rf "$BACKUP"; fail "exact rollback copy failed before mutation: $rel"
  fi
done
cp -p "$PKG/BASELINE_FILES.SHA256SUMS" "$BACKUP/BASELINE_FILES.SHA256SUMS"
cp -p "$PKG/UPDATED_FILES.SHA256SUMS" "$BACKUP/UPDATED_FILES.SHA256SUMS"
cp -p "$PKG/ROLLBACK_BASELINE.zip" "$BACKUP/ROLLBACK_BASELINE.zip"
cp -p "$PKG/rollback.sh" "$BACKUP/rollback.sh"; chmod 0700 "$BACKUP/rollback.sh"
restore_failure(){
  rc=$?; trap - EXIT HUP INT TERM
  for rel in $TARGETS; do
    source="$BACKUP/$rel"; target=$(at "$rel")
    if [ -f "$source" ]; then cp -p "$source" "$target.restore" && mv -f "$target.restore" "$target" || echo "RESTORE WARNING: $rel" >&2; fi
  done
  reload || echo "RESTORE WARNING: gateway reload failed" >&2
  exit "$rc"
}
trap restore_failure EXIT HUP INT TERM
for rel in $TARGETS; do
  name=${rel##*/}; target=$(at "$rel"); cp -p "$PKG/$name" "$target.tmp"
  expected=$(awk -v p="$rel" '$2==p {print $1}' "$PKG/UPDATED_FILES.SHA256SUMS")
  [ -n "$expected" ] && [ "$(sha256sum "$target.tmp" | awk '{print $1}')" = "$expected" ] || fail "staged candidate failed hash check: $name"
  mv -f "$target.tmp" "$target"
done
reload || fail "gateway reload failed"
"$NGINX" -t -c "$BASE/nginx.conf" >/dev/null || fail "post-reload config check failed"
(cd "$ROOT" && sha256sum -c "$PKG/UPDATED_FILES.SHA256SUMS" >/dev/null) || fail "installed candidate manifest mismatch"
kill -0 "$pid" 2>/dev/null || fail "gateway exited after reload"
"$NETSTAT" -lnt 2>/dev/null | awk 'NR > 2 && $4 ~ /(:|\])9443$/ { found=1 } END { exit !found }' || fail "TCP 9443 listener disappeared"
cp -p "$PKG/UPDATED_FILES.SHA256SUMS" "$BACKUP/POST-INSTALL-READBACK.SHA256SUMS"
candidate_archive_sha=OFFLINE_REHEARSAL
[ -z "$CANDIDATE_ARCHIVE" ] || candidate_archive_sha=$(sha256sum "$CANDIDATE_ARCHIVE" | awk '{print $1}')
printf '{\n  "schema":"hbnf-opal-uv-commissioning-readback-v1",\n  "transaction_id":"%s",\n  "admission_manifest_sha256":"%s",\n  "candidate_archive_sha256":"%s",\n  "baseline_manifest":"PASS",\n  "updated_manifest":"PASS",\n  "gateway_reload":"PASS"\n}\n' "$TX" "${ADMISSION_SHA256:-OFFLINE_REHEARSAL}" "$candidate_archive_sha" > "$BACKUP/POST-INSTALL-READBACK.json"
sync
trap - EXIT HUP INT TERM
echo "UV_UPDATE_OK: authenticated commissioning pulse and safe OFF installed; exact live-baseline module recovery retained at $BACKUP."

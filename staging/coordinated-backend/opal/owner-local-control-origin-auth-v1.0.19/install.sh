#!/bin/sh
set -eu
PKG=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
TX=OWNER-LOCAL-CONTROL-LOCAL-AUTH-V119-20261028-01
ADMISSION_FILE=${HBNF_OPAL_ADMISSION_FILE:-}
ADMISSION_SHA256=${HBNF_OPAL_ADMISSION_SHA256:-}
CANDIDATE_ARCHIVE=${HBNF_OPAL_CANDIDATE_ARCHIVE:-}
BACKUP=/root/hbnf-owner-local-control-origin-auth.rollback-$TX
TARGET=/etc/hbnf-local-control/lua/auth.lua
TMP=$TARGET.hbnf-v119.tmp
SERVICE=/etc/init.d/hbnf-owner-local-control
NGINX=/usr/sbin/nginx
fail(){ echo "LOCAL AUTH UPDATE BLOCKED: $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || fail "run as root on the Opal"
for cmd in sha256sum jsonfilter curl; do command -v "$cmd" >/dev/null 2>&1 || fail "$cmd missing"; done
(cd "$PKG" && sha256sum -c SHA256SUMS >/dev/null) || fail "package checksums failed"
[ -f "$TARGET" ] && [ ! -L "$TARGET" ] || fail "auth.lua missing or symlinked"
[ -x "$SERVICE" ] && [ -x "$NGINX" ] || fail "dedicated gateway missing"
[ -s /var/run/hbnf-owner-local-control-nginx.pid ] || fail "gateway PID missing"
pid=$(cat /var/run/hbnf-owner-local-control-nginx.pid); case "$pid" in *[!0-9]*|'') fail "gateway PID malformed" ;; esac
kill -0 "$pid" 2>/dev/null || fail "gateway is not running"
"$NGINX" -t -c /etc/hbnf-local-control/nginx.conf >/dev/null || fail "current gateway config invalid"
netstat -lnt 2>/dev/null | awk 'NR>2 && $4 ~ /(:|\])9443$/ {ok=1} END{exit !ok}' || fail "9443 listener missing"
[ ! -e "$BACKUP" ] && [ ! -e "$TMP" ] || fail "transaction recovery path exists; inspect it"
[ -n "$ADMISSION_FILE" ] && [ -f "$ADMISSION_FILE" ] && [ ! -L "$ADMISSION_FILE" ] || fail "one-time admission manifest required"
[ -n "$ADMISSION_SHA256" ] && [ "$(sha256sum "$ADMISSION_FILE" | awk '{print $1}')" = "$ADMISSION_SHA256" ] || fail "admission hash mismatch"
[ -n "$CANDIDATE_ARCHIVE" ] && [ -f "$CANDIDATE_ARCHIVE" ] && [ ! -L "$CANDIDATE_ARCHIVE" ] || fail "retained candidate archive required"
av(){ jsonfilter -i "$ADMISSION_FILE" -e "$1" 2>/dev/null | sed -n '1p'; }
[ "$(av '@.schema')" = hbnf-opal-uv-update-admission-v1 ] || fail "admission schema mismatch"
[ "$(av '@.transaction_id')" = "$TX" ] && [ "$(av '@.outcome')" = PASS ] || fail "admission transaction not passed"
[ "$(av '@.target.model')" = GL-SFT1200 ] && [ "$(av '@.target.ip')" = 192.168.77.1 ] || fail "target mismatch"
[ "$(av '@.candidate.source_commit')" = "$(jsonfilter -i "$PKG/PACKAGE.json" -e '@.sourceCommit' | sed -n '1p')" ] || fail "source commit mismatch"
[ "$(av '@.candidate.package_sha256')" = "$(sha256sum "$CANDIDATE_ARCHIVE" | awk '{print $1}')" ] || fail "candidate package mismatch"
[ "$(av '@.baseline.package_sha256')" = "$(jsonfilter -i "$PKG/PACKAGE.json" -e '@.baseline.packageSha256' | sed -n '1p')" ] || fail "rollback package mismatch"
[ "$(av '@.baseline.installed_files_manifest_sha256')" = "$(sha256sum "$PKG/BASELINE_FILES.SHA256SUMS" | awk '{print $1}')" ] || fail "baseline manifest mismatch"
[ "$(av '@.durable_readback.status')" = PASS ] || fail "durable package readback missing"
[ "$(av '@.acceptance_plan.status')" = DECLARED ] || fail "acceptance plan missing"
(cd / && sha256sum -c "$PKG/BASELINE_FILES.SHA256SUMS" >/dev/null) || fail "current 20-file live baseline differs"
[ "$(wc -l < "$PKG/BASELINE_FILES.SHA256SUMS" | tr -d ' ')" = 20 ] || fail "baseline manifest incomplete"
expected=$(awk '$2=="etc/hbnf-local-control/lua/auth.lua" {print $1}' "$PKG/BASELINE_FILES.SHA256SUMS")
[ -n "$expected" ] && [ "$(sha256sum "$TARGET" | awk '{print $1}')" = "$expected" ] || fail "auth.lua differs from exact live baseline"
mkdir -m 0700 "$BACKUP"
cp -p "$TARGET" "$BACKUP/auth.lua"
cp -p "$PKG/BASELINE_FILES.SHA256SUMS" "$BACKUP/BASELINE_FILES.SHA256SUMS"
cp -p "$PKG/UPDATED_FILES.SHA256SUMS" "$BACKUP/UPDATED_FILES.SHA256SUMS"
cp -p "$PKG/ROLLBACK_BASELINE.zip" "$BACKUP/ROLLBACK_BASELINE.zip"
cp -p "$PKG/rollback.sh" "$BACKUP/rollback.sh"; chmod 0700 "$BACKUP/rollback.sh"
[ "$(sha256sum "$BACKUP/auth.lua" | awk '{print $1}')" = "$expected" ] || fail "exact auth rollback copy failed"
restore_failure(){
 rc=$?; trap - EXIT HUP INT TERM
 if [ -f "$BACKUP/auth.lua" ]; then cp -p "$BACKUP/auth.lua" "$TARGET.restore" && mv -f "$TARGET.restore" "$TARGET" || echo "RESTORE WARNING: exact auth rollback remains at $BACKUP" >&2; fi
 rm -f "$TMP"; exit "$rc"
}
trap restore_failure EXIT HUP INT TERM
cp -p "$PKG/auth.lua" "$TMP"
expected=$(awk '$2=="etc/hbnf-local-control/lua/auth.lua" {print $1}' "$PKG/UPDATED_FILES.SHA256SUMS")
[ "$(sha256sum "$TMP" | awk '{print $1}')" = "$expected" ] || fail "candidate auth.lua hash mismatch"
mv -f "$TMP" "$TARGET"
# Nginx loads auth.lua through dofile on each request; no service reload needed.
local_headers=/tmp/hbnf-v119-local.headers; public_headers=/tmp/hbnf-v119-public.headers; denied_headers=/tmp/hbnf-v119-denied.headers
local_code=$(curl --noproxy '*' --silent --show-error --max-time 5 --resolve cart-control.hbnightflyers.com:9443:192.168.77.1 -D "$local_headers" -o /tmp/hbnf-v119-local.body -w '%{http_code}' https://cart-control.hbnightflyers.com:9443/api/aux/uv-status -H 'Origin: http://192.168.77.1')
[ "$local_code" = 401 ] && grep -q 'paired_owner_required' /tmp/hbnf-v119-local.body && tr -d '\r' < "$local_headers" | grep -Fqx 'Access-Control-Allow-Origin: http://192.168.77.1' || fail "local origin/auth check failed (HTTP $local_code)"
public_code=$(curl --noproxy '*' --silent --show-error --max-time 5 --resolve cart-control.hbnightflyers.com:9443:192.168.77.1 -D "$public_headers" -o /tmp/hbnf-v119-public.body -w '%{http_code}' https://cart-control.hbnightflyers.com:9443/api/aux/uv-status -H 'Origin: https://hbnightflyers.com')
[ "$public_code" = 401 ] && grep -q 'paired_owner_required' /tmp/hbnf-v119-public.body && tr -d '\r' < "$public_headers" | grep -Fqx 'Access-Control-Allow-Origin: https://hbnightflyers.com' || fail "public owner auth behavior changed (HTTP $public_code)"
denied_code=$(curl --noproxy '*' --silent --show-error --max-time 5 --resolve cart-control.hbnightflyers.com:9443:192.168.77.1 -D "$denied_headers" -o /dev/null -w '%{http_code}' https://cart-control.hbnightflyers.com:9443/api/aux/uv-status -H 'Origin: https://untrusted.invalid')
[ "$denied_code" = 403 ] || fail "untrusted origin not denied (HTTP $denied_code)"
if tr -d '\r' < "$denied_headers" | grep -qi '^Access-Control-Allow-Origin:'; then fail "untrusted origin received allow-origin"; fi
(cd / && sha256sum -c "$PKG/UPDATED_FILES.SHA256SUMS" >/dev/null) || fail "updated installed-file manifest failed"
cp -p "$PKG/UPDATED_FILES.SHA256SUMS" "$BACKUP/POST-INSTALL-READBACK.SHA256SUMS"
printf '{\n  "schema":"hbnf-opal-local-origin-auth-readback-v1",\n  "transaction_id":"%s",\n  "admission_manifest_sha256":"%s",\n  "candidate_archive_sha256":"%s",\n  "updated_file_manifest":"PASS",\n  "local_origin":"PASS",\n  "public_origin":"PASS",\n  "paired_owner_auth_required":"PASS",\n  "untrusted_origin_denied":"PASS",\n  "nginx_gateway_health":"PASS"\n}\n' "$TX" "$ADMISSION_SHA256" "$(sha256sum "$CANDIDATE_ARCHIVE" | awk '{print $1}')" > "$BACKUP/POST-INSTALL-READBACK.json"
sync; trap - EXIT HUP INT TERM
echo "LOCAL_AUTH_OK: Cart-local origin passes; Owner pairing remains required; public origin unchanged; unknown origin denied. Exact prior auth.lua and full 20-file rollback retained at $BACKUP."

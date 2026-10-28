#!/bin/sh
set -eu
PKG=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
TX=OWNER-LOCAL-CONTROL-CORS-V118-20261028-02
ADMISSION_FILE=${HBNF_OPAL_ADMISSION_FILE:-}
ADMISSION_SHA256=${HBNF_OPAL_ADMISSION_SHA256:-}
CANDIDATE_ARCHIVE=${HBNF_OPAL_CANDIDATE_ARCHIVE:-}
BACKUP=/root/hbnf-owner-local-control-cors.rollback-$TX
TARGET=/etc/hbnf-local-control/nginx-server.conf
TMP=$TARGET.hbnf-v118.tmp
NGINX=/usr/sbin/nginx
CONF=/etc/hbnf-local-control/nginx.conf
SERVICE=/etc/init.d/hbnf-owner-local-control
fail(){ echo "CORS UPDATE BLOCKED: $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || fail "run as root on the Opal"
command -v sha256sum >/dev/null 2>&1 || fail "sha256sum missing"
command -v jsonfilter >/dev/null 2>&1 || fail "jsonfilter missing"
command -v curl >/dev/null 2>&1 || fail "curl missing for live CORS verification"
(cd "$PKG" && sha256sum -c SHA256SUMS >/dev/null) || fail "package checksum failed"
[ -f "$TARGET" ] && [ ! -L "$TARGET" ] || fail "gateway config missing or is a symlink"
[ -x "$SERVICE" ] && [ -x "$NGINX" ] || fail "dedicated gateway service missing"
[ -s /var/run/hbnf-owner-local-control-nginx.pid ] || fail "dedicated gateway PID missing"
pid=$(cat /var/run/hbnf-owner-local-control-nginx.pid); case "$pid" in *[!0-9]*|'') fail "gateway PID malformed" ;; esac
kill -0 "$pid" 2>/dev/null || fail "dedicated gateway is not running"
"$NGINX" -t -c "$CONF" >/dev/null || fail "current gateway config is invalid"
netstat -lnt 2>/dev/null | awk 'NR>2 && $4 ~ /(:|\])9443$/ {ok=1} END{exit !ok}' || fail "gateway is not listening on 9443"
[ ! -e "$BACKUP" ] && [ ! -e "$TMP" ] || fail "transaction recovery path already exists; inspect before proceeding"
[ -n "$ADMISSION_FILE" ] && [ -f "$ADMISSION_FILE" ] && [ ! -L "$ADMISSION_FILE" ] || fail "one-time admission manifest required"
[ -n "$ADMISSION_SHA256" ] && [ "$(sha256sum "$ADMISSION_FILE" | awk '{print $1}')" = "$ADMISSION_SHA256" ] || fail "admission hash mismatch"
[ -n "$CANDIDATE_ARCHIVE" ] && [ -f "$CANDIDATE_ARCHIVE" ] && [ ! -L "$CANDIDATE_ARCHIVE" ] || fail "retained candidate archive required"
av(){ jsonfilter -i "$ADMISSION_FILE" -e "$1" 2>/dev/null | sed -n '1p'; }
[ "$(av '@.schema')" = hbnf-opal-uv-update-admission-v1 ] || fail "admission schema mismatch"
[ "$(av '@.transaction_id')" = "$TX" ] || fail "admission transaction mismatch"
[ "$(av '@.outcome')" = PASS ] || fail "admission has not passed"
[ "$(av '@.target.model')" = GL-SFT1200 ] && [ "$(av '@.target.ip')" = 192.168.77.1 ] || fail "target mismatch"
[ "$(av '@.candidate.source_commit')" = "$(jsonfilter -i "$PKG/PACKAGE.json" -e '@.sourceCommit' | sed -n '1p')" ] || fail "source commit mismatch"
[ "$(av '@.candidate.package_sha256')" = "$(sha256sum "$CANDIDATE_ARCHIVE" | awk '{print $1}')" ] || fail "candidate archive mismatch"
[ "$(av '@.baseline.package_sha256')" = "$(jsonfilter -i "$PKG/PACKAGE.json" -e '@.baseline.packageSha256' | sed -n '1p')" ] || fail "rollback package mismatch"
[ "$(av '@.baseline.installed_files_manifest_sha256')" = "$(sha256sum "$PKG/BASELINE_FILES.SHA256SUMS" | awk '{print $1}')" ] || fail "baseline manifest mismatch"
[ "$(av '@.durable_readback.status')" = PASS ] || fail "durable candidate and rollback readback missing"
[ "$(av '@.acceptance_plan.status')" = DECLARED ] || fail "acceptance plan missing"
(cd / && sha256sum -c "$PKG/BASELINE_FILES.SHA256SUMS" >/dev/null) || fail "current 20-file live baseline differs"
[ "$(wc -l < "$PKG/BASELINE_FILES.SHA256SUMS" | tr -d ' ')" = 20 ] || fail "live baseline manifest is incomplete"
expected=$(awk '$2=="etc/hbnf-local-control/nginx-server.conf" {print $1}' "$PKG/BASELINE_FILES.SHA256SUMS")
[ -n "$expected" ] && [ "$(sha256sum "$TARGET" | awk '{print $1}')" = "$expected" ] || fail "gateway config differs from admitted exact baseline"
mkdir -m 0700 "$BACKUP"
cp -p "$TARGET" "$BACKUP/nginx-server.conf"
cp -p "$PKG/BASELINE_FILES.SHA256SUMS" "$BACKUP/BASELINE_FILES.SHA256SUMS"
cp -p "$PKG/UPDATED_FILES.SHA256SUMS" "$BACKUP/UPDATED_FILES.SHA256SUMS"
cp -p "$PKG/ROLLBACK_BASELINE.zip" "$BACKUP/ROLLBACK_BASELINE.zip"
cp -p "$PKG/rollback.sh" "$BACKUP/rollback.sh"; chmod 0700 "$BACKUP/rollback.sh"
[ "$(sha256sum "$BACKUP/nginx-server.conf" | awk '{print $1}')" = "$expected" ] || fail "exact config rollback copy failed before mutation"
restore_failure(){
  rc=$?; trap - EXIT HUP INT TERM
  if [ -f "$BACKUP/nginx-server.conf" ]; then
    cp -p "$BACKUP/nginx-server.conf" "$TARGET.restore" && mv -f "$TARGET.restore" "$TARGET" || echo "RESTORE WARNING: original gateway config retained at $BACKUP" >&2
    "$SERVICE" reload || echo "RESTORE WARNING: service reload failed" >&2
  fi
  rm -f "$TMP"
  exit "$rc"
}
trap restore_failure EXIT HUP INT TERM
cp -p "$PKG/nginx-server.conf" "$TMP"
expected=$(awk '$2=="etc/hbnf-local-control/nginx-server.conf" {print $1}' "$PKG/UPDATED_FILES.SHA256SUMS")
[ -n "$expected" ] && [ "$(sha256sum "$TMP" | awk '{print $1}')" = "$expected" ] || fail "candidate config hash mismatch"
mv -f "$TMP" "$TARGET"
"$NGINX" -t -c "$CONF" >/dev/null || fail "candidate gateway config failed syntax check"
"$SERVICE" reload || fail "dedicated gateway reload failed"
"$NGINX" -t -c "$CONF" >/dev/null || fail "post-reload config check failed"
kill -0 "$pid" 2>/dev/null || fail "dedicated gateway exited after reload"
netstat -lnt 2>/dev/null | awk 'NR>2 && $4 ~ /(:|\])9443$/ {ok=1} END{exit !ok}' || fail "TCP 9443 listener disappeared"
local_headers=/tmp/hbnf-v118-local-cors.headers
public_headers=/tmp/hbnf-v118-public-cors.headers
denied_headers=/tmp/hbnf-v118-denied-cors.headers
local_origin=$(curl --silent --show-error --max-time 5 --resolve cart-control.hbnightflyers.com:9443:192.168.77.1 -D "$local_headers" -o /dev/null -w '%{http_code}' -X OPTIONS -H 'Origin: http://192.168.77.1' -H 'Access-Control-Request-Method: GET' -H 'Access-Control-Request-Headers: x-hbnf-device' https://cart-control.hbnightflyers.com:9443/api/aux/uv-status)
[ "$local_origin" = 204 ] && tr -d '\r' < "$local_headers" | grep -Fqx 'Access-Control-Allow-Origin: http://192.168.77.1' || fail "Cart-local PWA preflight returned $local_origin or wrong allow-origin"
public_origin=$(curl --silent --show-error --max-time 5 --resolve cart-control.hbnightflyers.com:9443:192.168.77.1 -D "$public_headers" -o /dev/null -w '%{http_code}' -X OPTIONS -H 'Origin: https://hbnightflyers.com' -H 'Access-Control-Request-Method: GET' -H 'Access-Control-Request-Headers: x-hbnf-device' https://cart-control.hbnightflyers.com:9443/api/aux/uv-status)
[ "$public_origin" = 204 ] && tr -d '\r' < "$public_headers" | grep -Fqx 'Access-Control-Allow-Origin: https://hbnightflyers.com' || fail "public PWA preflight returned $public_origin or wrong allow-origin"
denied_origin=$(curl --silent --show-error --max-time 5 --resolve cart-control.hbnightflyers.com:9443:192.168.77.1 -D "$denied_headers" -o /dev/null -w '%{http_code}' -X OPTIONS -H 'Origin: https://untrusted.invalid' -H 'Access-Control-Request-Method: GET' -H 'Access-Control-Request-Headers: x-hbnf-device' https://cart-control.hbnightflyers.com:9443/api/aux/uv-status)
[ "$denied_origin" = 403 ] || fail "untrusted-origin preflight returned $denied_origin, expected 403"
if tr -d '\r' < "$denied_headers" | grep -qi '^Access-Control-Allow-Origin:'; then fail "untrusted origin received an allow-origin header"; fi
rm -f "$local_headers" "$public_headers" "$denied_headers"
cp -p "$PKG/UPDATED_FILES.SHA256SUMS" "$BACKUP/POST-INSTALL-READBACK.SHA256SUMS"
candidate_sha=$(sha256sum "$CANDIDATE_ARCHIVE" | awk '{print $1}')
printf '{\n  "schema":"hbnf-opal-owner-cors-readback-v1",\n  "transaction_id":"%s",\n  "admission_manifest_sha256":"%s",\n  "candidate_archive_sha256":"%s",\n  "updated_manifest":"PASS",\n  "gateway_reload":"PASS",\n  "cart_local_origin_preflight":"PASS",\n  "public_origin_preflight":"PASS",\n  "untrusted_origin_denied":"PASS"\n}\n' "$TX" "$ADMISSION_SHA256" "$candidate_sha" > "$BACKUP/POST-INSTALL-READBACK.json"
sync
trap - EXIT HUP INT TERM
echo "CORS_UPDATE_OK: Cart-local PWA and public origin preflights PASS; untrusted origin remains denied. Gateway auth and WLED routes remain unchanged. Exact previous gateway state retained at $BACKUP."

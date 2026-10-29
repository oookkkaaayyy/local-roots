#!/bin/sh
set -eu
PKG=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
TX=OWNER-LOCAL-UV-LOCAL-ACCESS-V123-20261028-02
ADMISSION_FILE=${HBNF_OPAL_ADMISSION_FILE:-}; ADMISSION_SHA256=${HBNF_OPAL_ADMISSION_SHA256:-}; CANDIDATE_ARCHIVE=${HBNF_OPAL_CANDIDATE_ARCHIVE:-}
BACKUP=/root/hbnf-owner-local-uv-local-access.rollback-$TX
STATUS=/etc/hbnf-local-control/lua/uv_status_access.lua
POLICY=/etc/hbnf-local-control/lua/uv_policy_access.lua
AUTH=/etc/hbnf-local-control/lua/auth_owner.lua
SERVER=/etc/hbnf-local-control/nginx-server.conf
fail(){ echo "LOCAL UV LOCK FIX BLOCKED: $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || fail "run as root on the Opal"
for cmd in sha256sum jsonfilter curl; do command -v "$cmd" >/dev/null 2>&1 || fail "$cmd missing"; done
(cd "$PKG" && sha256sum -c SHA256SUMS >/dev/null) || fail "package checksum failed"
for f in "$STATUS" "$POLICY" "$AUTH" "$SERVER"; do [ -f "$f" ] && [ ! -L "$f" ] || fail "managed file missing/symlinked: $f"; done
[ -n "$ADMISSION_FILE" ] && [ -f "$ADMISSION_FILE" ] && [ ! -L "$ADMISSION_FILE" ] || fail "one-time admission manifest required"
[ -n "$ADMISSION_SHA256" ] && [ "$(sha256sum "$ADMISSION_FILE" | awk '{print $1}')" = "$ADMISSION_SHA256" ] || fail "admission hash mismatch"
[ -n "$CANDIDATE_ARCHIVE" ] && [ -f "$CANDIDATE_ARCHIVE" ] && [ ! -L "$CANDIDATE_ARCHIVE" ] || fail "retained candidate archive required"
av(){ jsonfilter -i "$ADMISSION_FILE" -e "$1" 2>/dev/null | sed -n '1p'; }
[ "$(av '@.schemaVersion')" = 1 ] || fail "shared release admission schema mismatch"
[ "$(av '@.releaseId')" = HBNF-OPAL-UV-LOCK-V123-20261028-02 ] || fail "release ID mismatch"
[ "$(av '@.source.commit')" = "$(jsonfilter -i "$PKG/PACKAGE.json" -e '@.sourceCommit' | sed -n '1p')" ] || fail "source commit mismatch"
[ "$(av '@.package.sha256')" = "$(sha256sum "$CANDIDATE_ARCHIVE" | awk '{print $1}')" ] || fail "candidate package mismatch"
[ "$(av '@.baseline.rollbackSha256')" = "$(jsonfilter -i "$PKG/PACKAGE.json" -e '@.baseline.packageSha256' | sed -n '1p')" ] || fail "rollback package mismatch"
[ "$(av '@.baseline.rollbackDriveFileId')" = "$(jsonfilter -i "$PKG/PACKAGE.json" -e '@.baseline.driveFileId' | sed -n '1p')" ] || fail "rollback recovery identity mismatch"
[ "$(av '@.baseline.rollbackDownloadBackSha256')" = "$(jsonfilter -i "$PKG/PACKAGE.json" -e '@.baseline.packageSha256' | sed -n '1p')" ] || fail "rollback download-back hash mismatch"
[ "$(av '@.deployment.provider')" = "$(jsonfilter -i "$PKG/PACKAGE.json" -e '@.target.provider' | sed -n '1p')" ] || fail "provider mismatch"
[ "$(av '@.deployment.target')" = "$(jsonfilter -i "$PKG/PACKAGE.json" -e '@.target.identity' | sed -n '1p')" ] || fail "target mismatch"
[ -n "$(av '@.recovery.driveFileId')" ] || fail "candidate durable recovery identity missing"
[ "$(av '@.baseline.identity')" = "$(jsonfilter -i "$PKG/PACKAGE.json" -e '@.baseline.identity' | sed -n '1p')" ] || fail "installed baseline identity mismatch"
[ "$(wc -l < "$PKG/BASELINE_FILES.SHA256SUMS" | tr -d ' ')" = 20 ] || fail "baseline manifest incomplete"
[ -s /var/run/hbnf-owner-local-control-nginx.pid ] || fail "dedicated gateway PID missing"
pid=$(cat /var/run/hbnf-owner-local-control-nginx.pid); case "$pid" in *[!0-9]*|'') fail "gateway PID malformed" ;; esac
kill -0 "$pid" 2>/dev/null || fail "dedicated gateway is not running"
/usr/sbin/nginx -t -c /etc/hbnf-local-control/nginx.conf >/dev/null || fail "gateway config invalid"
netstat -lnt 2>/dev/null | awk 'NR>2 && $4 ~ /(:|\])9443$/ {ok=1} END{exit !ok}' || fail "9443 listener missing"
[ ! -e "$BACKUP" ] || fail "transaction recovery path exists; inspect before retry"
mkdir -m 0700 "$BACKUP"
cp -p "$STATUS" "$BACKUP/uv_status_access.lua"; cp -p "$POLICY" "$BACKUP/uv_policy_access.lua"; cp -p "$AUTH" "$BACKUP/auth_owner.lua"; cp -p "$SERVER" "$BACKUP/nginx-server.conf"
cp -p "$PKG/BASELINE_FILES.SHA256SUMS" "$BACKUP/BASELINE_FILES.SHA256SUMS"; cp -p "$PKG/UPDATED_FILES.SHA256SUMS" "$BACKUP/UPDATED_FILES.SHA256SUMS"; cp -p "$PKG/ROLLBACK_BASELINE.zip" "$BACKUP/ROLLBACK_BASELINE.zip"; cp -p "$PKG/rollback.sh" "$BACKUP/rollback.sh"; chmod 0700 "$BACKUP/rollback.sh"
restore_failure(){ rc=$?; trap - EXIT HUP INT TERM; for n in uv_status_access.lua uv_policy_access.lua auth_owner.lua nginx-server.conf; do case "$n" in uv_status_access.lua) dst="$STATUS";; uv_policy_access.lua) dst="$POLICY";; auth_owner.lua) dst="$AUTH";; nginx-server.conf) dst="$SERVER";; esac; cp -p "$BACKUP/$n" "$dst.restore" && mv -f "$dst.restore" "$dst"; done; kill -HUP "$pid" 2>/dev/null || true; exit "$rc"; }
trap restore_failure EXIT HUP INT TERM
for n in uv_status_access.lua uv_policy_access.lua auth_owner.lua nginx-server.conf; do cp -p "$PKG/$n" "$BACKUP/$n.candidate"; done
(cd "$PKG" && sha256sum -c CANDIDATE_FILES.SHA256SUMS >/dev/null) || fail "candidate files checksum failed"
for spec in 'uv_status_access.lua:/etc/hbnf-local-control/lua/uv_status_access.lua' 'uv_policy_access.lua:/etc/hbnf-local-control/lua/uv_policy_access.lua' 'auth_owner.lua:/etc/hbnf-local-control/lua/auth_owner.lua' 'nginx-server.conf:/etc/hbnf-local-control/nginx-server.conf'; do src=${spec%%:*}; dst=${spec#*:}; cp -p "$PKG/$src" "$dst.tmp"; mv -f "$dst.tmp" "$dst"; done
/usr/sbin/nginx -t -c /etc/hbnf-local-control/nginx.conf >/dev/null || fail "updated gateway config invalid"
kill -HUP "$pid" || fail "dedicated gateway reload failed"
local_status=000; tries=0
while [ "$local_status" != 200 ] && [ "$tries" -lt 10 ]; do
 local_status=$(curl --noproxy '*' --silent --show-error --max-time 5 --resolve cart-control.hbnightflyers.com:9443:192.168.77.1 -D /tmp/hbnf-v123-status.headers -o /tmp/hbnf-v123-status.body -w '%{http_code}' https://cart-control.hbnightflyers.com:9443/api/aux/uv-status -H 'Origin: http://192.168.77.1' || true)
 [ "$local_status" = 200 ] || { tries=$((tries+1)); sleep 1; }
done
[ "$local_status" = 200 ] && grep -q '"mutationIssued":false' /tmp/hbnf-v123-status.body && grep -q '"commissioningTestAvailable":true' /tmp/hbnf-v123-status.body || fail "local read-only UV status failed (HTTP $local_status)"
local_policy=$(curl --noproxy '*' --silent --show-error --max-time 5 --resolve cart-control.hbnightflyers.com:9443:192.168.77.1 -o /tmp/hbnf-v123-policy.body -w '%{http_code}' -X POST https://cart-control.hbnightflyers.com:9443/api/aux/uv-policy -H 'Origin: http://192.168.77.1' -H 'Content-Type: application/json' --data '{"mode":"INVALID","brightnessBySegment":{"main":0,"short":0}}')
[ "$local_policy" = 400 ] && grep -q 'unsupported_uv_mode' /tmp/hbnf-v123-policy.body || fail "local strict policy validation failed (HTTP $local_policy)"
public_status=$(curl --noproxy '*' --silent --show-error --max-time 5 --resolve cart-control.hbnightflyers.com:9443:192.168.77.1 -o /tmp/hbnf-v123-public.body -w '%{http_code}' https://cart-control.hbnightflyers.com:9443/api/aux/uv-status -H 'Origin: https://hbnightflyers.com')
[ "$public_status" = 401 ] && grep -q 'paired_owner_required' /tmp/hbnf-v123-public.body || fail "public Owner pairing gate changed (HTTP $public_status)"
denied=$(curl --noproxy '*' --silent --show-error --max-time 5 --resolve cart-control.hbnightflyers.com:9443:192.168.77.1 -D /tmp/hbnf-v123-denied.headers -o /dev/null -w '%{http_code}' https://cart-control.hbnightflyers.com:9443/api/aux/uv-status -H 'Origin: https://untrusted.invalid')
[ "$denied" = 403 ] || fail "unknown origin not denied (HTTP $denied)"
if tr -d '\r' < /tmp/hbnf-v123-denied.headers | grep -qi '^Access-Control-Allow-Origin:'; then fail "unknown origin received CORS permission"; fi
(cd / && sha256sum -c "$PKG/UPDATED_FILES.SHA256SUMS" >/dev/null) || fail "updated full file manifest failed"
cp -p "$PKG/UPDATED_FILES.SHA256SUMS" "$BACKUP/POST-INSTALL-READBACK.SHA256SUMS"
printf '{\n  "schema":"hbnf-opal-local-uv-access-readback-v1",\n  "transaction_id":"%s",\n  "release_id":"%s",\n  "admission_manifest_sha256":"%s",\n  "candidate_archive_sha256":"%s",\n  "updated_file_manifest":"PASS",\n  "uv_lock_zone":"PASS",\n  "local_status":"PASS",\n  "invalid_policy_no_write":"PASS",\n  "public_pairing":"PASS",\n  "unknown_origin_denied":"PASS"\n}\n' "$TX" HBNF-OPAL-UV-LOCK-V123-20261028-02 "$ADMISSION_SHA256" "$(sha256sum "$CANDIDATE_ARCHIVE" | awk '{print $1}')" > "$BACKUP/POST-INSTALL-READBACK.json"
sync; trap - EXIT HUP INT TERM
echo "LOCAL_UV_LOCK_FIX_OK: dedicated lock zone active; readiness and strict policy checks pass. No valid UV command was issued."

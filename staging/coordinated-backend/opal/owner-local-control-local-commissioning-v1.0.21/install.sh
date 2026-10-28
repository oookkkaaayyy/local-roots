#!/bin/sh
set -eu
PKG=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
TX=OWNER-LOCAL-UV-LOCAL-ACCESS-V121-20261028-01
ADMISSION_FILE=${HBNF_OPAL_ADMISSION_FILE:-}; ADMISSION_SHA256=${HBNF_OPAL_ADMISSION_SHA256:-}; CANDIDATE_ARCHIVE=${HBNF_OPAL_CANDIDATE_ARCHIVE:-}
BACKUP=/root/hbnf-owner-local-uv-local-access.rollback-$TX
STATUS=/etc/hbnf-local-control/lua/uv_status_access.lua
POLICY=/etc/hbnf-local-control/lua/uv_policy_access.lua
AUTH=/etc/hbnf-local-control/lua/auth_owner.lua
fail(){ echo "LOCAL UV ACCESS BLOCKED: $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || fail "run as root on the Opal"
for cmd in sha256sum jsonfilter curl; do command -v "$cmd" >/dev/null 2>&1 || fail "$cmd missing"; done
(cd "$PKG" && sha256sum -c SHA256SUMS >/dev/null) || fail "package checksum failed"
[ -f "$STATUS" ] && [ ! -L "$STATUS" ] && [ -f "$POLICY" ] && [ ! -L "$POLICY" ] && [ -f "$AUTH" ] && [ ! -L "$AUTH" ] || fail "UV handlers or Owner auth missing/symlinked"
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
[ "$(av '@.durable_readback.status')" = PASS ] && [ "$(av '@.acceptance_plan.status')" = DECLARED ] || fail "durable readback/admission plan missing"
(cd / && sha256sum -c "$PKG/BASELINE_FILES.SHA256SUMS" >/dev/null) || fail "current 20-file live baseline differs"
[ "$(wc -l < "$PKG/BASELINE_FILES.SHA256SUMS" | tr -d ' ')" = 20 ] || fail "baseline manifest incomplete"
[ -s /var/run/hbnf-owner-local-control-nginx.pid ] || fail "dedicated gateway PID missing"
pid=$(cat /var/run/hbnf-owner-local-control-nginx.pid); case "$pid" in *[!0-9]*|'') fail "gateway PID malformed" ;; esac
kill -0 "$pid" 2>/dev/null || fail "dedicated gateway is not running"
/usr/sbin/nginx -t -c /etc/hbnf-local-control/nginx.conf >/dev/null || fail "gateway config invalid"
netstat -lnt 2>/dev/null | awk 'NR>2 && $4 ~ /(:|\])9443$/ {ok=1} END{exit !ok}' || fail "9443 listener missing"
[ ! -e "$BACKUP" ] || fail "transaction recovery path exists; inspect before retry"
mkdir -m 0700 "$BACKUP"
cp -p "$STATUS" "$BACKUP/uv_status_access.lua"; cp -p "$POLICY" "$BACKUP/uv_policy_access.lua"; cp -p "$AUTH" "$BACKUP/auth_owner.lua"
cp -p "$PKG/BASELINE_FILES.SHA256SUMS" "$BACKUP/BASELINE_FILES.SHA256SUMS"
cp -p "$PKG/UPDATED_FILES.SHA256SUMS" "$BACKUP/UPDATED_FILES.SHA256SUMS"
cp -p "$PKG/ROLLBACK_BASELINE.zip" "$BACKUP/ROLLBACK_BASELINE.zip"
cp -p "$PKG/rollback.sh" "$BACKUP/rollback.sh"; chmod 0700 "$BACKUP/rollback.sh"
restore_failure(){ rc=$?; trap - EXIT HUP INT TERM; cp -p "$BACKUP/uv_status_access.lua" "$STATUS.restore" && mv -f "$STATUS.restore" "$STATUS"; cp -p "$BACKUP/uv_policy_access.lua" "$POLICY.restore" && mv -f "$POLICY.restore" "$POLICY"; cp -p "$BACKUP/auth_owner.lua" "$AUTH.restore" && mv -f "$AUTH.restore" "$AUTH"; exit "$rc"; }
trap restore_failure EXIT HUP INT TERM
cp -p "$PKG/uv_status_access.lua" "$STATUS.tmp"; cp -p "$PKG/uv_policy_access.lua" "$POLICY.tmp"; cp -p "$PKG/auth_owner.lua" "$AUTH.tmp"
(cd "$PKG" && sha256sum -c CANDIDATE_FILES.SHA256SUMS >/dev/null) || fail "candidate Lua checksums failed"
mv -f "$STATUS.tmp" "$STATUS"; mv -f "$POLICY.tmp" "$POLICY"; mv -f "$AUTH.tmp" "$AUTH"
# Verify local guest-style status and command validation without issuing a WLED write.
local_status=$(curl --noproxy '*' --silent --show-error --max-time 5 --resolve cart-control.hbnightflyers.com:9443:192.168.77.1 -D /tmp/hbnf-v120-status.headers -o /tmp/hbnf-v120-status.body -w '%{http_code}' https://cart-control.hbnightflyers.com:9443/api/aux/uv-status -H 'Origin: http://192.168.77.1')
[ "$local_status" = 200 ] && grep -q '"mutationIssued":false' /tmp/hbnf-v120-status.body && tr -d '\r' < /tmp/hbnf-v120-status.headers | grep -Fqx 'Access-Control-Allow-Origin: http://192.168.77.1' || fail "local read-only status failed (HTTP $local_status)"
# Invalid mode is rejected before runtime/dispatch; this confirms the local route passes auth without mutating AUX.
local_policy=$(curl --noproxy '*' --silent --show-error --max-time 5 --resolve cart-control.hbnightflyers.com:9443:192.168.77.1 -D /tmp/hbnf-v120-policy.headers -o /tmp/hbnf-v120-policy.body -w '%{http_code}' -X POST https://cart-control.hbnightflyers.com:9443/api/aux/uv-policy -H 'Origin: http://192.168.77.1' -H 'Content-Type: application/json' --data '{"mode":"INVALID","brightnessBySegment":{"main":0,"short":0}}')
[ "$local_policy" = 400 ] && grep -q 'unsupported_uv_mode' /tmp/hbnf-v120-policy.body || fail "local UV route did not reach strict command validation (HTTP $local_policy)"
public_status=$(curl --noproxy '*' --silent --show-error --max-time 5 --resolve cart-control.hbnightflyers.com:9443:192.168.77.1 -D /tmp/hbnf-v120-public.headers -o /tmp/hbnf-v120-public.body -w '%{http_code}' https://cart-control.hbnightflyers.com:9443/api/aux/uv-status -H 'Origin: https://hbnightflyers.com')
[ "$public_status" = 401 ] && grep -q 'paired_owner_required' /tmp/hbnf-v120-public.body || fail "public Owner pairing gate changed (HTTP $public_status)"
denied=$(curl --noproxy '*' --silent --show-error --max-time 5 --resolve cart-control.hbnightflyers.com:9443:192.168.77.1 -D /tmp/hbnf-v120-denied.headers -o /dev/null -w '%{http_code}' https://cart-control.hbnightflyers.com:9443/api/aux/uv-status -H 'Origin: https://untrusted.invalid')
[ "$denied" = 403 ] || fail "unknown origin not denied (HTTP $denied)"
if tr -d '\r' < /tmp/hbnf-v120-denied.headers | grep -qi '^Access-Control-Allow-Origin:'; then fail "unknown origin received CORS permission"; fi
(cd / && sha256sum -c "$PKG/UPDATED_FILES.SHA256SUMS" >/dev/null) || fail "updated file manifest failed"
cp -p "$PKG/UPDATED_FILES.SHA256SUMS" "$BACKUP/POST-INSTALL-READBACK.SHA256SUMS"
printf '{\n  "schema":"hbnf-opal-local-uv-access-readback-v1",\n  "transaction_id":"%s",\n  "admission_manifest_sha256":"%s",\n  "candidate_archive_sha256":"%s",\n  "updated_file_manifest":"PASS",\n  "local_status_read":"PASS",\n  "local_policy_validation_no_write":"PASS",\n  "public_pairing_preserved":"PASS",\n  "unknown_origin_denied":"PASS"\n}\n' "$TX" "$ADMISSION_SHA256" "$(sha256sum "$CANDIDATE_ARCHIVE" | awk '{print $1}')" > "$BACKUP/POST-INSTALL-READBACK.json"
sync; trap - EXIT HUP INT TERM
echo "LOCAL_UV_ACCESS_OK: Local status and strict UV validation are available without pairing; public pairing remains required; unknown origins denied. No AUX command was issued."

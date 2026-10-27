#!/bin/sh
set -eu
PKG=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT=${HBNF_OPAL_ROOT:-/}
TEST_MODE=${HBNF_TEST_MODE:-0}
TX=OWNER-LOCAL-CONTROL-UV-STATUS-V115-20261027-01
BASELINE_PACKAGE_SHA256=a5a877c3c9089df245c1262341ad3a3926c9fc85ba660d67197f277fad6096fa
BASELINE_MODULE_SHA256=72e586ba9d2643967923d0f3202523b0fee025b507affc281bc284bb17a40d13
CANDIDATE_MODULE_SHA256=ae51e16f33f88b8cce4ec3d9fa058443edc94b4cb721816b81359966a139a342
BASELINE_FILES_SHA256=35d79e40b11e3759ce228cbced7a227f4a5ce7ac6a01a7171acd2b41e03c1307
UPDATED_FILES_SHA256=cb2789e341712d485c9c370e9a218b4b3b7ab7b9755dc0a4dfd5fc41fa9c8e38
BACKUP_REL=root/hbnf-owner-local-control-uv-status.rollback-V115-20261027-01
TARGET_REL=etc/hbnf-local-control/lua/uv_status_access.lua
fail(){ echo "UPDATE BLOCKED: $*" >&2; exit 1; }
at(){ printf '%s/%s\n' "${ROOT%/}" "$1"; }
[ "$ROOT" = / ] || [ "$TEST_MODE" = 1 ] || fail "alternate roots are permitted only for offline rehearsal"
[ "$ROOT" != / ] || fail "REVIEW_ONLY: fresh authenticated baseline readback and candidate-specific pre-mutation admission are required; live installation is disabled in this package"
[ "$ROOT" = / ] && [ "$(id -u)" != 0 ] && fail "run as root on the Opal"
command -v sha256sum >/dev/null 2>&1 || fail "sha256sum is required"
(cd "$PKG" && sha256sum -c SHA256SUMS >/dev/null) || fail "package checksum failed"
[ "$(sha256sum "$PKG/ROLLBACK_BASELINE.zip" | awk '{print $1}')" = "$BASELINE_PACKAGE_SHA256" ] || fail "exact v1.0.14 rollback package is missing or changed"
[ "$(sha256sum "$PKG/baseline-uv_status_access.lua" | awk '{print $1}')" = "$BASELINE_MODULE_SHA256" ] || fail "exact v1.0.14 UV status module is missing or changed"
[ "$(sha256sum "$PKG/uv_status_access.lua" | awk '{print $1}')" = "$CANDIDATE_MODULE_SHA256" ] || fail "candidate UV status module differs from source"
[ "$(sha256sum "$PKG/BASELINE_FILES.SHA256SUMS" | awk '{print $1}')" = "$BASELINE_FILES_SHA256" ] || fail "v1.0.14 installed-file manifest identity failed"
[ "$(sha256sum "$PKG/UPDATED_FILES.SHA256SUMS" | awk '{print $1}')" = "$UPDATED_FILES_SHA256" ] || fail "updated-file manifest identity failed"
[ "$(wc -l < "$PKG/BASELINE_FILES.SHA256SUMS" | tr -d ' ')" = 20 ] || fail "installed-file baseline manifest is incomplete"

if [ "$ROOT" = / ]; then
  UBUS=$(command -v ubus) || fail "ubus is required to identify the Opal model"
  BOARD=$("$UBUS" call system board 2>/dev/null) || fail "cannot identify Opal model"
  printf '%s\n' "$BOARD" | grep -Fq '"board_name": "glinet,gl-sft1200"' || fail "target is not the expected GL-SFT1200 Opal"
fi
BASE=$(at etc/hbnf-local-control)
LUA_DIR=$BASE/lua
CONF=$BASE/nginx.conf
SERVICE=$(at etc/init.d/hbnf-owner-local-control)
TARGET=$(at "$TARGET_REL")
BACKUP=$(at "$BACKUP_REL")
PID_FILE=$(at var/run/hbnf-owner-local-control-nginx.pid)
NGINX=$(at usr/sbin/nginx)
NETSTAT=$(at bin/netstat)
[ -d "$LUA_DIR" ] && [ -f "$TARGET" ] && [ ! -L "$TARGET" ] || fail "dedicated gateway module path is missing or unsafe"
[ -f "$BASE/nginx-server.conf" ] && [ -x "$SERVICE" ] && [ -f "$PID_FILE" ] || fail "dedicated gateway service is incomplete"
pid=$(cat "$PID_FILE"); case "$pid" in *[!0-9]*|'') fail "gateway PID is malformed" ;; esac
kill -0 "$pid" 2>/dev/null || fail "dedicated gateway process is not running"
[ -x "$NGINX" ] && [ -x "$NETSTAT" ] || fail "Nginx or netstat is missing"
"$NGINX" -t -c "$CONF" >/dev/null || fail "dedicated Nginx config preflight failed"
"$NETSTAT" -lnt 2>/dev/null | awk 'NR > 2 && $4 ~ /(:|\])9443$/ { found=1 } END { exit !found }' || fail "dedicated gateway is not listening on TCP 9443"
[ "$(find "$LUA_DIR" -maxdepth 1 -type f | wc -l | tr -d ' ')" = 14 ] || fail "Lua directory is not the exact v1.0.14 file set"
(cd "$ROOT" && sha256sum -c "$PKG/BASELINE_FILES.SHA256SUMS" >/dev/null) || fail "installed gateway files differ from the exact v1.0.14 baseline"
[ ! -e "$BACKUP" ] || fail "transaction backup already exists; inspect before retrying"

if [ "$ROOT" != / ] && [ "$TEST_MODE" = 1 ]; then
  TEST_RELOAD=${HBNF_TEST_RELOAD:-}
  [ -x "$TEST_RELOAD" ] || fail "offline rehearsal reload stub is missing"
  reload_gateway(){ "$TEST_RELOAD" reload; }
else
  reload_gateway(){ "$SERVICE" reload; }
fi

mkdir -m 0700 "$BACKUP"
while read -r expected relative; do
  case "$relative" in /*|*..*|'') fail "unsafe baseline path" ;; esac
  source_file=$(at "$relative")
  [ -f "$source_file" ] && [ ! -L "$source_file" ] || fail "installed file missing or unsafe: $relative"
  destination=$BACKUP/$relative
  mkdir -p "$(dirname "$destination")"
  cp -p "$source_file" "$destination"
done < "$PKG/BASELINE_FILES.SHA256SUMS"
cp -p "$PKG/BASELINE_FILES.SHA256SUMS" "$BACKUP/BASELINE_FILES.SHA256SUMS"
cp -p "$PKG/UPDATED_FILES.SHA256SUMS" "$BACKUP/UPDATED_FILES.SHA256SUMS"
cp -p "$PKG/ROLLBACK_BASELINE.zip" "$BACKUP/ROLLBACK_BASELINE.zip"
cp -p "$PKG/rollback.sh" "$BACKUP/rollback.sh"
chmod 0700 "$BACKUP/rollback.sh"
(cd "$BACKUP" && sha256sum -c BASELINE_FILES.SHA256SUMS >/dev/null) || fail "device-side exact v1.0.14 snapshot failed readback"

restore_after_failure(){
  rc=$?
  trap - EXIT HUP INT TERM
  if [ -f "$BACKUP/$TARGET_REL" ] && [ -f "$TARGET" ]; then
    current_sha=$(sha256sum "$TARGET" | awk '{print $1}') || current_sha=unknown
    if [ "$current_sha" != "$BASELINE_MODULE_SHA256" ]; then
      cp -p "$TARGET" "$BACKUP/failed-candidate-uv_status_access.lua" || echo "RECOVERY WARNING: could not preserve failed target module" >&2
      if cp -p "$BACKUP/$TARGET_REL" "$TARGET.tmp" && mv -f "$TARGET.tmp" "$TARGET"; then
        if reload_gateway; then
          echo "RECOVERY: exact baseline UV status module restored after failed update" >&2
        else
          echo "RECOVERY WARNING: baseline file restored but dedicated gateway reload failed" >&2
        fi
      else
        echo "RECOVERY FAILURE: could not restore baseline UV status module" >&2
      fi
    fi
  fi
  exit "$rc"
}
trap 'restore_after_failure' EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
cp -p "$PKG/uv_status_access.lua" "$TARGET.tmp"
chmod 0644 "$TARGET.tmp"
[ "$(sha256sum "$TARGET.tmp" | awk '{print $1}')" = "$CANDIDATE_MODULE_SHA256" ] || fail "candidate temporary file hash failed"
mv -f "$TARGET.tmp" "$TARGET"
reload_gateway || fail "dedicated Nginx reload failed"
"$NGINX" -t -c "$CONF" >/dev/null || fail "dedicated Nginx post-reload config check failed"
(cd "$ROOT" && sha256sum -c "$PKG/UPDATED_FILES.SHA256SUMS" >/dev/null) || fail "post-update files differ from the candidate manifest"
kill -0 "$pid" 2>/dev/null || fail "dedicated gateway exited after reload"
"$NETSTAT" -lnt 2>/dev/null | awk 'NR > 2 && $4 ~ /(:|\])9443$/ { found=1 } END { exit !found }' || fail "gateway listener disappeared after reload"
cp -p "$PKG/UPDATED_FILES.SHA256SUMS" "$BACKUP/POST-INSTALL-READBACK.SHA256SUMS"
printf '%s\n' "schema=hbnf-opal-uv-status-update-readback-v1" "transaction=$TX" "baseline_module_sha256=$BASELINE_MODULE_SHA256" "candidate_module_sha256=$CANDIDATE_MODULE_SHA256" "rollback_package_sha256=$BASELINE_PACKAGE_SHA256" "installed_file_manifest=PASS" "dedicated_nginx_reload=PASS" > "$BACKUP/POST-INSTALL-READBACK.txt"
sync
trap - EXIT HUP INT TERM
echo "UPDATE_OK: only the dedicated authenticated UV status module changed; exact v1.0.14 snapshot and package rollback retained at $BACKUP."
echo "The authenticated runtime response still requires readback; no AUX or Matrix output was changed."

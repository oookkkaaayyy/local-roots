#!/bin/ash
# #116 C9 exact live-Opal preflight: read-only companion to accepted sandbox.
# NEVER installs, stages, replaces, chmods, deletes, or restores any device file.
# Inputs must be derived from the SAME ADMISSION.PENDING.json and C9 source tree.
set -eu
[ "$#" -eq 4 ] || { echo 'usage: root six.tsv candidates_dir expected_manifest_sha256' >&2; exit 64; }
ROOT=$1; TARGETS=$2; SOURCE=$3; MANIFEST_SHA=$4
case "$ROOT" in
 /) [ "$(id -u)" = 0 ] || exit 65;;
 /tmp/cart116-c9-rehearsal-*) [ -d "$ROOT" ] && [ ! -L "$ROOT" ] || exit 65;;
 *) echo 'C9_FIXED_LIVE_OR_TEST_ROOT_REQUIRED' >&2; exit 65;;
esac
hex64(){ case "$1" in ''|*[!a-f0-9]*) return 1;; esac; [ "$(printf '%s' "$1" | wc -c | tr -d ' ')" -eq 64 ]; }
sha(){ sha256sum "$1" | awk '{print $1}'; }
valid(){
 case "$1:$2" in
 /www/mission-control-local/local-transport.js:local-transport.js|\
 /www/mission-control-local/owner-pwa/hbnf-cart-local.js:hbnf-cart-local.js|\
 /www/mission-control-local/owner-pwa/hbnf-cart.js:hbnf-cart.js|\
 /www/mission-control-local/owner-pwa/hbnf-cart.html:hbnf-cart.html|\
 /www/mission-control-local/owner-pwa/.hbnf-payload.sha256:.hbnf-payload.sha256|\
 /www/mission-control-local/owner-pwa/.hbnf-package-version:.hbnf-package-version) return 0;;
 *) return 1;; esac
}
for cmd in sha256sum df stat sort cut wc awk cmp; do
 command -v "$cmd" >/dev/null 2>&1 || { echo "MISSING_BUSYBOX_COMMAND:$cmd" >&2; exit 66; }
done
[ -f "$TARGETS" ] && [ ! -L "$TARGETS" ] && [ -d "$SOURCE" ] && [ ! -L "$SOURCE" ] || exit 66
hex64 "$MANIFEST_SHA" || exit 66
[ -f "$SOURCE/ADMISSION.PENDING.json" ] &&
[ ! -L "$SOURCE/ADMISSION.PENDING.json" ] &&
[ "$(sha "$SOURCE/ADMISSION.PENDING.json")" = "$MANIFEST_SHA" ] || exit 67
for parent in "$ROOT/www" "$ROOT/www/mission-control-local" "$ROOT/www/mission-control-local/owner-pwa"; do
 [ -d "$parent" ] && [ ! -L "$parent" ] || exit 68
done
count=0; bytes=0; TAB="$(printf '\t')"
while IFS="$TAB" read -r dest rel old new mode; do
 [ -n "$dest" ] || continue
 valid "$dest" "$rel" && hex64 "$old" && hex64 "$new" && [ "$mode" = 644 ] || exit 70
 [ -f "$ROOT$dest" ] && [ ! -L "$ROOT$dest" ] &&
 [ -f "$SOURCE/$rel" ] && [ ! -L "$SOURCE/$rel" ] || exit 71
 [ "$(sha "$ROOT$dest")" = "$old" ] &&
 [ "$(sha "$SOURCE/$rel")" = "$new" ] || exit 72
 if [ "$ROOT" = / ]; then
  [ "$(stat -c '%u:%g:%a' "$ROOT$dest")" = '0:0:644' ] || exit 73
 fi
 n="$(wc -c < "$SOURCE/$rel")"; bytes=$((bytes+n))
 count=$((count+1))
done < "$TARGETS"
[ "$count" -eq 6 ] || exit 74
[ "$(cut -f1 "$TARGETS" | sort -u | wc -l | tr -d ' ')" -eq 6 ] || exit 74
free_kb="$(df -k "$ROOT/www" | awk 'END {print $4}')"
case "$free_kb" in ''|*[!0-9]*) exit 75;; esac
# Conservative free-space floor: 4MiB plus staged and local recovery copies.
required_kb=$((4096+(bytes*3+1023)/1024))
[ "$free_kb" -gt "$required_kb" ] || exit 75
echo "C9_PREFLIGHT_PASS_READ_ONLY count=$count candidate_bytes=$bytes free_kb=$free_kb required_kb=$required_kb manifest_sha256=$MANIFEST_SHA"
echo 'NOT_ADMITTED_NO_TARGET_WRITE_NO_DEVICE_OR_OWNER_VISIBLE_ACCEPTANCE'

#!/bin/ash
# Controls #116: narrow six-file Owner PWA transaction CANDIDATE (never auto-run).
# Live operations are fail-closed pending SAME controlling manifest phase1A gate.
# This script does not touch network, router config, firmware, Edge, SQL or UV.
set -eu
umask 077
[ "$#" -eq 5 ] || { echo 'usage: preflight|prepare|apply|restore|verify root six.tsv candidate_dir txid' >&2; exit 64; }
ACTION=$1 ROOT=$2 TARGETS=$3 SOURCE=$4 TX=$5
case "$ACTION" in preflight|prepare|apply|restore|verify) ;; *) exit 64;; esac
case "$TX" in ''|*[!A-Za-z0-9_-]*) exit 64;; esac
[ "$(printf %s "$TX" | wc -c | awk '{print $1}')" -ge 20 ] && [ "$(printf %s "$TX" | wc -c | awk '{print $1}')" -le 64 ] || exit 64
LIVE=0
case "$ROOT" in
 /) LIVE=1; [ "$(id -u)" = 0 ] || exit 65;;
 /tmp/cart116-c9-rehearsal-*) [ -d "$ROOT" ] && [ ! -L "$ROOT" ] || exit 65;;
 *) echo 'UNSUPPORTED_C9_ROOT' >&2; exit 65;;
esac
for cmd in sha256sum ls df cp mv mkdir cmp awk sort cut wc chmod chown sync rm sed id; do
 command -v "$cmd" >/dev/null 2>&1 || { echo "MISSING_OPAL_COMMAND:$cmd" >&2; exit 66; }
done
[ -f "$TARGETS" ] && [ ! -L "$TARGETS" ] || exit 67
for parent in "$ROOT/www" "$ROOT/www/mission-control-local" "$ROOT/www/mission-control-local/owner-pwa"; do
 [ -d "$parent" ] && [ ! -L "$parent" ] || exit 67
done
sha(){ sha256sum "$1" | awk '{print $1}'; }
# BusyBox Opal GL-SFT1200 has no stat applet. Exact ls -ln mode/UID/GID
# bytes were validated against the authenticated read-only on-device format.
ownership_ok(){
 [ -f "$1" ] && [ ! -L "$1" ] || return 1
 case "$2" in 644) expected='-rw-r--r--';; 600) expected='-rw-------';; *) return 1;; esac
 ls -ln "$1" | awk -v expected="$expected" '
   NR==1 && $1==expected && $3=="0" && $4=="0" { accepted=1 }
   END { exit !accepted }'
}
hex64(){ case "$1" in ''|*[!0-9a-f]*) return 1;; esac; [ "$(printf %s "$1" | wc -c | awk '{print $1}')" -eq 64 ]; }
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
TXBASE="$ROOT/root/cart116-controls-recovery/$TX"
REGISTRY="$ROOT/root/cart116-controls-one-time/$TX"
TAB="$(printf '\t')"
manifest_validate(){
 n=0
 while IFS="$TAB" read -r dest rel old new mode; do
  valid "$dest" "$rel" && hex64 "$old" && hex64 "$new" && [ "$mode" = 644 ] || return 70
  n=$((n+1))
 done < "$TARGETS"
 [ "$n" -eq 6 ] &&
 [ "$(cut -f1 "$TARGETS" | sort -u | wc -l | awk '{print $1}')" -eq 6 ] || return 70
}
candidate_validate(){
 [ -d "$SOURCE" ] && [ ! -L "$SOURCE" ] || return 71
 while IFS="$TAB" read -r dest rel old new mode; do
  [ -f "$SOURCE/$rel" ] && [ ! -L "$SOURCE/$rel" ] &&
  [ "$(sha "$SOURCE/$rel")" = "$new" ] || return 71
 done < "$TARGETS"
}
old_validate(){
 while IFS="$TAB" read -r dest rel old new mode; do
  [ -f "$ROOT$dest" ] && [ ! -L "$ROOT$dest" ] &&
  [ "$(sha "$ROOT$dest")" = "$old" ] || return 72
  if [ "$LIVE" = 1 ]; then
   ownership_ok "$ROOT$dest" 644 || return 72
  fi
 done < "$TARGETS"
}
live_gate(){
 [ "$LIVE" = 1 ] || return 0
 [ -f "$SOURCE/ADMISSION.RECEIPT" ] && [ ! -L "$SOURCE/ADMISSION.RECEIPT" ] &&
 [ -f "$SOURCE/ADMISSION.PENDING.json" ] && [ ! -L "$SOURCE/ADMISSION.PENDING.json" ] || return 80
 ownership_ok "$SOURCE/ADMISSION.RECEIPT" 600 || return 80
 field(){ sed -n "s/^$1=//p" "$SOURCE/ADMISSION.RECEIPT"; }
 [ "$(field C9_PHASE1A_ADMITTED)" = 'YES_SAME_MANIFEST' ] &&
 [ "$(field C9_INSTALLED_PRECHANGE_READBACK)" = PASS ] &&
 [ "$(field C9_21_FILE_ROLLBACK_DURABLE_DOWNLOADBACK)" = PASS ] &&
 [ "$(field C9_RESTORE_ROUTE_VERIFIED)" = PASS ] &&
 [ "$(field C9_OWNER_EXACT_RELEASE_AUTHORIZATION)" = YES ] || return 80
 [ "$(field C9_ROLLBACK_SHA256)" = d717ab5d5cd29c90a4ab1a4b9041b9d8ad21314d47916b8607a051f173cd15e9 ] || return 80
 hex64 "$(field C9_MANIFEST_SHA256)" && hex64 "$(field C9_SIX_TSV_SHA256)" || return 80
 [ "$(sha "$SOURCE/ADMISSION.PENDING.json")" = "$(field C9_MANIFEST_SHA256)" ] &&
 [ "$(sha "$TARGETS")" = "$(field C9_SIX_TSV_SHA256)" ] || return 80
}
space_gate(){
 free_kb="$(df -k "$ROOT/www" | awk 'END {print $4}')"
 case "$free_kb" in ''|*[!0-9]*) return 81;; esac
 bytes=0
 while IFS="$TAB" read -r dest rel old new mode; do
  length="$(wc -c < "$SOURCE/$rel")"; bytes=$((bytes+length))
 done < "$TARGETS"
 [ "$free_kb" -gt $((4096+(bytes*3+1023)/1024)) ]
}
backup_check(){
 [ -d "$TXBASE" ] && [ ! -L "$TXBASE" ] &&
 [ -f "$TXBASE/prepared" ] && [ -f "$TXBASE/manifest.tsv" ] &&
 cmp -s "$TARGETS" "$TXBASE/manifest.tsv" || return 82
 while IFS="$TAB" read -r dest rel old new mode; do
  [ -f "$TXBASE/old/$rel" ] && [ ! -L "$TXBASE/old/$rel" ] &&
  [ -f "$TXBASE/new/$rel" ] && [ ! -L "$TXBASE/new/$rel" ] &&
  [ "$(sha "$TXBASE/old/$rel")" = "$old" ] &&
  [ "$(sha "$TXBASE/new/$rel")" = "$new" ] || return 82
 done < "$TARGETS"
}
restore_files(){
 backup_check || return 83
 # Refuse any third-party modification to ANY target before restoring one.
 while IFS="$TAB" read -r dest rel old new mode; do
  [ -f "$ROOT$dest" ] && [ ! -L "$ROOT$dest" ] || return 83
  current="$(sha "$ROOT$dest")"
  [ "$current" = "$old" ] || [ "$current" = "$new" ] || return 83
 done < "$TARGETS"
 while IFS="$TAB" read -r dest rel old new mode; do
  target="$ROOT$dest"; staged="$target.cart116c9-restore-$TX"
  [ ! -e "$staged" ] && [ ! -L "$staged" ] || return 83
  cp "$TXBASE/old/$rel" "$staged" && chmod 644 "$staged" || return 83
  if [ "$LIVE" = 1 ]; then chown 0:0 "$staged" || return 83; fi
  [ "$(sha "$staged")" = "$old" ] || return 83
  mv -f "$staged" "$target" || return 83
 done < "$TARGETS"
 # Clean only our known candidate staging files after restoring every target.
 while IFS="$TAB" read -r dest rel old new mode; do
  leftover="$ROOT$dest.cart116c9-stage-$TX"
  if [ -e "$leftover" ] || [ -L "$leftover" ]; then
   [ -f "$leftover" ] && [ ! -L "$leftover" ] &&
   [ "$(sha "$leftover")" = "$new" ] || return 83
   rm -f "$leftover" || return 83
  fi
 done < "$TARGETS"
 sync
 : > "$TXBASE/restored"
}
manifest_validate || exit 84
case "$ACTION" in
 preflight)
  candidate_validate && old_validate && space_gate || exit 85
  echo 'C9_SIX_FILE_PREFLIGHT_READ_ONLY_PASS'
  ;;
 prepare)
  live_gate && candidate_validate && old_validate && space_gate || exit 86
  [ ! -e "$TXBASE" ] && [ ! -L "$TXBASE" ] &&
  [ ! -e "$REGISTRY" ] && [ ! -L "$REGISTRY" ] || exit 86
  mkdir -p "${TXBASE%/*}" "${REGISTRY%/*}" || exit 86
  mkdir "$TXBASE" || exit 86
  mkdir "$TXBASE/old" "$TXBASE/new" || exit 86
  cp "$TARGETS" "$TXBASE/manifest.tsv" || exit 86
  while IFS="$TAB" read -r dest rel old new mode; do
   cp -p "$ROOT$dest" "$TXBASE/old/$rel" &&
   cp "$SOURCE/$rel" "$TXBASE/new/$rel" || exit 86
  done < "$TARGETS"
  : > "$TXBASE/prepared"
  backup_check || exit 86
  sync
  echo 'C9_PREPARED_JOURNAL_ONLY_TARGETS_UNMODIFIED'
  ;;
 apply)
  live_gate && candidate_validate && backup_check &&
  old_validate && space_gate || exit 87
  [ ! -e "$REGISTRY" ] && [ ! -L "$REGISTRY" ] || exit 87
  # Stage all six adjacent to targets; verify BEFORE first swap.
  while IFS="$TAB" read -r dest rel old new mode; do
   staged="$ROOT$dest.cart116c9-stage-$TX"
   [ ! -e "$staged" ] && [ ! -L "$staged" ] || exit 87
   cp "$TXBASE/new/$rel" "$staged" && chmod 644 "$staged" || exit 87
   if [ "$LIVE" = 1 ]; then chown 0:0 "$staged" || exit 87; fi
   [ "$(sha "$staged")" = "$new" ] || exit 87
  done < "$TARGETS"
  sync
  mkdir -p "${REGISTRY%/*}" || exit 88
  mkdir "$REGISTRY" || exit 88
  cp "$TARGETS" "$REGISTRY/manifest.tsv" || exit 88
  : > "$REGISTRY/consumed"
  # Power loss never runs EXIT traps. Ensure the one-time consumed journal is
  # flushed before even the first /www rename. Prepare already synced backups.
  # This is necessary but NOT a proof of Opal flash/overlay power-loss durability.
  sync
  FAILED=1
  trap '[ "$FAILED" -eq 0 ] || { restore_files || echo "C9_RESTORE_REQUIRED_STOP" >&2; }' EXIT
  swapped=0
  while IFS="$TAB" read -r dest rel old new mode; do
   target="$ROOT$dest"; staged="$target.cart116c9-stage-$TX"
   [ "$(sha "$target")" = "$old" ] && [ "$(sha "$staged")" = "$new" ] || exit 88
   mv -f "$staged" "$target" || exit 88
   swapped=$((swapped+1))
   # Fault injection is allowed only in the isolated /tmp rehearsal root.
   if [ "$LIVE" = 0 ] && [ "${C9_SANDBOX_ABORT_AFTER:-0}" = "$swapped" ]; then exit 98; fi
  done < "$TARGETS"
  sync
  while IFS="$TAB" read -r dest rel old new mode; do
   [ "$(sha "$ROOT$dest")" = "$new" ] || exit 88
  done < "$TARGETS"
  : > "$REGISTRY/applied_pending_readback"
  FAILED=0
  trap - EXIT
  echo 'C9_RAW_BYTES_APPLIED_NOT_SERVE_OR_PHYSICAL_ACCEPTANCE'
  ;;
 restore)
  [ -f "$REGISTRY/consumed" ] || exit 89
  restore_files || exit 89
  : > "$REGISTRY/restored"
  echo 'C9_SIX_PREIMAGES_RESTORED_REQUIRE_SERVED_AND_DEVICE_VERIFICATION'
  ;;
 verify)
  [ -f "$REGISTRY/consumed" ] && backup_check || exit 90
  while IFS="$TAB" read -r dest rel old new mode; do
   [ -f "$ROOT$dest" ] && [ ! -L "$ROOT$dest" ] &&
   [ "$(sha "$ROOT$dest")" = "$new" ] || exit 90
  done < "$TARGETS"
  echo 'C9_SIX_FILES_HASH_MATCH_NOT_PWA_DEVICE_FIELD_ACCEPTANCE'
  ;;
esac

#!/bin/ash
# Controls #116 four-new-target install/reverse transaction. REVIEW source, not an approval.
# Actual live execution requires a separately signed-off, exact, one-time
# source/target/rollback manifest, independent off-device backup download-back,
# and admitted code revision. This script deliberately has NO skip/check flags.
set -eu
umask 077
ROOT=/
[ "$(id -u)" = 0 ] || exit 90
[ "$#" -ge 3 ] && [ "$#" -le 4 ] || exit 91
ACTION=$1; PKG=$2; RECEIPT=$3; ARCHIVE=${4:-}
case "$ACTION" in preflight|backup|apply|rollback|closeout) :;; *) exit 91;; esac
case "$PKG:$RECEIPT" in *'..'*|*' '*|*'\t'*) exit 91;; esac
[ -d "$PKG" ] && [ ! -L "$PKG" ] && [ -f "$PKG/TARGETS.tsv" ] || exit 92
[ -f "$RECEIPT" ] && [ ! -L "$RECEIPT" ] &&
 [ "$(stat -c %u:%a "$RECEIPT")" = '0:600' ] || exit 92
field(){ sed -n "s/^$1=//p" "$RECEIPT"; }
TX=$(field TRANSACTION_ID)
MANIFEST_SHA=$(field MANIFEST_SHA256)
CAPSULE_SHA=$(field CAPSULE_SHA256)
OWNER=$(field OWNER_APPROVED_EXACT_SOURCE)
BACKUP_SHA=$(field BACKUP_SHA256)
DOWNLOADED_SHA=$(field BACKUP_DOWNLOAD_BACK_SHA256)
case "$TX" in ''|*[!A-Za-z0-9_-]*) exit 92;; esac
[ "${#TX}" -ge 20 ] && [ "${#TX}" -le 80 ] || exit 92
hex64(){ case "$1" in *[!a-f0-9]*|'') return 1;; esac; [ "${#1}" -eq 64 ]; }
hex64 "$MANIFEST_SHA" && hex64 "$CAPSULE_SHA" || exit 92
[ "$(sha256sum "$PKG/TARGETS.tsv" | awk '{print $1}')" = "$MANIFEST_SHA" ] || exit 93
BASE="$ROOT/root/cart116-controls-recovery/$TX"
REGISTRY="$ROOT/root/cart116-controls-one-time/$TX"
OLD_OWNER="$ROOT/www/mission-control-local/owner-pwa"
OWNER_SERVICE="$ROOT/etc/init.d/hbnf-cart-glow-bridge"
CONF="$ROOT/etc/hbnf-cart-glow-bridge.conf"
LOCKOUT="$ROOT/etc/hbnf-glow-overlay-v1.partial-failure"
PENDING="$ROOT/etc/hbnf-glow-overlay-v1.pending"

# Fixed target allowlist: never permit a manifest-controlled arbitrary root path.
valid_target(){
 # Only four new files may be installed. Never admit Owner PWA/www paths.
 case "$1" in
  /usr/libexec/hbnf-cart-glow-bridge|/usr/libexec/hbnf-cart-glow-provision|/usr/lib/hbnf-glow-overlay-v1.sh|/etc/init.d/hbnf-cart-glow-bridge) return 0;;
  *) return 1;;
 esac
}
check_targets(){
 count=0
 TAB="$(printf '\t')"
 while IFS="$TAB" read -r target relative new_sha old_sha mode || [ -n "${target:-}" ]; do
  [ -n "$target" ] || continue
  valid_target "$target" || return 95
  case "$relative" in candidate/opal/*) :;; *) return 95;; esac
  case "$relative" in *'..'*|*' '*|*'\t'*) return 95;; esac
  case "$mode" in 600|644|700|755) :;; *) return 95;; esac
  hex64 "$new_sha" || return 95
  src="$PKG/$relative"
  [ -f "$src" ] && [ ! -L "$src" ] &&
   [ "$(sha256sum "$src" | awk '{print $1}')" = "$new_sha" ] || return 95
  dest="$ROOT${target}"
  [ ! -L "$dest" ] || return 96
  if [ -e "$dest" ]; then
   [ -f "$dest" ] || return 96
   [ "$(stat -c %u "$dest")" = 0 ] || return 96
   hex64 "$old_sha" || return 96
   [ "$(sha256sum "$dest" | awk '{print $1}')" = "$old_sha" ] || return 96
  else
   [ "$old_sha" = ABSENT ] || return 96
  fi
  count=$((count+1))
 done < "$PKG/TARGETS.tsv"
 [ "$count" -eq 4 ] || return 95
 actual_paths="$(cut -f1 "$PKG/TARGETS.tsv" | LC_ALL=C sort)" || return 95
 expected_paths="$(printf '%s\n' \
  /etc/init.d/hbnf-cart-glow-bridge \
  /usr/lib/hbnf-glow-overlay-v1.sh \
  /usr/libexec/hbnf-cart-glow-bridge \
  /usr/libexec/hbnf-cart-glow-provision | LC_ALL=C sort)" || return 95
 [ "$actual_paths" = "$expected_paths" ] || return 95
 # Historical named cloud relay is absent per physical readback; if a new
 # unexpected instance appears, do not replace/kill it.
 [ ! -e "$ROOT/usr/libexec/hbnf-matrix-relay" ] &&
  [ ! -e "$ROOT/etc/init.d/hbnf-matrix-relay" ] || return 96
 [ ! -e "$CONF" ] && [ ! -L "$CONF" ] || return 96
 [ ! -e "$PENDING" ] && [ ! -L "$PENDING" ] &&
  [ ! -e "$LOCKOUT" ] && [ ! -L "$LOCKOUT" ] || return 96
 [ -f "$OLD_OWNER/.hbnf-package-version" ] && [ ! -L "$OLD_OWNER" ] || return 96
 # Owner local direct-WS service is NOT stopped, altered or inspected here.
}
check_saved_backup(){
 [ -f "$BASE/backup.tar.gz" ] && [ -f "$BASE/metadata.tsv" ] &&
  [ ! -L "$BASE" ] && [ ! -L "$BASE/backup.tar.gz" ] || return 97
 actual="$(sha256sum "$BASE/backup.tar.gz" | awk '{print $1}')"
 [ "$actual" = "$BACKUP_SHA" ] && [ "$DOWNLOADED_SHA" = "$actual" ] || return 97
}
check_archive(){
 [ -f "$ARCHIVE" ] && [ ! -L "$ARCHIVE" ] || return 97
 [ "$(sha256sum "$ARCHIVE" | awk '{print $1}')" = "$CAPSULE_SHA" ] || return 97
}
write_backup(){
 [ ! -e "$BASE" ] || return 97
 mkdir -p "$BASE/files" && chmod 700 "$BASE" || return 97
 TAB="$(printf '\t')"
 : > "$BASE/metadata.tsv"
 while IFS="$TAB" read -r target relative new_sha old_sha mode || [ -n "${target:-}" ]; do
  [ -n "$target" ] || continue
  src="$ROOT${target}"
  if [ -f "$src" ]; then
   mkdir -p "$BASE/files$(dirname "$target")"
   cp -p "$src" "$BASE/files$target" || return 97
   [ "$(sha256sum "$BASE/files$target" | awk '{print $1}')" = "$old_sha" ] || return 97
   printf 'EXISTS\t%s\t%s\t%s\n' "$target" "$old_sha" "$(stat -c %a "$src")" >> "$BASE/metadata.tsv"
  else
   printf 'ABSENT\t%s\t-\t-\n' "$target" >> "$BASE/metadata.tsv"
  fi
 done < "$PKG/TARGETS.tsv"
 # Preserve the unchanged 21-file Owner tree read-only as recovery evidence.
 # NO Owner /www path is ever eligible for apply or rollback.
 cp -a "$OLD_OWNER" "$BASE/owner-pwa-full" || return 97
 (cd "$BASE" && tar -czf backup.tar.gz files metadata.tsv owner-pwa-full) || return 97
 sha256sum "$BASE/backup.tar.gz" | awk '{print $1}'
}
rollback_files(){
 [ -d "$BASE/files" ] && [ -f "$BASE/metadata.tsv" ] || return 98
 TAB="$(printf '\t')"
 # A partial apply may leave either original/absent or exact candidate bytes;
 # refuse to clobber Owner changes or unrecognized third-party writes.
 while IFS="$TAB" read -r target relative new_sha old_sha mode || [ -n "${target:-}" ]; do
  [ -n "$target" ] || continue
  dest="$ROOT${target}"
  [ ! -L "$dest" ] || return 98
  if [ -e "$dest" ]; then
   actual="$(sha256sum "$dest" | awk '{print $1}')"
   [ "$actual" = "$new_sha" ] || [ "$actual" = "$old_sha" ] || return 98
  fi
  if [ -e "$dest.cart116stage" ]; then
   [ -f "$dest.cart116stage" ] && [ ! -L "$dest.cart116stage" ] &&
    [ "$(sha256sum "$dest.cart116stage" | awk '{print $1}')" = "$new_sha" ] || return 98
  fi
 done < "$PKG/TARGETS.tsv"
 # Exact prior service OFF; never touch existing Owner gateway or Wi-Fi.
 if [ -f "$OWNER_SERVICE" ] && grep -q '^# NEW Controls-owned procd service' "$OWNER_SERVICE"; then
  "$OWNER_SERVICE" stop >/dev/null 2>&1 || :
  "$OWNER_SERVICE" disable >/dev/null 2>&1 || :
 fi
 while IFS="$TAB" read -r target relative new_sha old_sha mode || [ -n "${target:-}" ]; do
  [ -n "$target" ] || continue
  dest="$ROOT${target}"
  if [ -e "$dest.cart116stage" ]; then
   rm -f "$dest.cart116stage" || return 98
  fi
  if [ "$old_sha" = ABSENT ]; then
   rm -f "$dest" || return 98
  else
   [ -f "$BASE/files$target" ] &&
    [ "$(sha256sum "$BASE/files$target" | awk '{print $1}')" = "$old_sha" ] || return 98
   cp -p "$BASE/files$target" "$dest.reverse" &&
    mv -f "$dest.reverse" "$dest" || return 98
  fi
 done < "$PKG/TARGETS.tsv"
 # This credential file did not exist at original capture. It contains secrets
 # and cannot be included in off-device backups or source artifacts.
 if [ -e "$CONF" ]; then
  [ -f "$CONF" ] && [ ! -L "$CONF" ] &&
   [ "$(stat -c %u:%a "$CONF")" = '0:600' ] || return 98
  rm -f "$CONF" || return 98
 fi
 [ ! -e "$PENDING" ] && [ ! -e "$LOCKOUT" ] || return 98
 return 0
}

case "$ACTION" in
 preflight)
  check_targets || exit 101
  echo 'PREFLIGHT_MATCHED_NO_WRITES'
  ;;
 backup)
  check_targets || exit 101
  [ "$OWNER" = PENDING ] || exit 101
  write_backup || exit 102
  echo 'BACKUP_CAPTURED_NEEDS_EXTERNAL_INDEPENDENT_DOWNLOAD_BACK'
  ;;
 apply)
  [ "$OWNER" = APPROVED_FOR_THIS_EXACT_MANIFEST ] || exit 103
  [ "$(field BACKUP_DOWNLOAD_BACK_VERIFIED)" = YES ] || exit 103
  check_archive || exit 103
  check_saved_backup || exit 103
  check_targets || exit 103
  [ ! -e "$REGISTRY" ] || exit 103
  # The review source is deliberately NOT admitted; the device cannot be
  # changed unless a new signed source version activates BOTH hard gates.
  grep -qx 'HBNF_CART_GLOW_SOURCE_ADMITTED=true' "$PKG/candidate/opal/usr/libexec/hbnf-cart-glow-bridge" || exit 104
  grep -qx 'HBNF_OVERLAY_V1_SOURCE_ADMITTED=true' "$PKG/candidate/opal/usr/lib/hbnf-glow-overlay-v1.sh" || exit 104
  grep -qx 'HBNF_NATIVE_OWNER_TEXT_PRIORITY_ADMITTED=true' "$PKG/candidate/opal/usr/lib/hbnf-glow-overlay-v1.sh" || exit 104
  # One-time registry consumed BEFORE any target file mutation. Never reuse.
  mkdir -p "$(dirname "$REGISTRY")" && mkdir "$REGISTRY" || exit 104
  printf '%s\n' "$MANIFEST_SHA" > "$REGISTRY/manifest.sha256"
  : > "$REGISTRY/install_started"
  FAILED=1
  trap '[ "$FAILED" -eq 0 ] || { rollback_files || echo "RECOVERY_LOCKOUT_INSPECT_OWNER" >&2; }' EXIT HUP INT TERM
  TAB="$(printf '\t')"
  while IFS="$TAB" read -r target relative new_sha old_sha mode || [ -n "${target:-}" ]; do
   [ -n "$target" ] || continue
   dest="$ROOT${target}"; source="$PKG/$relative"
   mkdir -p "$(dirname "$dest")"
   cp "$source" "$dest.cart116stage" && chmod "$mode" "$dest.cart116stage" &&
    chown 0:0 "$dest.cart116stage" || exit 105
   [ "$(sha256sum "$dest.cart116stage" | awk '{print $1}')" = "$new_sha" ] || exit 105
   # Before each rename original must still equal pinned preimage.
   if [ "$old_sha" = ABSENT ]; then [ ! -e "$dest" ] && [ ! -L "$dest" ] || exit 105
   else [ "$(sha256sum "$dest" | awk '{print $1}')" = "$old_sha" ] || exit 105; fi
   mv -f "$dest.cart116stage" "$dest" || exit 105
  done < "$PKG/TARGETS.tsv"
  # Supabase Edge/SQL/source admission and physical Owner priority must have
  # been independently verified before this external action. The owner provides
  # two credentials to the root-only provisioner only via authenticated stdin.
  if [ "${ROOT}" = / ]; then
   /usr/libexec/hbnf-cart-glow-provision || exit 105
   /etc/init.d/hbnf-cart-glow-bridge enable || exit 105
   /etc/init.d/hbnf-cart-glow-bridge start || exit 105
  fi
  FAILED=0; trap - EXIT HUP INT TERM
  : > "$REGISTRY/applied_pending_physical_acceptance"
  echo 'APPLIED_PENDING_INDEPENDENT_READBACK_AND_FIELD_ACCEPTANCE'
  ;;
 rollback)
  # Recovery intentionally permitted after failed/consumed one-time release.
  check_saved_backup || exit 106
  rollback_files || exit 107
  : > "$REGISTRY/rollback_restored"
  echo 'ROLLBACK_TARGET_BYTES_RESTORED_VERIFY_DEVICES_AND_OWNER'
  ;;
 closeout)
  [ -d "$REGISTRY" ] && [ -f "$REGISTRY/applied_pending_physical_acceptance" ] || exit 108
  # Hardware acceptance is external to this installer and cannot be certified
  # from SHA/HTTP status. Require independently attested one-time field receipt.
  [ "$(field PHYSICAL_ACCEPTED_BY_OWNER)" = YES_WITH_SAME_MANIFEST ] || exit 108
  field_sha="$(field PHYSICAL_ACCEPTANCE_RECEIPT_SHA256)"
  readback_sha="$(field INDEPENDENT_CLOSEOUT_READBACK_SHA256)"
  hex64 "$field_sha" && hex64 "$readback_sha" || exit 108
  : > "$REGISTRY/closed_with_external_physical_receipt"
  echo 'CLOSEOUT_RECORDED_EXTERNAL_PHYSICAL_WITNESS_REQUIRED'
  ;;
esac

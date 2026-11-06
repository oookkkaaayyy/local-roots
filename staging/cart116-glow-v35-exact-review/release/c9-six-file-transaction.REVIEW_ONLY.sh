#!/bin/sh
# Controls #116 C9: isolated six-file filesystem transaction rehearsal ONLY.
# The live Opal root '/', live remote devices, and live admission are disabled.
# Source-only route: no network, no credentials, no firmware or router changes.
set -eu
umask 077
[ "$#" -eq 5 ] || { echo 'USAGE: action sandbox_root six.tsv candidates_dir transaction_id' >&2; exit 64; }
ACTION=$1
ROOT=$2
TARGETS=$3
SOURCE=$4
TX=$5
case "$ACTION" in preflight|prepare|apply|rollback) ;; *) exit 64;; esac
case "$ROOT" in /tmp/cart116-c9-rehearsal-*) ;; *) echo 'REVIEW_ONLY_SANDBOX_REQUIRED' >&2; exit 65;; esac
[ -d "$ROOT" ] && [ ! -L "$ROOT" ] && [ -f "$TARGETS" ] && [ ! -L "$TARGETS" ] && [ -d "$SOURCE" ] && [ ! -L "$SOURCE" ] || exit 66
case "$TX" in ''|*[!a-zA-Z0-9_-]*) exit 66;; esac
[ "${#TX}" -ge 20 ] && [ "${#TX}" -le 64 ] || exit 66
TXBASE="$ROOT/.cart116-c9-transactions/$TX"
hex64(){ case "$1" in ''|*[!0-9a-f]*) return 1;; esac; [ "${#1}" -eq 64 ]; }
sha(){ sha256sum "$1" | awk '{print $1}'; }
valid(){
 case "$1:$2" in
 '/www/mission-control-local/local-transport.js:local-transport.js'|\
 '/www/mission-control-local/owner-pwa/hbnf-cart-local.js:hbnf-cart-local.js'|\
 '/www/mission-control-local/owner-pwa/hbnf-cart.js:hbnf-cart.js'|\
 '/www/mission-control-local/owner-pwa/hbnf-cart.html:hbnf-cart.html'|\
 '/www/mission-control-local/owner-pwa/.hbnf-payload.sha256:.hbnf-payload.sha256'|\
 '/www/mission-control-local/owner-pwa/.hbnf-package-version:.hbnf-package-version') return 0;;
 *) return 1;; esac
}
# No unverified source, unexpected original, symlink, duplicate, or extra target.
check_targets(){
 count=0
 TAB="$(printf '\t')"
 while IFS="$TAB" read -r dest rel old new mode || [ -n "${dest:-}" ]; do
  [ -n "$dest" ] || continue
  valid "$dest" "$rel" || return 70
  hex64 "$old" && hex64 "$new" && [ "$mode" = 644 ] || return 70
  test -f "$SOURCE/$rel" && [ ! -L "$SOURCE/$rel" ] && [ "$(sha "$SOURCE/$rel")" = "$new" ] || return 70
  [ -f "$ROOT$dest" ] && [ ! -L "$ROOT$dest" ] || return 71
  [ "$(sha "$ROOT$dest")" = "$old" ] || return 71
  count=$((count+1))
 done < "$TARGETS"
 [ "$count" -eq 6 ] || return 72
 [ "$(cut -f1 "$TARGETS" | sort -u | wc -l | tr -d ' ')" -eq 6 ] || return 72
}
# The manifest is exact, not a list of arbitrary files.
check_manifest(){
 TAB="$(printf '\t')"; count=0
 while IFS="$TAB" read -r dest rel old new mode || [ -n "${dest:-}" ]; do
  [ -n "$dest" ] || continue
  valid "$dest" "$rel" || return 70
  hex64 "$old" && hex64 "$new" && [ "$mode" = 644 ] || return 70
  [ -f "$SOURCE/$rel" ] && [ ! -L "$SOURCE/$rel" ] && [ "$(sha "$SOURCE/$rel")" = "$new" ] || return 70
  [ -f "$ROOT$dest" ] && [ ! -L "$ROOT$dest" ] || return 71
  count=$((count+1))
 done < "$TARGETS"
 [ "$count" -eq 6 ] && [ "$(cut -f1 "$TARGETS" | sort -u | wc -l | tr -d ' ')" -eq 6 ]
}
check_backup(){
 [ -f "$TXBASE/manifest.tsv" ] && [ -f "$TXBASE/prepared" ] || return 73
 cmp -s "$TXBASE/manifest.tsv" "$TARGETS" || return 73
 TAB="$(printf '\t')"
 while IFS="$TAB" read -r dest rel old new mode || [ -n "${dest:-}" ]; do
  [ -n "$dest" ] || continue
  [ -f "$TXBASE/old/$rel" ] && [ "$(sha "$TXBASE/old/$rel")" = "$old" ] || return 73
  [ -f "$TXBASE/new/$rel" ] && [ "$(sha "$TXBASE/new/$rel")" = "$new" ] || return 73
 done < "$TARGETS"
}
case "$ACTION" in
 preflight)
  [ ! -e "$TXBASE" ] || exit 74
  check_targets || exit 75
  echo 'SIX_TARGETS_CANDIDATE_AND_PREIMAGE_MATCH_READ_ONLY'
  ;;
 prepare)
  [ ! -e "$TXBASE" ] || exit 74
  check_targets || exit 75
  mkdir -p "$TXBASE/old" "$TXBASE/new" || exit 75
  cp "$TARGETS" "$TXBASE/manifest.tsv" || exit 75
  TAB="$(printf '\t')"
  while IFS="$TAB" read -r dest rel old new mode || [ -n "${dest:-}" ]; do
   [ -n "$dest" ] || continue
   cp -p "$ROOT$dest" "$TXBASE/old/$rel" || exit 75
   cp "$SOURCE/$rel" "$TXBASE/new/$rel" || exit 75
   [ "$(sha "$TXBASE/old/$rel")" = "$old" ] && [ "$(sha "$TXBASE/new/$rel")" = "$new" ] || exit 75
  done < "$TARGETS"
  : > "$TXBASE/prepared"
  echo 'REHEARSAL_PREPARED_ONLY'
  ;;
 apply)
  check_backup || exit 76
  [ ! -e "$TXBASE/consumed" ] || exit 77
  check_targets || exit 78
  : > "$TXBASE/consumed"
  TAB="$(printf '\t')"
  while IFS="$TAB" read -r dest rel old new mode || [ -n "${dest:-}" ]; do
   [ -n "$dest" ] || continue
   target="$ROOT$dest"; staged="$target.cart116c9-staging"
   [ ! -e "$staged" ] && [ ! -L "$staged" ] || exit 78
   cp "$TXBASE/new/$rel" "$staged" && chmod 644 "$staged" || exit 78
   [ "$(sha "$staged")" = "$new" ] && [ "$(sha "$target")" = "$old" ] || exit 78
   mv -f "$staged" "$target" || exit 78
  done < "$TARGETS"
  : > "$TXBASE/applied"
  echo 'REHEARSAL_APPLIED_NOT_INSTALLABLE_ON_CART'
  ;;
 rollback)
  [ -f "$TXBASE/consumed" ] || exit 79
  check_backup || exit 79
  TAB="$(printf '\t')"
  # Fail closed if any target changed to a third-party hash. Precheck all before any restore.
  while IFS="$TAB" read -r dest rel old new mode || [ -n "${dest:-}" ]; do
   [ -n "$dest" ] || continue
   [ -f "$ROOT$dest" ] && [ ! -L "$ROOT$dest" ] || exit 80
   current="$(sha "$ROOT$dest")"
   [ "$current" = "$old" ] || [ "$current" = "$new" ] || exit 80
  done < "$TARGETS"
  while IFS="$TAB" read -r dest rel old new mode || [ -n "${dest:-}" ]; do
   [ -n "$dest" ] || continue
   target="$ROOT$dest"; staged="$target.cart116c9-restore"
   [ ! -e "$staged" ] && [ ! -L "$staged" ] || exit 80
   cp -p "$TXBASE/old/$rel" "$staged" || exit 80
   [ "$(sha "$staged")" = "$old" ] || exit 80
   mv -f "$staged" "$target" || exit 80
  done < "$TARGETS"
  : > "$TXBASE/restored"
  echo 'REHEARSAL_ROLLBACK_VERIFIED_NOT_CART_RESTORED'
  ;;
esac

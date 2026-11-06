#!/bin/ash
# #116 C9 Phase1A: GL-SFT1200 /www and /root recovery filesystem observer.
# READ ONLY; no remount, tmp files, credentials, network calls or target writes.
# Does NOT admit install; evaluate together with exact six-file hash preflight.
set -eu
[ "$#" -eq 1 ] || { echo 'usage: c9-opal-overlay-readonly.REVIEW_ONLY.sh root' >&2; exit 64; }
ROOT=$1
case "$ROOT" in
 /) [ "$(id -u)" = 0 ] || exit 65; MOUNTS=/proc/mounts; MODEL=/tmp/sysinfo/model;;
 /tmp/cart116-c9-rehearsal-*) [ -d "$ROOT" ] && [ ! -L "$ROOT" ] || exit 65
  MOUNTS="$ROOT/proc/mounts"; MODEL="$ROOT/tmp/sysinfo/model";;
 *) echo C9_REVIEW_ONLY_FIXED_TARGET >&2; exit 65;;
esac
for cmd in awk df cat; do command -v "$cmd" >/dev/null 2>&1 || { echo "MISSING_C9_PROBE_COMMAND:$cmd" >&2; exit 66; }; done
[ -f "$MOUNTS" ] && [ ! -L "$MOUNTS" ] && [ -f "$MODEL" ] && [ ! -L "$MODEL" ] || exit 67
[ -d "$ROOT/root" ] && [ ! -L "$ROOT/root" ] &&
[ -d "$ROOT/www" ] && [ ! -L "$ROOT/www" ] || exit 67
model="$(cat "$MODEL")"
case "$model" in *GL-SFT1200*|*Opal*) : ;; *)
 echo "C9_WRONG_OPAL_MODEL_REJECTED" >&2; exit 68;;
esac
root_fs="$(awk '$2=="/" {print $3; exit}' "$MOUNTS")"
overlay_fs="$(awk '$2=="/overlay" {print $3; exit}' "$MOUNTS")"
case "$root_fs" in overlay|overlayfs) : ;; *)
 echo "C9_ROOT_NOT_OVERLAY_REJECTED" >&2; exit 69;;
esac
case "$overlay_fs" in jffs2|ubifs|f2fs|ext4|btrfs) : ;; *)
 echo "C9_PERSISTENT_OVERLAY_UNPROVEN" >&2; exit 70;;
esac
# Reject mounts that actually intersect the six Owner assets or the
# persistent recovery journal. Unrelated nested mounts under /root or /www
# are not evidence that the C9 targets use a different backing filesystem.
if awk '
 function intersects(path, mount) {
   return path == mount || index(path, mount "/") == 1 || index(mount, path "/") == 1
 }
 $2 != "/" && $2 != "/overlay" {
   m=$2
   if (intersects("/root/cart116-controls-recovery",m) ||
       intersects("/www/mission-control-local/local-transport.js",m) ||
       intersects("/www/mission-control-local/owner-pwa/hbnf-cart-local.js",m) ||
       intersects("/www/mission-control-local/owner-pwa/hbnf-cart.js",m) ||
       intersects("/www/mission-control-local/owner-pwa/hbnf-cart.html",m) ||
       intersects("/www/mission-control-local/owner-pwa/.hbnf-payload.sha256",m) ||
       intersects("/www/mission-control-local/owner-pwa/.hbnf-package-version",m))
       bad=1
 }
 END { exit !bad }
' "$MOUNTS"; then
 echo "C9_RECOVERY_OR_ONE_OF_SIX_TARGET_MOUNTS_OVERRIDDEN" >&2; exit 71
fi
free_root="$(df -k "$ROOT/root" | awk 'END {print $4}')"
free_www="$(df -k "$ROOT/www" | awk 'END {print $4}')"
case "$free_root:$free_www" in *[!0-9:]*|:*|*:) exit 72;; esac
[ "$free_root" -ge 4096 ] && [ "$free_www" -ge 4096 ] || exit 72
printf 'C9_OVERLAY_FS_READ_ONLY_PASS model=%s rootfs=%s persistent_overlay=%s root_free_kb=%s www_free_kb=%s\n' \
 "$model" "$root_fs" "$overlay_fs" "$free_root" "$free_www"
echo 'NOT_POWER_CYCLE_TESTED_NOT_A_RELEASE_ADMISSION_OR_WRITE_AUTHORIZATION'

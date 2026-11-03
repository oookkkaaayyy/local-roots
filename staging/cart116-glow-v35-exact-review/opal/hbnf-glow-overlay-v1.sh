#!/bin/ash
# REVIEW_ONLY: source candidate for the existing Opal, NEVER an install launcher.
# Do not run unless same-manifest admission has replaced the hard false gate.
set -eu
# Hard-coded build gate. No environment variable or remote setting can enable
# actuator writes. Only a separately reviewed manifest-bound source revision may
# change this value after all recovery and owner authorization checks.
HBNF_OVERLAY_V1_SOURCE_ADMITTED=false
[ "$HBNF_OVERLAY_V1_SOURCE_ADMITTED" = true ] || exit 0
# The Owner relay owns the execution loop. This is invoked once, in-process,
# only when the legacy relay has no pending paired challenge. No second daemon.
[ -r /etc/hbnf-matrix-relay.conf ] || exit 1
CONF=/etc/hbnf-matrix-relay.conf
[ ! -L "$CONF" ] && [ "$(stat -c %a "$CONF")" = 600 ] &&
 [ "$(stat -c %u "$CONF")" = 0 ] || exit 1
. "$CONF"
[ "${RELAY_ID:-}" = 'opal-hbnf-cart' ] || exit 1
: "${RELAY_TOKEN:?missing relay token}"
: "${RELAY_API_KEY:?missing relay API key}"
[ "${#RELAY_TOKEN}" -ge 43 ] || exit 1
case "$RELAY_TOKEN" in *[!A-Za-z0-9_-]*|'') exit 1;; esac
case "$RELAY_API_KEY" in *[!A-Za-z0-9._-]*|'') exit 1;; esac
[ "${SUPABASE_RELAY_URL:-}" = 'https://phcpbvuqibyarpfrftgx.supabase.co/functions/v1/hbnf-cart-control' ] || exit 1
command -v curl >/dev/null && command -v jsonfilter >/dev/null && command -v sha256sum >/dev/null || exit 1
M=http://192.168.77.10; A=http://192.168.77.11
TMP=/tmp/hbnf-glow-overlay-v1
LOCKOUT=/etc/hbnf-glow-overlay-v1.partial-failure
LEGACY_LOCKOUT=/etc/hbnf-matrix-relay.partial-failure
[ ! -e "$LEGACY_LOCKOUT" ] && [ ! -L "$LEGACY_LOCKOUT" ] || exit 1
[ ! -L "$LOCKOUT" ] || exit 1
[ ! -L "$TMP" ] || exit 1
umask 077; mkdir -p "$TMP"; chmod 700 "$TMP"
# One process per unit: no independent uncoordinated auto-polling / cron.
mkdir "$TMP/active" 2>/dev/null || exit 1
trap 'rmdir "$TMP/active" 2>/dev/null || :' EXIT
printf 'header = "Authorization: Bearer %s"\nheader = "apikey: %s"\nheader = "X-HBNF-Relay-ID: %s"\n' "$RELAY_TOKEN" "$RELAY_API_KEY" "$RELAY_ID" > "$TMP/auth.conf"
chmod 600 "$TMP/auth.conf"; unset RELAY_TOKEN RELAY_API_KEY
snapshot() {
 curl -fsS --connect-timeout 2 --max-time 4 "$M/json/si" -o "$TMP/m-si.json" || return 1
 curl -fsS --connect-timeout 2 --max-time 4 "$M/hbnf/build.json" -o "$TMP/build.json" || return 1
 curl -fsS --connect-timeout 2 --max-time 4 "$A/json/si" -o "$TMP/a-si.json" || return 1
 curl -fsS --connect-timeout 2 --max-time 4 "$A/json/cfg" -o "$TMP/auxConfig.json" || return 1
 jsonfilter -i "$TMP/m-si.json" -e '@.info' > "$TMP/info.json" || return 1
 jsonfilter -i "$TMP/m-si.json" -e '@.state' > "$TMP/state.json" || return 1
 jsonfilter -i "$TMP/a-si.json" -e '@.info' > "$TMP/auxInfo.json" || return 1
 jsonfilter -i "$TMP/a-si.json" -e '@.state' > "$TMP/auxState.json" || return 1
 [ "$(jsonfilter -i "$TMP/info.json" -e '@.mac' | tr -d : | tr 'A-F' 'a-f')" = 704bca5b345c ] || return 1
 [ "$(jsonfilter -i "$TMP/auxInfo.json" -e '@.mac' | tr -d : | tr 'A-F' 'a-f')" = 8c94df55c34c ] || return 1
 [ "$(jsonfilter -i "$TMP/build.json" -e '@.release_id')" = 'hbnf-cart2-phase2-r6-skins-readable-20261014' ] || return 1
 ps="$(jsonfilter -i "$TMP/state.json" -e '@.ps')" || return 1
 case "$ps" in
   60) : ;;
   -1) # Current physical profile: effect 142 without an active preset.
       # No source/installed renderer parity proof. Still fail closed.
       return 1 ;;
   *) return 1 ;;
 esac
 fx="$(jsonfilter -i "$TMP/state.json" -e '@.HBNF.effectId')" || return 1
 [ "$(jsonfilter -i "$TMP/state.json" -e '@.seg[0].fx')" = "$fx" ] || return 1
 [ "$(jsonfilter -i "$TMP/state.json" -e '@.seg[1].fx')" = "$fx" ] || return 1
 [ "$(jsonfilter -i "$TMP/auxInfo.json" -e '@.live')" = true ] || return 1
 [ "$(jsonfilter -i "$TMP/auxInfo.json" -e '@.lm')" = DDP ] || return 1
 [ "$(jsonfilter -i "$TMP/auxInfo.json" -e '@.lip')" = 192.168.77.10 ] || return 1
 # Exactly 24 configured: 22 RGB DDP on GPIO16, plus two PWM outputs
 # GPIO25/26 whose segments MUST remain OFF. Never write AUX config/state.
 [ "$(jsonfilter -i "$TMP/auxInfo.json" -e '@.leds.count')" = 24 ] || return 1
 for spec in '0:0:22:22:16:0:0:22:1' '1:22:1:41:25:1:22:23:0' '2:23:1:41:26:2:23:24:0'; do
  oldifs="$IFS"; IFS=:; set -- $spec; IFS="$oldifs"
  i="$1"; start="$2"; length="$3"; typ="$4"; pin="$5"; seg="$6"; lo="$7"; hi="$8"; on="$9"
  [ "$(jsonfilter -i "$TMP/auxConfig.json" -e "@.hw.led.ins[$i].start")" = "$start" ] || return 1
  [ "$(jsonfilter -i "$TMP/auxConfig.json" -e "@.hw.led.ins[$i].len")" = "$length" ] || return 1
  [ "$(jsonfilter -i "$TMP/auxConfig.json" -e "@.hw.led.ins[$i].type")" = "$typ" ] || return 1
  [ "$(jsonfilter -i "$TMP/auxConfig.json" -e "@.hw.led.ins[$i].pin[0]")" = "$pin" ] || return 1
  [ "$(jsonfilter -i "$TMP/auxState.json" -e "@.seg[$seg].start")" = "$lo" ] || return 1
  [ "$(jsonfilter -i "$TMP/auxState.json" -e "@.seg[$seg].stop")" = "$hi" ] || return 1
  v="$(jsonfilter -i "$TMP/auxState.json" -e "@.seg[$seg].on")"
  if [ "$on" = 1 ]; then [ "$v" = true ] || return 1;
  else [ "$v" = false ] || return 1; fi
  [ -z "$(jsonfilter -i "$TMP/auxConfig.json" -e "@.hw.led.ins[$i].pin[1]" 2>/dev/null || true)" ] || return 1
 done
 # Reject any fourth bus. This is 24 logical outputs, not 24 DDP RGB pixels.
 [ -z "$(jsonfilter -i "$TMP/auxConfig.json" -e '@.hw.led.ins[3].type' 2>/dev/null || true)" ] || return 1
 [ "$(jsonfilter -i "$TMP/auxConfig.json" -e '@.if.live.maxbri')" = false ] || return 1
}
post() {
 op="$1"
 curl -sS --connect-timeout 3 --max-time 12 --config "$TMP/auth.conf" \
  -F "op=$op" -F 'relayId=opal-hbnf-cart' \
  -F "challengeId=${challenge:-}" -F "overlayId=${overlay:-}" \
  -F "info=@$TMP/info.json;type=application/json" \
  -F "state=@$TMP/state.json;type=application/json" \
  -F "build=@$TMP/build.json;type=application/json" \
  -F "auxInfo=@$TMP/auxInfo.json;type=application/json" \
  -F "auxState=@$TMP/auxState.json;type=application/json" \
  -F "auxConfig=@$TMP/auxConfig.json;type=application/json" \
  "$SUPABASE_RELAY_URL" -o "$TMP/$op.json" -w '%{http_code}'
}
# The same foreground relay loop calls this helper once per cycle. After ACK,
# return immediately to Owner service; later cycles check native TTL restoration.
# No background process, secondary polling daemon, actuator retry or sleep(21).
PENDING="$TMP/overlay-v1-pending"
[ ! -L "$PENDING" ] || exit 1
if [ -e "$LOCKOUT" ]; then
 [ -f "$PENDING" ] && [ -r "$PENDING" ] || exit 1
 challenge="$(sed -n '1p' "$PENDING")"
 overlay="$(sed -n '2p' "$PENDING")"
 payload_ttl="$(sed -n '3p' "$PENDING")"
 started_s="$(sed -n '4p' "$PENDING")"
 echo "$challenge" | grep -Eq '^[0-9a-f-]{36}$' || exit 1
 echo "$overlay" | grep -Eq '^hbnf-[a-f0-9]{32}$' || exit 1
 case "$payload_ttl:$started_s" in *[!0-9:]*|'') exit 1;; esac
 [ "$payload_ttl" -ge 1000 ] && [ "$payload_ttl" -le 20000 ] || exit 1
 [ "$(wc -l < "$PENDING")" -eq 4 ] || exit 1
 now_s="$(date +%s)" || exit 1
 case "$now_s" in *[!0-9]*|'') exit 1;; esac
 # TTL plus margin, not a fixed foreground sleep. Owner relay stays responsive.
 if [ "$now_s" -lt "$((started_s + (payload_ttl + 999)/1000 + 2))" ]; then exit 0; fi
 snapshot || exit 1
 code="$(post overlay_v1_restored)" || exit 1
 [ "$code" = 200 ] &&
  [ "$(jsonfilter -i "$TMP/overlay_v1_restored.json" -e '@.matrixOriginalProfileConfirmed')" = true ] || exit 1
 # Exactly the same settled challenge and device readback unlocks native Glow.
 rm -f "$PENDING" || exit 1
 rm -f "$LOCKOUT" || exit 1
 exit 0
fi
# A state marker without lockout is inconsistent: do not issue a second overlay.
[ ! -e "$PENDING" ] || exit 1
# Foreground one-shot: either issue/ACK or return without a GLOW command.
snapshot || exit 1
code="$(post overlay_v1_next)" || exit 1
[ "$code" = 200 ] || exit 0
challenge="$(jsonfilter -i "$TMP/overlay_v1_next.json" -e '@.challengeId')"
overlay="$(jsonfilter -i "$TMP/overlay_v1_next.json" -e '@.overlayId')"
echo "$challenge" | grep -Eq '^[0-9a-f-]{36}$' || exit 1
echo "$overlay" | grep -Eq '^hbnf-[a-f0-9]{32}$' || exit 1
snapshot || exit 1
# Recheck the shared legacy lockout after the remote network call.
[ ! -e "$LEGACY_LOCKOUT" ] && [ ! -L "$LEGACY_LOCKOUT" ] || exit 1
code="$(post overlay_v1_authorize)" || exit 1
[ "$code" = 200 ] &&
 [ "$(jsonfilter -i "$TMP/overlay_v1_authorize.json" -e '@.status')" = apply_once ] &&
 [ "$(jsonfilter -i "$TMP/overlay_v1_authorize.json" -e '@.overlayId')" = "$overlay" ] &&
 [ "$(jsonfilter -i "$TMP/overlay_v1_authorize.json" -e '@.auxWriteRequired')" = false ] || exit 1
# JSON is reconstructed with ONLY the native HBNF.overlay root key. No seg/fx/
# brightness/preset/AUX JSON can be written by this candidate shell.
# The one-use SQL capability was consumed. Every failure from this point
# stays locked out until the same-manifest, owner-controlled recovery.
(umask 077; : > "$LOCKOUT") || exit 1
[ "$(jsonfilter -i "$TMP/overlay_v1_authorize.json" -e '@.matrixPayload.HBNF.overlay.id')" = "$overlay" ] || exit 1
[ "$(jsonfilter -i "$TMP/overlay_v1_authorize.json" -e '@.matrixPayload.HBNF.overlay.kind')" = scoreboard ] || exit 1
[ "$(jsonfilter -i "$TMP/overlay_v1_authorize.json" -e '@.matrixPayload.HBNF.overlay.label')" = GLOW ] || exit 1
payload_ttl="$(jsonfilter -i "$TMP/overlay_v1_authorize.json" -e '@.matrixPayload.HBNF.overlay.ttlMs')" || exit 1
case "$payload_ttl" in *[!0-9]*|'') exit 1;; esac
[ "$payload_ttl" -ge 1000 ] && [ "$payload_ttl" -le 20000 ] || exit 1
overlay_json="$(jsonfilter -i "$TMP/overlay_v1_authorize.json" -e '@.matrixPayload.HBNF.overlay')" || exit 1
[ -n "$overlay_json" ] && [ "${#overlay_json}" -lt 3000 ] || exit 1
printf '{"HBNF":{"overlay":%s}}\n' "$overlay_json" > "$TMP/glow-overlay-only.json"
# One-use authorized apply may be indeterminate if HTTP transport fails; do not
# replay or force the old fx142/bri255 full-state projection as a fallback.
curl -fsS --connect-timeout 2 --max-time 4 -H 'Content-Type: application/json' \
 --data-binary @"$TMP/glow-overlay-only.json" "$M/json/state" -o /dev/null || exit 1
snapshot || exit 1
code="$(post overlay_v1_ack)" || exit 1
[ "$code" = 200 ] &&
 [ "$(jsonfilter -i "$TMP/overlay_v1_ack.json" -e '@.matrixOverlayIdConfirmed')" = true ] || exit 1
# Persist only non-secret validated identifiers in process-local runtime state.
# After reboot TMP is lost but /etc lockout survives: no unauthorized replay.
started_s="$(date +%s)" || exit 1
case "$started_s" in *[!0-9]*|'') exit 1;; esac
printf '%s\n%s\n%s\n%s\n' "$challenge" "$overlay" "$payload_ttl" "$started_s" > "$PENDING.new" || exit 1
chmod 600 "$PENDING.new" || exit 1
mv "$PENDING.new" "$PENDING" || exit 1
# Return to the existing Owner relay immediately; a later single-loop pass
# verifies the native auto-expiry without ever sending an overlay CLEAR.
exit 0

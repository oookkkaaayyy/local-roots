#!/bin/bash
set -euo pipefail

BASE="$(cd "$(dirname "$0")" && pwd)"
MATRIX_NEW="$BASE/HBNF_WLED16_MAX_WOWMAX_V3_TEMPO_LOCK.bin"
AUX_NEW="$BASE/HBNF_SP803E_AUX_R3_TEMPO_LOCK.bin"
MATRIX_OLD="$BASE/rollback/HBNF_WLED16_MAX_WOWMAX_V3_PRE_TEMPO_LOCK.bin"
AUX_OLD="$BASE/rollback/HBNF_SP803E_AUX_R3_PRE_TEMPO_LOCK.bin"
TARGET_MATRIX_WITNESS="registry28-tempo-lock-v5-colorwifi"
TARGET_AUX_WITNESS="registry28-tempo-lock-1d-v3-colorwifi"
OLD_MATRIX_WITNESS="registry28-fixed-v4-colorwifi"
OLD_AUX_WITNESS="registry28-fixed-1d-v2-colorwifi"

fail(){ printf '\nBLOCKER: %s\n' "$1" >&2; exit 1; }
need(){ command -v "$1" >/dev/null 2>&1 || fail "$1 is required."; }
need curl; need python3; need shasum

[ -f "$BASE/SHA256SUMS" ] || fail "SHA256SUMS missing."
(cd "$BASE" && shasum -a 256 -c SHA256SUMS) || fail "Package integrity check failed."
for f in "$MATRIX_NEW" "$AUX_NEW" "$MATRIX_OLD" "$AUX_OLD"; do [ -f "$f" ] || fail "Missing $(basename "$f")"; done

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

discover(){
python3 - "$1" <<'PY'
import concurrent.futures, ipaddress, json, subprocess, sys, urllib.request
want=sys.argv[1]
try:
    route=subprocess.check_output(["route","-n","get","default"],text=True,stderr=subprocess.DEVNULL)
    iface=next(x.split(":",1)[1].strip() for x in route.splitlines() if "interface:" in x)
    ip=subprocess.check_output(["ipconfig","getifaddr",iface],text=True,stderr=subprocess.DEVNULL).strip()
except Exception:
    print(""); raise SystemExit
net=ipaddress.ip_network(ip+"/24",strict=False)
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
def probe(addr):
    a=str(addr)
    try:
        with opener.open(f"http://{a}/json/state",timeout=.45) as r: s=json.load(r)
        with opener.open(f"http://{a}/json/info",timeout=.45) as r: i=json.load(r)
        leds=int((i.get("leds") or {}).get("count") or 0)
        if want=="matrix" and s.get("HBNFWOW",{}).get("release")=="hbnf-wow-r3-max-2026-09-21-v3" and leds==512: return a
        if want=="aux" and s.get("HBNFAUX",{}).get("release")=="hbnf-wow-aux-r3-2026-09-22-v1" and leds==22: return a
    except Exception: return None
with concurrent.futures.ThreadPoolExecutor(max_workers=64) as ex:
    hits=[x for x in ex.map(probe,net.hosts()) if x]
print(hits[0] if len(hits)==1 else "")
PY
}

json_get(){
python3 - "$1" "$2" <<'PY'
import json,sys
try:
 d=json.loads(sys.argv[1])
 for k in sys.argv[2].split("."):
  d=d.get(k) if isinstance(d,dict) else None
 if isinstance(d,bool): print("true" if d else "false")
 elif d is None: print("")
 else: print(d)
except Exception: print("")
PY
}

backup_node(){
  local kind="$1" ip="$2" dir="$3"
  mkdir -p "$dir"
  for ep in state cfg info; do
    curl --noproxy '*' -fsS --max-time 8 "http://$ip/json/$ep" -o "$dir/$ep.json" || fail "$kind backup failed at /json/$ep"
  done
  curl --noproxy '*' -fsS --max-time 8 "http://$ip/presets.json" -o "$dir/presets.json" || true
}

wait_witness(){
  local kind="$1" target="$2" deadline=$((SECONDS+100))
  while [ "$SECONDS" -lt "$deadline" ]; do
    local ip state got
    ip="$(discover "$kind")"
    if [ -n "$ip" ]; then
      state="$(curl --noproxy '*' -fsS --max-time 4 "http://$ip/json/state" 2>/dev/null || true)"
      if [ "$kind" = matrix ]; then got="$(json_get "$state" "HBNFWOW.buildWitness")"; else got="$(json_get "$state" "HBNFAUX.buildWitness")"; fi
      if [ "$got" = "$target" ]; then printf '%s' "$ip"; return 0; fi
    fi
    sleep 3
  done
  return 1
}

ota(){
  local kind="$1" ip="$2" bin="$3" target="$4"
  printf '\nUpdating %s...\n' "$kind" >&2
  curl --noproxy '*' -fsS --max-time 150 -F "update=@$bin" "http://$ip/update" -o "$TMP/$kind-ota.txt" || return 1
  sleep 7
  wait_witness "$kind" "$target"
}

rollback_pair(){
  printf '\nAttempting automatic rollback to the pre-tempo-lock pair...\n' >&2
  local m a
  m="$(discover matrix || true)"; a="$(discover aux || true)"
  if [ -n "$a" ]; then curl --noproxy '*' -fsS --max-time 150 -F "update=@$AUX_OLD" "http://$a/update" >/dev/null 2>&1 || true; fi
  sleep 7
  if [ -n "$m" ]; then curl --noproxy '*' -fsS --max-time 150 -F "update=@$MATRIX_OLD" "http://$m/update" >/dev/null 2>&1 || true; fi
  sleep 10
  local rm ra
  rm="$(wait_witness matrix "$OLD_MATRIX_WITNESS" 2>/dev/null || true)"
  ra="$(wait_witness aux "$OLD_AUX_WITNESS" 2>/dev/null || true)"
  if [ -n "$rm" ] && [ -n "$ra" ]; then
    printf '\nROLLBACK PASS: both controllers restored to the prior firmware pair.\n' >&2
  else
    printf '\nROLLBACK INCOMPLETE: stop and return to ChatGPT before further changes.\n' >&2
  fi
}

printf '\nHBNF TEMPO-LOCK FIELD FIX\n'
printf 'Preserves WLED configuration/presets; firmware only. Each controller should reboot once.\n\n'

MATRIX_IP="$(discover matrix)"
AUX_IP="$(discover aux)"
[ -n "$MATRIX_IP" ] || fail "Could not uniquely identify the 512-pixel Matrix on this local network."
[ -n "$AUX_IP" ] || fail "Could not uniquely identify the 22-pixel AUX on this local network."
printf 'Matrix: %s\nAUX:    %s\n' "$MATRIX_IP" "$AUX_IP"

MS="$(curl --noproxy '*' -fsS --max-time 5 "http://$MATRIX_IP/json/state")"
AS="$(curl --noproxy '*' -fsS --max-time 5 "http://$AUX_IP/json/state")"
MC="$(curl --noproxy '*' -fsS --max-time 5 "http://$MATRIX_IP/json/cfg")"
AC="$(curl --noproxy '*' -fsS --max-time 5 "http://$AUX_IP/json/cfg")"
MW="$(json_get "$MS" "HBNFWOW.buildWitness")"
AW="$(json_get "$AS" "HBNFAUX.buildWitness")"
[ "$MW" = "$OLD_MATRIX_WITNESS" ] || [ "$MW" = "$TARGET_MATRIX_WITNESS" ] || fail "Unexpected Matrix firmware witness: $MW"
[ "$AW" = "$OLD_AUX_WITNESS" ] || [ "$AW" = "$TARGET_AUX_WITNESS" ] || fail "Unexpected AUX firmware witness: $AW"
[ "$(json_get "$MC" "ota.lock")" != "true" ] || fail "Matrix OTA is locked."
[ "$(json_get "$AC" "ota.lock")" != "true" ] || fail "AUX OTA is locked."
[ "$(json_get "$AC" "hw.led.total")" = "22" ] || fail "AUX no longer reports 22 logical LEDs."
[ "$(json_get "$AC" "hw.led.maxpwr")" = "900" ] || fail "AUX current cap is no longer 900mA."

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$HOME/Desktop/HBNF_TEMPO_LOCK_BACKUP_$STAMP"
backup_node Matrix "$MATRIX_IP" "$BACKUP/matrix"
backup_node AUX "$AUX_IP" "$BACKUP/aux"
printf 'Backup: %s\n' "$BACKUP"

if [ "$MW" != "$TARGET_MATRIX_WITNESS" ]; then
  if ! MATRIX_IP="$(ota matrix "$MATRIX_IP" "$MATRIX_NEW" "$TARGET_MATRIX_WITNESS")"; then rollback_pair; fail "Matrix tempo-lock OTA did not verify."; fi
fi
printf 'Matrix tempo lock: PASS\n'

AUX_IP="$(discover aux)"
if [ "$AW" != "$TARGET_AUX_WITNESS" ]; then
  if ! AUX_IP="$(ota aux "$AUX_IP" "$AUX_NEW" "$TARGET_AUX_WITNESS")"; then rollback_pair; fail "AUX tempo-lock OTA did not verify."; fi
fi
printf 'AUX tempo lock: PASS\n'

MS="$(curl --noproxy '*' -fsS --max-time 5 "http://$MATRIX_IP/json/state")"
AS="$(curl --noproxy '*' -fsS --max-time 5 "http://$AUX_IP/json/state")"
AC="$(curl --noproxy '*' -fsS --max-time 5 "http://$AUX_IP/json/cfg")"
[ "$(json_get "$MS" "HBNFWOW.buildWitness")" = "$TARGET_MATRIX_WITNESS" ] || fail "Final Matrix witness mismatch."
[ "$(json_get "$AS" "HBNFAUX.buildWitness")" = "$TARGET_AUX_WITNESS" ] || fail "Final AUX witness mismatch."
[ "$(json_get "$AC" "hw.led.total")" = "22" ] || fail "Final AUX pixel count mismatch."
[ "$(json_get "$AC" "hw.led.maxpwr")" = "900" ] || fail "Final AUX current cap mismatch."
[ "$(json_get "$AC" "if.mqtt.en")" = "true" ] || fail "Final AUX MQTT unexpectedly disabled."
[ "$(json_get "$AC" "if.mqtt.topics.device")" = "hbnf/cart/aux1" ] || fail "Final AUX MQTT topic mismatch."

printf '\nHBNF_TEMPO_LOCK_TECHNICAL_PASS matrix=%s aux=%s backup=%s\n' "$TARGET_MATRIX_WITNESS" "$TARGET_AUX_WITNESS" "$BACKUP"
printf 'Next: play music and confirm chosen SPEED remains constant while audio still changes accents/intensity.\n'

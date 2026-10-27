#!/bin/sh
# Read-only installation preflight; no router, DNS, Nginx, or device writes.
set -eu
HOST=cart-control.hbnightflyers.com
MATRIX=192.168.77.10
AUX=192.168.77.11
GATEWAY_PORT=8443
GATEWAY_LAN_IP=192.168.77.1
EXPECTED_MATRIX_RELEASE=hbnf-cart2-phase2-r6-skins-readable-20261014
fail(){ echo "BLOCKED: $*" >&2; exit 1; }
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/matrix_topology.sh"
NGINX=/usr/sbin/nginx
[ -x "$NGINX" ] || fail "installed Nginx binary missing"
command -v openssl >/dev/null 2>&1 || fail "openssl missing"
command -v curl >/dev/null 2>&1 || fail "curl missing"
command -v jsonfilter >/dev/null 2>&1 || fail "jsonfilter missing"
command -v sha256sum >/dev/null 2>&1 || fail "sha256sum missing"
nginx_build=$("$NGINX" -V 2>&1)
printf '%s\n' "$nginx_build" | grep -q 'lua-nginx' || fail "installed Nginx build has no Lua module"
printf '%s\n' "$nginx_build" | grep -q 'http_ssl' || fail "installed Nginx build has no TLS module"
# Test the bundled modules in the actual embedded Nginx LuaJIT runtime. The
# standalone OpenWrt `lua` executable is not necessarily LuaJIT and cannot
# validate modules that use LuaJIT FFI.
PROBE_DIR=$(mktemp -d /tmp/hbnf-local-control-lua-probe.XXXXXX) || fail "cannot create temporary Lua runtime probe directory"
chmod 0755 "$PROBE_DIR"
PROBE_PORT=$((20000 + ($$ % 20000)))
PROBE_PID=
probe_cleanup(){
  if [ -n "$PROBE_PID" ]; then
    kill -TERM "$PROBE_PID" 2>/dev/null || true
    wait "$PROBE_PID" 2>/dev/null || true
  fi
  rm -rf "$PROBE_DIR"
}
trap probe_cleanup EXIT HUP INT TERM
cat >"$PROBE_DIR/probe.lua" <<'LUA'
local cjson = require "cjson.safe"
assert(cjson.encode({probe = true}))
local sha = require "resty.sha256"
local hex = require "resty.string"
local ctx = sha:new()
assert(ctx)
assert(ctx:update("abc"))
ngx.say(hex.to_hex(ctx:final()))
LUA
chmod 0644 "$PROBE_DIR/probe.lua"
cat >"$PROBE_DIR/nginx.conf" <<EOF
worker_processes 1;
daemon off;
pid $PROBE_DIR/nginx.pid;
error_log $PROBE_DIR/error.log;
events { worker_connections 16; }
http {
  lua_package_path "$SCRIPT_DIR/vendor/?.lua;;";
  server {
    listen 127.0.0.1:$PROBE_PORT;
    location = /probe {
      content_by_lua_file $PROBE_DIR/probe.lua;
    }
  }
}
EOF
"$NGINX" -p "$PROBE_DIR/" -c "$PROBE_DIR/nginx.conf" >"$PROBE_DIR/stdout.log" 2>&1 &
PROBE_PID=$!
probe_digest=
probe_attempt=0
while [ "$probe_attempt" -lt 20 ]; do
  probe_digest=$(curl -fsS --max-time 1 "http://127.0.0.1:$PROBE_PORT/probe" 2>/dev/null || true)
  [ -n "$probe_digest" ] && break
  kill -0 "$PROBE_PID" 2>/dev/null || break
  probe_attempt=$((probe_attempt + 1))
  sleep 1
done
[ "$probe_digest" = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" ] || {
  echo "Lua runtime probe response: ${probe_digest:-<no HTTP response>} on 127.0.0.1:$PROBE_PORT" >&2
  for probe_log in "$PROBE_DIR/stdout.log" "$PROBE_DIR/error.log"; do
    if [ -f "$probe_log" ]; then
      echo "--- $probe_log ---" >&2
      cat "$probe_log" >&2 || true
    fi
  done
  fail "bundled Lua modules failed the embedded Nginx LuaJIT SHA-256 probe; the preceding Nginx/curl output identifies the cause"
}
probe_cleanup
PROBE_PID=
trap - EXIT HUP INT TERM
[ -x /sbin/procd ] && [ -f /etc/rc.common ] && [ -f /lib/functions/procd.sh ] || fail "OpenWrt procd service support is incomplete"
[ -x /etc/init.d/nginx ] || fail "existing GL.iNet Nginx service is unavailable"
[ "$(uci -q get network.lan.ipaddr 2>/dev/null || true)" = "$GATEWAY_LAN_IP" ] || fail "Opal LAN address is not the exact gateway bind address $GATEWAY_LAN_IP"
# Require the active OpenWrt WAN zone's input policy to remain restrictive;
# absence of a port-specific ACCEPT rule alone is not proof of WAN denial.
wan_zone_index=$(uci -q show firewall 2>/dev/null | awk -F'[][]' '/^firewall\.@zone\[[0-9]+\]\.name=.wan./ { print $2; exit }')
[ -n "$wan_zone_index" ] || fail "could not identify the active OpenWrt WAN firewall zone"
wan_input=$(uci -q get "firewall.@zone[$wan_zone_index].input" 2>/dev/null || true)
case "$wan_input" in DROP|REJECT) ;; *) fail "WAN input policy must be DROP or REJECT (got ${wan_input:-unset})" ;; esac
worker_uid=$(id -u nobody 2>/dev/null || true)
worker_gid=$(id -g nobody 2>/dev/null || true)
worker_group=$(id -gn nobody 2>/dev/null || true)
case "$worker_uid:$worker_gid" in *[!0-9:]*|:*) fail "could not resolve the dedicated nobody account" ;; esac
[ "$worker_uid" -ne 0 ] || fail "dedicated Nginx request worker account resolves to root"
[ "$worker_group" = "nogroup" ] || fail "dedicated nobody group differs from the packaged nginx worker config"
[ ! -e /etc/hbnf-owner-local-control ] || fail "dedicated service/init path already exists; inspect before install"
[ ! -e /etc/hbnf-local-control/nginx.conf ] || fail "dedicated Nginx config already exists; inspect before install"
[ ! -e /etc/hbnf-local-control/nginx-server.conf ] || fail "dedicated Nginx server config already exists; inspect before install"
[ ! -e /etc/hbnf-local-control-state ] || fail "dedicated persistent session store already exists; inspect before install"
[ ! -e /var/log/hbnf-owner-local-control-nginx ] || fail "dedicated Nginx log directory already exists; inspect before install"
[ ! -e /var/run/hbnf-owner-local-control-nginx.pid ] || fail "dedicated Nginx PID path already exists; inspect before install"
[ ! -e /etc/rc.d/S85hbnf-owner-local-control ] || fail "dedicated service boot link already exists; inspect before install"
if command -v netstat >/dev/null 2>&1; then
  netstat -lnt 2>/dev/null | awk 'NR > 2 && $4 ~ /(:|\])8443$/ { found=1 } END { exit found ? 0 : 1 }' && fail "TCP port 8443 is already bound"
else
  awk '$2 ~ /:20FB$/ && $4 == "0A" { found=1 } END { exit found ? 0 : 1 }' /proc/net/tcp /proc/net/tcp6 2>/dev/null && fail "TCP port 8443 is already bound"
fi
# This listener is bound to the LAN address only. Also fail if an explicit
# WAN-input accept rule for 8443 exists in either active firewall family.
if command -v iptables-save >/dev/null 2>&1; then
  wan_accept=$(iptables-save 2>/dev/null | grep -E -- '^-A (zone_wan_input|input_wan_rule|INPUT) .*8443.*-j ACCEPT|^-A (zone_wan_input|input_wan_rule|INPUT) .*-j ACCEPT.*8443' || true)
  [ -z "$wan_accept" ] || fail "an explicit IPv4 WAN accept rule for TCP 8443 exists"
fi
if command -v ip6tables-save >/dev/null 2>&1; then
  wan6_accept=$(ip6tables-save 2>/dev/null | grep -E -- '^-A (zone_wan_input|input_wan_rule|INPUT) .*8443.*-j ACCEPT|^-A (zone_wan_input|input_wan_rule|INPUT) .*-j ACCEPT.*8443' || true)
  [ -z "$wan6_accept" ] || fail "an explicit IPv6 WAN accept rule for TCP 8443 exists"
fi
[ -r /etc/ssl/certs/ca-certificates.crt ] || fail "system CA bundle missing"
[ -d /etc/hbnf-local-control ] || fail "certificate directory /etc/hbnf-local-control is missing"
[ -s /etc/hbnf-local-control/tls/fullchain.pem ] || fail "DNS-01 certificate not installed"
[ -s /etc/hbnf-local-control/tls/privkey.pem ] || fail "DNS-01 private key not installed"
key_meta=$(ls -ln /etc/hbnf-local-control/tls/privkey.pem 2>/dev/null | awk '{print $1, $3, $4}')
[ "$key_meta" = "-rw------- 0 0" ] || fail "TLS private key must be root:root mode 0600"
openssl x509 -in /etc/hbnf-local-control/tls/fullchain.pem -noout -text | grep -Fq "DNS:$HOST" || fail "certificate SAN does not match $HOST"
openssl x509 -in /etc/hbnf-local-control/tls/fullchain.pem -checkend 86400 -noout >/dev/null || fail "certificate expires within 24 hours"
openssl verify -CAfile /etc/ssl/certs/ca-certificates.crt -untrusted /etc/hbnf-local-control/tls/fullchain.pem /etc/hbnf-local-control/tls/fullchain.pem >/dev/null 2>&1 || fail "certificate chain is not trusted by the Opal CA bundle"
resolved=$(nslookup "$HOST" 2>/dev/null | awk '/^Address [0-9]+: /{print $3} /^Address: /{print $2}' | tail -n 1)
[ "$resolved" = "192.168.77.1" ] || fail "$HOST must resolve locally to 192.168.77.1 (got ${resolved:-no answer})"
matrix_info=$(curl -fsS --max-time 3 "http://$MATRIX/json/info") || fail "Matrix read-only identity request failed"
matrix_state=$(curl -fsS --max-time 3 "http://$MATRIX/json/state") || fail "Matrix read-only topology request failed"
aux_info=$(curl -fsS --max-time 3 "http://$AUX/json/info") || fail "AUX read-only identity request failed"
matrix_build=$(curl -fsS --max-time 3 "http://$MATRIX/hbnf/build.json") || fail "Matrix embedded release identity request failed"
matrix_mac=$(printf '%s' "$matrix_info" | jsonfilter -e '@.mac' 2>/dev/null || true)
aux_mac=$(printf '%s' "$aux_info" | jsonfilter -e '@.mac' 2>/dev/null || true)
matrix_leds=$(printf '%s' "$matrix_info" | jsonfilter -e '@.leds.count' 2>/dev/null || true)
matrix_seg0_start=$(printf '%s' "$matrix_state" | jsonfilter -e '@.seg[0].start' 2>/dev/null || true)
matrix_seg0_stop=$(printf '%s' "$matrix_state" | jsonfilter -e '@.seg[0].stop' 2>/dev/null || true)
matrix_seg0_start_y=$(printf '%s' "$matrix_state" | jsonfilter -e '@.seg[0].startY' 2>/dev/null || true)
matrix_seg0_stop_y=$(printf '%s' "$matrix_state" | jsonfilter -e '@.seg[0].stopY' 2>/dev/null || true)
matrix_seg1_start=$(printf '%s' "$matrix_state" | jsonfilter -e '@.seg[1].start' 2>/dev/null || true)
matrix_seg1_stop=$(printf '%s' "$matrix_state" | jsonfilter -e '@.seg[1].stop' 2>/dev/null || true)
aux_leds=$(printf '%s' "$aux_info" | jsonfilter -e '@.leds.count' 2>/dev/null || true)
matrix_release=$(printf '%s' "$matrix_build" | jsonfilter -e '@.release_id' 2>/dev/null || true)
[ "$(printf '%s' "$matrix_mac" | tr 'A-F' 'a-f')" = "704bca5b345c" ] || fail "unexpected Matrix identity"
[ "$(printf '%s' "$aux_mac" | tr 'A-F' 'a-f')" = "8c94df55c34c" ] || fail "unexpected AUX identity"
[ "$matrix_release" = "$EXPECTED_MATRIX_RELEASE" ] || fail "unexpected Matrix release identity"
[ "$matrix_leds" = "534" ] || fail "unexpected combined Matrix/companion pixel count"
matrix_topology_valid "$matrix_leds" "$matrix_seg0_start" "$matrix_seg0_stop" "$matrix_seg0_start_y" "$matrix_seg0_stop_y" "$matrix_seg1_start" "$matrix_seg1_stop" "$aux_leds" || fail "unexpected 2D Matrix/companion topology (expected Matrix x=0..32,y=0..16 and companion 512..534; AUX 22 LEDs)"
echo "PREFLIGHT_OK: Opal/Nginx prerequisites, restrictive WAN input policy, local DNS, certificate, exact Matrix release, device identities, 32x16 Matrix segment, and 22-pixel companion topology are present."
echo "NGINX_ISOLATION: existing GL.iNet Nginx/global workers/listeners remain untouched; a separate 8443 instance uses a root master only to open the root-only TLS key and a single nobody/nogroup request worker."
echo "SESSION_STORAGE: persistent /etc parent will be root:nogroup 0710; session, revocation, and request-temp directories will be nobody:nogroup 0700."
echo "OWNER_ACCEPTED_NETWORK_EXPOSURE: direct unpaired-client WLED isolation was NOT_TESTED and is not an admission gate by owner decision; raw WLED API calls can bypass Owner/Guest UI constraints. PWA certificate trust and physical iPad behavior remain NOT_CHECKED."

#!/bin/sh
# Read-only installation preflight; no router, DNS, Nginx, or device writes.
set -eu
HOST=cart-control.hbnightflyers.com
MATRIX=192.168.77.10
AUX=192.168.77.11
EXPECTED_MATRIX_RELEASE=hbnf-cart2-phase2-r6-skins-readable-20261014
fail(){ echo "BLOCKED: $*" >&2; exit 1; }
command -v nginx >/dev/null 2>&1 || fail "nginx missing"
command -v openssl >/dev/null 2>&1 || fail "openssl missing"
command -v curl >/dev/null 2>&1 || fail "curl missing"
command -v jsonfilter >/dev/null 2>&1 || fail "jsonfilter missing"
command -v sha256sum >/dev/null 2>&1 || fail "sha256sum missing"
command -v lua >/dev/null 2>&1 || fail "Lua runtime missing"
lua -e 'assert(require("cjson.safe"))' >/dev/null 2>&1 || fail "Lua cjson.safe module missing"
lua -e 'local s=require("resty.sha256"); assert(s.new); local h=require("resty.string"); assert(h.to_hex)' >/dev/null 2>&1 || fail "lua-resty-string SHA-256 support missing; do not install a new dependency in this transaction"
nginx -V 2>&1 | grep -q 'lua' || fail "existing Nginx build has no Lua module"
nginx -V 2>&1 | grep -q 'http_ssl' || fail "existing Nginx build has no TLS module"
nginx -T 2>&1 | grep -Fq '/etc/nginx/conf.d/*.conf' || fail "Nginx does not include the staged server-config directory"
if nginx -T 2>/dev/null | grep -Fq 'server_name cart-control.hbnightflyers.com'; then fail "hostname already has an Nginx server; inspect it before install"; fi
workers=$(ps w | grep '[n]ginx: worker' | awk '{print $2}' | sort -u)
[ -n "$workers" ] || fail "could not verify Nginx worker account"
[ "$workers" = "root" ] || fail "session persistence requires the existing Nginx worker to be root; no permission workaround is authorized"
[ -r /etc/ssl/certs/ca-certificates.crt ] || fail "system CA bundle missing"
[ -d /etc/hbnf-local-control ] || fail "certificate directory /etc/hbnf-local-control is missing"
[ -f /etc/hbnf-local-control/owner-network-isolation-verified ] || fail "guest/unpaired-to-WLED isolation has not been physically verified"
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
aux_info=$(curl -fsS --max-time 3 "http://$AUX/json/info") || fail "AUX read-only identity request failed"
matrix_build=$(curl -fsS --max-time 3 "http://$MATRIX/hbnf/build.json") || fail "Matrix embedded release identity request failed"
matrix_mac=$(printf '%s' "$matrix_info" | jsonfilter -e '@.mac' 2>/dev/null || true)
aux_mac=$(printf '%s' "$aux_info" | jsonfilter -e '@.mac' 2>/dev/null || true)
matrix_leds=$(printf '%s' "$matrix_info" | jsonfilter -e '@.leds.count' 2>/dev/null || true)
aux_leds=$(printf '%s' "$aux_info" | jsonfilter -e '@.leds.count' 2>/dev/null || true)
matrix_release=$(printf '%s' "$matrix_build" | jsonfilter -e '@.release_id' 2>/dev/null || true)
[ "$(printf '%s' "$matrix_mac" | tr 'A-F' 'a-f')" = "704bca5b345c" ] || fail "unexpected Matrix identity"
[ "$(printf '%s' "$aux_mac" | tr 'A-F' 'a-f')" = "8c94df55c34c" ] || fail "unexpected AUX identity"
[ "$matrix_release" = "$EXPECTED_MATRIX_RELEASE" ] || fail "unexpected Matrix release identity"
[ "$matrix_leds" = "512" ] || fail "unexpected Matrix pixel topology"
[ "$aux_leds" = "22" ] || fail "unexpected AUX pixel topology"
echo "PREFLIGHT_OK: Opal/Nginx prerequisites, local DNS, certificate, exact Matrix release, device identities, and pixel topologies are present."
echo "NOT_CHECKED: router guest-to-WLED isolation, PWA certificate trust and physical iPad behavior; these remain mandatory release gates."

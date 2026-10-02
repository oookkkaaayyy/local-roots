# HBNF Opal Updater — Next Immutable Package Requirements

This is the source-of-truth correction list for the next updater package. Do not reinstall the current IPK until a replacement package contains every item below.

## Preserve
- Cart-LAN source restriction.
- HTTP_HOST = console.gl-inet.com.
- Immutable signed manifest/artifact verification.
- Exact Matrix MAC gate 70:4b:ca:5b:34:5c.
- Challenge/install authorization only from trusted Opal HTTPS origin.
- One-use nonce + HMAC proof + exact confirmation string.
- Release-role and rollback constraints.
- No public inbound Matrix exposure.

## Required OpenWrt 18.06 compatibility fixes
1. Package all parent directories:
   - /usr/lib/lua/luci/view/hbnf-updater/
   - /www/luci-static/resources/hbnf/
   - /etc/hbnf-updater/
2. Old Nixio:
   - fs.mkdir(path) rather than numeric-mode mkdir calls that fail on this build.
   - fs.chmod modes as strings: "0700", "0600", "0644".
   - nixio.umask("0077"), not numeric 63.
3. No dependency on BusyBox stat:
   - ship a narrow compatibility helper for %s/%u/%a or implement equivalent portable checks.
   - remove stat from mandatory tool preflight.
4. BusyBox-safe MAC normalization:
   - remove ':', '-', and '.' separately; lowercase A-F separately.
5. Safari same-origin check GET:
   - action=check may omit Origin.
   - if Origin exists, accept only Matrix origin or Opal origin.
   - default expected_origin to Opal origin when same-origin GET omits Origin.
   - only compare Origin when present.

## Required progress/result integration
The Matrix-local /hbnf dashboard must be able to show OTA job progress/result without gaining install authority.

Allow read-only GET action=result from:
- Matrix origin http://192.168.77.10
- Opal origin https://console.gl-inet.com

Keep these Opal-only:
- challenge POST
- install POST

For Matrix-origin result:
- retain cart-LAN source check.
- retain HTTP_HOST=console.gl-inet.com.
- add Access-Control-Allow-Origin: http://192.168.77.10 and Vary: Origin.
- return only existing job/result state; never return trusted-iPad token, nonce, proof material, WLED PIN, signer private material, or admin data.

Do not relax challenge/install authorization merely to simplify UI integration.

## Verification gates for replacement IPK
- outer IPK/container accepted by live OpenWrt opkg.
- all required parent dirs created on clean install.
- updater check returns ok=true against current accepted signed baseline.
- Matrix-origin check GET works with and without browser Origin behavior as applicable.
- Matrix-origin result GET works and is CORS-readable.
- Opal-origin installer can challenge/install exactly as before.
- invalid origin, wrong host, off-LAN source, wrong MAC, bad proof, replayed nonce, signature mismatch, and artifact mismatch all remain blocked.
- package reinstall does not erase required persistent config/key/token files unless explicitly intended and backed up.

# Opal Owner Local Control — staged v1.0.7

Offline package only. No router, device, cloud, scoring, DNS, firewall, or firmware changes are made until a separately admitted installation. This release retains the existing Opal Mission Control WebSocket interface and adds a separate authenticated HTTP transport module for the production Owner PWA. The updated existing transport keeps its WebSocket class and current command mappings; rollback restores its exact v1.0.1 source.

## Per-command gateway

The authenticated `/api/aux/uv-policy` route validates the mode and both
brightness caps, checks the expected UV-enabled AUX build witness and segments
1/2, then constructs a WLED state update for only those two segments. It leaves
the underglow segment and global power state untouched. The route reports
success only when the AUX state response matches both requested channel values.
The read-only `/api/aux/uv-status` route reports ready only for that same AUX
build witness with both UV segments present. The Opal-hosted PWA sends UV
requests to this gateway and does not fall back to Supabase when local control
fails. Opening the PWA does not send an output command; the owner must choose
Apply manual override, Follow Matrix, or UV off.

The dedicated Nginx instance listens only on `192.168.77.1:8443`, uses the installed TLS/Lua-enabled Nginx binary, and drops its single request worker to `nobody:nogroup`. The Nginx master remains root only to open its root-only key and supervise the process. The global GL.iNet Nginx, its 80/443 listeners, and the Skins relay are not reloaded or modified.

The Owner PWA imports `owner-http-transport.js`. Its Matrix writes use bounded `POST /api/matrix/control` requests; each request validates the paired token, origin, expiry/revocation, body size, command keys, and value ranges before constructing a canonical WLED `/json/state` body. The gateway no longer exposes a write-capable WebSocket route. The PWA then obtains fresh Matrix state and checks the requested values; AUX control has a separate authenticated request and independent readback. HTTP acceptance alone is not reported as device-state confirmation, and DDP state is not represented as proof of physical illumination. The test-installed Opal page continues using its existing WebSocket class.

WLED documents JSON state writes through HTTP POST and state readback through its JSON API ([WLED JSON API](https://kno.wled.ge/interfaces/json-api/)). That upstream API does not provide owner authorization; authorization here is enforced by the Opal gateway per request. The exact installed Matrix firmware contract remains a live release prerequisite.

## Verified device facts and remaining security boundary

Read-only inventory confirmed GL-SFT1200/OpenWrt 18.06, Nginx 1.17.7 with TLS/Lua, LAN address `192.168.77.1`, and WAN input drop/reject. The staged socket binds only the LAN address. This supports WAN denial but has not been tested from an external WAN client because the candidate is not installed.

The live wireless configuration places both active HBNF-Cart radios on the main `lan` bridge; guest SSIDs are disabled. Matrix and AUX share that LAN, where WLED native control APIs are unauthenticated. Therefore unpaired clients on the main Wi-Fi can bypass the Owner gateway. This is a confirmed release blocker. No marker file is accepted as proof of isolation; a safe network isolation design and a negative control test from unpaired clients are still required. Do not install this gateway as a security-complete Owner PWA while that bypass remains.

The deployed v25 pairing verifier returns only `{paired:true}`. The authoritative paired-session expiry schema could not be recovered from repository migrations or available bounded read-only backend access. Enrollment fails closed when `expiresAtEpoch` is unavailable; do not infer expiry from browser input. The verifier/schema correction remains blocked pending the authoritative database contract.

## TLS and local DNS

The hostname is `cart-control.hbnightflyers.com`; the gateway must use a publicly trusted DNS-01 certificate while local DNS resolves that hostname to `192.168.77.1`. DNS-01 does not require a public gateway record, but issuance/renewal needs authorized DNS-provider API credentials. Let’s Encrypt documents DNS-01 as the validation option for certificates without exposing an HTTP service ([ACME challenge types](https://letsencrypt.org/docs/challenge-types/)). The Opal inventory found no ACME client or existing certificate; no DNS token scope was available for this pass. Renewal needs WAN access at renewal time; the already-issued certificate and local split-DNS resolution continue to serve the local gateway during WAN outages until expiry.

The installer does not create the certificate or alter dnsmasq. Existing preflight checks require the key to be root:root mode 0600, a trusted SAN/chain, and local hostname resolution. No certificate credential is included in the package.

## Persistent sessions and rollback

Session expiry/revocation files are stored under persistent `/etc/hbnf-local-control-state`; shared dictionaries are caches only. The package verifies and snapshots the exact current Opal page module SHA `a91e84c89a481739f9c47c619a1d3c5c35d690869c54159486d528d3863c746e`. Rollback stops/disables only the dedicated service, restores that exact transport, removes `owner-http-transport.js` and the dedicated config/Lua/session/log paths, then verifies the original Opal page transport and GL.iNet 80/443 listeners remain unchanged.

## Release status

Staged, not installed. Remaining mandatory gates: authoritative server pairing expiry; trusted DNS-01 certificate and split DNS; proven isolation from direct WLED control for every unpaired client; external WAN-denial and runtime config checks; iOS 12 device acceptance; and physical Matrix/AUX readback/illumination confirmation. Do not treat host tests or this package as physical acceptance.

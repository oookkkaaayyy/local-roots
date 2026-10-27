# Opal Owner Local Control — staged v1.0.13

Offline package only. No router, device, cloud, scoring, DNS, firewall, or firmware changes are made until a separately admitted installation. This release retains the existing Opal Mission Control WebSocket interface and adds a separate authenticated HTTP transport module for the production Owner PWA. The existing transport keeps its WebSocket class and current command mappings; rollback restores the exact accepted Mission Control v1.0.2 transport (SHA-256 `51e4f03ff1ffc9d8cece0a3e6f14fefac77e642fe1a4eced95ca749d777f676a`). The installer still requires a fresh live hash match before capturing its transaction rollback.

The package carries the three OpenResty `lua-resty-string` v0.17 modules required for SHA-256, including their BSD license notice, and loads them from its isolated Lua directory. This avoids relying on an uninstalled Opal system package. The bundled upstream revision is `ac0967a020e7d05475ae53808ebf685232fe1c1d`.

## Per-command gateway

The authenticated `/api/aux/uv-policy` route validates the mode and both
brightness caps, checks the expected UV-enabled AUX build witness and segments
1/2, then applies the same hardware-profile and commissioning-gate policy as
the AUX command path before constructing a WLED state update for only those two
segments. The packaged profile is shared with the AUX source and defaults to
disabled; missing profile data, any false gate, or a limit mismatch returns
`mutationIssued:false` before WLED is called. The route leaves the underglow
segment and global power state untouched. Success requires AUX state readback
matching both requested channel values. The read-only `/api/aux/uv-status`
route reports control ready only when the exact AUX build witness, both UV
segments, and the same shared hardware profile/gates pass. The Opal-hosted PWA sends UV
requests to this gateway and does not fall back to Supabase when local control
fails. Opening the PWA does not send an output command; the owner must choose
Apply manual override, Follow Matrix, or UV off.

The dedicated Nginx instance listens only on `192.168.77.1:8443`, uses the installed TLS/Lua-enabled Nginx binary, and drops its single request worker to `nobody:nogroup`. The Nginx master remains root only to open its root-only key and supervise the process. The global GL.iNet Nginx, its 80/443 listeners, and the Skins relay are not reloaded or modified.

The Owner PWA imports `owner-http-transport.js`. Its Matrix writes use bounded `POST /api/matrix/control` requests; each request validates the paired token, origin, expiry/revocation, body size, command keys, and value ranges before constructing a canonical WLED `/json/state` body. The gateway no longer exposes a write-capable WebSocket route. The PWA then obtains fresh Matrix state and checks the requested values; AUX control has a separate authenticated request and independent readback. HTTP acceptance alone is not reported as device-state confirmation, and DDP state is not represented as proof of physical illumination. The test-installed Opal page continues using its existing WebSocket class.

WLED documents JSON state writes through HTTP POST and state readback through its JSON API ([WLED JSON API](https://kno.wled.ge/interfaces/json-api/)). That upstream API does not provide owner authorization; authorization here is enforced by the Opal gateway per request. The exact installed Matrix firmware contract remains a live release prerequisite.

## Verified device facts and remaining security boundary

Read-only inventory confirmed GL-SFT1200/OpenWrt 18.06, Nginx 1.17.7 with TLS/Lua, LAN address `192.168.77.1`, and WAN input drop/reject. The staged socket binds only the LAN address. This supports WAN denial but has not been tested from an external WAN client because the candidate is not installed.

The owner explicitly accepts that unpaired devices on the shared Cart Wi-Fi may call Matrix/AUX WLED's unauthenticated HTTP API directly. Those raw calls can bypass Owner/Guest PWA visibility and command constraints and directly control functions available through the device API. The gateway still authenticates and checks commands sent through its own HTTPS endpoints; it does not protect requests that bypass it. This exposure is recorded in the source-bound `SOURCE_BASE.json` and package manifest with observation status `NOT_TESTED`; no isolation test is claimed or required for admission. No router/network change is included.

The deployed Cart control function is v35. Its pairing verifier returns `{paired:true, expiresAtEpoch}` using the expiry stored in `hbnf_internal.cart_device_sessions.expires_at`; the new database function is executable only by `service_role`. The exact pre-deployment function v34 source is retained at `evidence/live-production-20261026/hbnf-cart-control-v34/`, and v35 readback is retained beside it. The endpoint fails closed with 503 if the authoritative expiry cannot be read; it never trusts browser-supplied expiry.

## TLS and local DNS

The hostname is `cart-control.hbnightflyers.com`; the gateway must use a publicly trusted DNS-01 certificate while local DNS resolves that hostname to `192.168.77.1`. DNS-01 does not require a public gateway record. A Let's Encrypt certificate was issued on 2026-10-26 and is retained on the coordinator Mac at `/Users/andrew/Library/Application Support/HBNF/opal-gateway-tls/tls/`; the matching temporary `_acme-challenge.cart-control` TXT record was removed after issuance. The certificate is valid through 2027-01-24. Its private key is outside the repository and must be copied to Opal as `/etc/hbnf-local-control/tls/privkey.pem` with owner `root:root` and mode `0600`; install the full chain as `/etc/hbnf-local-control/tls/fullchain.pem`. The original issuance used Certbot manual DNS mode, so renewal is not automatic: repeat DNS-01 issuance before expiry and replace both files together. Renewal needs internet access at issuance time; the already-issued certificate serves the local gateway during WAN outages until expiry. See `TLS_CERTIFICATE_READINESS_20261026.json` for the public certificate fingerprint, dates, and protected local file paths. No private key is committed or included in a package.

The installer does not create the certificate or alter dnsmasq. Existing preflight checks require the key to be root:root mode 0600, a trusted SAN/chain, and local hostname resolution. No certificate credential is included in the package.

## Persistent sessions and rollback

Session expiry/revocation files are stored under persistent `/etc/hbnf-local-control-state`; shared dictionaries are caches only. The package requires and snapshots the exact accepted Opal Mission Control v1.0.2 transport SHA `51e4f03ff1ffc9d8cece0a3e6f14fefac77e642fe1a4eced95ca749d777f676a`. Rollback stops/disables only the dedicated service, restores that exact transport, removes `owner-http-transport.js` and the dedicated config/Lua/session/log paths, then verifies the original Opal page transport and GL.iNet 80/443 listeners remain unchanged. This historical/source identity does not replace the install-time live hash check or exact rollback readback.

## Release status

Staged, not installed. The authoritative pairing-expiry contract is deployed and read back. The owner-confirmed physical integration review is PASS; the removable module is assembled but disconnected and unpowered. The separate powered field acceptance still needs low-output voltage/current/temperature readings, live channel/PWM checks, combined-load behavior, Matrix/AUX readback, and confirmation that underglow remains functional. Remaining software/network setup is trusted DNS-01 certificate plus local split DNS; verify WAN denial, runtime configuration, and iOS 12 behavior. Owner-accepted direct WLED exposure remains outside gateway protection and is not a network isolation claim. Host checks and source readbacks do not establish the field results or physical illumination.

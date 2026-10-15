# Owner PWA local transport — staged, not installed

This is an offline source/package for a local authenticated gateway behind the existing Opal Nginx. It does not change the public website, Supabase, firmware, scoring, Wi-Fi, DNS, firewall, or running router services until the guarded installer is explicitly run.

## Transport decision

The existing public PWA is HTTPS. Browsers block or downgrade an HTTPS page attempting the Matrix's insecure `ws://` endpoint. The Opal already has Nginx TLS, Lua, and native WebSocket proxy support. The least invasive compatible route is therefore a dedicated hostname, `cart-control.hbnightflyers.com`, with a publicly trusted TLS certificate issued by DNS-01, locally resolved by the Opal to `192.168.77.1`. Opal terminates WSS, checks the paired token/session, and proxies only the authenticated WebSocket to the existing Matrix WLED socket. Read-only Matrix/AUX identity/state paths are separately allowlisted. The existing PWA falls back to its current cloud route when local transport is unavailable; local commands do not fall back after a local command starts, avoiding duplicate actuation.

The gateway uses only the existing publishable Supabase key to validate a new local enrollment. It stores a SHA-256 digest of the random paired token and its server-supplied 180-day pairing expiration, never the raw token. Existing paired devices with no known pairing expiration can keep using the cloud path, but cannot be newly enrolled offline until they accept a fresh pairing link carrying its exact expiry. Revocation tombstones block local re-enrollment of the same token; local PWA unpair sends the revoke request and closes its socket. A remote cloud revocation cannot be discovered while WAN is unavailable; the local grant remains bounded by the original pairing expiry. Existing WebSocket connections are closed by the owner UI on local unpair; a remote revocation cannot forcibly terminate an already-upgraded native Nginx proxy connection until that connection closes. This limitation must remain visible in security acceptance.

The AUX mutation path is separate from Matrix WebSocket state: the Opal accepts only JSON `bri` (0–255) and/or `on` boolean, requires the paired local session and exact Owner PWA Origin, strips caller headers, forwards only the canonical allowed fields to AUX `/json/state`, and the PWA requires fresh AUX state readback to match. A failed/mismatched AUX readback attempts bounded restoration of both the prior AUX state and Matrix's stored AUX target. The software can confirm WLED state, not physical illumination.

## Required before install

1. A DNS-01-issued certificate whose SAN is exactly `cart-control.hbnightflyers.com`, with its private key stored mode 0600 at `/etc/hbnf-local-control/tls/privkey.pem` and chain at `/etc/hbnf-local-control/tls/fullchain.pem`. No private key or DNS API token belongs in GitHub or this package. TLS is pinned to TLS 1.2 for the iOS 12 target.
2. Opal local DNS must resolve that hostname to `192.168.77.1` while WAN is disconnected. The currently running router's DNS configuration has not been changed.
3. A qualified router network rule must prevent guest/unpaired clients from reaching Matrix/AUX WLED APIs directly while allowing Opal-to-device traffic. Current LAN placement permits direct WLED access; UI auth alone does not provide this isolation. The exact bridge/firewall path still needs read-only topology confirmation and guest-network acceptance testing. Do not install as owner-secure until that gate passes.
4. Fresh device identities, Matrix release, local connectivity, Nginx worker permissions, certificate trust and iOS 12 PWA behavior must pass the read-only preflight and physical acceptance.

## Installation and rollback

`preflight.sh` is read-only. It checks installed Nginx capabilities, certificate/SAN/trust, local DNS, and exact Matrix/AUX identities. `install.sh` is a one-shot installer that verifies the exact prior v1.0.1 transport hash, saves it under `/root/hbnf-owner-local-control.rollback-20261015`, adds only the dedicated Nginx server and Lua files, runs `nginx -t`, and reloads Nginx. It refuses conflicting targets. `rollback.sh` restores the exact prior transport and removes only this release's Nginx/Lua/session files, then validates/reloads the old configuration. Neither script has been run on the Opal.

The PWA source changes are in `hbnf-final-controller/`; they require a separately guarded website asset release. No live site deployment was performed.

## Acceptance limits

Host fixtures validate the PWA adapter, command readback contracts, WSS-only bearer use, fail-closed session behavior, and installer scope. They do not validate OpenWrt's exact Nginx/Lua runtime, the installed certificate, router ACL behavior, iOS 12 Safari, or physical lights. Matrix readback proves firmware state; AUX WLED readback proves receiver state; neither alone proves physical illumination.

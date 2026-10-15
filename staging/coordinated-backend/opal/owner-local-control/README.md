# Opal Owner Local Control — staged v1.0.3

Offline package only. It does not change the public site, Supabase, firmware, scoring, Wi-Fi, DNS, firewall, or running router services until the guarded installer is explicitly run.

## Root-worker correction

The Opal's existing GL.iNet Nginx 1.17.7 runs root workers by vendor configuration. That is not treated as a router defect and its global user, configuration, 80/443 listeners, reload behavior, and Skins relay are left alone.

The gateway instead gets a second Nginx instance using the already-installed binary and statically built TLS/Lua modules. It has a standalone config, PID/log/temp paths, Lua shared dictionaries, one worker, and TCP 8443. Its master remains root only to read the existing root:root mode-0600 TLS key and supervise the listener; Nginx's native `user nobody nogroup` drops the request worker before it handles traffic. The worker owns only the dedicated session, revocation, and request-temp directories. The existing PWA adapter points to `https://cart-control.hbnightflyers.com:8443` and uses WSS on that listener.

This follows Nginx's documented master/worker privilege separation and OpenWrt's existing procd service supervision. Changing global `user root;` to `nobody` was rejected because it would alter all existing Nginx sites. Running the whole gateway process as `nobody` was rejected because it cannot read the private key at mode 0600; widening key permissions would weaken key protection. Replacing Nginx with uHTTPd was not justified: the installed Nginx already has the needed TLS, Lua and WebSocket proxy support, while an alternative WebSocket-auth proxy is not established on this router.

Sources: [Nginx core `user` directive](https://nginx.org/en/docs/ngx_core_module.html#user), [OpenWrt procd init scripts](https://openwrt.org/docs/guide-developer/procd-init-scripts), [OpenWrt 18.06 procd source](https://github.com/openwrt/openwrt/blob/openwrt-18.06/package/system/procd/files/procd.sh).

## Opal evidence and limits

Read-only inventory on the actual GL-SFT1200 confirmed OpenWrt 18.06, Nginx 1.17.7, OpenSSL 1.1.1i, compiled TLS and Lua modules, `/sbin/procd`, `nobody` UID 65534 / `nogroup`, root-owned existing Nginx master and root workers, and free TCP 8443. The router reported about 118,784 KiB total RAM and 71,232 KiB available; the existing Nginx master/worker RSS values were about 7.7 MiB per process. The new one-worker instance's incremental memory was not physically measured because the package has not been installed. A rough RSS upper estimate is one additional master plus one worker (about 15.5 MiB before accounting for shared executable/library pages); runtime memory under relay load remains a release check.

The packaged init service is procd-supervised with respawn and starts after the existing Nginx service. Startup recovery and the separate config were not exercised on the router. The preflight requires a valid DNS-01 certificate, matching local DNS, free 8443, exact current device identities/topology, and empty dedicated install paths. The read-only inventory found the certificate absent and `cart-control.hbnightflyers.com` returning NXDOMAIN. TLS module support is verified; certificate trust/handshake is not.

Persistent session and revocation files live under `/etc/hbnf-local-control-state` on the router's persistent overlay, not `/tmp`. The parent is root:nogroup mode 0710; session, revocation, and temporary child directories are nobody:nogroup mode 0700. Nginx's shared session/rate dictionaries are instance-local and are caches, not the persistent source of session expiry/revocation.

## Existing pairing and security gates

The gateway stores only a SHA-256 digest of the random paired token and the server-issued pairing expiration. The current known v25 verifier returns `{paired:true}` without authoritative expiry, so enrollment remains blocked until its read-only pairing contract is updated and qualified with rollback. Do not use a browser-supplied expiry.

The supported Owner PWA closes its socket on hide/unload and rotates it every 60 seconds with gateway revalidation. This bounds revocation for that client, but does not forcibly terminate a noncompliant raw WebSocket that remains open. Guest/unpaired direct access to WLED remains a separate mandatory network-isolation test; no UI lock or marker file is accepted as proof. No isolation rule has been changed.

## Installation and exact rollback

`preflight.sh` is read-only. `install.sh` verifies the source-bound package, the exact previous v1.0.1 transport hash, fresh release/device identity, certificate/DNS, and free dedicated paths; then snapshots the prior transport at `/root/hbnf-owner-local-control.rollback-v1.0.3`, installs only the separate config/service/Lua/state plus the revised transport, validates the dedicated config, enables/starts its service, and checks for exactly one `nobody` request worker and a fail-closed HTTPS 401. It does not edit `/etc/nginx/nginx.conf` or `/etc/nginx/conf.d`, or reload the global Nginx.

`rollback.sh` disables/stops only the dedicated service, verifies the candidate transport hash, restores the exact prior transport, removes only the dedicated config/service/Lua/session/log files, and checks the existing 80/443 listeners remain present. The package is staged, not installed. Runtime config syntax, TLS handshake, procd boot recovery, measured memory overhead, session persistence across reboot, guest-client isolation, iOS 12, and physical output are not yet verified.

## Remaining acceptance

1. Qualify the authoritative Supabase pairing-expiry verifier and its exact rollback; production returns only `{paired:true}` in the last verified contract.
2. Issue/install the trusted DNS-01 cert and local hostname resolution without public PWA routing changes.
3. Verify guest/unpaired clients cannot access WLED control APIs directly while Opal-to-device traffic remains allowed.
4. After guarded authorization and preflight, validate Nginx config/start as a dedicated instance; verify worker UID, 8443 TLS/WSS, procd restart, persistent sessions, memory under relay load, and rollback.
5. Test on iOS 12 iPad mini with WAN disabled, then verify Matrix and AUX state/physical response and existing admin/Skins/animation behavior.

# Opal unattended Matrix Skins relay — staged package

This is an outbound-only relay for the GL-SFT1200. It reads `live_status` from the existing Supabase Edge Function with the existing **public** anon/publishable key, then posts a validated `hbnf-live-v1` snapshot to the already-installed Matrix API. It never writes website scoring data. Version 1.0.2 changes only the relay's display labels from full names to static-width abbreviations and is a guarded update for an existing 1.0.1 relay.

## Why this path

The installed Vibe-first firmware and the readable-scoreboard candidate both use the existing `/hbnf/live` receiver; the relay remains the autonomous Supabase poller. The Opal preflight recorded on October 9 found OpenWrt/BusyBox, curl with TLS verification and CA bundle, jsonfilter, and procd already present, so this avoids another Matrix build/OTA. A fresh identity, package, CA, and route check remains mandatory before installation.

## Fail-closed requirements

* The relay accepts only the pinned Matrix MAC and one of the two exact compatible release IDs, Supabase function URL, and `selectorVersion=skins-front-lock-v1`.
* Until the staged selector correction is deployed, the current endpoint response has no selector marker and this relay sends **no Matrix writes**. This protects against the demonstrated premature B9 selection in v23.
* HTTPS uses curl's normal CA/hostname verification; there is no `-k`/insecure mode. Requests are bounded to 8 seconds and 32 KiB.
* Only fresh successful reads are posted. On read failures, the relay does not replay cached scores; the Matrix's existing live snapshot expires after 120 seconds.
* Source names are fully validated, then projected to static labels no wider than eight characters: Front 9 uses the first three recognizable letters; Back 9 uses first initials separated by ` / `. Duplicate abbreviations receive stable roster-order suffixes. Invalid, unsupported, over-58-character, over-20-entry, malformed, ambiguous, or over-width values are rejected rather than clipped or scrolled.
* Changed snapshots use `/hbnf/live`, with `Host: 192.168.77.10` and `Origin: http://192.168.77.10`, matching the installed receiver. Native command overlays keep precedence.
* Four-minute redisplay uses the validated 240-second timer fix and pulses the same receiver with inactive then active data only after a fresh poll, while no manual overlay or game is active. This is intentionally not a second scoreboard implementation.
* Current installed firmware has no game runtime. The relay checks the optional `HBNF.gameActive` flag and suppresses periodic redisplay if a later compatible build reports a game active.

## Package files

* `hbnf-skins-relay`: BusyBox ash service process.
* `hbnf-skins-relay-core.sh`: validation and compact snapshot formatter.
* `hbnf-skins-relay.init`: standard procd foreground service wrapper.
* `hbnf-skins-relay.conf.example`: placeholder only; contains no key.
* `tests/opal-skins-relay-contract.mjs`: host-side fixture and behavior tests.

The service is already installed and running at version 1.0.1. The staged 1.0.2 package is an update, not an initial install; its one-attempt updater verifies current service identity and files, saves an exact 1.0.1 recovery copy, updates only the service/core files, then checks the running service. The existing public key and configuration remain untouched.

## Disable / rollback

Run `sh /etc/init.d/hbnf-skins-relay stop` then `disable`; remove the two service symlinks only if the init helper did not. Preserve the config for re-enable or securely remove it. No Matrix firmware or Supabase data rollback is involved. If the approved selector function is deployed, restore the exact active Supabase v23 function version from its version history; do not roll back the Matrix firmware.

## Acceptance boundary

Offline tests establish formatting, selector-version fail-closed behavior, F9/B9 routing expectations, refresh scheduling, and request contracts only. They do not prove router installation, real HTTPS, Matrix HTTP acceptance, or visible pixels. Physical acceptance must confirm one changed-score overlay, a four-minute redisplay, ordinary animations between overlays, manual-overlay precedence, and recovery after a brief WAN interruption.

The installed readable-scoreboard firmware controls page duration and transitions; the relay supplies labels that fit the 32 px static text width, avoiding horizontal scrolling. All 1–20 entries are visited in two-row pages. Win/payout amounts are not in the existing live contract and are never derived by this relay.

# HBNF Coordinated Release — 2026-10-01

## Purpose
Build the next HBNF cart release as ONE coordinated release. Do not create another infrastructure-only Matrix build. Keep the currently accepted Audio V1.1 firmware untouched until the candidate is fully built/tested.

## Accepted live baseline
- Matrix: 192.168.77.10, MAC 70:4b:ca:5b:34:5c
- AUX: 192.168.77.11, MAC 8c:94:df:55:c3:4c
- Opal: 192.168.77.1
- Accepted firmware SHA-256: 0aeb668e58cad3bae5b636fdc79573a263c3d0e911903ed48af0bbc2e5681f61
- Accepted release ID: hbnf-matrix-v1-1-current-20260930
- Accepted HBNF candidate: hbnf-integrated-rc-visual-audio-continuity-2026-09-30
- WLED 16.0.1
- 28 curated ANIMartRIX effects IDs 220–247
- Existing Motion / Audio Response controls are accepted and must remain functional.
- DDP Matrix→AUX target 192.168.77.11; companion segment id1 start512 stop534 fx142, on=true, bri255.
- Current /hbnf dashboard is accepted for normal use and must not regress.

## Required visible scope for this release
1. Palette / color control.
2. Effect / show selection.
3. Manual Matrix text entry.
4. Saved looks / presets / show controls.
5. Skins live data.
6. Glow live data.
7. Existing Motion control.
8. Existing Audio Response control.
9. OTA status/control integrated into /hbnf:
   - current release/status
   - check for signed update
   - install when a newer signed release is available
   - install progress/result
   - no LuCI/admin password for routine operation after trusted-iPad provisioning.

Reuse prior HBNF TEXT / LOOKS / SHOWS / LIVE DATA implementations where possible, but preserve one canonical state owner. Browser code may use WLED JSON read-only endpoints such as /json/pal and /json/info; base visual mutations must enter through hbnf-cart-control → reconciler → Foundation adapter. Do not rebuild capabilities that already exist in source/history.

## Current production canonical control plane
Read-only production capture on 2026-10-01:
- actuator fence is already ACTIVE at epoch 2
- control-plane release_id is hbnf-cart-foundation-v1-20260925
- desired state exists at captured revision 117
- do not seed canonical state or reactivate the fence during this release
- exact current backend source is captured under evidence/live-production-20261001/
- coordinated backend candidates are based on current hbnf-cart-control v16 and hbnf-matrix-adapter-foundation v2, not historical authenticated-only sources

The control-plane release ID above is separate from the accepted Matrix firmware OTA release ID hbnf-matrix-v1-1-current-20260930.

## Cloud OTA live state already proven
The Opal updater backend is installed and its signed current-release check now passes end-to-end. The mounted iPad installer reports:
"Latest release is already recorded as accepted by Opal after health checks."

The current signed release is intentionally not installable because it is already accepted. A real newer-release Install→reboot→health→result flow remains to be exercised by this coordinated release.

## Live Opal compatibility fixes that MUST be incorporated into corrected immutable updater source/package
The currently installed 1.2.3 artifact required old-OpenWrt compatibility fixes. Future package/source must include these natively; do not depend on live manual patches.

### Package layout
Create parent directories in package payload so first install does not fail:
- /usr/lib/lua/luci/view/hbnf-updater/
- /www/luci-static/resources/hbnf/
- /etc/hbnf-updater/

### Old Nixio compatibility
In luci/controller/hbnf_updater.lua:
- do not use numeric mode args for fs.mkdir/fs.chmod on this firmware
- use string chmod modes: "0700", "0600", "0644"
- use nixio.umask("0077"), not numeric 63

### Old OpenWrt lacks stat
Do not require external `stat` on this Opal.
Current live workaround uses /usr/libexec/hbnf-stat with only:
- %s => file byte size
- %u => numeric uid
- %a => octal mode
Future immutable package may either ship that helper or implement equivalent logic safely without external stat.

### MAC normalization
Do not use:
`tr -d ':-.'`
Use a BusyBox-safe normalization such as separate removals:
`tr -d ':' | tr -d '-' | tr -d '.' | tr 'A-F' 'a-f'`

### Same-origin Safari GET behavior
The public update-check endpoint must allow an HTTPS same-origin GET whose browser omits the Origin header.
Current live controller fix:
- for action=="check", reject only if Origin exists AND is neither Matrix nor Opal origin
- set expected_origin = origin or opal_origin
- final origin comparison only when origin exists
Do NOT weaken challenge/install authorization.

## Updater security contracts to preserve
- cart-LAN source required
- HTTP_HOST must be console.gl-inet.com
- challenge/install/result remain Opal-origin only
- install requires trusted iPad token + one-use nonce + HMAC proof
- confirmation string remains exact:
  INSTALL <ROLE> <release> 70:4b:ca:5b:34:5c
- immutable signed release verification remains mandatory
- release signer private key must never be committed; public key only is safe
- no public inbound Matrix exposure

## UI/UX contract
- iPad mini 2 / iOS 12 must remain usable.
- iPhone can control in parallel.
- Fast local-first controls; no login prompts.
- Preserve live-state convergence and reconnect behavior.
- No giant admin UI. Course controls should be direct and touch-friendly.
- Do not reintroduce deprecated Skills/Random surfaces unless explicitly needed.
- Keep normal cart use independent of WAN whenever the feature is local.

## Live data contract
Skins and Glow should share one live/cache/reconnect framework rather than separate fragile implementations.
Use existing HBNF data/backend sources where already implemented.
Degrade gracefully if WAN is absent: local Matrix controls must continue working.

## Build / release workflow
1. Reconcile current accepted Matrix source and prior UI/live-data implementations into this isolated branch.
2. Build the complete candidate without touching live hardware.
3. Automated tests:
   - existing visual/audio foundation
   - Matrix/AUX contract
   - iOS12-compatible JS syntax
   - controller API/state synchronization
   - text
   - looks/shows
   - Skins/Glow data/cache/reconnect
   - OTA UI states
   - corrected Opal updater package/container/install layout
   - signed-release manifest/artifact verification
4. Produce one immutable signed Matrix release based on accepted SHA 0aeb668e...
5. Keep rollback to current accepted Audio V1.1 ready.
6. Only then perform the first real OTA install from the trusted iPad.
7. Verify reboot, Matrix/AUX health, /hbnf reconnect, all visible controls, and updater result.
8. Freeze the resulting known-good release.

## Do not
- Do not deploy from this branch without explicit go-live approval.
- Do not flash intermediate experiments.
- Do not change router network settings as part of this release.
- Do not treat HBNF-Cart SSID startup reliability as solved; it is a separate unresolved router-startup issue.
- Do not rebuild accepted visual/audio behavior from scratch.
- Do not create another throwaway firmware whose only visible change is an updater button.

## Acceptance
Candidate is not ready until every required visible scope item above is present and automated tests pass. Production acceptance still requires one controlled physical OTA install and short physical verification.

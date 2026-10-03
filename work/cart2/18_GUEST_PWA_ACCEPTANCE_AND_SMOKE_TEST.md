# HBNF Cart 2.0 — Guest PWA Acceptance / Smoke Test

STATUS: REQUIRED BEFORE GUEST PLATFORM RELEASE.

## Static packaging gate
Fail release if any referenced asset is absent.

Verify:
- guest HTML
- CSS
- JS
- manifest
- 192 icon
- 512 icon
- Apple touch icon
- service worker if used

Parse HTML + manifest and verify every same-origin referenced asset exists in the release package.

## HTTP gate
For every asset:
- expected 2xx status
- expected MIME type
- no HTML fallback served for JS/CSS/manifest/icon URLs
- no redirect loop
- cache headers compatible with release strategy

## Blank-screen gate
Run guest page with:
1. all APIs available
2. Supabase unavailable
3. Matrix unavailable
4. Opal unavailable
5. WAN unavailable after initial load
6. stale service-worker cache
7. JS module fetch failure
8. localStorage unavailable/cleared

In every case:
- body contains visible branded shell
- actionable status text is visible
- no all-white/all-empty viewport

## Clean-device gate
Use a browser profile/device with:
- no cookies
- no localStorage
- no prior service worker
- no pairing token

Open the exact share URL.

Expected:
- visible guest shell immediately
- no owner pairing requirement to load
- no admin controls
- valid manifest/icon
- plain-language connection state

## PWA install gate
Modern Chromium:
- manifest valid
- name/short_name
- 192 and 512 icons
- start_url
- standalone display

iOS Safari:
- Apple touch icon resolves
- Add to Home Screen launch opens stable guest route
- safe-area layout works
- no module/API syntax unsupported by target iOS where old-iOS compatibility is required

## Guest authority gate
Default CLOSED.

Without active session:
- all mutation attempts fail closed.

With active owner-opened session:
- only capability-scoped actions succeed.

Expired/revoked session:
- mutation immediately fails
- UI returns to closed state.

## Owner-surface isolation
Guest package must contain no visible or callable path to:
- firmware OTA/install
- rollout preflight
- router admin
- recovery
- durable owner pairing
- unrestricted brightness/current
- raw advanced audio
- diagnostic secrets

## Regression
The reported 2026-10-02 friend-share failure becomes a permanent regression scenario:
NEW DEVICE + SHARED URL + OFF-CART NETWORK MUST RENDER A USEFUL GUEST SHELL, NEVER A BLANK WHITE PAGE.

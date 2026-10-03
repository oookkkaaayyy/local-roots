# HBNF Cart 2.0 — Guest Platform Product Contract

STATUS: CANDIDATE FOR SCOPE LOCK. NOT YET APPROVED.

## Finding from current implementation
The existing hosted hbnf-cart controller is not a complete guest platform.

Current source is primarily an owner/cart-control surface. It contains device pairing, firmware/update controls, advanced audio, brightness, text, live-data overlays and other owner/admin-adjacent capabilities.

The current manifest references a single 180x180 icon, but the coordinated-release controller tree does not contain the referenced hbnf-cart-icon-180.png asset. The current controller-only package also does not include an icon asset. This is a packaging defect and explains why icon behavior cannot be relied on.

A shareable guest experience therefore must be treated as a separate first-class product surface rather than assuming the owner controller can simply be texted to a friend.

## Product goal
A friend receives one URL or QR code and gets a useful, branded HBNF Cart experience immediately.

The page must NEVER render as a blank white screen.

The guest must not need:
- a ChatGPT/OpenAI account;
- Supabase/email login;
- owner pairing token;
- router/admin password;
- firmware knowledge.

## Public-shell principle
The guest URL is allowed to load anywhere on the internet.

It always renders:
- HBNF branding;
- clear cart-connection state;
- install/Add-to-Home-Screen capable PWA metadata;
- a useful offline/unavailable screen;
- instructions to join HBNF-Cart when local control is required.

Actual cart mutation remains unavailable until the guest is on the permitted cart network/session and the owner has enabled guest authority.

## Owner vs Guest separation

### OWNER MISSION CONTROL
Owner-only:
- firmware/update/install
- network/router diagnostics
- rollout preflight
- device pairing/admin
- raw brightness/current/recovery controls where appropriate
- advanced audio configuration
- diagnostics and release identity
- guest-session enable/disable

### GUEST PLATFORM
Candidate guest capabilities:
- choose from owner-approved Vibes
- participate in approved digital games
- participate in approved zero-input/near-zero-input IRL directive modes
- view current game/session status
- submit only explicitly approved short text/moment actions if owner enables that permission
- leave/end own controller participation

Guest may NOT:
- update firmware
- access router/network/admin
- change underlying device topology
- access OTA/preflight/recovery
- change owner-only tuning
- acquire permanent cart authority

## Guest session model

Default: CLOSED.

Owner explicitly opens a guest session.

Session defines:
- enabled capabilities
- optional player name
- expiry
- max concurrent guests
- whether Vibe selection is allowed
- whether text/moments are allowed
- whether game control is allowed

Guest URL/QR contains only an opaque short-lived session reference, never a durable owner credential.

Session revocation must take effect without requiring guest cache clearing.

## UX states

### PUBLIC / OFF-CART
Always rendered.
- HBNF logo/icon
- “Cart controls are available when you’re with the cart.”
- Join HBNF-Cart instruction / QR assistance
- installable PWA shell
- no blank page

### CART FOUND, SESSION CLOSED
- “Connected to HBNF Cart”
- “Guest controls are currently closed.”
- live non-sensitive status may be shown if approved

### SESSION OPEN
- allowed Vibe cards
- Games
- approved IRL modes
- session/player identity
- clear connection health

### CART TEMPORARILY LOST
- preserve shell and current UI
- show reconnecting state
- disable mutations
- never white-screen

### SESSION EXPIRED/REVOKED
- immediately disable mutations
- return to public shell with plain-language status

## PWA requirements
- dedicated guest manifest
- stable same-origin start_url
- 192x192 icon
- 512x512 icon
- Apple touch icon
- standalone display
- theme/background colors
- branded splash behavior where browser supports it
- service worker/offline app-shell caching if compatible with hosting
- versioned cache invalidation
- installability smoke test on iOS Safari and modern Chrome

## Rendering reliability rule
The initial HTML must contain a visible app shell BEFORE any network/API/module success.

If JavaScript, Supabase, Matrix, Opal or WAN fails:
- branded shell remains visible;
- failure state is shown;
- retry is available;
- no uncaught startup error may blank the document.

## Shareability acceptance
Pass only if a new device with no prior cookies/localStorage:
1. opens the shared HTTPS URL;
2. sees branded guest shell immediately;
3. receives valid icon/manifest assets;
4. may Add to Home Screen / install where supported;
5. sees a useful offline/cart-unavailable state off-LAN;
6. sees allowed controls when on HBNF-Cart with an open guest session;
7. cannot reach owner-only actions.

## Current white-screen incident
Treat the reported friend-share white screen as a real product failure.

Do not mark guest platform COMPLETE until reproduced/diagnosed or superseded by a new guest surface that passes the clean-device shareability acceptance above.

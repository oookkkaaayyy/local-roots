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


## 2026-10-03 pre-backend security / isolation refinement

Current staging source is NOT safe to connect to a production guest mutation backend yet. Static audit evidence:
`evidence/hbnf-phase2-migration-20261003/GUEST_STAGING_AUDIT_20261003.json`.

Required contract additions:

### Capability state is authoritative per control
A session being OPEN does not enable all guest controls.
Each control is enabled only if:
- fresh session state is valid;
- the specific capability is granted;
- connection/mutation path is currently safe.

Unknown, stale, reconnecting, expired, or revoked state fails CLOSED.

The current staging client violates this rule because `render()` can re-enable all controls after `applyCapabilities()`. That is a known blocker, not accepted behavior.

### Session proof
The public/QR join reference is an onboarding reference, not a durable owner credential and not sufficient mutation authority by itself.

Before backend connection, define a server-validated short-lived guest proof/session mechanism. Every mutation is checked server-side for:
- valid session;
- expiry/revocation;
- requested capability;
- controller/player membership where relevant.

A public session identifier alone must never authorize mutation.

OWASP's current session-management guidance treats session IDs/tokens as authentication-equivalent secrets and warns that URL-carried session identifiers can leak through history, logs, links and referrers. Prefer resolving the initial join reference into a safer short-lived browser session mechanism, then remove/neutralize the join secret from the visible URL where practical.

Evidence:
- https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html

### Guest PWA isolation
Guest PWA/service-worker scope must not overlap owner/admin routes.

Current staging manifest uses `scope: "/"`; if deployed with a root-scoped service worker, that can place unrelated same-origin routes under guest-worker control. Final deployment must use a guest-specific path/scope or isolated origin, with an acceptance test proving owner Mission Control routes are outside guest service-worker control.

MDN explicitly defines service-worker scope as the URL range the worker controls and cautions against unnecessarily broad scopes.

Evidence:
- https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/scope
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Service-Worker-Allowed

### Dynamic authority is never app-shell cache data
Service-worker caching may cover versioned static shell assets only.
Do not cache:
- guest session/status responses;
- revocation/expiry responses;
- capability authority;
- game/control mutation responses.

Navigation fallback may serve the guest shell for guest documents, but missing JS/CSS/icon/API requests must not silently receive HTML fallback.

Evidence:
- https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Caching
